'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Award, BadgePercent, Building2, Download, FileOutput, HandCoins, Info, Receipt, RefreshCw, Settings2,
  TrendingDown, TrendingUp, Trophy, Wallet,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select } from '@/components/ui/field';
import { Indicador, Vazio, baixarCsv } from '@/components/financeiro/ui-financeiro';
import { GerarContasPagarModal } from '@/components/comissoes/gerar-contas-pagar-modal';
import { useRegionais } from '@/hooks/use-config';
import { useMeuPapel } from '@/hooks/use-vendas';
import {
  useApurarComissoes, useComissoesConfig, useComissoesDesempenho, useComissoesLotes, useSaveComissoesConfig,
} from '@/hooks/use-comissoes';
import {
  COMPETENCIA_INICIAL_COMISSAO, DESTINO_COMISSAO, competenciaComissionavel, janelaMeses, rankingConsultores,
  resumoRegionais, serieMensal, variacao, type ConsultorRanking,
} from '@/lib/comissoes';
import type { ComissoesConfigRow } from '@/lib/database.types';
import { formatCurrency, formatDate } from '@/lib/utils';

const MES = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' });
const rotuloMes = (iso: string) => MES.format(new Date(`${iso}T00:00:00`)).replace('.', '');
const rotuloComp = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const pct = (v: number | null | undefined, casas = 1) =>
  v == null ? '—' : `${(v * 100).toFixed(casas).replace('.', ',')}%`;
const compacto = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v));

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function Crescimento({ v, rotulo, pp }: { v: number | null; rotulo?: string; pp?: boolean }) {
  if (v == null) return <span className="text-[11px] text-slate-400">{rotulo ? `${rotulo} ` : ''}s/ base</span>;
  const sobe = v >= 0;
  const Icon = sobe ? TrendingUp : TrendingDown;
  const txt = pp ? `${(v * 100).toFixed(1).replace('.', ',')} p.p.` : pct(v, 0);
  return (
    <span className={`tnum inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
      sobe ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
      <Icon className="h-3 w-3" aria-hidden />
      {rotulo ? `${rotulo} ` : ''}{sobe ? '+' : ''}{txt}
    </span>
  );
}

/** Mini barras do recebido nos meses da janela. */
function Trilha({ valores, meses }: { valores: number[]; meses: string[] }) {
  const max = Math.max(...valores, 1);
  return (
    <div className="flex h-8 items-end gap-1" aria-label="Recebido nos ultimos meses">
      {valores.map((v, i) => (
        <div
          key={meses[i]}
          title={`${rotuloMes(meses[i])}: ${formatCurrency(v)}`}
          className={`w-3 rounded-t ${i === valores.length - 1 ? 'bg-cyan-500' : 'bg-slate-300'}`}
          style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function Medalha({ posicao }: { posicao: number }) {
  const cor = posicao === 1 ? 'bg-amber-400 text-amber-950'
    : posicao === 2 ? 'bg-slate-300 text-slate-800'
      : posicao === 3 ? 'bg-orange-300 text-orange-950' : 'bg-slate-100 text-slate-500';
  return <span className={`tnum grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${cor}`}>{posicao}</span>;
}

/**
 * GESTAO DE COMISSOES PELA MATRIZ (0198). Recorrencia sobre o recebido dos
 * boletos (SCar + Mutual), pelo mes de vencimento, a partir de 11/2026, com as
 * taxas dos cadastros. O financeiro gera o contas a pagar na data escolhida.
 * Matriz ve e gera tudo; gestor regional ve so a propria unidade (banco).
 */
export default function ComissoesPage() {
  const { data: papel, isLoading: carregandoPapel } = useMeuPapel();
  const matriz = papel === 'admin' || papel === 'financeiro';
  const podeVer = matriz || papel === 'gestor_regional';

  const [competencia, setCompetencia] = useState(mesAtual);
  const [regionalId, setRegionalId] = useState('');
  const [modalGerar, setModalGerar] = useState(false);
  const [mostrarConfig, setMostrarConfig] = useState(false);

  const { data: regionais } = useRegionais();
  const { data: linhas, isLoading, error } = useComissoesDesempenho(competencia, regionalId || null, 3);
  const { data: config } = useComissoesConfig();
  const { data: lotes } = useComissoesLotes(matriz);
  const salvarConfig = useSaveComissoesConfig();
  const apurar = useApurarComissoes();

  const meses = useMemo(() => janelaMeses(competencia, 3), [competencia]);
  const serie = useMemo(() => serieMensal(linhas ?? [], meses), [linhas, meses]);
  const atual = serie[serie.length - 1];
  const anterior = serie[serie.length - 2];
  const porRegional = useMemo(() => resumoRegionais(linhas ?? [], competencia), [linhas, competencia]);
  const ranking = useMemo(() => rankingConsultores(linhas ?? [], meses), [linhas, meses]);

  const inicial = config?.competencia_inicial ?? COMPETENCIA_INICIAL_COMISSAO;
  const comissionavel = competenciaComissionavel(competencia, inicial);
  const nomeRegional = regionalId ? regionais?.find((r) => r.id === regionalId)?.nome ?? 'Regional' : 'Todas as regionais';

  const grafico = serie.map((m) => ({
    mes: rotuloMes(m.competencia),
    Emitidos: m.valorEmitido,
    Recebidos: m.valorRecebido,
    'Taxa de recebimento': m.taxaRecebimento == null ? null : Math.round(m.taxaRecebimento * 1000) / 10,
  }));

  function exportar() {
    const fmt = (v: number | null) => (v == null ? '' : Math.round(v * 1000) / 10);
    baixarCsv(`ranking-comissoes-${competencia.slice(0, 7)}.csv`, [
      ['Posicao', 'Consultor', 'Regional', ...meses.map((m) => `Recebido ${rotuloComp(m)}`), 'Emitido no mes',
        'Taxa recebimento %', 'Comissao do mes', 'Cresc. mes %', 'Cresc. 3 meses %'],
      ...ranking.map((c: ConsultorRanking) => [
        c.posicao, c.nome, c.regionalNome, ...c.recebidoPorMes, c.valorEmitido, fmt(c.taxaRecebimento), c.comissao,
        fmt(c.crescimentoMes), fmt(c.crescimentoJanela),
      ]),
    ]);
  }

  function atualizarApuracao() {
    apurar.mutate(
      { competencia, regionalId: regionalId || null },
      {
        onSuccess: (r) => toast.success(`Apuração de ${rotuloComp(competencia)} atualizada: ${formatCurrency(Number(r?.valor_total ?? 0))}`),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  if (carregandoPapel) return <div className="h-40 animate-pulse rounded-xl bg-slate-100" />;
  if (!podeVer) {
    return (
      <Card>
        <Vazio icon={HandCoins} titulo="Acesso restrito"
          descricao="A gestão de comissões é da matriz (admin/financeiro). O gestor regional vê o painel da própria unidade; o extrato do consultor fica no Portal do Vendedor." />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Comissões</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Recorrência sobre os boletos recebidos (SCar e Mutual), pelo mês de vencimento, com as taxas dos
            cadastros de regionais e consultores.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <FormField label="Competência (vencimento)" className="w-44">
            <Input type="month" value={competencia.slice(0, 7)}
              onChange={(e) => e.target.value && setCompetencia(`${e.target.value}-01`)} />
          </FormField>
          {matriz && (
            <FormField label="Regional" className="w-56">
              <Select value={regionalId} onChange={(e) => setRegionalId(e.target.value)}>
                <option value="">Todas as regionais</option>
                {(regionais ?? []).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
              </Select>
            </FormField>
          )}
          {matriz && (
            <Button variant="secondary" onClick={atualizarApuracao} disabled={!comissionavel || apurar.isPending}
              title="Recalcula a comissão da competência com os boletos recebidos até agora">
              <RefreshCw className={`h-4 w-4 ${apurar.isPending ? 'animate-spin' : ''}`} /> Atualizar apuração
            </Button>
          )}
          {matriz && (
            <Button onClick={() => setModalGerar(true)} disabled={!comissionavel}>
              <FileOutput className="h-4 w-4" /> Gerar contas a pagar
            </Button>
          )}
        </div>
      </div>

      {!comissionavel && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            As comissões no SCar começam na competência <b>{rotuloComp(inicial)}</b>. Meses anteriores aparecem só
            para comparar emitidos × recebidos — não geram comissão nem contas a pagar.
          </p>
        </div>
      )}
      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Não foi possível ler o painel: {(error as Error).message}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Boletos emitidos" valor={atual?.valorEmitido} icon={Receipt} carregando={isLoading}
          detalhe={`${atual?.boletosEmitidos ?? 0} boleto(s) com vencimento em ${rotuloComp(competencia)} · ${atual?.boletosVencidos ?? 0} já vencido(s)`} />
        <Indicador titulo="Boletos recebidos" valor={atual?.valorRecebido} icon={Wallet} tom="receita" carregando={isLoading}
          detalhe={`${atual?.boletosRecebidos ?? 0} pago(s) · taxa ${pct(atual?.taxaRecebimento)} dos vencidos (mês anterior ${pct(anterior?.taxaRecebimento)})`} />
        <Indicador titulo="Comissão das franquias" valor={atual?.comissaoFranquia} icon={Building2} tom="alerta" carregando={isLoading}
          detalhe="Taxa recorrente da regional sobre o recebido da carteira" />
        <Indicador titulo="Comissão dos consultores" valor={atual?.comissaoVendedores} icon={BadgePercent} tom="destaque" carregando={isLoading}
          detalhe={`Pagos direto pela matriz · total da competência ${formatCurrency(atual?.comissaoTotal)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Emitidos × recebidos — últimos 3 meses</CardTitle>
            <p className="text-xs text-slate-500">
              {nomeRegional}. Linha = % recebido sobre o que já venceu (eixo da direita).
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? <div className="h-64 animate-pulse rounded-lg bg-slate-100" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={grafico} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="v" tickFormatter={compacto} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={44} />
                  <YAxis yAxisId="p" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={40} />
                  <Tooltip
                    formatter={(v: number | string, nome: string) =>
                      nome === 'Taxa de recebimento' ? `${String(v).replace('.', ',')}%` : formatCurrency(Number(v))}
                    contentStyle={{ borderRadius: 10, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="v" dataKey="Emitidos" fill="#9FB3D9" radius={[4, 4, 0, 0]} maxBarSize={34} />
                  <Bar yAxisId="v" dataKey="Recebidos" fill="#1E2B4D" radius={[4, 4, 0, 0]} maxBarSize={34} />
                  <Line yAxisId="p" type="monotone" dataKey="Taxa de recebimento" stroke="#22A7E4" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Mês a mês</CardTitle>
            <p className="text-xs text-slate-500">Crescimento do recebido contra o mês anterior.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {serie.map((m, i) => (
              <div key={m.competencia} className="rounded-lg border border-slate-200 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold capitalize text-slate-700">{rotuloMes(m.competencia)}</span>
                  {i > 0 && <Crescimento v={variacao(m.valorRecebido, serie[i - 1].valorRecebido)} />}
                </div>
                <div className="tnum mt-1 grid grid-cols-3 gap-2 text-xs text-slate-500">
                  <span>Emitido<br /><b className="text-slate-800">{formatCurrency(m.valorEmitido)}</b></span>
                  <span>Recebido<br /><b className="text-emerald-700">{formatCurrency(m.valorRecebido)}</b></span>
                  <span>Comissão<br /><b className="text-slate-800">{formatCurrency(m.comissaoTotal)}</b></span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" title={`Taxa: ${pct(m.taxaRecebimento)}`}>
                  <div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.min(100, (m.taxaRecebimento ?? 0) * 100)}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {!regionalId && porRegional.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Por regional — {rotuloComp(competencia)}</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="py-2 pr-3">Regional</th>
                  <th className="py-2 pr-3">A matriz paga</th>
                  <th className="py-2 pr-3 text-right">Emitido</th>
                  <th className="py-2 pr-3 text-right">Recebido</th>
                  <th className="py-2 pr-3 text-right">Taxa</th>
                  <th className="py-2 pr-3 text-right">Cresc. mês</th>
                  <th className="py-2 text-right">Comissão</th>
                </tr>
              </thead>
              <tbody>
                {porRegional.map((r) => (
                  <tr key={r.regionalId ?? 'sem'} className="tnum border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3">
                      <button className="font-medium text-cyan-700 hover:underline disabled:no-underline"
                        disabled={!r.regionalId || !matriz} onClick={() => r.regionalId && setRegionalId(r.regionalId)}>
                        {r.regionalNome}
                      </button>
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-500">
                      {r.destino ? DESTINO_COMISSAO[r.destino].rotulo : '—'}
                      {r.destino === 'FRANQUIA' && ` · ${pct(r.taxaRegional, 2)}`}
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-600">{formatCurrency(r.valorEmitido)}</td>
                    <td className="py-2 pr-3 text-right font-semibold text-emerald-700">{formatCurrency(r.valorRecebido)}</td>
                    <td className="py-2 pr-3 text-right text-slate-600">
                      {pct(r.taxaRecebimento)}
                      <span className="ml-1"><Crescimento v={r.variacaoTaxa} pp /></span>
                    </td>
                    <td className="py-2 pr-3 text-right"><Crescimento v={r.crescimentoRecebido} /></td>
                    <td className="py-2 text-right font-semibold text-slate-800">{formatCurrency(r.comissaoTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-amber-500" aria-hidden /> Ranking de consultores — melhor recebimento
            </CardTitle>
            <p className="text-xs text-slate-500">
              {nomeRegional} · {rotuloComp(competencia)} · desempate pela taxa de recebimento. Comissão = a do consultor
              (unidade que paga consultores) ou a da franquia sobre a carteira dele.
            </p>
          </div>
          <Button variant="secondary" onClick={exportar} disabled={ranking.length === 0}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? <div className="h-40 animate-pulse rounded-lg bg-slate-100" /> : ranking.length === 0 ? (
            <Vazio icon={Award} titulo="Sem boletos de consultores"
              descricao="Nenhum boleto com vencimento nestes 3 meses está ligado a um consultor (veículo sem vendedor)." />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Consultor</th>
                  <th className="py-2 pr-3">3 meses</th>
                  <th className="py-2 pr-3 text-right">Emitido</th>
                  <th className="py-2 pr-3 text-right">Recebido</th>
                  <th className="py-2 pr-3 text-right">Taxa</th>
                  <th className="py-2 pr-3 text-right">Crescimento</th>
                  <th className="py-2 text-right">Comissão</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((c) => (
                  <tr key={c.vendedorId} className="tnum border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3"><Medalha posicao={c.posicao} /></td>
                    <td className="py-2 pr-3">
                      <p className="font-medium text-slate-800">
                        {c.nome}{!c.ativo && <span className="ml-1 text-[10px] font-semibold text-rose-600">INATIVO</span>}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {c.regionalNome}{c.taxaVendedor != null && ` · ${pct(c.taxaVendedor, 2)} no cadastro`}
                      </p>
                    </td>
                    <td className="py-2 pr-3"><Trilha valores={c.recebidoPorMes} meses={meses} /></td>
                    <td className="py-2 pr-3 text-right text-slate-600">
                      {formatCurrency(c.valorEmitido)}
                      <span className="block text-[11px] text-slate-400">{c.boletosEmitidos} boleto(s)</span>
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold text-emerald-700">
                      {formatCurrency(c.valorRecebido)}
                      <span className="block text-[11px] font-normal text-slate-400">{c.boletosRecebidos} pago(s)</span>
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-600">{pct(c.taxaRecebimento)}</td>
                    <td className="py-2 pr-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <Crescimento v={c.crescimentoMes} rotulo="mês" />
                        <Crescimento v={c.crescimentoJanela} rotulo="3m" />
                      </div>
                    </td>
                    <td className="py-2 text-right font-semibold text-slate-800">{formatCurrency(c.comissao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {matriz && (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Envios ao contas a pagar</CardTitle>
              <p className="text-xs text-slate-500">Cada geração vira um lote; os títulos aparecem em Financeiro → Contas a Pagar.</p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {(lotes ?? []).length === 0 ? (
                <Vazio icon={FileOutput} titulo="Nenhum envio ainda"
                  descricao="Use “Gerar contas a pagar” para lançar as comissões da competência na data escolhida." />
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr className="border-b border-slate-200">
                      <th className="py-2 pr-3">Competência</th>
                      <th className="py-2 pr-3">Regional</th>
                      <th className="py-2 pr-3">Vencimento</th>
                      <th className="py-2 pr-3 text-right">Títulos</th>
                      <th className="py-2 pr-3 text-right">Valor</th>
                      <th className="py-2">Gerado por</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(lotes ?? []).map((l) => (
                      <tr key={l.id} className="tnum border-b border-slate-100 last:border-0">
                        <td className="py-2 pr-3 font-medium text-slate-700">{rotuloComp(l.competencia)}</td>
                        <td className="py-2 pr-3 text-slate-600">{l.regionais?.nome ?? 'Todas'}</td>
                        <td className="py-2 pr-3 text-slate-600">{formatDate(l.data_vencimento)}</td>
                        <td className="py-2 pr-3 text-right text-slate-600">{l.qtd_lancamentos}</td>
                        <td className="py-2 pr-3 text-right font-semibold text-slate-900">{formatCurrency(Number(l.valor_total))}</td>
                        <td className="py-2 text-xs text-slate-500">
                          {l.origem === 'AUTOMATICA' ? 'Automático' : l.usuarios?.nome ?? '-'} · {formatDate(l.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-1.5"><Settings2 className="h-4 w-4 text-slate-400" aria-hidden /> Política</CardTitle>
              <button className="text-xs font-medium text-cyan-700 hover:underline" onClick={() => setMostrarConfig((v) => !v)}>
                {mostrarConfig ? 'Fechar' : 'Ajustar'}
              </button>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              <p>• Início: competência <b>{rotuloComp(inicial)}</b> (mês de vencimento do boleto).</p>
              <p>• Adesão: <b>não é paga</b> — só recorrência sobre o valor recebido.</p>
              <p>• Taxas e a quem a matriz paga: Configurações → Regionais e Configurações → Vendedores.</p>
              <p>• Consultor inativo {config?.exigir_vendedor_ativo === false ? <b>continua recebendo</b> : <b>não recebe</b>}.</p>
              <p>
                • Geração automática:{' '}
                {config?.geracao_automatica
                  ? <b className="text-emerald-700">ligada (dia {config.dia_geracao_automatica}) — exige o agendamento no banco</b>
                  : <b>desligada</b>} — o financeiro gera manualmente.
              </p>
              {mostrarConfig && config && (
                <ConfigForm key={config.updated_at} inicial={config} salvando={salvarConfig.isPending}
                  onSalvar={(c) => salvarConfig.mutate(c, {
                    onSuccess: () => { toast.success('Política atualizada'); setMostrarConfig(false); },
                    onError: (e) => toast.error((e as Error).message),
                  })} />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {matriz && (
        <GerarContasPagarModal open={modalGerar} onClose={() => setModalGerar(false)} competencia={competencia}
          regionalId={regionalId || null} regionalNome={nomeRegional} diaPadrao={config?.dia_vencimento_padrao ?? 10} />
      )}
    </div>
  );
}

function ConfigForm({ inicial, salvando, onSalvar }: {
  inicial: ComissoesConfigRow; salvando: boolean; onSalvar: (c: ComissoesConfigRow) => void;
}) {
  const [c, setC] = useState(inicial);
  const dia = (v: string) => Math.min(28, Math.max(1, Number(v) || 1));
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={c.exigir_vendedor_ativo}
          onChange={(e) => setC({ ...c, exigir_vendedor_ativo: e.target.checked })} />
        Consultor precisa estar ativo para receber
      </label>
      <FormField label="Dia de vencimento sugerido (mês seguinte)">
        <Input type="number" min={1} max={28} value={c.dia_vencimento_padrao}
          onChange={(e) => setC({ ...c, dia_vencimento_padrao: dia(e.target.value) })} />
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={c.geracao_automatica}
          onChange={(e) => setC({ ...c, geracao_automatica: e.target.checked })} />
        Gerar automaticamente (exige agendamento no banco)
      </label>
      {c.geracao_automatica && (
        <FormField label="Dia do mês para gerar o contas a pagar do mês anterior">
          <Input type="number" min={1} max={28} value={c.dia_geracao_automatica}
            onChange={(e) => setC({ ...c, dia_geracao_automatica: dia(e.target.value) })} />
        </FormField>
      )}
      <div className="flex justify-end">
        <Button onClick={() => onSalvar(c)} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</Button>
      </div>
    </div>
  );
}
