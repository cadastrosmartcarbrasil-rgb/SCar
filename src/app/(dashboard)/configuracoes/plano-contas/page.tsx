'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select } from '@/components/ui/field';
import { usePlanoContas, useSaveCategoria, useDeleteCategoria } from '@/hooks/use-config';
import type { CategoriasDreRow, TipoCategoriaDre } from '@/lib/database.types';

const TIPOS: { value: TipoCategoriaDre; label: string; cor: string }[] = [
  { value: 'RECEITA', label: 'Receita', cor: 'bg-emerald-50 text-emerald-700' },
  { value: 'CUSTO_VARIAVEL', label: 'Custo Variavel', cor: 'bg-amber-50 text-amber-700' },
  { value: 'DESPESA_FIXA', label: 'Despesa Fixa', cor: 'bg-rose-50 text-rose-700' },
];
const tipoMeta = (t: TipoCategoriaDre) => TIPOS.find((x) => x.value === t)!;

export default function PlanoContasPage() {
  const { data: categorias, isLoading } = usePlanoContas();
  const salvar = useSaveCategoria();
  const excluir = useDeleteCategoria();

  const [aberto, setAberto] = useState(false);
  const [ed, setEd] = useState<Partial<CategoriasDreRow> | null>(null);

  function novo() {
    setEd({ codigo_estruturado: '', nome: '', tipo: 'RECEITA', ativo: true });
    setAberto(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ed?.codigo_estruturado || !ed?.nome) return toast.error('Preencha codigo e nome');
    salvar.mutate(ed, {
      onSuccess: () => {
        toast.success('Conta salva');
        setAberto(false);
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Estrutura de contas usada no DRE. Edite os codigos, nomes e classificacoes conforme sua
          contabilidade.
        </p>
        <Button onClick={novo}>
          <Plus className="h-4 w-4" /> Nova Conta
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Codigo</th>
              <th className="px-4 py-2">Nome da conta</th>
              <th className="px-4 py-2">Classificacao</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Acoes</th>
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
            {(categorias ?? []).map((c) => {
              const meta = tipoMeta(c.tipo);
              return (
                <tr key={c.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{c.codigo_estruturado}</td>
                  <td className="px-4 py-2 font-medium text-slate-800">{c.nome}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${meta.cor}`}>{meta.label}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={c.ativo ? 'text-emerald-600' : 'text-slate-400'}>
                      {c.ativo ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => {
                          setEd(c);
                          setAberto(true);
                        }}
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Excluir a conta "${c.nome}"?`))
                            excluir.mutate(c.id, {
                              onSuccess: () => toast.success('Conta excluida'),
                              onError: (e) => toast.error((e as Error).message),
                            });
                        }}
                        className="rounded p-1.5 text-rose-500 hover:bg-rose-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!isLoading && (categorias ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Nenhuma conta cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={aberto} onClose={() => setAberto(false)} title={ed?.id ? 'Editar Conta' : 'Nova Conta'}>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Codigo *">
              <Input
                value={ed?.codigo_estruturado ?? ''}
                onChange={(e) => setEd((p) => ({ ...p, codigo_estruturado: e.target.value }))}
                placeholder="1.1.01"
              />
            </FormField>
            <FormField label="Nome da conta *" className="col-span-2">
              <Input value={ed?.nome ?? ''} onChange={(e) => setEd((p) => ({ ...p, nome: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Classificacao *">
            <Select
              value={ed?.tipo ?? 'RECEITA'}
              onChange={(e) => setEd((p) => ({ ...p, tipo: e.target.value as TipoCategoriaDre }))}
            >
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </FormField>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={ed?.ativo ?? true}
              onChange={(e) => setEd((p) => ({ ...p, ativo: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300"
            />
            Conta ativa
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
