'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select } from '@/components/ui/field';
import {
  useUsuarios,
  useRegionais,
  useCreateUsuario,
  useUpdateUsuario,
  type NovoUsuario,
} from '@/hooks/use-config';
import type { PapelUsuario, UsuariosRow } from '@/lib/database.types';

const PAPEIS: { value: PapelUsuario; label: string }[] = [
  { value: 'admin', label: 'Administrador' },
  { value: 'gestor_regional', label: 'Gestor Regional' },
  { value: 'consultor_vendas', label: 'Consultor de Vendas' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'sinistro', label: 'Sinistro' },
  { value: 'cotador', label: 'Cotador' },
];
const papelLabel = (p: PapelUsuario) => PAPEIS.find((x) => x.value === p)?.label ?? p;

export default function UsuariosPage() {
  const { data: usuarios, isLoading } = useUsuarios();
  const { data: regionais } = useRegionais();
  const criar = useCreateUsuario();
  const atualizar = useUpdateUsuario();

  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState<NovoUsuario>({
    nome: '',
    email: '',
    senha: '',
    papel: 'consultor_vendas',
    regional_id: null,
  });

  function novo() {
    setForm({ nome: '', email: '', senha: '', papel: 'consultor_vendas', regional_id: null });
    setAberto(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    criar.mutate(form, {
      onSuccess: () => {
        toast.success('Usuario criado');
        setAberto(false);
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  function alterar(u: UsuariosRow, patch: Partial<UsuariosRow>) {
    atualizar.mutate(
      { id: u.id, ...patch },
      {
        onSuccess: () => toast.success('Atualizado'),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Crie usuarios da equipe e defina o papel (permissoes) e a regional de cada um.
        </p>
        <Button onClick={novo}>
          <Plus className="h-4 w-4" /> Novo Usuario
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">E-mail</th>
              <th className="px-4 py-2">Papel</th>
              <th className="px-4 py-2">Regional</th>
              <th className="px-4 py-2">Ativo</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Carregando...
                </td>
              </tr>
            )}
            {(usuarios ?? []).map((u) => (
              <tr key={u.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2 font-medium text-slate-800">
                  <span className="inline-flex items-center gap-2">
                    <UserCog className="h-4 w-4 text-brand-500" /> {u.nome}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-600">{u.email}</td>
                <td className="px-4 py-2">
                  <Select
                    className="py-1"
                    value={u.papel}
                    onChange={(e) => alterar(u, { papel: e.target.value as PapelUsuario })}
                  >
                    {PAPEIS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-4 py-2">
                  <Select
                    className="py-1"
                    value={u.regional_id ?? ''}
                    onChange={(e) => alterar(u, { regional_id: e.target.value || null })}
                  >
                    <option value="">-- Global --</option>
                    {(regionais ?? []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nome}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={u.ativo}
                    onChange={(e) => alterar(u, { ativo: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </td>
              </tr>
            ))}
            {!isLoading && (usuarios ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Nenhum usuario cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={aberto} onClose={() => setAberto(false)} title="Novo Usuario" tamanho="lg">
        <form onSubmit={submit} className="space-y-3">
          <FormField label="Nome completo *">
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </FormField>
          <FormField label="E-mail *">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </FormField>
          <FormField label="Senha provisoria * (min. 6 caracteres)">
            <Input
              type="text"
              value={form.senha}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
              placeholder="O usuario podera troca-la depois"
            />
          </FormField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Papel *">
              <Select
                value={form.papel}
                onChange={(e) => setForm({ ...form, papel: e.target.value as PapelUsuario })}
              >
                {PAPEIS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Regional">
              <Select
                value={form.regional_id ?? ''}
                onChange={(e) => setForm({ ...form, regional_id: e.target.value || null })}
              >
                <option value="">-- Global --</option>
                {(regionais ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <p className="text-xs text-slate-400">
            Papeis <strong>admin</strong> e <strong>financeiro</strong> tem acesso global (todas as
            regionais). Os demais ficam restritos a regional escolhida.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={criar.isPending}>
              {criar.isPending ? 'Criando...' : 'Criar usuario'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
