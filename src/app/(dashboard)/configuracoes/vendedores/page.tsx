'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, BadgeDollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select } from '@/components/ui/field';
import {
  useVendedores,
  useSaveVendedor,
  useDeleteVendedor,
  useUsuarios,
  useRegionais,
} from '@/hooks/use-config';
import type { VendedoresRow } from '@/lib/database.types';

export default function VendedoresPage() {
  const { data: vendedores, isLoading } = useVendedores();
  const { data: usuarios } = useUsuarios();
  const { data: regionais } = useRegionais();
  const salvar = useSaveVendedor();
  const excluir = useDeleteVendedor();

  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState<Partial<VendedoresRow>>({});

  const nomeUsuario = useMemo(() => new Map((usuarios ?? []).map((u) => [u.id, u.nome])), [usuarios]);
  const nomeRegional = useMemo(() => new Map((regionais ?? []).map((r) => [r.id, r.nome])), [regionais]);

  function novo() {
    setForm({ taxa_comissao_adesao: 0, taxa_comissao_recorrente: 0, ativo: true });
    setAberto(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.usuario_id) return toast.error('Selecione o usuario');
    salvar.mutate(form, {
      onSuccess: () => {
        toast.success('Vendedor salvo');
        setAberto(false);
      },
      onError: (err) => {
        const m = (err as Error).message;
        toast.error(m.includes('usuario_id') ? 'Este usuario ja e vendedor' : m);
      },
    });
  }

  // percentuais sao guardados como fracao (0.10 = 10%)
  const pct = (v: number | undefined) => ((v ?? 0) * 100).toFixed(2).replace('.00', '') + '%';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Vincule usuarios como vendedores (consultores) e defina as taxas de comissao. Eles ficam
          disponiveis no cadastro de veiculos.
        </p>
        <Button onClick={novo}>
          <Plus className="h-4 w-4" /> Novo Vendedor
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Vendedor</th>
              <th className="px-4 py-2">Regional</th>
              <th className="px-4 py-2">Comissao Adesao</th>
              <th className="px-4 py-2">Comissao Recorrente</th>
              <th className="px-4 py-2">Ativo</th>
              <th className="px-4 py-2 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Carregando...
                </td>
              </tr>
            )}
            {(vendedores ?? []).map((v) => (
              <tr key={v.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2 font-medium text-slate-800">
                  <span className="inline-flex items-center gap-2">
                    <BadgeDollarSign className="h-4 w-4 text-brand-500" />
                    {nomeUsuario.get(v.usuario_id) ?? '(usuario)'}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {v.regional_id ? nomeRegional.get(v.regional_id) ?? '-' : 'Global'}
                </td>
                <td className="px-4 py-2 text-slate-600">{pct(v.taxa_comissao_adesao)}</td>
                <td className="px-4 py-2 text-slate-600">{pct(v.taxa_comissao_recorrente)}</td>
                <td className="px-4 py-2">
                  <span className={v.ativo ? 'text-emerald-600' : 'text-slate-400'}>
                    {v.ativo ? 'Sim' : 'Nao'}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        if (confirm('Remover este vendedor?'))
                          excluir.mutate(v.id, { onError: (e) => toast.error((e as Error).message) });
                      }}
                      className="rounded p-1.5 text-rose-500 hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && (vendedores ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Nenhum vendedor cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={aberto} onClose={() => setAberto(false)} title="Novo Vendedor">
        <form onSubmit={submit} className="space-y-3">
          <FormField label="Usuario *">
            <Select
              value={form.usuario_id ?? ''}
              onChange={(e) => setForm({ ...form, usuario_id: e.target.value })}
            >
              <option value="">-- Selecione --</option>
              {(usuarios ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome} ({u.papel})
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
          <TetoDaRegional regionalId={form.regional_id ?? null} />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Comissao adesao (%)">
              <Input
                type="number"
                step="0.01"
                min={0}
                value={(form.taxa_comissao_adesao ?? 0) * 100}
                onChange={(e) =>
                  setForm({ ...form, taxa_comissao_adesao: (Number(e.target.value) || 0) / 100 })
                }
              />
            </FormField>
            <FormField label="Comissao recorrente (%)">
              <Input
                type="number"
                step="0.01"
                min={0}
                value={(form.taxa_comissao_recorrente ?? 0) * 100}
                onChange={(e) =>
                  setForm({ ...form, taxa_comissao_recorrente: (Number(e.target.value) || 0) / 100 })
                }
              />
            </FormField>
          </div>
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

/**
 * Teto herdado da franquia. A comissao do vendedor nunca pode passar a da sua
 * regional — a trava vale no banco (0034), aqui e so para o operador ver antes
 * de tentar salvar.
 */
function TetoDaRegional({ regionalId }: { regionalId: string | null }) {
  const { data: regionais } = useRegionais();
  const reg = (regionais ?? []).find((r) => r.id === regionalId);

  if (!regionalId) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
        Escolha a regional primeiro: a comissao do vendedor sai do que a franquia recebe.
      </p>
    );
  }
  if (!reg) return null;

  const ad = Number(reg.taxa_comissao_adesao ?? 0) * 100;
  const rec = Number(reg.taxa_comissao_recorrente ?? 0) * 100;

  return (
    <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11.5px] leading-relaxed text-slate-600">
      Teto de <b>{reg.nome}</b>: adesao ate <b className="tnum">{ad.toFixed(2).replace('.', ',')}%</b>{' '}
      e recorrencia ate <b className="tnum">{rec.toFixed(2).replace('.', ',')}%</b>.
      {ad === 0 && rec === 0 && ' Configure a comissao da franquia em Configuracoes -> Regionais.'}
    </p>
  );
}
