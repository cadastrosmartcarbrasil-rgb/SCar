'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField, Input, MoneyInput, Select } from '@/components/ui/field';
import { usePlanoContas } from '@/hooks/use-config';
import { useMovimentacoesEvento, useAddMovimentacaoEvento } from '@/hooks/use-evento-cadastro';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { MovimentacoesCaixaRow, TipoMovimentacao } from '@/lib/database.types';

// Lancamentos financeiros (contas a pagar/receber) vinculados ao protocolo.
export function EventoFinanceiro({ eventoId, regionalId }: { eventoId: string; regionalId?: string | null }) {
  const { data: movs, isLoading } = useMovimentacoesEvento(eventoId);
  const { data: categorias } = usePlanoContas();
  const add = useAddMovimentacaoEvento(eventoId, regionalId);

  const hoje = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<Partial<MovimentacoesCaixaRow>>({
    tipo: 'DESPESA',
    valor: 0,
    data_competencia: hoje,
  });

  const m = movs ?? [];
  const receber = m.filter((x) => x.tipo === 'RECEITA').reduce((s, x) => s + Number(x.valor), 0);
  const pagar = m.filter((x) => x.tipo === 'DESPESA').reduce((s, x) => s + Number(x.valor), 0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.valor || form.valor <= 0) return toast.error('Informe um valor');
    add.mutate(form, {
      onSuccess: () => {
        toast.success('Lancamento adicionado');
        setForm({ tipo: form.tipo, valor: 0, data_competencia: hoje });
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Box titulo="A Receber" valor={receber} cor="text-emerald-600" />
        <Box titulo="A Pagar" valor={pagar} cor="text-rose-600" />
        <Box titulo="Saldo do evento" valor={receber - pagar} cor="text-slate-800" />
      </div>

      {/* Novo lancamento */}
      <form onSubmit={submit} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-3 lg:grid-cols-6">
        <FormField label="Tipo">
          <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoMovimentacao })}>
            <option value="DESPESA">A Pagar</option>
            <option value="RECEITA">A Receber</option>
          </Select>
        </FormField>
        <FormField label="Categoria (DRE)" className="lg:col-span-2">
          <Select value={form.categoria_dre_id ?? ''} onChange={(e) => setForm({ ...form, categoria_dre_id: e.target.value || null })}>
            <option value="">--</option>
            {(categorias ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo_estruturado} - {c.nome}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Valor (R$)">
          <MoneyInput value={form.valor ?? null} onChange={(v) => setForm({ ...form, valor: v ?? 0 })} />
        </FormField>
        <FormField label="Competencia">
          <Input type="date" value={form.data_competencia ?? hoje} onChange={(e) => setForm({ ...form, data_competencia: e.target.value })} />
        </FormField>
        <div className="flex items-end">
          <Button type="submit" disabled={add.isPending} className="w-full">
            <Plus className="h-4 w-4" /> Lancar
          </Button>
        </div>
        <FormField label="Descricao" className="lg:col-span-6">
          <Input value={form.descricao ?? ''} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Ex.: pagamento de funilaria" />
        </FormField>
      </form>

      {/* Lista */}
      {isLoading ? (
        <p className="text-sm text-slate-400">Carregando...</p>
      ) : m.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum lancamento vinculado a este protocolo.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="py-2">Competencia</th>
              <th className="py-2">Tipo</th>
              <th className="py-2">Descricao</th>
              <th className="py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {m.map((x) => (
              <tr key={x.id} className="border-b border-slate-50">
                <td className="py-2">{formatDate(x.data_competencia)}</td>
                <td className="py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${x.tipo === 'RECEITA' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                    {x.tipo === 'RECEITA' ? 'A Receber' : 'A Pagar'}
                  </span>
                </td>
                <td className="py-2 text-slate-600">{x.descricao ?? '-'}</td>
                <td className="py-2 text-right font-medium">{formatCurrency(x.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Box({ titulo, valor, cor }: { titulo: string; valor: number; cor: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-superficie p-3">
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className={`mt-1 text-lg font-semibold ${cor}`}>{formatCurrency(valor)}</p>
    </div>
  );
}
