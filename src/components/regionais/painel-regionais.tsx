'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer, ComposedChart, AreaChart, Area, BarChart, Bar, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, Cell,
} from 'recharts';
import {
  Building2, Car, CircleAlert, UserMinus, ShieldAlert, Wallet, TrendingUp,
  TrendingDown, Minus, Download, Settings, ArrowRight, PiggyBank, HandCoins,
  ReceiptText, Landmark, Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { Vazio, baixarCsv } from '@/components/financeiro/ui-financeiro';
import { useRegionais } from '@/hooks/use-config';
import {
  usePainelRegionaisResumo, usePainelRegionaisSerie, usePainelRegionaisComparativo,
  useIntervaloContas, useContasPlano, useSalvarIntervaloContas,
} from '@/hooks/use-regionais-painel';
import {
  PERIODO_PADRAO_PAINEL, PRESETS_PAINEL, ROTULO_RISCO, direcaoVariacao,
  ordenarComparativo, periodoPainel, periodoValido, presetAtivo, riscoRegional,
  rotuloIntervalo, serieParaGrafico, totaisComparativo, validarIntervaloContas,
  variacao, type Direcao, type OrdemComparativo, type PeriodoPainel, type RiscoRegional,
} from '@/lib/regionais';
import { formatCurrency, formatPercent } from '@/lib/utils';
import type { RegionaisPainelLinha } from '@/lib/database.types';

// ---------------------------------------------------------------------------
// Paleta — um acento (o ciano da marca) + as cores de status, a mesma escolha
// do painel da 24h (0061): validada para daltonismo e contraste NOS DOIS TEMAS.
// Toda barra e faixa carrega rotulo visivel: identidade nunca depende da cor.
// Grafico usa hex fixo, como os demais do sistema.
// ---------------------------------------------------------------------------
const COR_ACENTO = '#139AD6';   // carteira / recebido
const COR_VERDE  = '#12A150';
const COR_AMBAR  = '#C77700';
const COR_VERMELHO = '#E5484D';
const COR_CINZA  = '#64748B';

const COR_RISCO: Record<RiscoRegional, string> = {
  critico: COR_VERMELHO, atencao: COR_AMBAR, saudavel: COR_VERDE, sem_dados: COR_CINZA,
};
const CLASSE_RISCO: Record<RiscoRegional, string> = {
  critico: 'bg-rose-50 text-rose-700 ring-rose-200',
  atencao: 'bg-amber-50 text-amber-700 ring-amber-200',
  saudavel: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  sem_dados: 'bg-slate-100 text-slate-500 ring-slate-200',
};

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid rgb(var(--superficie-alta))',
  backgroundColor: 'rgb(var(--superficie))',
  fontSize: 12,
} as const;
const EIXO = { fontSize: 11, fill: 'currentColor' } as const;

const inteiro = new Intl.NumberFormat('pt-BR');
const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

// ---------------------------------------------------------------------------
// Cartao de indicador
// ---------------------------------------------------------------------------
const CHIP: Record<string, string> = {
  cyan: 'bg-cyan-50 text-cyan-600',
  navy: 'bg-brand-50 text-brand-600',
  rose: 'bg-rose-50 text-rose-600',
  amber: 'bg-amber-50 text-amber-600',
  green: 'bg-emerald-50 text-emerald-600',
  slate: 'bg-slate-100 text-slate-500',
};

const CLASSE_DIRECAO: Record<Direcao, string> = {
  boa: 'text-emerald-600',
  ruim: 'text-rose-600',
  neutra: 'text-slate-400',
};

function Tendencia({ fracao, subirEBom }: { fracao: number | null; subirEBom: boolean }) {
  const direcao = direcaoVariacao(fracao, subirEBom);
  if (fracao === null) {
    return <span className="text-[11.5px] text-slate-400">sem base de comparacao</span>;
  }
  const Icon = fracao === 0 ? Minus : fracao > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-[11.5px] font-semibold ${CLASSE_DIRECAO[direcao]}`}>
      <Icon className="h-3.5 w-3.5" />
      {fracao === 0 ? 'estavel' : `${formatPercent(Math.abs(fracao))} vs periodo anterior`}
    </span>
  );
}

function Tile({
  titulo, valor, detalhe, rodape, icon: Icon, tom = 'cyan', carregando,
}: {
  titulo: string; valor: string; detalhe?: string; rodape?: React.ReactNode;
  icon: React.ElementType; tom?: keyof typeof CHIP; carregando?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-superficie p-4 shadow-[0_1px_2px_rgba(20,33,61,0.04),0_10px_26px_-16px_rgba(20,33,61,0.18)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11.5px] font-semibold uppercase leading-tight tracking-wide text-slate-500">{titulo}</p>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] ${CHIP[tom]}`}>
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
      </div>
      {carregando ? (
        <div className="mt-3 h-7 w-24 animate-pulse rounded bg-slate-100" />
      ) : (
        <p className="tnum mt-2.5 text-[23px] font-bold leading-none text-slate-900">{valor}</p>
      )}
      {detalhe && <p className="mt-2 text-[11.5px] leading-tight text-slate-500">{detalhe}</p>}
      {rodape && <div className="mt-1.5">{rodape}</div>}
    </div>
  );
}

function SeloRisco({ risco }: { risco: RiscoRegional }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${CLASSE_RISCO[risco]}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: COR_RISCO[risco] }} />
      {ROTULO_RISCO[risco]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Barra de filtros: periodo (padrao = ultimos 30 dias), unidade e engrenagem
// ---------------------------------------------------------------------------
function BarraFiltros({
  periodo, onPeriodo, regionalId, onRegional, onAbrirContas, recorte,
}: {
  periodo: PeriodoPainel;
  onPeriodo: (p: PeriodoPainel) => void;
  regionalId: string | null;
  onRegional: (id: string | null) => void;
  onAbrirContas: () => void;
  recorte: string;
}) {
  const { data: regionais } = useRegionais();
  const ativo = presetAtivo(periodo);

  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-2xl border border-slate-200/80 bg-superficie p-4 shadow-[0_1px_2px_rgba(20,33,61,0.04)]">
      <div className="flex flex-wrap gap-1">
        {PRESETS_PAINEL.map((p) => (
          <button
            key={p.chave}
            type="button"
            onClick={() => onPeriodo(periodoPainel(p.chave))}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
              ativo === p.chave ? 'bg-acao text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {p.rotulo}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">De</span>
          <input
            type="date"
            value={periodo.inicio}
            onChange={(e) => onPeriodo({ ...periodo, inicio: e.target.value })}
            className="tnum mt-1 block rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Ate</span>
          <input
            type="date"
            value={periodo.fim}
            onChange={(e) => onPeriodo({ ...periodo, fim: e.target.value })}
            className="tnum mt-1 block rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          />
        </label>
      </div>

      <label className="block min-w-[190px]">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Regional</span>
        <select
          value={regionalId ?? ''}
          onChange={(e) => onRegional(e.target.value || null)}
          className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
        >
          <option value="">Todas as regionais</option>
          {(regionais ?? []).map((r) => (
            <option key={r.id} value={r.id}>{r.nome}</option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={onAbrirContas}
        title="Intervalo do plano de contas que alimenta o financeiro do painel"
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
      >
        <Settings className="h-4 w-4" />
        <span className="hidden sm:inline">Plano de contas:</span>
        <b className="tnum font-semibold text-slate-800">{recorte}</b>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Engrenagem: intervalo de contas. Institucional (fica em `empresa`), nao do
// navegador — dois gestores nao podem ler "Valor Recebido" diferente.
// ---------------------------------------------------------------------------
function ModalContas({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: atual } = useIntervaloContas();
  const { data: contas } = useContasPlano();
  const salvar = useSalvarIntervaloContas();
  const [de, setDe] = useState<string | null>(null);
  const [ate, setAte] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Abre sempre com o que esta salvo (e nao com o rascunho da vez anterior).
  const vDe = de ?? atual?.conta_de ?? '';
  const vAte = ate ?? atual?.conta_ate ?? '';
  const problema = validarIntervaloContas(vDe, vAte);

  async function confirmar() {
    setErro(null);
    if (problema) { setErro(problema); return; }
    try {
      await salvar.mutateAsync({ de: vDe.trim() || null, ate: vAte.trim() || null });
      setDe(null); setAte(null);
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Nao foi possivel salvar o intervalo.');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Intervalo do plano de contas"
      subtitulo="Define quais contas entram no financeiro deste painel (recebido e gasto com evento)."
      tamanho="lg"
    >
      <div className="space-y-4">
        <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-[12.5px] leading-relaxed text-slate-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          O recorte vale para <b>todo mundo</b> — ele muda o numero que a diretoria le, entao fica no
          cadastro da empresa, nao no navegador de cada um. Deixar em branco significa
          <b> todas as contas</b>. Somente admin/financeiro podem alterar.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Conta inicial</span>
            <input
              list="contas-plano-painel"
              value={vDe}
              onChange={(e) => setDe(e.target.value)}
              placeholder="1.0.00"
              className="tnum mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Conta final</span>
            <input
              list="contas-plano-painel"
              value={vAte}
              onChange={(e) => setAte(e.target.value)}
              placeholder="3.9.99"
              className="tnum mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <datalist id="contas-plano-painel">
          {(contas ?? []).map((c) => (
            <option key={c.codigo} value={c.codigo}>{`${c.codigo} — ${c.nome}`}</option>
          ))}
        </datalist>

        {(problema || erro) && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] font-medium text-rose-700">
            {erro ?? problema}
          </p>
        )}

        <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-[12.5px]">
            <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr><th className="px-3 py-2">Conta</th><th className="px-3 py-2">Nome</th><th className="px-3 py-2">Grupo</th></tr>
            </thead>
            <tbody>
              {(contas ?? []).map((c) => (
                <tr key={c.codigo} className="border-t border-slate-100">
                  <td className="tnum px-3 py-1.5 font-medium text-slate-700">{c.codigo}</td>
                  <td className="px-3 py-1.5 text-slate-600">{c.nome}</td>
                  <td className="px-3 py-1.5 text-slate-400">{c.tipo}</td>
                </tr>
              ))}
              {(contas ?? []).length === 0 && (
                <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-400">
                  Nenhuma conta ativa. Cadastre em Configuracoes &gt; Plano de contas.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => { setDe(''); setAte(''); }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Todas as contas
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={salvar.isPending || !!problema}
            className="rounded-lg bg-acao px-4 py-2 text-sm font-semibold text-white transition hover:bg-acao-escura disabled:opacity-50"
          >
            {salvar.isPending ? 'Salvando...' : 'Salvar intervalo'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// 1) Metricas operacionais + 2) metricas financeiras
// ---------------------------------------------------------------------------
function Indicadores({ periodo, regionalId }: { periodo: PeriodoPainel; regionalId: string | null }) {
  const valido = periodoValido(periodo);
  const { data, isLoading } = usePainelRegionaisResumo(
    { inicio: periodo.inicio, fim: periodo.fim, regionalId }, valido,
  );
  const r = data;
  const carteiraPct = r && r.veiculos_ativos > 0 ? r.veiculos_inadimplentes / r.veiculos_ativos : 0;

  return (
    <>
      <section>
        <h2 className="mb-2.5 text-[12px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Frota / itens protegidos
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tile
            titulo="Veiculos ativos"
            valor={inteiro.format(r?.veiculos_ativos ?? 0)}
            detalhe={`${inteiro.format(r?.veiculos_novos ?? 0)} entraram no periodo`}
            rodape={<Tendencia fracao={variacao(r?.veiculos_ativos ?? 0, r?.veiculos_ativos_antes ?? 0)} subirEBom />}
            icon={Car}
            tom="cyan"
            carregando={isLoading}
          />
          <Tile
            titulo="Veiculos inadimplentes"
            valor={inteiro.format(r?.veiculos_inadimplentes ?? 0)}
            detalhe={`${formatPercent(carteiraPct)} da carteira — retrato de hoje`}
            icon={CircleAlert}
            tom="amber"
            carregando={isLoading}
          />
          <Tile
            titulo="Veiculos cancelados"
            valor={inteiro.format(r?.veiculos_cancelados ?? 0)}
            detalhe="Churn do periodo (saida definitiva da base)"
            rodape={<Tendencia fracao={variacao(r?.veiculos_cancelados ?? 0, r?.veiculos_cancelados_antes ?? 0)} subirEBom={false} />}
            icon={UserMinus}
            tom="rose"
            carregando={isLoading}
          />
          <Tile
            titulo="Veiculos em evento"
            valor={inteiro.format(r?.veiculos_em_evento ?? 0)}
            detalhe="Sinistros em atendimento/oficina agora"
            icon={ShieldAlert}
            tom="navy"
            carregando={isLoading}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2.5 text-[12px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Financeiro
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Tile
            titulo="Carteira ativa"
            valor={formatCurrency(r?.carteira_ativa)}
            detalhe="Mensalidade contratada dos veiculos na base"
            icon={PiggyBank}
            tom="cyan"
            carregando={isLoading}
          />
          <Tile
            titulo="Valor recebido"
            valor={formatCurrency(r?.valor_recebido)}
            detalhe="Arrecadacao efetivada no periodo"
            rodape={<Tendencia fracao={variacao(r?.valor_recebido ?? 0, r?.valor_recebido_antes ?? 0)} subirEBom />}
            icon={HandCoins}
            tom="green"
            carregando={isLoading}
          />
          <Tile
            titulo="Valor inadimplente"
            valor={formatCurrency(r?.valor_inadimplente)}
            detalhe="Titulo vencido e nao pago (retrato de hoje)"
            icon={ReceiptText}
            tom="rose"
            carregando={isLoading}
          />
          <Tile
            titulo="Valor a receber"
            valor={formatCurrency(r?.valor_a_receber)}
            detalhe="Boleto em aberto que ainda nao venceu"
            icon={Landmark}
            tom="slate"
            carregando={isLoading}
          />
          <Tile
            titulo="Gasto em eventos"
            valor={formatCurrency(r?.gasto_eventos)}
            detalhe="Indenizacao, reparo, guincho e rateio pagos"
            rodape={<Tendencia fracao={variacao(r?.gasto_eventos ?? 0, r?.gasto_eventos_antes ?? 0)} subirEBom={false} />}
            icon={Wallet}
            tom="amber"
            carregando={isLoading}
          />
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// 3) Evolucao temporal — frota (area + linhas) e dinheiro (barras + linha)
// ---------------------------------------------------------------------------
function GraficosEvolucao({ periodo, regionalId }: { periodo: PeriodoPainel; regionalId: string | null }) {
  const valido = periodoValido(periodo);
  const { data, isLoading } = usePainelRegionaisSerie(
    { inicio: periodo.inicio, fim: periodo.fim, regionalId }, null, valido,
  );
  const serie = useMemo(() => serieParaGrafico(data ?? []), [data]);
  const granularidade = serie[0]?.granularidade ?? 'DIA';
  const escala = { DIA: 'dia a dia', SEMANA: 'por semana', MES: 'por mes' }[granularidade];

  function csv() {
    baixarCsv('regionais-evolucao.csv', [
      ['Periodo', 'Ativos', 'Inadimplentes', 'Sinistros', 'Recebido', 'Gasto em eventos', 'Resultado'],
      ...serie.map((p) => [p.rotulo, p.ativos, p.inadimplentes, p.sinistros, p.recebido, p.gasto_eventos, p.resultado]),
    ]);
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }

  if (serie.length === 0) {
    return (
      <Card>
        <CardContent>
          <Vazio
            icon={TrendingUp}
            titulo="Sem movimento no periodo"
            descricao="Escolha um periodo maior ou confira se a unidade tem carteira ativada."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card className="min-w-0">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-x-3">
          <CardTitle>Frota no periodo</CardTitle>
          <span className="text-[11px] uppercase tracking-wide text-slate-400">{escala}</span>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full min-w-0 text-slate-500">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={serie} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradAtivos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COR_ACENTO} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={COR_ACENTO} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.18} vertical={false} />
                <XAxis dataKey="rotulo" tick={EIXO} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
                <YAxis yAxisId="frota" tick={EIXO} axisLine={false} tickLine={false} allowDecimals={false}
                  tickFormatter={(v: number) => compacto.format(v)} />
                <YAxis yAxisId="ocor" orientation="right" tick={EIXO} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number, n) => [inteiro.format(v), n as string]}
                />
                <Legend wrapperStyle={{ fontSize: 11.5 }} />
                <Area yAxisId="frota" type="monotone" dataKey="ativos" name="Ativos"
                  stroke={COR_ACENTO} strokeWidth={2} fill="url(#gradAtivos)" />
                <Line yAxisId="frota" type="monotone" dataKey="inadimplentes" name="Inadimplentes"
                  stroke={COR_AMBAR} strokeWidth={2} dot={false} />
                <Line yAxisId="ocor" type="monotone" dataKey="sinistros" name="Sinistros"
                  stroke={COR_VERMELHO} strokeWidth={2} strokeDasharray="4 3" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">
            Ativos e inadimplentes sao o <b>retrato no fim</b> de cada ponto; sinistros sao os
            <b> abertos</b> naquele intervalo (eixo da direita).
          </p>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-x-3">
          <CardTitle>Recebido x gasto em eventos</CardTitle>
          <button
            type="button"
            onClick={csv}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full min-w-0 text-slate-500">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.18} vertical={false} />
                <XAxis dataKey="rotulo" tick={EIXO} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
                <YAxis tick={EIXO} axisLine={false} tickLine={false} tickFormatter={(v: number) => compacto.format(v)} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, n) => [formatCurrency(v), n as string]} />
                <Legend wrapperStyle={{ fontSize: 11.5 }} />
                <Bar dataKey="recebido" name="Recebido" fill={COR_ACENTO} radius={[3, 3, 0, 0]} maxBarSize={26} />
                <Bar dataKey="gasto_eventos" name="Gasto em eventos" fill={COR_VERMELHO} radius={[3, 3, 0, 0]} maxBarSize={26} />
                <Line type="monotone" dataKey="resultado" name="Resultado" stroke={COR_VERDE} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">
            O gasto e o que <b>saiu do caixa</b> com evento e assistencia 24h, nao estimativa: e o
            titulo do Contas a Pagar com baixa registrada.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3b) Comparativo por regional — ranking + tabela detalhada
// ---------------------------------------------------------------------------
const COLUNAS: { chave: OrdemComparativo; rotulo: string; numerica: boolean }[] = [
  { chave: 'nome', rotulo: 'Regional', numerica: false },
  { chave: 'ativos', rotulo: 'Ativos', numerica: true },
  { chave: 'inadimplencia', rotulo: 'Inadimplencia', numerica: true },
  { chave: 'sinistros', rotulo: 'Sinistros', numerica: true },
  { chave: 'recebido', rotulo: 'Receita liquida', numerica: true },
  { chave: 'sinistralidade', rotulo: 'Sinistralidade', numerica: true },
];

function Comparativo({ periodo, regionalId }: { periodo: PeriodoPainel; regionalId: string | null }) {
  const valido = periodoValido(periodo);
  const { data, isLoading } = usePainelRegionaisComparativo(periodo, valido);
  const [ordem, setOrdem] = useState<OrdemComparativo>('ativos');
  const linhas = useMemo(() => ordenarComparativo(data ?? [], ordem), [data, ordem]);
  const totais = useMemo(() => totaisComparativo(data ?? []), [data]);

  const barras = useMemo(
    () => ordenarComparativo(data ?? [], 'ativos').slice(0, 10).map((l) => ({
      ...l,
      curto: l.regional.length > 16 ? `${l.regional.slice(0, 15)}.` : l.regional,
      risco: riscoRegional(l),
    })),
    [data],
  );

  function csv() {
    baixarCsv('regionais-comparativo.csv', [
      ['Regional', 'Cidade', 'UF', 'Situacao', 'Ativos', 'Novos', 'Cancelados', 'Inadimplentes',
       'Inadimplencia', 'Sinistros', 'Recebido', 'Gasto em eventos', 'Resultado', 'Sinistralidade'],
      ...linhas.map((l) => [l.regional, l.cidade, l.uf, l.ativa ? 'Ativa' : 'Inativa',
        l.veiculos_ativos, l.veiculos_novos,
        l.veiculos_cancelados, l.veiculos_inadimplentes, l.inadimplencia, l.sinistros,
        l.recebido, l.gasto_eventos, l.resultado, l.sinistralidade]),
    ]);
  }

  if (isLoading) return <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />;

  if ((data ?? []).length === 0) {
    return (
      <Card>
        <CardContent>
          <Vazio
            icon={Building2}
            titulo="Nenhuma regional para comparar"
            descricao="Cadastre as unidades em Configuracoes > Regionais. O ranking aparece aqui assim que houver mais de uma."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="min-w-0">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-x-3">
          <CardTitle>Desempenho por regional</CardTitle>
          <span className="text-[11px] uppercase tracking-wide text-slate-400">
            barra = carteira ativa · cor = risco da unidade
          </span>
        </CardHeader>
        <CardContent>
          <div style={{ height: Math.max(200, barras.length * 40 + 30) }} className="w-full min-w-0 text-slate-500">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barras} layout="vertical" margin={{ left: 0, right: 56, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.18} horizontal={false} />
                <XAxis type="number" tick={EIXO} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="curto" width={118} tick={EIXO} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number) => [inteiro.format(v), 'Veiculos ativos']}
                />
                <Bar dataKey="veiculos_ativos" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {barras.map((b) => <Cell key={b.regional_id} fill={COR_RISCO[b.risco]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            {(['critico', 'atencao', 'saudavel', 'sem_dados'] as RiscoRegional[]).map((k) => (
              <li key={k} className="flex items-center gap-1.5 text-[12.5px]">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR_RISCO[k] }} />
                <span className="text-slate-500">{ROTULO_RISCO[k]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">
            Risco e a <b>pior</b> das duas reguas: sinistralidade acima de 100% (gasta mais com
            evento do que arrecada) ou inadimplencia acima de 25% da carteira.
          </p>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-x-3">
          <CardTitle>Detalhamento por regional</CardTitle>
          <button
            type="button"
            onClick={csv}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[13px]">
              <thead className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  {COLUNAS.map((c) => (
                    <th
                      key={c.chave}
                      className={`px-4 py-2.5 font-semibold ${c.numerica ? 'text-right' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => setOrdem(c.chave)}
                        className={`transition hover:text-slate-800 ${ordem === c.chave ? 'text-brand-700 underline decoration-cyan-500 decoration-2 underline-offset-4' : ''}`}
                      >
                        {c.rotulo}
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right font-semibold">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => <LinhaRegional key={l.regional_id} l={l} destacada={l.regional_id === regionalId} />)}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50/60 text-[12.5px] font-semibold text-slate-700">
                <tr>
                  <td className="px-4 py-2.5">{inteiro.format(totais.unidades)} unidade(s)</td>
                  <td className="tnum px-4 py-2.5 text-right">{inteiro.format(totais.ativos)}</td>
                  <td className="tnum px-4 py-2.5 text-right">{formatPercent(totais.inadimplencia)}</td>
                  <td className="tnum px-4 py-2.5 text-right">{inteiro.format(totais.sinistros)}</td>
                  <td className="tnum px-4 py-2.5 text-right">{formatCurrency(totais.recebido)}</td>
                  <td className="tnum px-4 py-2.5 text-right">{formatPercent(totais.sinistralidade)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LinhaRegional({ l, destacada }: { l: RegionaisPainelLinha; destacada: boolean }) {
  const risco = riscoRegional(l);
  return (
    <tr className={`border-b border-slate-100 last:border-0 ${destacada ? 'bg-cyan-50/40' : ''}`}>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold uppercase text-slate-800">{l.regional}</span>
          <SeloRisco risco={risco} />
          {/* Unidade inativada (0067) segue na tabela: ela operou no periodo. */}
          {!l.ativa && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
              Inativa
            </span>
          )}
        </div>
        <span className="mt-0.5 block text-[11.5px] uppercase text-slate-400">
          {[l.cidade, l.uf].filter(Boolean).join(' — ') || 'Local nao informado'}
          {' · '}
          <span className="text-emerald-600">+{inteiro.format(l.veiculos_novos)}</span>
          {' / '}
          <span className="text-rose-600">-{inteiro.format(l.veiculos_cancelados)}</span>
        </span>
      </td>
      <td className="tnum px-4 py-2.5 text-right font-semibold text-slate-800">
        {inteiro.format(l.veiculos_ativos)}
      </td>
      <td className="tnum px-4 py-2.5 text-right">
        <span className={l.inadimplencia >= 0.15 ? 'font-semibold text-rose-600' : 'text-slate-600'}>
          {formatPercent(l.inadimplencia)}
        </span>
        <span className="block text-[11px] text-slate-400">{inteiro.format(l.veiculos_inadimplentes)} veic.</span>
      </td>
      <td className="tnum px-4 py-2.5 text-right text-slate-600">{inteiro.format(l.sinistros)}</td>
      <td className="tnum px-4 py-2.5 text-right">
        <span className={l.resultado < 0 ? 'font-semibold text-rose-600' : 'text-slate-800'}>
          {formatCurrency(l.resultado)}
        </span>
        <span className="block text-[11px] text-slate-400">
          {formatCurrency(l.recebido)} − {formatCurrency(l.gasto_eventos)}
        </span>
      </td>
      <td className="tnum px-4 py-2.5 text-right">
        <span className={l.sinistralidade > 1 ? 'font-semibold text-rose-600'
          : l.sinistralidade >= 0.7 ? 'font-semibold text-amber-700' : 'text-slate-600'}>
          {l.recebido > 0 ? formatPercent(l.sinistralidade) : '—'}
        </span>
      </td>
      <td className="px-4 py-2.5 text-right">
        <Link
          href="/regional"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-medium text-slate-600 transition hover:border-cyan-400 hover:text-cyan-700"
        >
          Abrir portal <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------
export function PainelRegionais() {
  const [periodo, setPeriodo] = useState<PeriodoPainel>(() => periodoPainel(PERIODO_PADRAO_PAINEL));
  const [regionalId, setRegionalId] = useState<string | null>(null);
  const [contasAberto, setContasAberto] = useState(false);
  const { data: intervalo } = useIntervaloContas();
  const valido = periodoValido(periodo);

  return (
    <div className="space-y-6">
      <BarraFiltros
        periodo={periodo}
        onPeriodo={setPeriodo}
        regionalId={regionalId}
        onRegional={setRegionalId}
        onAbrirContas={() => setContasAberto(true)}
        recorte={rotuloIntervalo(intervalo?.conta_de ?? null, intervalo?.conta_ate ?? null)}
      />

      {!valido ? (
        <Card>
          <CardContent>
            <Vazio
              icon={CircleAlert}
              titulo="Periodo invertido"
              descricao="A data inicial esta depois da final. Ajuste as datas ou use um dos atalhos."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Indicadores periodo={periodo} regionalId={regionalId} />
          <GraficosEvolucao periodo={periodo} regionalId={regionalId} />
          <Comparativo periodo={periodo} regionalId={regionalId} />
        </>
      )}

      <ModalContas open={contasAberto} onClose={() => setContasAberto(false)} />
    </div>
  );
}
