'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { useRegionais } from '@/hooks/use-config';
import {
  useRastreadoresResumo, useRastreadoresARecuperar, useGiroEstoque,
} from '@/hooks/use-rastreadores';
import { rotuloStatus, formatarChip } from '@/lib/rastreador';
import { formatCurrency } from '@/lib/utils';

export function RelatoriosRastreadores() {
  const [regionalId, setRegionalId] = useState('');
  const { data: regionais } = useRegionais();
  const { data: resumo } = useRastreadoresResumo(regionalId || undefined);
  const { data: recuperar } = useRastreadoresARecuperar(regionalId || undefined);
  const { data: giro } = useGiroEstoque(regionalId || undefined);

  const custoTotal = (resumo?.por_plataforma ?? []).reduce((s, p) => s + Number(p.custo_mensal ?? 0), 0);

  function exportarRecuperar() {
    const linhas = [
      ['IMEI', 'Status', 'Dias', 'Placa', 'Associado', 'Documento', 'Telefone', 'Celular'],
      ...(recuperar ?? []).map((r) => [
        r.imei, rotuloStatus(r.status), String(r.dias_no_status), r.placa ?? '',
        r.associado ?? '', r.documento ?? '', r.telefone ?? '', r.celular ?? '',
      ]),
    ];
    const csv = linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'equipamentos-a-recuperar.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <Select value={regionalId} onChange={(e) => setRegionalId(e.target.value)} className="mt-0 w-auto">
        <option value="">Todas as unidades</option>
        {(regionais ?? []).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
      </Select>

      {/* Custo por plataforma: ativos x custo mensal do equipamento */}
      <section className="rounded-lg border border-slate-200 bg-superficie p-4">
        <h2 className="text-sm font-semibold text-slate-700">Custo mensal por plataforma</h2>
        <p className="mb-3 text-xs text-slate-400">
          Equipamentos ATIVOS x custo por equipamento cadastrado na ficha da rastreadora (Fornecedores).
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="py-2">Plataforma</th><th className="py-2">Total</th>
              <th className="py-2">Ativos</th><th className="py-2 text-right">Custo mensal</th>
            </tr>
          </thead>
          <tbody>
            {(resumo?.por_plataforma ?? []).map((p) => (
              <tr key={p.plataforma} className="border-b border-slate-50 last:border-0">
                <td className="py-2 text-slate-700">{p.plataforma}</td>
                <td className="py-2 tabular-nums text-slate-600">{p.total}</td>
                <td className="py-2 tabular-nums text-slate-600">{p.ativos}</td>
                <td className="py-2 text-right tabular-nums font-medium text-slate-800">{formatCurrency(Number(p.custo_mensal ?? 0))}</td>
              </tr>
            ))}
            {(resumo?.por_plataforma ?? []).length === 0 && (
              <tr><td colSpan={4} className="py-4 text-center text-slate-400">Sem equipamentos cadastrados.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200">
              <td colSpan={3} className="py-2 text-xs uppercase text-slate-400">Total</td>
              <td className="py-2 text-right font-semibold tabular-nums text-slate-900">{formatCurrency(custoTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      {/* Posicao por unidade */}
      <section className="rounded-lg border border-slate-200 bg-superficie p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Posicao de estoque por unidade</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="py-2">Unidade</th><th className="py-2">Total</th>
              <th className="py-2">Instalados</th><th className="py-2">Em estoque</th>
              <th className="py-2">Instalacoes</th><th className="py-2 text-right">Dias medios em estoque</th>
            </tr>
          </thead>
          <tbody>
            {(resumo?.por_regional ?? []).map((r) => {
              const g = (giro ?? []).find((x) => x.regional === r.regional);
              return (
                <tr key={r.regional} className="border-b border-slate-50 last:border-0">
                  <td className="py-2 text-slate-700">{r.regional}</td>
                  <td className="py-2 tabular-nums text-slate-600">{r.total}</td>
                  <td className="py-2 tabular-nums text-slate-600">{r.ativos}</td>
                  <td className="py-2 tabular-nums text-slate-600">{r.estoque}</td>
                  <td className="py-2 tabular-nums text-slate-600">{g?.instalacoes ?? 0}</td>
                  <td className="py-2 text-right tabular-nums text-slate-600">
                    {g?.dias_medio_em_estoque != null ? `${g.dias_medio_em_estoque} d` : '—'}
                  </td>
                </tr>
              );
            })}
            {(resumo?.por_regional ?? []).length === 0 && (
              <tr><td colSpan={6} className="py-4 text-center text-slate-400">Sem equipamentos cadastrados.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* A recuperar: status 3 a 7, com o contato do associado */}
      <section className="rounded-lg border border-slate-200 bg-superficie p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">Equipamentos a recuperar</h2>
            <p className="text-xs text-slate-400">Inadimplente, inativo, a devolver, cobrar e boleto gerado.</p>
          </div>
          <Button variant="secondary" onClick={exportarRecuperar}><Download className="h-4 w-4" /> CSV</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="py-2">IMEI</th><th className="py-2">Status</th><th className="py-2">Dias</th>
                <th className="py-2">Placa</th><th className="py-2">Associado</th><th className="py-2">Contato</th>
              </tr>
            </thead>
            <tbody>
              {(recuperar ?? []).map((r) => (
                <tr key={r.rastreador_id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2 font-mono text-slate-700">{r.imei}</td>
                  <td className="py-2 text-slate-600">{rotuloStatus(r.status)}</td>
                  <td className="py-2 tabular-nums text-slate-600">{r.dias_no_status}</td>
                  <td className="py-2 font-mono text-slate-700">{r.placa ?? '—'}</td>
                  <td className="py-2 text-slate-600">{r.associado ?? '—'}</td>
                  <td className="py-2 text-slate-600">{formatarChip(r.celular ?? r.telefone ?? '') || '—'}</td>
                </tr>
              ))}
              {(recuperar ?? []).length === 0 && (
                <tr><td colSpan={6} className="py-4 text-center text-slate-400">Nada a recuperar.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
