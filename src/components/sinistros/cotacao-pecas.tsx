'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';
import type { CotacoesPecasRow, ItensCotacaoRow, TipoReparo } from '@/lib/database.types';

// Modulo de cotacao de pecas: lancamento de fornecedor e itens.
// valor_total e recalculado por trigger no banco (fn_recalcular_cotacao).
// tipoReparo separa reparo do veiculo proprio x veiculo de terceiro.
export function CotacaoPecas({ eventoId, tipoReparo }: { eventoId: string; tipoReparo?: TipoReparo }) {
  const supabase = createClient();
  const qc = useQueryClient();
  const [fornecedor, setFornecedor] = useState('');
  const chave = ['eventos', eventoId, 'cotacoes', tipoReparo ?? 'all'];

  const { data: cotacoes } = useQuery<(CotacoesPecasRow & { itens_cotacao: ItensCotacaoRow[] })[]>({
    queryKey: chave,
    queryFn: async () => {
      let q = supabase
        .from('cotacoes_pecas')
        .select('*, itens_cotacao(*)')
        .eq('evento_id', eventoId)
        .order('created_at', { ascending: true });
      if (tipoReparo) q = q.eq('tipo_reparo', tipoReparo);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as never;
    },
  });

  const criarCotacao = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('cotacoes_pecas').insert({
        evento_id: eventoId,
        fornecedor_nome: fornecedor || 'Novo fornecedor',
        tipo_reparo: tipoReparo ?? 'PROPRIO',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setFornecedor('');
      qc.invalidateQueries({ queryKey: chave });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const addItem = useMutation({
    mutationFn: async (v: { cotacaoId: string; desc: string; qtd: number; unit: number }) => {
      const { error } = await supabase.from('itens_cotacao').insert({
        cotacao_id: v.cotacaoId,
        descricao_peca: v.desc,
        quantidade: v.qtd,
        valor_unitario: v.unit,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chave }),
    onError: (e) => toast.error((e as Error).message),
  });

  const delItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('itens_cotacao').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chave }),
  });

  const mudarStatus = useMutation({
    mutationFn: async (v: { id: string; status: CotacoesPecasRow['status'] }) => {
      const { error } = await supabase.from('cotacoes_pecas').update({ status: v.status }).eq('id', v.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chave }),
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={fornecedor}
          onChange={(e) => setFornecedor(e.target.value)}
          placeholder="Nome do fornecedor"
          className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          onClick={() => criarCotacao.mutate()}
          className="flex items-center gap-1 rounded-md bg-acao px-3 py-1.5 text-sm text-white hover:bg-acao-escura"
        >
          <Plus className="h-4 w-4" /> Nova cotacao
        </button>
      </div>

      {(cotacoes ?? []).map((c) => (
        <CotacaoCard key={c.id} cotacao={c} onAddItem={addItem} onDelItem={delItem} onStatus={mudarStatus} />
      ))}
      {(cotacoes ?? []).length === 0 && (
        <p className="text-sm text-slate-400">Nenhuma cotacao lancada.</p>
      )}
    </div>
  );
}

const STATUS_COTACAO_COR: Record<string, string> = {
  EM_ABERTO: 'bg-slate-100 text-slate-600',
  APROVADA: 'bg-emerald-50 text-emerald-700',
  REJEITADA: 'bg-rose-50 text-rose-700',
};

function CotacaoCard({
  cotacao,
  onAddItem,
  onDelItem,
  onStatus,
}: {
  cotacao: CotacoesPecasRow & { itens_cotacao: ItensCotacaoRow[] };
  onAddItem: ReturnType<typeof useMutation<void, Error, { cotacaoId: string; desc: string; qtd: number; unit: number }>>;
  onDelItem: ReturnType<typeof useMutation<void, Error, string>>;
  onStatus: ReturnType<typeof useMutation<void, Error, { id: string; status: CotacoesPecasRow['status'] }>>;
}) {
  const [desc, setDesc] = useState('');
  const [qtd, setQtd] = useState(1);
  const [unit, setUnit] = useState(0);

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="font-medium text-slate-800">{cotacao.fornecedor_nome}</p>
          <span className={`rounded px-2 py-0.5 text-xs ${STATUS_COTACAO_COR[cotacao.status] ?? ''}`}>
            {cotacao.status}
          </span>
        </div>
        <span className="text-sm font-semibold text-brand-700">{formatCurrency(cotacao.valor_total)}</span>
      </div>

      <div className="mb-2 flex gap-2">
        <button
          onClick={() => onStatus.mutate({ id: cotacao.id, status: 'APROVADA' })}
          className="rounded border border-emerald-200 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-50"
        >
          Aprovar
        </button>
        <button
          onClick={() => onStatus.mutate({ id: cotacao.id, status: 'REJEITADA' })}
          className="rounded border border-rose-200 px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-50"
        >
          Rejeitar
        </button>
      </div>

      <table className="w-full text-sm">
        <tbody>
          {cotacao.itens_cotacao?.map((i) => (
            <tr key={i.id} className="border-t border-slate-100">
              <td className="py-1">{i.descricao_peca}</td>
              <td className="py-1 text-center text-slate-500">{i.quantidade}x</td>
              <td className="py-1 text-right">{formatCurrency(i.valor_unitario)}</td>
              <td className="py-1 pl-2 text-right">
                <button onClick={() => onDelItem.mutate(i.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-rose-400 hover:text-rose-600" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 flex gap-1">
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Peca"
          className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
        />
        <input
          type="number"
          value={qtd}
          min={1}
          onChange={(e) => setQtd(Number(e.target.value))}
          className="w-14 rounded border border-slate-300 px-2 py-1 text-xs"
        />
        <input
          type="number"
          value={unit}
          min={0}
          step="0.01"
          onChange={(e) => setUnit(Number(e.target.value))}
          className="w-24 rounded border border-slate-300 px-2 py-1 text-xs"
        />
        <button
          onClick={() => {
            if (!desc) return;
            onAddItem.mutate({ cotacaoId: cotacao.id, desc, qtd, unit });
            setDesc('');
            setQtd(1);
            setUnit(0);
          }}
          className="rounded bg-acao px-2 text-white"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
