'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend, AreaChart, Area, LabelList,
} from 'recharts';
import {
  Car, Users, Wallet, UserPlus, UserMinus, AlertTriangle, Ticket, ArrowRight, Map as MapIcon,
  TrendingUp, TrendingDown, Minus, ShieldAlert, LifeBuoy, Radar, Target, Banknote, Info,
  PieChart as PieIcon, Layers,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useVisaoGeral } from '@/hooks/use-dashboard';
import { useResumoProtocolos } from '@/hooks/use-protocolos';
import { useCobrancaSerie } from '@/hooks/use-cobranca-painel';
import { usePerfilAtual, useRegionais } from '@/hooks/use-config';
import { useTema } from '@/hooks/use-tema';
import { opcoesParaFiltrar, rotuloUnidade } from '@/lib/regional';
import {
  coresPorEntidade, crescimentoLiquido, eventosPorEtapa, fatiasComOutros, funilOrdenado,
  inadimplenciaDoMes, inadimplenciaDoPeriodo, recebidoDoMes, somarPorTipo,
  projecaoDoMes, rotuloMesCurto, taxaChurn, variacaoRelativa, ROTULO_STATUS_VEICULO,
  type Fatia, type PainelVisaoGeral,
} from '@/lib/visao-geral';
import { formatCurrency, formatPercent } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Estilo dos graficos. Texto de eixo/rotulo usa `currentColor` (herda o
// `text-slate-*` do container, que inverte no tema escuro); o tooltip usa os
// tokens de superficie. Mesma convencao do painel da 24h.
// ---------------------------------------------------------------------------
const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid rgb(var(--superficie-alta))',
  backgroundColor: 'rgb(var(--superficie))',
  fontSize: 12,
} as const;
const EIXO = { fontSize: 11, fill: 'currentColor' } as const;
// Duas series de MESMA unidade num grafico: azul (entrou) e laranja (saiu) —
// slots 1 e 2 da paleta categorica validada.
const COR_A = { claro: '#2a78d6', escuro: '#3987e5' };
const COR_B = { claro: '#eb6834', escuro: '#d95926' };
// Slot 3 (verde-agua): eventos do SCar, empilhados sobre o historico do Mutual.
// Validado contra o laranja e o azul nos dois temas (violeta x azul reprovou).
const COR_C = { claro: '#1baf7a', escuro: '#199e70' };

const inteiro = new Intl.NumberFormat('pt-BR');
const n = (v: unknown) => Number(v ?? 0);

// ---------------------------------------------------------------------------
// Pecas
// ---------------------------------------------------------------------------
function Tile({
  titulo, valor, detalhe, icon: Icon, tom = 'cyan', carregando, href, tendencia,
}: {
  titulo: string; valor: string; detalhe?: React.ReactNode; icon: React.ElementType;
  tom?: 'cyan' | 'navy' | 'rose' | 'amber' | 'green' | 'violet'; carregando?: boolean;
  href?: string; tendencia?: React.ReactNode;
}) {
  const chip = {
    cyan: 'bg-cyan-50 text-cyan-600',
    navy: 'bg-brand-50 text-brand-600',
    rose: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-600',
    green: 'bg-emerald-50 text-emerald-600',
    violet: 'bg-violet-50 text-violet-600',
  }[tom];
  const corpo = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11.5px] font-semibold uppercase leading-tight tracking-wide text-slate-500">{titulo}</p>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] ${chip}`}>
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
      </div>
      {carregando ? (
        <div className="mt-3 h-7 w-24 animate-pulse rounded bg-slate-100" />
      ) : (
        <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2">
          <p className="tnum text-[23px] font-bold leading-none text-slate-900">{valor}</p>
          {tendencia}
        </div>
      )}
      {detalhe && <div className="mt-2 text-[11.5px] leading-snug text-slate-500">{detalhe}</div>}
    </>
  );
  const classe =
    'block rounded-2xl border border-slate-200/80 bg-superficie p-4 shadow-[0_1px_2px_rgba(20,33,61,0.04),0_10px_26px_-16px_rgba(20,33,61,0.18)]';
  return href ? (
    <Link href={href} className={`${classe} transition hover:-translate-y-0.5 hover:border-cyan-300`}>{corpo}</Link>
  ) : (
    <div className={classe}>{corpo}</div>
  );
}

/** Seta de tendencia; `subirEBom` diz para que lado e boa noticia. */
function Tendencia({ fracao, subirEBom, rotulo }: { fracao: number | null; subirEBom: boolean; rotulo?: string }) {
  if (fracao === null) {
    return <span className="text-[11px] text-slate-400">sem base de comparacao</span>;
  }
  if (fracao === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11.5px] font-medium text-slate-400">
        <Minus className="h-3.5 w-3.5" /> estavel
      </span>
    );
  }
  const subiu = fracao > 0;
  const bom = subiu === subirEBom;
  const Icon = subiu ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11.5px] font-semibold ${bom ? 'text-emerald-600' : 'text-rose-600'}`}>
      <Icon className="h-3.5 w-3.5" />
      {subiu ? '+' : ''}{formatPercent(fracao)}
      {rotulo && <span className="font-normal text-slate-400"> {rotulo}</span>}
    </span>
  );
}

function SemDados({ texto }: { texto: string }) {
  return <p className="py-10 text-center text-sm text-slate-400">{texto}</p>;
}

function Secao({ titulo, icon: Icon, children, acao }: {
  titulo: string; icon: React.ElementType; children: React.ReactNode; acao?: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-slate-600">
          <Icon className="h-4 w-4 text-cyan-600" /> {titulo}
        </h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

function LinkSecao({ href, texto }: { href: string; texto: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:text-cyan-800">
      {texto} <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

/**
 * Rosca com a legenda ao lado: nome, valor e % em TEXTO — a cor so acompanha
 * (no tema claro tres fatias ficam abaixo de 3:1 contra o fundo).
 */
function Rosca({
  fatias, cores, unidade, extra,
}: {
  fatias: Fatia[]; cores: Record<string, string>; unidade: string;
  extra?: (nome: string) => React.ReactNode;
}) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  if (!fatias.length) return <SemDados texto="Nada na base para distribuir." />;
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[200px_1fr]">
      <div className="relative mx-auto h-[200px] w-[200px] text-slate-500">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={fatias} dataKey="valor" nameKey="nome" innerRadius={62} outerRadius={94}
              paddingAngle={fatias.length > 1 ? 1.5 : 0} stroke="rgb(var(--superficie))" strokeWidth={2}
              isAnimationActive={false}
            >
              {fatias.map((f) => <Cell key={f.nome} fill={cores[f.nome]} />)}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: number, nome: string) => [`${inteiro.format(v)} ${unidade} (${formatPercent(v / total)})`, nome]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="tnum text-xl font-bold text-slate-900">{inteiro.format(total)}</p>
            <p className="text-[11px] text-slate-500">{unidade}</p>
          </div>
        </div>
      </div>
      <ul className="space-y-1.5 text-sm">
        {fatias.map((f) => (
          <li key={f.nome} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cores[f.nome] }} />
            <span className="min-w-0 flex-1 truncate text-slate-700">{f.nome}</span>
            <span className="tnum font-semibold text-slate-900">{inteiro.format(f.valor)}</span>
            <span className="tnum w-12 text-right text-xs text-slate-500">{formatPercent(f.pct)}</span>
            {extra && <span className="tnum hidden w-28 text-right text-xs text-slate-500 md:inline">{extra(f.nome)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barras horizontais ranqueadas, um acento so e o valor escrito na ponta. */
function BarrasRanking({ fatias, cor, altura }: { fatias: Fatia[]; cor: string; altura?: number }) {
  if (!fatias.length) return <SemDados texto="Sem dados." />;
  const h = altura ?? Math.max(160, fatias.length * 30 + 20);
  return (
    <div style={{ height: h }} className="w-full text-slate-500">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={fatias} layout="vertical" margin={{ left: 4, right: 56, top: 4, bottom: 4 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="nome" width={130} tick={EIXO} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(30,43,77,0.05)' }}
            formatter={(v: number, _n, p) => [`${inteiro.format(v)} (${formatPercent((p?.payload as Fatia)?.pct)})`, 'Veiculos']}
          />
          <Bar dataKey="valor" fill={cor} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
            <LabelList
              dataKey="valor" position="right" fontSize={11} fill="currentColor"
              formatter={(v: number) => inteiro.format(v)}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blocos
// ---------------------------------------------------------------------------
function Cabecalho({ d, carregando }: { d: PainelVisaoGeral | null | undefined; carregando: boolean }) {
  const { data: protocolos } = useResumoProtocolos();
  const k = d?.kpis;
  const hoje = new Date();
  const projecao = projecaoDoMes(n(k?.adesoes_mes), hoje);
  const churn = taxaChurn(n(k?.saidas_mes), n(k?.base_mes_anterior));
  const varBase = variacaoRelativa(n(k?.veiculos_base), n(k?.base_mes_anterior));

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      <Tile
        titulo="Veiculos na base" icon={Car} tom="cyan" carregando={carregando} href="/veiculos"
        valor={inteiro.format(n(k?.veiculos_base))}
        tendencia={<Tendencia fracao={varBase} subirEBom rotulo="no mes" />}
        detalhe={`${inteiro.format(n(k?.vistoria_pendente))} com vistoria pendente`}
      />
      <Tile
        titulo="Associados" icon={Users} tom="navy" carregando={carregando} href="/associados"
        valor={inteiro.format(n(k?.associados_base))}
        detalhe={`${(n(k?.veiculos_base) / Math.max(1, n(k?.associados_base))).toFixed(2).replace('.', ',')} veiculos por associado`}
      />
      <Tile
        titulo="Carteira mensal" icon={Wallet} tom="green" carregando={carregando}
        valor={formatCurrency(n(k?.carteira_mensal))}
        detalhe={
          <>
            Ticket medio {formatCurrency(n(k?.ticket_medio))}
            {n(k?.sem_valor) > 0 && <span className="text-amber-600"> · {inteiro.format(n(k?.sem_valor))} sem valor</span>}
          </>
        }
      />
      <Tile
        titulo="Adesoes no mes" icon={UserPlus} tom="cyan" carregando={carregando}
        valor={inteiro.format(n(k?.adesoes_mes))}
        tendencia={<Tendencia fracao={variacaoRelativa(projecao, n(k?.adesoes_mes_anterior))} subirEBom rotulo="projetado" />}
        detalhe={`Ritmo atual fecha em ~${inteiro.format(projecao)} · mes anterior ${inteiro.format(n(k?.adesoes_mes_anterior))}`}
      />
      <Tile
        titulo="Saidas no mes" icon={UserMinus} tom="rose" carregando={carregando}
        valor={inteiro.format(n(k?.saidas_mes))}
        detalhe={`Churn ${churn === null ? '—' : formatPercent(churn)} · mes anterior ${inteiro.format(n(k?.saidas_mes_anterior))}`}
      />
      <Tile
        titulo="Protocolos em aberto" icon={Ticket} tom="violet" href="/protocolos"
        valor={inteiro.format(n(protocolos?.abertos))}
        detalhe={
          <>
            {inteiro.format(n(protocolos?.em_andamento))} em atendimento
            {n(protocolos?.urgentes) > 0 && <span className="text-rose-600"> · {inteiro.format(n(protocolos?.urgentes))} urgentes</span>}
            {n(protocolos?.mais_7_dias) > 0 && <span className="text-amber-600"> · {inteiro.format(n(protocolos?.mais_7_dias))} +7 dias</span>}
          </>
        }
      />
    </div>
  );
}

/** A carteira ainda cobrada pelo Mutual (0082) — sem isso o financeiro parece vazio. */
function FaixaCobrancaExterna({ d }: { d: PainelVisaoGeral }) {
  const ext = n(d.kpis.cobranca_externa);
  const base = n(d.kpis.veiculos_base);
  if (!ext) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-cyan-200 bg-cyan-50/60 px-4 py-3 text-sm text-slate-700">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />
      <p>
        <b className="tnum">{inteiro.format(ext)}</b> de {inteiro.format(base)} veiculos ({formatPercent(ext / Math.max(1, base))})
        ainda sao <b>cobrados pelo sistema anterior</b> — {formatCurrency(n(d.kpis.carteira_externa))}/mes da carteira. Eles estao
        na base, no SAC e na 24h, mas o boleto ainda sai de la — as <i>Mensalidades</i> abaixo juntam o que foi emitido aqui e o
        historico de boletos importado do Mutual.
      </p>
    </div>
  );
}

function Distribuicao({ d, escuro, global }: { d: PainelVisaoGeral; escuro: boolean; global: boolean }) {
  const porUnidade = useMemo(
    () => fatiasComOutros(d.por_regional, (r) => r.nome, (r) => r.veiculos, 8),
    [d.por_regional],
  );
  const carteiraUnidade = useMemo(
    () => new Map(d.por_regional.map((r) => [r.nome, r])),
    [d.por_regional],
  );
  const cores = useMemo(() => coresPorEntidade(d.por_regional.map((r) => r.nome), escuro), [d.por_regional, escuro]);
  const porUf = useMemo(() => fatiasComOutros(d.por_uf, (u) => u.uf, (u) => u.veiculos, 8), [d.por_uf]);

  return (
    <Secao titulo="Distribuicao nacional da carteira" icon={MapIcon} acao={global ? <LinkSecao href="/regionais" texto="Dashboard das regionais" /> : undefined}>
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader><CardTitle>Veiculos por unidade</CardTitle></CardHeader>
          <CardContent>
            <Rosca
              fatias={porUnidade} cores={cores} unidade="veiculos"
              extra={(nome) => {
                const r = carteiraUnidade.get(nome);
                return r?.carteira != null ? `${formatCurrency(n(r.carteira))}/mes` : null;
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Por estado (UF do associado)</CardTitle></CardHeader>
          <CardContent>
            <BarrasRanking fatias={porUf} cor={escuro ? COR_A.escuro : COR_A.claro} />
          </CardContent>
        </Card>
      </div>
    </Secao>
  );
}

function Evolucao({
  d, escuro, meses, setMeses,
}: { d: PainelVisaoGeral; escuro: boolean; meses: number; setMeses: (m: number) => void }) {
  const serie = d.serie.map((m) => ({ ...m, rotulo: rotuloMesCurto(m.mes), liquido: crescimentoLiquido(m) }));
  const entrou = serie.reduce((s, m) => s + n(m.adesoes), 0);
  const saiu = serie.reduce((s, m) => s + n(m.saidas), 0);
  const primeiro = serie[0];
  const ultimo = serie[serie.length - 1];
  const corA = escuro ? COR_A.escuro : COR_A.claro;
  const corB = escuro ? COR_B.escuro : COR_B.claro;

  return (
    <Secao
      titulo={`Evolucao da carteira — ultimos ${meses} meses`} icon={TrendingUp}
      acao={
        <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
          {[6, 12].map((m) => (
            <button
              key={m} type="button" onClick={() => setMeses(m)}
              className={`rounded-md px-2.5 py-1 ${meses === m ? 'bg-acao font-medium text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {m} meses
            </button>
          ))}
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Novas adesoes x saidas por mes</CardTitle>
            <p className="text-xs text-slate-500">
              {inteiro.format(entrou)} entraram e {inteiro.format(saiu)} sairam no periodo — liquido{' '}
              <b className={entrou - saiu >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                {entrou - saiu >= 0 ? '+' : ''}{inteiro.format(entrou - saiu)}
              </b>
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full text-slate-500">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} vertical={false} />
                  <XAxis dataKey="rotulo" tick={EIXO} axisLine={false} tickLine={false} />
                  <YAxis tick={EIXO} axisLine={false} tickLine={false} allowDecimals={false} width={36} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(30,43,77,0.05)' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                  <Bar dataKey="adesoes" name="Adesoes" fill={corA} radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false}>
                    <LabelList dataKey="adesoes" position="top" fontSize={10} fill="currentColor" />
                  </Bar>
                  <Bar dataKey="saidas" name="Saidas" fill={corB} radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Veiculos na base (fim de cada mes)</CardTitle>
            <p className="text-xs text-slate-500">
              De {inteiro.format(n(primeiro?.base_fim))} para {inteiro.format(n(ultimo?.base_fim))}
              {' '}<Tendencia fracao={variacaoRelativa(n(ultimo?.base_fim), n(primeiro?.base_fim))} subirEBom />
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full text-slate-500">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={serie}>
                  <defs>
                    <linearGradient id="vg-base" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={corA} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={corA} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} vertical={false} />
                  <XAxis dataKey="rotulo" tick={EIXO} axisLine={false} tickLine={false} />
                  <YAxis tick={EIXO} axisLine={false} tickLine={false} width={44} domain={['dataMin - 50', 'auto']} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [inteiro.format(v), 'Veiculos na base']} />
                  <Area type="monotone" dataKey="base_fim" stroke={corA} strokeWidth={2} fill="url(#vg-base)" dot={{ r: 3 }} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
      <p className="flex items-start gap-1.5 text-[11.5px] text-slate-400">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        A carteira migrada traz a data de ativacao original. Os encerrados antes da migracao nao foram trazidos,
        entao as saidas desse periodo aparecem zeradas; vendas feitas no sistema anterior depois da ultima captura
        so entram na proxima carga.
      </p>
    </Secao>
  );
}

function Composicao({ d, escuro }: { d: PainelVisaoGeral; escuro: boolean }) {
  const porTipo = useMemo(() => fatiasComOutros(d.por_tipo, (t) => t.nome, (t) => t.veiculos, 6), [d.por_tipo]);
  const coresTipo = useMemo(() => coresPorEntidade(d.por_tipo.map((t) => t.nome), escuro), [d.por_tipo, escuro]);
  const porPlano = useMemo(() => fatiasComOutros(d.por_plano, (p) => p.nome, (p) => p.veiculos, 8), [d.por_plano]);
  const total = d.por_status.reduce((s, x) => s + n(x.veiculos), 0);
  const corStatus: Record<string, string> = {
    ativo: '#12A150', vistoria_pendente: '#C08600', em_evento: '#2a78d6', inadimplente: '#E5484D', suspenso: '#64748B',
  };

  return (
    <Secao titulo="Composicao da frota" icon={Layers}>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader><CardTitle>Por tipo de veiculo</CardTitle></CardHeader>
          <CardContent><Rosca fatias={porTipo} cores={coresTipo} unidade="veiculos" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Por plano</CardTitle></CardHeader>
          <CardContent>
            <BarrasRanking fatias={porPlano} cor={escuro ? '#3987e5' : '#2a78d6'} />
          </CardContent>
        </Card>
      </div>
      {total > 0 && (
        <Card>
          <CardContent className="py-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Situacao dos veiculos na base</p>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
              {d.por_status.map((s) => (
                <div
                  key={s.status} title={`${ROTULO_STATUS_VEICULO[s.status] ?? s.status}: ${inteiro.format(n(s.veiculos))}`}
                  style={{ width: `${(n(s.veiculos) / total) * 100}%`, background: corStatus[s.status] ?? '#94A3B8' }}
                  className="h-full border-r-2 border-superficie last:border-r-0"
                />
              ))}
            </div>
            <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
              {d.por_status.map((s) => (
                <li key={s.status} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: corStatus[s.status] ?? '#94A3B8' }} />
                  {ROTULO_STATUS_VEICULO[s.status] ?? s.status}
                  <b className="tnum text-slate-800">{inteiro.format(n(s.veiculos))}</b>
                  <span className="tnum text-slate-400">{formatPercent(n(s.veiculos) / total)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </Secao>
  );
}

function EventosBloco({ d, escuro }: { d: PainelVisaoGeral; escuro: boolean }) {
  const e = d.eventos;
  const h = e.historico;
  const etapas = eventosPorEtapa(e.por_status);
  // Tipos dos ULTIMOS 12 MESES, somando SCar + historico do Mutual (0101).
  const porTipo = fatiasComOutros(
    somarPorTipo(e.por_tipo_12m ?? e.por_tipo, h?.por_tipo_12m),
    (t) => t.tipo, (t) => t.n, 7,
  );
  const serie = d.serie.map((m) => ({
    rotulo: rotuloMesCurto(m.mes),
    eventos: n(m.eventos),
    historico: n(m.eventos_historico),
    acionamentos: n(m.acionamentos),
  }));
  const temHistorico = n(h?.total) > 0;
  const mes = n(e.novos_mes) + n(h?.mes);
  const doze = n(e.ultimos_12m) + n(h?.ultimos_12m);
  const frequencia = n(d.kpis.veiculos_base) ? doze / n(d.kpis.veiculos_base) : null;

  return (
    <Secao titulo="Eventos / sinistros e Assistencia 24h" icon={ShieldAlert} acao={<LinkSecao href="/sinistros" texto="Abrir eventos" />}>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Tile titulo="Eventos em aberto (SCar)" icon={AlertTriangle} tom="amber" href="/sinistros" valor={inteiro.format(n(e.abertos))}
          detalhe={etapas.filter((x) => !['CONCLUIDO', 'NEGADO'].includes(x.status)).map((x) => `${x.rotulo} ${x.n}`).join(' · ') || 'Nenhum em andamento'} />
        <Tile titulo="Eventos no mes" icon={ShieldAlert} tom="rose" valor={inteiro.format(mes)}
          detalhe={temHistorico ? `${inteiro.format(n(e.novos_mes))} no SCar · ${inteiro.format(n(h?.mes))} no Mutual` : `${inteiro.format(n(e.total))} registrados no total`} />
        <Tile titulo="Eventos em 12 meses" icon={ShieldAlert} tom="rose" href="/sinistros?aba=historico" valor={inteiro.format(doze)}
          detalhe={frequencia === null ? undefined : `${formatPercent(frequencia)} da frota na base · SCar + historico`} />
        <Tile titulo="Acionamentos 24h no mes" icon={LifeBuoy} tom="cyan" valor={inteiro.format(n(d.assistencia.mes))}
          detalhe={`${inteiro.format(n(d.assistencia.em_aberto))} OS em andamento · custo ${formatCurrency(n(d.assistencia.custo_mes))}`} />
        <Tile titulo="Rastreadores instalados" icon={Radar} tom="navy" href="/rastreadores" valor={inteiro.format(n(d.rastreadores.instalados))}
          detalhe={
            <>
              {inteiro.format(n(d.rastreadores.estoque))} em estoque
              {n(d.rastreadores.inadimplentes) > 0 && <span className="text-rose-600"> · {inteiro.format(n(d.rastreadores.inadimplentes))} suspensos</span>}
            </>
          }
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader><CardTitle>Eventos e acionamentos 24h por mes</CardTitle></CardHeader>
          <CardContent>
            <div className="h-60 w-full text-slate-500">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} vertical={false} />
                  <XAxis dataKey="rotulo" tick={EIXO} axisLine={false} tickLine={false} />
                  <YAxis tick={EIXO} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(30,43,77,0.05)' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                  {temHistorico && (
                    <Bar dataKey="historico" name="Eventos (historico Mutual)" stackId="ev" fill={escuro ? COR_B.escuro : COR_B.claro} maxBarSize={22} isAnimationActive={false} />
                  )}
                  <Bar dataKey="eventos" name="Eventos (SCar)" stackId="ev" fill={escuro ? COR_C.escuro : COR_C.claro} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                  <Bar dataKey="acionamentos" name="Acionamentos 24h" fill={escuro ? COR_A.escuro : COR_A.claro} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Eventos por tipo — ultimos 12 meses</CardTitle></CardHeader>
          <CardContent>
            {porTipo.length ? (
              <BarrasRanking fatias={porTipo} cor={escuro ? COR_B.escuro : COR_B.claro} />
            ) : (
              <SemDados texto="Nenhum evento nos ultimos 12 meses." />
            )}
          </CardContent>
        </Card>
      </div>
      <p className="flex items-start gap-1.5 text-[11.5px] text-slate-400">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {temHistorico
          ? <>Os eventos somam o SCar e o <b>historico do Mutual</b> ({inteiro.format(n(h?.total))} eventos dos associados carregados).
              O historico e so consulta: nao conta como evento em aberto. Acionamentos 24h sao so os do SCar.</>
          : <>Eventos e acionamentos contam o que foi registrado no SCar — o historico do Mutual ainda nao foi importado
              (Integracao Mutual → Historico de eventos).</>}
      </p>
    </Secao>
  );
}

function ComercialFinanceiro({
  d, regionalId, meses, escuro,
}: { d: PainelVisaoGeral; regionalId: string | null; meses: number; escuro: boolean }) {
  const funil = funilOrdenado(d.vendas.funil);
  const maior = Math.max(1, ...funil.map((f) => f.n));
  const cob = useCobrancaSerie(regionalId, meses);
  const serie = (cob.data ?? []).map((m) => ({
    rotulo: rotuloMesCurto(String(m.mes).slice(0, 7)),
    emitido: n(m.valor_emitido),
    recebido: recebidoDoMes(m),
    inad: inadimplenciaDoMes(m),
  }));
  const atual = cob.data?.[cob.data.length - 1];
  // O mes corrente ainda esta vencendo: a inadimplencia de referencia e a do
  // periodo SEM ele, ponderada pelo valor.
  const fechados = (cob.data ?? []).slice(0, -1);
  const inadPeriodo = inadimplenciaDoPeriodo(fechados);
  const aVencer = atual ? n(atual.valor_emitido) - n(atual.valor_venceram) : 0;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.5fr]">
      <Secao titulo="Comercial" icon={Target} acao={<LinkSecao href="/vendas" texto="Abrir vendas" />}>
        <Card>
          <CardContent className="space-y-4 py-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><p className="tnum text-xl font-bold text-slate-900">{inteiro.format(n(d.vendas.em_aberto))}</p><p className="text-[11px] text-slate-500">leads em aberto</p></div>
              <div><p className="tnum text-xl font-bold text-slate-900">{inteiro.format(n(d.vendas.novos_mes))}</p><p className="text-[11px] text-slate-500">novos no mes</p></div>
              <div><p className="tnum text-xl font-bold text-emerald-600">{inteiro.format(n(d.vendas.convertidos_mes))}</p><p className="text-[11px] text-slate-500">convertidos no mes</p></div>
            </div>
            <ul className="space-y-1.5">
              {funil.map((e) => (
                <li key={e.status} className="grid grid-cols-[120px_1fr_36px] items-center gap-2 text-xs">
                  <span className="truncate text-slate-600">{e.rotulo}</span>
                  <span className="h-2.5 rounded-full bg-slate-100">
                    <span className="block h-full rounded-full bg-cyan-500" style={{ width: `${(e.n / maior) * 100}%` }} />
                  </span>
                  <span className="tnum text-right font-semibold text-slate-800">{e.n}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </Secao>

      <Secao titulo="Financeiro — mensalidades" icon={Banknote} acao={<LinkSecao href="/cobrancas" texto="Abrir cobranca" />}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile titulo="Emitido no mes" icon={Wallet} tom="cyan" carregando={cob.isLoading}
            valor={formatCurrency(n(atual?.valor_emitido))}
            detalhe={`${formatCurrency(aVencer)} ainda a vencer`} />
          <Tile titulo="Recebido no mes" icon={Banknote} tom="green" carregando={cob.isLoading}
            valor={formatCurrency(atual ? recebidoDoMes(atual) : 0)}
            detalhe={`Em aberto vencido: ${formatCurrency(n(atual?.valor_aberto_vencido))}`} />
          <Tile titulo={`Inadimplencia (${Math.max(1, fechados.length)} meses)`} icon={AlertTriangle} tom="rose" href="/cobrancas" carregando={cob.isLoading}
            valor={inadPeriodo === null ? '—' : formatPercent(inadPeriodo)}
            detalhe={`Valor vencido e nao pago · ${inteiro.format(n(d.kpis.inadimplentes))} veiculos inadimplentes`} />
          <Tile titulo="A pagar em 7 dias" icon={Banknote} tom="amber" href="/financeiro" valor={formatCurrency(n(d.pagar.proximos_7))}
            detalhe={n(d.pagar.vencido) > 0
              ? <span className="text-rose-600">{formatCurrency(n(d.pagar.vencido))} ja vencidos</span>
              : `${formatCurrency(n(d.pagar.em_aberto))} em aberto no total`} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Mensalidades: emitido x recebido</CardTitle>
            <p className="text-xs text-slate-500">Boletos emitidos no SCar + historico importado do Mutual, pelo mes de vencimento.</p>
          </CardHeader>
          <CardContent>
            {cob.error ? (
              <p className="py-8 text-center text-sm text-rose-600">
                Nao foi possivel ler a cobranca: {(cob.error as { message?: string }).message ?? 'erro'}
              </p>
            ) : serie.some((m) => m.emitido > 0) ? (
              <>
                <div className="h-56 w-full text-slate-500">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={serie} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} vertical={false} />
                      <XAxis dataKey="rotulo" tick={EIXO} axisLine={false} tickLine={false} />
                      <YAxis tick={EIXO} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatCurrency(v)} cursor={{ fill: 'rgba(30,43,77,0.05)' }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                      <Bar dataKey="emitido" name="Emitido" fill="#86b6ef" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
                      <Bar dataKey="recebido" name="Recebido" fill={escuro ? '#3987e5' : '#1c5cab'} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 grid gap-1 text-center text-[11px]" style={{ gridTemplateColumns: `repeat(${serie.length}, minmax(0, 1fr))` }}>
                  {serie.map((m, i) => (
                    <div key={m.rotulo}>
                      <p className="text-slate-400">{i === serie.length - 1 ? 'em curso' : 'inadimpl.'}</p>
                      <p className={`tnum font-semibold ${m.inad !== null && m.inad > 0.08 ? 'text-rose-600' : 'text-slate-700'}`}>
                        {m.inad === null ? '—' : formatPercent(m.inad)}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <SemDados texto={cob.isLoading ? 'Carregando...' : 'Nenhuma mensalidade no periodo.'} />
            )}
          </CardContent>
        </Card>
      </Secao>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------
export function VisaoGeral() {
  const [regionalId, setRegionalId] = useState<string | null>(null);
  const [meses, setMeses] = useState(6);
  const { data: perfil } = usePerfilAtual();
  const { data: regionais } = useRegionais();
  const { efetivo } = useTema();
  const escuro = efetivo === 'escuro';
  const global = perfil?.papel === 'admin' || perfil?.papel === 'financeiro';
  const { ativas, inativas } = opcoesParaFiltrar(regionais);
  const { data: d, isLoading, error } = useVisaoGeral(global ? regionalId : null, meses);

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {global ? (
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Unidade</span>
            <select
              value={regionalId ?? ''}
              onChange={(e) => setRegionalId(e.target.value || null)}
              className="mt-1 block rounded-lg border border-slate-300 bg-superficie px-2.5 py-1.5 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
            >
              <option value="">Todas as unidades</option>
              {ativas.map((r) => <option key={r.id} value={r.id}>{rotuloUnidade(r)}</option>)}
              {inativas.map((r) => <option key={r.id} value={r.id}>{rotuloUnidade(r)}</option>)}
            </select>
          </label>
        ) : (
          <span />
        )}
        {d?.gerado_em && (
          <p className="text-[11px] text-slate-400">
            Atualizado as {new Date(d.gerado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Nao foi possivel carregar o painel: {(error as { message?: string }).message ?? 'erro desconhecido'}.
          Tente atualizar a pagina.
        </div>
      ) : null}

      <Cabecalho d={d} carregando={isLoading} />

      {isLoading && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      )}

      {d && (
        <>
          <FaixaCobrancaExterna d={d} />
          <Distribuicao d={d} escuro={escuro} global={global} />
          <Evolucao d={d} escuro={escuro} meses={meses} setMeses={setMeses} />
          <Composicao d={d} escuro={escuro} />
          <EventosBloco d={d} escuro={escuro} />
          <ComercialFinanceiro d={d} regionalId={global ? regionalId : null} meses={meses} escuro={escuro} />
        </>
      )}

      {!isLoading && !error && !d && (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-slate-500">
          <PieIcon className="h-8 w-8 text-slate-300" />
          Seu acesso nao inclui os indicadores da operacao.
        </div>
      )}
    </div>
  );
}
