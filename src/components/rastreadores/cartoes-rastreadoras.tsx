'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Satellite, AlertTriangle, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { lerTodas } from '@/lib/paginacao';
import { formatCurrency, cn } from '@/lib/utils';
import { baixarCsv } from '@/components/financeiro/ui-financeiro';
import { useEmpresasRastreamento } from '@/hooks/use-rastreamento';
import {
  resumoPorRastreadora, STATUS_NA_BASE,
  type VeiculoDaRastreadora, type EquipamentoDoParque,
} from '@/lib/rastreadoras-resumo';

// Um cartão por rastreadora: quantos veículos ela rastreia, onde, quanto custa e o
// que pede ação. Clicar escolhe a rastreadora para a planilha e abre a lista.

interface VeiculoLido {
  id: string; placa: string | null; status: string; empresa_rastreamento_id: string;
  rastreador_imei: string | null;
  clientes: { nome_razao_social: string } | null;
  regionais: { nome: string } | null;
}

export const CHAVE_RESUMO_RASTREADORAS = ['rastreamento', 'resumo-rastreadoras'];

function useResumoRastreadoras() {
  const supabase = createClient();
  return useQuery({
    queryKey: CHAVE_RESUMO_RASTREADORAS,
    queryFn: async () => {
      const [veiculos, parque] = await Promise.all([
        lerTodas<VeiculoLido>((de, ate) =>
          supabase.from('veiculos')
            .select('id, placa, status, empresa_rastreamento_id, rastreador_imei, clientes(nome_razao_social), regionais!veiculos_regional_id_fkey(nome)')
            .not('empresa_rastreamento_id', 'is', null)
            .order('id').range(de, ate) as never),
        lerTodas<EquipamentoDoParque>((de, ate) =>
          supabase.from('rastreadores').select('empresa_rastreamento_id, status, veiculo_id')
            .order('id').range(de, ate) as never),
      ]);
      return {
        veiculos: veiculos.map<VeiculoDaRastreadora>((v) => ({
          id: v.id, placa: v.placa, status: v.status, empresa_rastreamento_id: v.empresa_rastreamento_id,
          rastreador_imei: v.rastreador_imei, regional: v.regionais?.nome ?? null,
          associado: v.clientes?.nome_razao_social ?? null,
        })),
        parque,
      };
    },
  });
}

export function CartoesRastreadoras({ selecionada, onSelecionar }: {
  selecionada: string;
  onSelecionar: (id: string) => void;
}) {
  const { data: rastreadoras } = useEmpresasRastreamento();
  const q = useResumoRastreadoras();
  const [aberta, setAberta] = useState<string | null>(null);

  const resumo = useMemo(() => resumoPorRastreadora(
    (rastreadoras ?? []).map((r) => ({ id: r.id, nome: r.nome, custo_mensal_equipamento: r.custo_mensal_equipamento })),
    q.data?.veiculos ?? [], q.data?.parque ?? [],
  ), [rastreadoras, q.data]);

  const comParque = useMemo(() => {
    const s = new Map<string, string>();
    for (const p of q.data?.parque ?? []) {
      if (p.veiculo_id && (p.status === 'ATIVO' || p.status === 'INADIMPLENTE')) s.set(p.veiculo_id, p.status);
    }
    return s;
  }, [q.data]);

  if (q.isLoading) return <p className="text-sm text-slate-500">Carregando as rastreadoras…</p>;
  if (q.error) return <p className="text-sm text-red-600">Não consegui ler as rastreadoras: {String((q.error as { message?: string }).message ?? q.error)}</p>;
  if (!resumo.length) return null;

  const lista = (q.data?.veiculos ?? [])
    .filter((v) => v.empresa_rastreamento_id === aberta)
    .sort((a, b) => Number(STATUS_NA_BASE.includes(b.status)) - Number(STATUS_NA_BASE.includes(a.status))
      || (a.regional ?? '').localeCompare(b.regional ?? '') || (a.placa ?? '').localeCompare(b.placa ?? ''));
  const nomeAberta = resumo.find((r) => r.id === aberta)?.nome ?? '';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {resumo.map((r) => (
          <div key={r.id}
            className={cn('rounded-2xl border bg-superficie p-4 transition',
              selecionada === r.id ? 'border-cyan-500 ring-1 ring-cyan-500' : 'border-slate-200')}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Satellite className="h-4 w-4 text-cyan-600" />
                <h3 className="font-display text-sm font-semibold text-slate-900">{r.nome}</h3>
              </div>
              {r.custoEstimado != null && (
                <span className="tnum text-xs text-slate-500" title="Veículos na base × custo do equipamento no cadastro do fornecedor">
                  ~{formatCurrency(r.custoEstimado)}/mês
                </span>
              )}
            </div>
            <p className="tnum mt-2 text-2xl text-slate-900">{r.naBase}
              <span className="ml-1 text-sm font-normal text-slate-500">veículos na base</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {r.porUnidade.map((u) => `${u.unidade} ${u.veiculos}`).join(' · ') || '—'}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-superficie-alta p-2">
                <p className="tnum text-base text-slate-900">{r.parqueAtivo}</p><p className="text-slate-500">2 · Ativo</p>
              </div>
              <div className="rounded-lg bg-superficie-alta p-2">
                <p className="tnum text-base text-slate-900">{r.parqueInadimplente}</p><p className="text-slate-500">3 · Inadimpl.</p>
              </div>
              <div className="rounded-lg bg-superficie-alta p-2">
                <p className="tnum text-base text-slate-900">{r.parqueInativo}</p><p className="text-slate-500">4 · Recolher</p>
              </div>
            </div>
            {r.semParque > 0 && (
              <p className="mt-2 text-xs text-slate-500">{r.semParque} só pela ficha (sem IMEI no parque)</p>
            )}
            {r.foraDaBase > 0 && (
              <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" /> {r.foraDaBase} ligado(s) a ela e fora da base
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => onSelecionar(r.id)}
                className={cn('rounded-lg border px-2.5 py-1 text-xs font-medium',
                  selecionada === r.id ? 'border-cyan-500 text-cyan-700 dark:text-cyan-300' : 'border-slate-300 text-slate-700 hover:bg-slate-50')}>
                {selecionada === r.id ? 'Escolhida para a planilha' : 'Subir planilha desta'}
              </button>
              <button onClick={() => setAberta(aberta === r.id ? null : r.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                {aberta === r.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Ver os {r.veiculos} veículos
              </button>
            </div>
          </div>
        ))}
      </div>

      {aberta && (
        <div className="rounded-2xl border border-slate-200 bg-superficie">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
            <p className="text-sm font-medium text-slate-900">{nomeAberta} · {lista.length} veículo(s)</p>
            <button onClick={() => baixarCsv(`veiculos-${nomeAberta.replace(/\W+/g, '-')}.csv`, [
              ['Placa', 'Associado', 'Unidade', 'Situação do veículo', 'No parque', 'IMEI'],
              ...lista.map((v) => [v.placa ?? '', v.associado ?? '', v.regional ?? '', v.status,
                comParque.get(v.id) ?? 'só ficha', v.rastreador_imei ?? '']),
            ])} className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900">
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-superficie-alta text-left text-xs text-slate-500">
                <tr><th className="px-3 py-2">Placa</th><th className="px-3 py-2">Associado</th><th className="px-3 py-2">Unidade</th>
                  <th className="px-3 py-2">Veículo</th><th className="px-3 py-2">Parque</th></tr>
              </thead>
              <tbody>
                {lista.map((v) => (
                  <tr key={v.id} className="border-t border-slate-200">
                    <td className="placa px-3 py-1.5">{v.placa ?? '—'}</td>
                    <td className="px-3 py-1.5">{v.associado ?? '—'}</td>
                    <td className="px-3 py-1.5">{v.regional ?? 'Matriz'}</td>
                    <td className={cn('px-3 py-1.5', !STATUS_NA_BASE.includes(v.status) && 'font-medium text-amber-700 dark:text-amber-300')}>{v.status}</td>
                    <td className="px-3 py-1.5 text-slate-500">
                      {comParque.get(v.id) === 'ATIVO' ? '2 · Ativo' : comParque.get(v.id) === 'INADIMPLENTE' ? '3 · Inadimplente' : 'só ficha'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
