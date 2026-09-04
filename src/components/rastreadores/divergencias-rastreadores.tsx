'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CircleAlert, Download, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { useRegionais } from '@/hooks/use-config';
import { useDivergenciasRastreadores } from '@/hooks/use-rastreadores';
import { DIVERGENCIAS, COR_SEVERIDADE, rotuloDivergencia } from '@/lib/rastreador';

// O painel que a operacao olha todo dia: onde o parque de equipamentos e o
// cadastro de veiculos discordam. A conta e feita no banco (uma consulta so).
export function DivergenciasRastreadores() {
  const [tipo, setTipo] = useState('');
  const [severidade, setSeveridade] = useState('');
  const [regionalId, setRegionalId] = useState('');
  const { data: regionais } = useRegionais();
  const { data: linhas, isLoading } = useDivergenciasRastreadores({ tipo, severidade, regionalId });

  const porSeveridade = useMemo(() => {
    const c = { ALTA: 0, MEDIA: 0, BAIXA: 0 };
    (linhas ?? []).forEach((l) => { c[l.severidade] += 1; });
    return c;
  }, [linhas]);

  function exportar() {
    const linhasCsv = [
      ['Tipo', 'Severidade', 'IMEI', 'Placa', 'Associado', 'Unidade', 'Descricao'],
      ...(linhas ?? []).map((l) => [
        rotuloDivergencia(l.tipo), l.severidade, l.imei ?? '', l.placa ?? '',
        l.associado ?? '', l.regional ?? '', l.descricao,
      ]),
    ];
    const csv = linhasCsv.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'divergencias-rastreadores.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {(['ALTA', 'MEDIA', 'BAIXA'] as const).map((s) => (
          <button key={s} onClick={() => setSeveridade(severidade === s ? '' : s)}
            className={`rounded-xl border bg-superficie p-3 text-left transition ${
              severidade === s ? 'border-cyan-400 ring-2 ring-cyan-200' : 'border-slate-200 hover:border-cyan-300'}`}>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Severidade {s}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{porSeveridade[s]}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={tipo} onChange={(e) => setTipo(e.target.value)} className="mt-0 w-auto">
          <option value="">Todos os tipos</option>
          {DIVERGENCIAS.map((d) => <option key={d.tipo} value={d.tipo}>{d.rotulo}</option>)}
        </Select>
        <Select value={regionalId} onChange={(e) => setRegionalId(e.target.value)} className="mt-0 w-auto">
          <option value="">Todas as unidades</option>
          {(regionais ?? []).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
        </Select>
        <Button variant="secondary" onClick={exportar}><Download className="h-4 w-4" /> CSV</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Divergencia</th>
              <th className="px-4 py-2">Equipamento</th>
              <th className="px-4 py-2">Veiculo</th>
              <th className="px-4 py-2">O que aconteceu</th>
              <th className="px-4 py-2 text-right">Resolver</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Conferindo...</td></tr>}
            {(linhas ?? []).map((l, i) => (
              <tr key={`${l.tipo}-${l.rastreador_id ?? l.veiculo_id}-${i}`} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${COR_SEVERIDADE[l.severidade]}`}>
                    {rotuloDivergencia(l.tipo)}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-slate-700">
                  {l.rastreador_id
                    ? <Link href={`/rastreadores/${l.rastreador_id}`} className="hover:underline">{l.imei}</Link>
                    : (l.imei ?? '—')}
                </td>
                <td className="px-4 py-2">
                  {l.placa ? <span className="font-mono font-medium text-slate-800">{l.placa}</span> : '—'}
                  {l.associado && <span className="block text-[11px] text-slate-400">{l.associado}</span>}
                </td>
                <td className="px-4 py-2 text-slate-600">{l.descricao}</td>
                <td className="px-4 py-2 text-right">
                  {l.rastreador_id ? (
                    <Link href={`/rastreadores/${l.rastreador_id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:underline">
                      Abrir equipamento <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : l.veiculo_id ? (
                    <Link href={`/veiculos?editar=${l.veiculo_id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:underline">
                      Abrir veiculo <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
            {!isLoading && (linhas ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                  <CircleAlert className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
                  Nenhuma divergencia entre o parque e o cadastro de veiculos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        As correcoes acontecem na ficha do equipamento ou do veiculo — nada e corrigido em massa.
      </p>
    </div>
  );
}
