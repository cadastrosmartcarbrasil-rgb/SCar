'use client';

import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileSpreadsheet, FileText, Info, Search, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, Input, Select } from '@/components/ui/field';
import { Indicador, Vazio } from '@/components/financeiro/ui-financeiro';
import { baixarExcelPlanilhas, imprimirRelatorios } from '@/components/financeiro/exportar';
import { useRelatorioConsultores } from '@/hooks/use-comissoes';
import {
  SITUACAO_COMISSAO, filtrarRelatorio, periodoDoAtalho, resumoPorConsultor, tabelasDoRelatorio, totaisRelatorio,
  type SituacaoComissao,
} from '@/lib/comissoes-relatorio';
import { formatCurrency } from '@/lib/utils';

const dataBR = (s: string | null | undefined) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—');
const pct = (v: number) => `${(v * 100).toFixed(2).replace('.', ',').replace(',00', '')}%`;

const TOM: Record<'ok' | 'aviso' | 'neutro' | 'fora', string> = {
  ok: 'bg-emerald-50 text-emerald-700',
  aviso: 'bg-amber-50 text-amber-700',
  neutro: 'bg-slate-100 text-slate-600',
  fora: 'bg-slate-100 text-slate-400',
};

function Selo({ s }: { s: SituacaoComissao }) {
  const m = SITUACAO_COMISSAO[s];
  return <span className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold ${TOM[m.tom]}`}>{m.rotulo}</span>;
}

const ATALHOS = [
  { k: 'mes', rotulo: 'Este mês' },
  { k: 'mes_anterior', rotulo: 'Mês anterior' },
  { k: 'semana', rotulo: 'Últimos 7 dias' },
  { k: 'hoje', rotulo: 'Hoje' },
] as const;

/**
 * Relatório de comissões POR CONSULTOR (0199). O período é pela DATA DO
 * CRÉDITO — o dia em que o recebimento caiu no banco —, não pelo vencimento.
 */
export function RelatorioConsultores({
  matriz, regionais,
}: {
  matriz: boolean;
  regionais: { id: string; nome: string }[];
}) {
  const [periodo, setPeriodo] = useState(() => periodoDoAtalho('mes'));
  const [regionalId, setRegionalId] = useState('');
  const [vendedorId, setVendedorId] = useState('');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);

  const invertido = periodo.fim < periodo.inicio;
  const { data, isLoading, error } = useRelatorioConsultores(periodo.inicio, periodo.fim, regionalId || null, !invertido);
  const todas = useMemo(() => data ?? [], [data]);
  const linhas = useMemo(() => filtrarRelatorio(todas, vendedorId, busca), [todas, vendedorId, busca]);
  const resumo = useMemo(() => resumoPorConsultor(linhas), [linhas]);
  const totais = useMemo(() => totaisRelatorio(resumo), [resumo]);
  const consultores = useMemo(() => resumoPorConsultor(todas), [todas]);

  const nomeRegional = regionalId ? regionais.find((r) => r.id === regionalId)?.nome ?? 'Regional' : 'Todas as regionais';
  const escopo = [nomeRegional, vendedorId ? consultores.find((c) => (c.vendedorId ?? '__sem__') === vendedorId)?.nome : null]
    .filter(Boolean).join(' · ');
  const nomeArquivo = `comissoes-consultores-${periodo.inicio}-a-${periodo.fim}`;

  function exportar(tipo: 'excel' | 'pdf') {
    const { resumo: r, detalhe: d } = tabelasDoRelatorio(linhas, periodo, escopo);
    if (tipo === 'excel') baixarExcelPlanilhas(nomeArquivo, [{ ...r, aba: 'Resumo' }, { ...d, aba: 'Boletos' }]);
    else imprimirRelatorios([r, d]);
  }

  const btn = 'inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-superficie px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex flex-wrap items-end gap-2">
            <FormField label="Crédito de" className="w-40">
              <Input type="date" value={periodo.inicio} onChange={(e) => setPeriodo((p) => ({ ...p, inicio: e.target.value }))} />
            </FormField>
            <FormField label="até" className="w-40">
              <Input type="date" value={periodo.fim} onChange={(e) => setPeriodo((p) => ({ ...p, fim: e.target.value }))} />
            </FormField>
            <div className="flex flex-wrap gap-1 pb-0.5">
              {ATALHOS.map((a) => (
                <button key={a.k} type="button" onClick={() => setPeriodo(periodoDoAtalho(a.k))}
                  className="rounded-full border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:border-cyan-400 hover:text-cyan-700">
                  {a.rotulo}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {matriz && (
              <FormField label="Regional" className="w-56">
                <Select value={regionalId} onChange={(e) => { setRegionalId(e.target.value); setVendedorId(''); }}>
                  <option value="">Todas as regionais</option>
                  {regionais.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
                </Select>
              </FormField>
            )}
            <FormField label="Consultor" className="w-64">
              <Select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
                <option value="">Todos os consultores</option>
                {consultores.map((c) => (
                  <option key={c.vendedorId ?? '__sem__'} value={c.vendedorId ?? '__sem__'}>
                    {c.nome}{c.vendedorId && !c.ativo ? ' (inativo)' : ''}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Buscar" className="min-w-[14rem] flex-1">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input className="pl-8" placeholder="Associado, placa, documento…" value={busca}
                  onChange={(e) => setBusca(e.target.value)} />
              </div>
            </FormField>
            <div className="flex gap-1.5 pb-0.5">
              <button type="button" className={btn} disabled={linhas.length === 0} onClick={() => exportar('excel')}>
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </button>
              <button type="button" className={btn} disabled={linhas.length === 0} onClick={() => exportar('pdf')}>
                <FileText className="h-4 w-4" /> PDF
              </button>
            </div>
          </div>
          <p className="flex items-start gap-1.5 text-xs text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            O período é pela <b>data do crédito</b>: o dia em que o recebimento caiu no banco (PIX no dia, boleto
            compensado no dia útil seguinte). Boleto pago fora do nosso banco usa a data do pagamento e vem marcado com *.
            Só entram boletos com vencimento a partir de 11/2026.
          </p>
          {invertido && <p className="text-sm text-rose-600">A data inicial está depois da final.</p>}
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Não foi possível ler o relatório: {(error as Error).message}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Recebido no período" valor={totais.recebido} tom="receita" carregando={isLoading}
          detalhe={`${totais.boletos} boleto(s) creditado(s)`} />
        <Indicador titulo="Comissão dos consultores" valor={totais.comissao} tom="destaque" carregando={isLoading}
          detalhe={`${totais.consultores} consultor(es) com comissão`} />
        <Indicador titulo="Paga / no contas a pagar" valor={totais.paga + totais.aPagar} carregando={isLoading}
          detalhe={`Paga ${formatCurrency(totais.paga)} · a pagar ${formatCurrency(totais.aPagar)}`} />
        <Indicador titulo="A apurar · pela franquia" valor={totais.aApurar + totais.pelaFranquia} tom="alerta" carregando={isLoading}
          detalhe={`A apurar ${formatCurrency(totais.aApurar)} · pela franquia ${formatCurrency(totais.pelaFranquia)}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5"><Users className="h-4 w-4 text-slate-400" aria-hidden /> Por consultor</CardTitle>
          <p className="text-xs text-slate-500">Clique no consultor para ver os boletos que geraram a comissão.</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? <div className="h-40 animate-pulse rounded-lg bg-slate-100" /> : resumo.length === 0 ? (
            <Vazio icon={Users} titulo="Nenhum recebimento no período"
              descricao="Nenhum boleto com vencimento a partir de 11/2026 creditou entre estas datas." />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="py-2 pr-3">Consultor</th>
                  <th className="py-2 pr-3">Regional</th>
                  <th className="py-2 pr-3">Quem paga</th>
                  <th className="py-2 pr-3 text-right">Boletos</th>
                  <th className="py-2 pr-3 text-right">Recebido</th>
                  <th className="py-2 pr-3 text-right">Comissão</th>
                  <th className="py-2 pr-3 text-right">Paga</th>
                  <th className="py-2 text-right">A pagar</th>
                </tr>
              </thead>
              <tbody>
                {resumo.map((r) => {
                  const chave = r.vendedorId ?? '__sem__';
                  const exp = aberto === chave;
                  const det = exp ? linhas.filter((l) => (l.vendedor_id ?? '__sem__') === chave) : [];
                  return (
                    <Fragment key={chave}>
                      <tr className="tnum cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                        onClick={() => setAberto(exp ? null : chave)}>
                        <td className="py-2 pr-3 font-medium text-slate-800">
                          <span className="inline-flex items-center gap-1">
                            {exp ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            {r.nome}
                            {r.vendedorId && !r.ativo && <span className="text-[0.625rem] font-semibold text-rose-600">INATIVO</span>}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-xs text-slate-500">{r.regionais.join(', ')}</td>
                        <td className="py-2 pr-3 text-xs text-slate-500">{r.quemPaga.join(', ') || '—'}</td>
                        <td className="py-2 pr-3 text-right text-slate-600">{r.boletos}</td>
                        <td className="py-2 pr-3 text-right text-slate-700">{formatCurrency(r.recebido)}</td>
                        <td className="py-2 pr-3 text-right font-semibold text-slate-900">{formatCurrency(r.comissao)}</td>
                        <td className="py-2 pr-3 text-right text-emerald-700">{formatCurrency(r.paga)}</td>
                        <td className="py-2 text-right text-amber-700">{formatCurrency(r.aPagar)}</td>
                      </tr>
                      {exp && (
                        <tr className="border-b border-slate-200 bg-slate-50/60">
                          <td colSpan={8} className="p-2">
                            <table className="w-full text-xs">
                              <thead className="text-left uppercase tracking-wide text-slate-500">
                                <tr>
                                  <th className="px-2 py-1">Crédito</th>
                                  <th className="px-2 py-1">Vencimento</th>
                                  <th className="px-2 py-1">Associado</th>
                                  <th className="px-2 py-1">Placa</th>
                                  <th className="px-2 py-1">Origem</th>
                                  <th className="px-2 py-1 text-right">Recebido</th>
                                  <th className="px-2 py-1 text-right">Taxa</th>
                                  <th className="px-2 py-1 text-right">Comissão</th>
                                  <th className="px-2 py-1">Situação</th>
                                </tr>
                              </thead>
                              <tbody>
                                {det.map((l, i) => (
                                  <tr key={`${l.boleto_id}-${l.placa}-${i}`} className="tnum border-t border-slate-100">
                                    <td className="px-2 py-1">
                                      {dataBR(l.data_credito)}
                                      {l.credito_estimado && <span title="Data do pagamento (não passou pelo nosso banco)"> *</span>}
                                    </td>
                                    <td className="px-2 py-1 text-slate-500">{dataBR(l.vencimento)}</td>
                                    <td className="px-2 py-1">{l.associado}</td>
                                    <td className="placa px-2 py-1">{l.placa ?? '—'}</td>
                                    <td className="px-2 py-1 text-slate-500">{l.origem === 'SCAR' ? 'SCar' : 'Mutual'}</td>
                                    <td className="px-2 py-1 text-right">{formatCurrency(l.valor_recebido)}</td>
                                    <td className="px-2 py-1 text-right text-slate-500">
                                      {l.valor_assistencia > 0 ? 'Assist. prof.' : pct(l.taxa)}
                                    </td>
                                    <td className="px-2 py-1 text-right font-semibold">{formatCurrency(l.valor_comissao)}</td>
                                    <td className="px-2 py-1">
                                      <Selo s={l.situacao} />
                                      {l.documento && <span className="ml-1 text-slate-400">{l.documento}</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="tnum border-t-2 border-slate-300 font-semibold">
                  <td className="py-2 pr-3" colSpan={3}>Total</td>
                  <td className="py-2 pr-3 text-right">{totais.boletos}</td>
                  <td className="py-2 pr-3 text-right">{formatCurrency(totais.recebido)}</td>
                  <td className="py-2 pr-3 text-right">{formatCurrency(totais.comissao)}</td>
                  <td className="py-2 pr-3 text-right">{formatCurrency(totais.paga)}</td>
                  <td className="py-2 text-right">{formatCurrency(totais.aPagar)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
