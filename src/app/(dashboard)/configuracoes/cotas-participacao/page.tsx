'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Save, Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useCotasParticipacao, useSaveCota, useDeleteCota } from '@/hooks/use-precificacao';
import type { CotasParticipacaoRow } from '@/lib/database.types';

export default function CotasParticipacaoPage() {
  const { data: cotas, isLoading } = useCotasParticipacao();
  const salvar = useSaveCota();
  const excluir = useDeleteCota();

  const [codigo, setCodigo] = useState('');
  const [pct, setPct] = useState<number | ''>('');

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Cotas de participacao (cota de rateio no evento) como percentual da FIPE. O modelo do
        veiculo herda a cota (padrao SGA: V5=5%, V10=10%...), e o veiculo pode sobrescrever. Alterar
        um percentual aqui reflete em todos os veiculos que usam essa cota — sem precisar criar novos
        planos.
      </p>

      <div className="rounded-lg border border-slate-200 bg-superficie">
        <div className="border-b border-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
          Cotas cadastradas
        </div>

        <div className="flex flex-wrap items-end gap-2 p-3">
          <div>
            <label className="text-xs text-slate-500">Codigo</label>
            <Input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Ex.: V10"
              className="mt-0 w-28"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Percentual (%)</label>
            <Input
              type="number"
              step="0.1"
              value={pct}
              onChange={(e) => setPct(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="Ex.: 10"
              className="mt-0 w-32"
            />
          </div>
          <Button
            onClick={() => {
              if (!codigo.trim() || pct === '') return toast.error('Informe codigo e percentual');
              salvar.mutate(
                { codigo: codigo.trim(), percentual: Number(pct) / 100 },
                {
                  onSuccess: () => {
                    setCodigo('');
                    setPct('');
                    toast.success('Cota salva');
                  },
                  onError: (e) => toast.error((e as Error).message),
                },
              );
            }}
          >
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-slate-100 text-left text-[11px] uppercase text-slate-400">
              <th className="px-4 py-1.5">Codigo</th>
              <th className="px-2 py-1.5">% da FIPE</th>
              <th className="px-2 py-1.5">Descricao</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-3 text-slate-400">
                  Carregando...
                </td>
              </tr>
            )}
            {(cotas ?? []).map((c) => (
              <CotaRow
                key={c.id}
                cota={c}
                onSalvar={(percentual) =>
                  salvar.mutate(
                    { id: c.id, codigo: c.codigo, percentual, descricao: c.descricao, ativo: c.ativo },
                    {
                      onSuccess: () => toast.success('Percentual atualizado'),
                      onError: (e) => toast.error((e as Error).message),
                    },
                  )
                }
                onExcluir={() => {
                  if (confirm(`Excluir a cota "${c.codigo}"?`))
                    excluir.mutate(c.id, { onError: (e) => toast.error((e as Error).message) });
                }}
              />
            ))}
            {!isLoading && (cotas ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-3 text-slate-400">
                  Nenhuma cota cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CotaRow({
  cota,
  onSalvar,
  onExcluir,
}: {
  cota: CotasParticipacaoRow;
  onSalvar: (percentual: number) => void;
  onExcluir: () => void;
}) {
  const [pct, setPct] = useState(Math.round(cota.percentual * 10000) / 100);
  const alterado = pct !== Math.round(cota.percentual * 10000) / 100;
  return (
    <tr className="border-b border-slate-50">
      <td className="px-4 py-1.5 font-medium text-slate-700">
        <span className="inline-flex items-center gap-1">
          <Percent className="h-3.5 w-3.5 text-slate-400" />
          {cota.codigo}
        </span>
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          step="0.1"
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <span className="ml-1 text-xs text-slate-400">%</span>
      </td>
      <td className="px-2 py-1.5 text-slate-500">{cota.descricao ?? '-'}</td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-2">
          <button
            title="Salvar"
            disabled={!alterado}
            onClick={() => onSalvar(pct / 100)}
            className={alterado ? '' : 'opacity-30'}
          >
            <Save className="h-4 w-4 text-emerald-500 hover:text-emerald-700" />
          </button>
          <button title="Excluir" onClick={onExcluir}>
            <Trash2 className="h-4 w-4 text-rose-400 hover:text-rose-600" />
          </button>
        </div>
      </td>
    </tr>
  );
}
