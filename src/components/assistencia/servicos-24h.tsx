'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select, MoneyInput } from '@/components/ui/field';
import { usePlanoContas } from '@/hooks/use-config';
import { useServicosAssistencia, useSaveServicoAssistencia } from '@/hooks/use-assistencia';
import { formatCurrency } from '@/lib/utils';
import type { ServicosAssistenciaRow } from '@/lib/database.types';

// Cadastro/parametrizacao dos servicos de Assistencia 24h.
export function Servicos24h() {
  const { data: servicos, isLoading } = useServicosAssistencia();
  const { data: planoContas } = usePlanoContas();
  const salvar = useSaveServicoAssistencia();
  const [edit, setEdit] = useState<Partial<ServicosAssistenciaRow> | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!edit?.descricao?.trim()) return toast.error('Informe a descricao do servico');
    salvar.mutate(edit, {
      onSuccess: () => { toast.success('Servico salvo'); setEdit(null); },
      onError: (err) => toast.error(err.message),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Valor pago ao prestador, plano de contas, KM excedente e a regra de limite de uso
          (usada em tempo real no painel do atendente).
        </p>
        <Button onClick={() => setEdit({ ativo: true, limite_quantidade: 2, limite_janela_meses: 12, ordem: 0 })}>
          <Plus className="h-4 w-4" /> Novo servico
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Servico</th>
              <th className="px-4 py-2 text-right">Valor padrao</th>
              <th className="px-4 py-2">KM excedente</th>
              <th className="px-4 py-2">Limite de uso</th>
              <th className="px-4 py-2">Plano de contas</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Carregando...</td></tr>}
            {(servicos ?? []).map((s) => (
              <tr key={s.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2 font-medium text-slate-700">{s.descricao}</td>
                <td className="tnum px-4 py-2 text-right">{formatCurrency(Number(s.valor_padrao))}</td>
                <td className="px-4 py-2 text-slate-600">
                  {s.cobra_km_excedente
                    ? `${formatCurrency(Number(s.valor_km_excedente))}/km apos ${s.km_franquia} km`
                    : <span className="text-slate-400">Nao cobra</span>}
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {s.computa_limite
                    ? `${s.limite_quantidade} uso(s) / ${s.limite_janela_meses} meses`
                    : <span className="text-slate-400">Sem limite</span>}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {planoContas?.find((c) => c.id === s.categoria_dre_id)?.nome ?? '-'}
                </td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${s.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {s.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEdit(s)}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar servico 24h' : 'Novo servico 24h'} tamanho="lg">
        <form onSubmit={submit} className="space-y-3">
          <FormField label="Descricao do servico">
            <Input
              value={edit?.descricao ?? ''}
              onChange={(e) => setEdit({ ...edit, descricao: e.target.value })}
              placeholder="Ex.: Reboque Passeio, Chaveiro, Carro Reserva"
            />
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Valor padrao pago ao prestador">
              <MoneyInput value={edit?.valor_padrao ?? 0} onChange={(v) => setEdit({ ...edit, valor_padrao: v ?? 0 })} />
            </FormField>
            <FormField label="Plano de contas (contas a pagar)">
              <Select
                value={edit?.categoria_dre_id ?? ''}
                onChange={(e) => setEdit({ ...edit, categoria_dre_id: e.target.value || null })}
              >
                <option value="">Selecione...</option>
                {(planoContas ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.codigo_estruturado} — {c.nome}</option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={edit?.cobra_km_excedente ?? false}
                onChange={(e) => setEdit({ ...edit, cobra_km_excedente: e.target.checked })}
              />
              Cobranca de KM excedente
            </label>
            {edit?.cobra_km_excedente && (
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <FormField label="Valor padrao do KM excedente">
                  <MoneyInput value={edit?.valor_km_excedente ?? 0} onChange={(v) => setEdit({ ...edit, valor_km_excedente: v ?? 0 })} />
                </FormField>
                <FormField label="KM de franquia (inclusos)">
                  <Input
                    type="number" min={0}
                    value={edit?.km_franquia ?? 0}
                    onChange={(e) => setEdit({ ...edit, km_franquia: Number(e.target.value) })}
                  />
                </FormField>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={edit?.computa_limite ?? false}
                onChange={(e) => setEdit({ ...edit, computa_limite: e.target.checked })}
              />
              Computar utilizacao no limite do opcional
            </label>
            {edit?.computa_limite && (
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <FormField label="Quantidade de usos">
                  <Input
                    type="number" min={0}
                    value={edit?.limite_quantidade ?? 1}
                    onChange={(e) => setEdit({ ...edit, limite_quantidade: Number(e.target.value) })}
                  />
                </FormField>
                <FormField label="Periodo (meses, janela flutuante)">
                  <Input
                    type="number" min={1}
                    value={edit?.limite_janela_meses ?? 12}
                    onChange={(e) => setEdit({ ...edit, limite_janela_meses: Number(e.target.value) })}
                  />
                </FormField>
                <p className="text-xs text-slate-500 sm:col-span-2">
                  Ex.: 2 utilizacoes a cada 12 meses — o painel do atendente mostra o consumo em tempo real.
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Ordem de exibicao">
              <Input
                type="number"
                value={edit?.ordem ?? 0}
                onChange={(e) => setEdit({ ...edit, ordem: Number(e.target.value) })}
              />
            </FormField>
            <FormField label="Status">
              <Select
                value={edit?.ativo === false ? 'inativo' : 'ativo'}
                onChange={(e) => setEdit({ ...edit, ativo: e.target.value === 'ativo' })}
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </Select>
            </FormField>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button type="submit" disabled={salvar.isPending}>Salvar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
