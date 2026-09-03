'use client';

import { useMemo, useState } from 'react';
import {
  TrendingUp, TrendingDown, AlertTriangle, CalendarClock, Search, X, Barcode, QrCode,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select } from '@/components/ui/field';
import { useRegionais } from '@/hooks/use-config';
import { useResumoCobrancas, useListaCobrancas, type FiltroDashboard } from '@/hooks/use-cobrancas';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { StatusCobranca } from '@/lib/database.types';

const STATUS_COR: Record<StatusCobranca, string> = {
  aberto: 'bg-amber-50 text-amber-700',
  pago: 'bg-emerald-50 text-emerald-700',
  vencido: 'bg-rose-50 text-rose-700',
  cancelado: 'bg-slate-100 text-slate-500',
};
const STATUS_LABEL: Record<StatusCobranca, string> = {
  aberto: 'Em aberto', pago: 'Pago', vencido: 'Vencido', cancelado: 'Cancelado',
};

// Periodo padrao do painel: mes corrente (por data de vencimento).
function mesCorrente() {
  const hoje = new Date();
  const ini = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
  const fim = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0));
  return { inicio: ini.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}

export function DashboardCobranca() {
  const padrao = useMemo(mesCorrente, []);
  const [filtro, setFiltro] = useState<FiltroDashboard>({ inicio: padrao.inicio, fim: padrao.fim });
  const [placa, setPlaca] = useState('');
  const [associado, setAssociado] = useState('');

  const { data: regionais } = useRegionais();
  const { data: resumo, isLoading: carregandoKpis } = useResumoCobrancas(filtro);
  const { data: lista, isLoading } = useListaCobrancas(filtro);

  function aplicarBusca(e: React.FormEvent) {
    e.preventDefault();
    setFiltro((f) => ({ ...f, placa: placa.trim() || null, associado: associado.trim() || null }));
  }
  function limpar() {
    setPlaca('');
    setAssociado('');
    setFiltro({ inicio: padrao.inicio, fim: padrao.fim });
  }

  const inad = resumo?.inadimplencia_pct ?? 0;

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------ KPIs */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          titulo="Total emitido"
          valor={formatCurrency(Number(resumo?.emitido_valor ?? 0))}
          detalhe={`${resumo?.emitido_qtd ?? 0} boleto(s) no periodo`}
          icone={TrendingUp}
          cor="text-brand-700"
          carregando={carregandoKpis}
        />
        <Kpi
          titulo="Total recebido"
          valor={formatCurrency(Number(resumo?.recebido_valor ?? 0))}
          detalhe={`${resumo?.recebido_qtd ?? 0} pago(s) · ${
            Number(resumo?.emitido_valor ?? 0) > 0
              ? Math.round((Number(resumo?.recebido_valor ?? 0) / Number(resumo?.emitido_valor ?? 1)) * 100)
              : 0
          }% do emitido`}
          icone={TrendingDown}
          cor="text-emerald-700"
          carregando={carregandoKpis}
        />
        <Kpi
          titulo="Inadimplencia"
          valor={`${Number(inad ?? 0).toFixed(2).replace('.', ',')}%`}
          detalhe={`${formatCurrency(Number(resumo?.vencido_valor ?? 0))} em atraso · ${resumo?.vencido_qtd ?? 0} titulo(s)`}
          icone={AlertTriangle}
          cor={Number(inad ?? 0) > 10 ? 'text-rose-700' : 'text-amber-700'}
          carregando={carregandoKpis}
        />
        <div className="rounded-2xl border border-slate-200 bg-superficie p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-slate-400">Boletos a vencer</p>
            <CalendarClock className="h-4 w-4 text-cyan-600" />
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {[
              { l: '7 dias', q: resumo?.vencer_7_qtd, v: resumo?.vencer_7_valor },
              { l: '15 dias', q: resumo?.vencer_15_qtd, v: resumo?.vencer_15_valor },
              { l: '30 dias', q: resumo?.vencer_30_qtd, v: resumo?.vencer_30_valor },
            ].map((x) => (
              <li key={x.l} className="flex items-center justify-between">
                <span className="text-slate-500">
                  {x.l} <span className="text-xs text-slate-400">({x.q ?? 0})</span>
                </span>
                <span className="tnum font-medium text-slate-800">{formatCurrency(Number(x.v ?? 0))}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ------------------------------------------------ Filtros avancados */}
      <form onSubmit={aplicarBusca} className="rounded-2xl border border-slate-200 bg-superficie p-4">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <FormField label="Vencimento de">
            <Input
              type="date"
              value={filtro.inicio ?? ''}
              onChange={(e) => setFiltro((f) => ({ ...f, inicio: e.target.value || null }))}
            />
          </FormField>
          <FormField label="Vencimento ate">
            <Input
              type="date"
              value={filtro.fim ?? ''}
              onChange={(e) => setFiltro((f) => ({ ...f, fim: e.target.value || null }))}
            />
          </FormField>
          <FormField label="Placa">
            <Input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="ABC1D23" />
          </FormField>
          <FormField label="Associado (nome ou CPF/CNPJ)">
            <Input value={associado} onChange={(e) => setAssociado(e.target.value)} placeholder="Nome ou documento" />
          </FormField>
          <FormField label="Valor (min / max)">
            <div className="flex gap-2">
              <Input
                type="number" min={0} step="0.01" placeholder="min"
                value={filtro.valorMin ?? ''}
                onChange={(e) => setFiltro((f) => ({ ...f, valorMin: e.target.value ? Number(e.target.value) : null }))}
              />
              <Input
                type="number" min={0} step="0.01" placeholder="max"
                value={filtro.valorMax ?? ''}
                onChange={(e) => setFiltro((f) => ({ ...f, valorMax: e.target.value ? Number(e.target.value) : null }))}
              />
            </div>
          </FormField>
          <FormField label="Status do boleto">
            <Select
              value={filtro.status ?? ''}
              onChange={(e) => setFiltro((f) => ({ ...f, status: (e.target.value || null) as StatusCobranca | null }))}
            >
              <option value="">Todos</option>
              <option value="aberto">Em aberto</option>
              <option value="pago">Pago</option>
              <option value="vencido">Vencido</option>
              <option value="cancelado">Cancelado</option>
            </Select>
          </FormField>
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <FormField label="Regional" className="w-full max-w-xs">
            <Select
              value={filtro.regionalId ?? ''}
              onChange={(e) => setFiltro((f) => ({ ...f, regionalId: e.target.value || null }))}
            >
              <option value="">Todas</option>
              {(regionais ?? []).map((r) => (
                <option key={r.id} value={r.id}>{r.nome}</option>
              ))}
            </Select>
          </FormField>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={limpar}>
              <X className="h-4 w-4" /> Limpar
            </Button>
            <Button type="submit">
              <Search className="h-4 w-4" /> Filtrar
            </Button>
          </div>
        </div>
      </form>

      {/* ------------------------------------------------ Listagem */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Associado</th>
              <th className="px-4 py-2">Placa(s)</th>
              <th className="px-4 py-2">Competencia</th>
              <th className="px-4 py-2">Vencimento</th>
              <th className="px-4 py-2 text-right">Valor</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Boleto / PIX</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Carregando...</td></tr>}
            {!isLoading && (lista ?? []).length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Nenhuma cobranca com esses filtros.</td></tr>
            )}
            {(lista ?? []).map((c) => (
              <tr key={c.titulo_id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2">
                  <p className="font-medium text-slate-700">{c.associado}</p>
                  <p className="text-xs text-slate-400">{c.cpf_cnpj}</p>
                </td>
                <td className="px-4 py-2 text-slate-600">{c.placas ?? '-'}</td>
                <td className="px-4 py-2 text-slate-600">
                  {c.competencia ? c.competencia.slice(0, 7).split('-').reverse().join('/') : '-'}
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {formatDate(c.data_vencimento)}
                  {c.status === 'vencido' && c.dias_atraso > 0 && (
                    <span className="ml-1 text-xs text-rose-600">({c.dias_atraso}d)</span>
                  )}
                </td>
                <td className="tnum px-4 py-2 text-right font-medium">{formatCurrency(Number(c.valor))}</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS_COR[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2 text-xs">
                    {c.url_boleto && (
                      <a href={c.url_boleto} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                        <Barcode className="h-3.5 w-3.5" /> PDF
                      </a>
                    )}
                    {c.pix_copia_cola && (
                      <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(c.pix_copia_cola ?? '')}
                        className="inline-flex items-center gap-1 text-cyan-700 hover:underline"
                        title="Copiar PIX copia e cola"
                      >
                        <QrCode className="h-3.5 w-3.5" /> PIX
                      </button>
                    )}
                    {!c.url_boleto && !c.pix_copia_cola && <span className="text-slate-400">nao registrado</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(lista ?? []).length >= 500 && (
        <p className="text-xs text-slate-400">Mostrando os 500 primeiros — refine os filtros para ver o restante.</p>
      )}
    </div>
  );
}

function Kpi({
  titulo, valor, detalhe, icone: Icone, cor, carregando,
}: {
  titulo: string;
  valor: string;
  detalhe: string;
  icone: React.ElementType;
  cor: string;
  carregando?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-superficie p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-slate-400">{titulo}</p>
        <Icone className={`h-4 w-4 ${cor}`} />
      </div>
      <p className={`tnum mt-1 text-2xl font-semibold ${cor}`}>{carregando ? '...' : valor}</p>
      <p className="mt-0.5 text-xs text-slate-400">{detalhe}</p>
    </div>
  );
}
