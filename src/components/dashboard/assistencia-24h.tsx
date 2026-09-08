'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, LabelList,
} from 'recharts';
import {
  LifeBuoy, Wallet, Gauge, Timer, Repeat, MapPin, Car, Download, ExternalLink,
  TrendingUp, TrendingDown, Minus, ShieldAlert, ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FiltroPeriodo, Vazio, baixarCsv, periodoPreset, type Periodo,
} from '@/components/financeiro/ui-financeiro';
import { useRegionais } from '@/hooks/use-config';
import {
  usePainelResumo, usePainelPorServico, usePainelPorPraca, usePainelSerie,
  usePainelReincidencia, usePainelFrotaSituacao,
} from '@/hooks/use-assistencia';
import {
  agruparSituacao, compararUltimosMeses, fatiasPorServico, formatarHoras, lerPracas, rotuloMes,
  type GrupoSituacao,
} from '@/lib/assistencia';
import { formatCurrency, formatDate, formatPercent } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Paleta do painel — validada para daltonismo e contraste sobre a superficie
// nos DOIS temas (claro e escuro), por isso um acento so + as cores de status.
// Toda barra/faixa carrega rotulo visivel: identidade nunca depende da cor.
// ---------------------------------------------------------------------------
const COR_ACENTO = '#139AD6';   // ciano da marca (cyan-600)
const COR_ALERTA = '#E5484D';
const COR_SITUACAO: Record<GrupoSituacao, string> = {
  ATIVO: '#12A150',
  INATIVO: '#64748B',
  BLOQUEADO: '#E5484D',
};
const ROTULO_SITUACAO: Record<GrupoSituacao, string> = {
  ATIVO: 'Ativos', INATIVO: 'Inativos', BLOQUEADO: 'Bloqueados',
};

// Recharts pinta o tooltip de branco fixo e nao conhece o tema — por isso o
// fundo e a borda vem dos tokens (`--superficie`), e todo texto de eixo/rotulo
// usa `currentColor`, herdando a classe `text-slate-*` do container (essa sim
// inverte no tema escuro). Hex fixo em texto de grafico fica ilegivel no escuro.
const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid rgb(var(--superficie-alta))',
  backgroundColor: 'rgb(var(--superficie))',
  fontSize: 12,
} as const;

const EIXO = { fontSize: 11, fill: 'currentColor' } as const;

const inteiro = new Intl.NumberFormat('pt-BR');

function Tile({
  titulo, valor, detalhe, icon: Icon, tom = 'cyan', carregando,
}: {
  titulo: string; valor: string; detalhe?: string; icon: React.ElementType;
  tom?: 'cyan' | 'navy' | 'rose' | 'amber' | 'green'; carregando?: boolean;
}) {
  const chip = {
    cyan: 'bg-cyan-50 text-cyan-600',
    navy: 'bg-brand-50 text-brand-600',
    rose: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-600',
    green: 'bg-emerald-50 text-emerald-600',
  }[tom];
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-superficie p-4 shadow-[0_1px_2px_rgba(20,33,61,0.04),0_10px_26px_-16px_rgba(20,33,61,0.18)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11.5px] font-semibold uppercase leading-tight tracking-wide text-slate-500">{titulo}</p>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] ${chip}`}>
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
      </div>
      {carregando ? (
        <div className="mt-3 h-7 w-24 animate-pulse rounded bg-slate-100" />
      ) : (
        <p className="tnum mt-2.5 text-[23px] font-bold leading-none text-slate-900">{valor}</p>
      )}
      {detalhe && <p className="mt-2 text-[11.5px] leading-tight text-slate-500">{detalhe}</p>}
    </div>
  );
}

/** Seta de tendencia. Em assistencia, SUBIR custo/volume e ruim. */
function Tendencia({ fracao }: { fracao: number | null }) {
  if (fracao === null || fracao === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-slate-400">
        <Minus className="h-3.5 w-3.5" /> estavel
      </span>
    );
  }
  const subiu = fracao > 0;
  const Icon = subiu ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-[11.5px] font-semibold ${subiu ? 'text-rose-600' : 'text-emerald-600'}`}>
      <Icon className="h-3.5 w-3.5" /> {formatPercent(Math.abs(fracao))} vs mes anterior
    </span>
  );
}

// ---------------------------------------------------------------------------
// Frota por situacao — faixa segmentada com legenda nomeada.
// ---------------------------------------------------------------------------
function FrotaSituacao({ regionalId }: { regionalId: string | null }) {
  const { data, isLoading } = usePainelFrotaSituacao(regionalId);
  const grupos = useMemo(() => agruparSituacao(data ?? []), [data]);
  const total = grupos.reduce((a, g) => a + g.quantidade, 0);

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-x-3">
        <CardTitle>Frota por situacao</CardTitle>
        <span className="tnum text-xs text-slate-400">{inteiro.format(total)} veiculos</span>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-9 w-full animate-pulse rounded-lg bg-slate-100" />
        ) : total === 0 ? (
          <p className="text-sm text-slate-400">Nenhum veiculo na carteira.</p>
        ) : (
          <>
            <div className="flex h-9 w-full gap-[2px] overflow-hidden rounded-lg">
              {grupos.filter((g) => g.quantidade > 0).map((g) => (
                <div
                  key={g.grupo}
                  className="grid place-items-center text-[11px] font-bold text-white"
                  style={{ width: `${Math.max(g.fracao * 100, 4)}%`, background: COR_SITUACAO[g.grupo] }}
                  title={`${ROTULO_SITUACAO[g.grupo]}: ${inteiro.format(g.quantidade)}`}
                >
                  {g.fracao >= 0.12 ? formatPercent(g.fracao) : ''}
                </div>
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
              {grupos.map((g) => (
                <li key={g.grupo} className="flex items-center gap-1.5 text-[12.5px]">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR_SITUACAO[g.grupo] }} />
                  <span className="text-slate-500">{ROTULO_SITUACAO[g.grupo]}</span>
                  <b className="tnum text-slate-800">{inteiro.format(g.quantidade)}</b>
                  <span className="tnum text-slate-400">({formatPercent(g.fracao)})</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Servico acionado — barras ranqueadas (uma serie, uma cor) + aviso de teto.
// ---------------------------------------------------------------------------
function GraficoServicos({ periodo, regionalId }: { periodo: Periodo; regionalId: string | null }) {
  const { data, isLoading } = usePainelPorServico({ inicio: periodo.inicio, fim: periodo.fim, regionalId });
  const fatias = useMemo(() => fatiasPorServico(data ?? []).slice(0, 9), [data]);
  const noTeto = useMemo(() => fatias.filter((f) => f.temVeiculoNoLimite), [fatias]);

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-x-3">
        <CardTitle>Servico acionado</CardTitle>
        {fatias.length > 0 && (
          <button
            type="button"
            onClick={() => baixarCsv('assistencia-servicos.csv', [
              ['Servico', 'Acionamentos', 'Participacao', 'Veiculos', 'Custo', 'Veiculos no limite'],
              ...fatias.map((f) => [f.servico, f.acionamentos, f.fracao, f.veiculos, f.custo, f.veiculos_no_limite]),
            ])}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-64 w-full animate-pulse rounded-xl bg-slate-100" />
        ) : fatias.length === 0 ? (
          <Vazio
            icon={LifeBuoy}
            titulo="Sem acionamentos no periodo"
            descricao="As OS abertas em Assistencia 24h aparecem aqui, agrupadas pelo servico do catalogo."
          />
        ) : (
          <>
            <div style={{ height: Math.max(200, fatias.length * 38 + 28) }} className="w-full min-w-0 text-slate-500">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fatias} layout="vertical" margin={{ left: 0, right: 52, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.18} horizontal={false} />
                  <XAxis type="number" tick={EIXO} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="servico"
                    width={168}
                    interval={0}
                    tick={EIXO}
                    tickFormatter={(v: string) => (v.length > 26 ? `${v.slice(0, 25)}…` : v)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    cursor={{ fill: 'rgba(30,43,77,0.04)' }}
                    formatter={(v: number, _n: string, p: { payload?: { custo?: number; fracao?: number } }) => [
                      `${inteiro.format(v)} acionamentos · ${formatPercent(p.payload?.fracao ?? 0)} · ${formatCurrency(p.payload?.custo ?? 0)}`,
                      'Volume',
                    ]}
                  />
                  <Bar dataKey="acionamentos" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {fatias.map((f) => (
                      <Cell key={f.servico_id} fill={f.temVeiculoNoLimite ? COR_ALERTA : COR_ACENTO} />
                    ))}
                    <LabelList dataKey="acionamentos" position="right" className="tnum" style={{ fontSize: 11, fill: 'currentColor', fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {noTeto.length > 0 && (
              <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-tight text-rose-600">
                <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>
                  Em vermelho, servico com veiculo no teto do limite contratado:{' '}
                  {noTeto.map((f) => `${f.servico} (${f.veiculos_no_limite})`).join(' · ')}.
                </span>
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Onde acontece — volume x TAXA sobre a frota da praca.
// ---------------------------------------------------------------------------
function GraficoPracas({ periodo, regionalId }: { periodo: Periodo; regionalId: string | null }) {
  const { data, isLoading } = usePainelPorPraca({ inicio: periodo.inicio, fim: periodo.fim, regionalId }, 10);
  const linhas = useMemo(() => lerPracas(data ?? []), [data]);
  const maiorTaxa = useMemo(() => Math.max(0, ...linhas.map((l) => l.taxa)), [linhas]);

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-x-3">
        <div>
          <CardTitle>Onde acontece — top pracas</CardTitle>
          <p className="mt-0.5 text-[11.5px] text-slate-400">
            A barra e a TAXA sobre a frota local (acionamentos / veiculos da praca), nao o volume.
          </p>
        </div>
        {linhas.length > 0 && (
          <button
            type="button"
            onClick={() => baixarCsv('assistencia-pracas.csv', [
              ['Praca', 'Acionamentos', 'Frota', 'Taxa', 'Custo', 'Custo por veiculo'],
              ...linhas.map((l) => [l.rotulo, l.acionamentos, l.veiculos, l.taxa, l.custo, l.custoPorVeiculo]),
            ])}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-64 w-full animate-pulse rounded-xl bg-slate-100" />
        ) : linhas.length === 0 ? (
          <Vazio
            icon={MapPin}
            titulo="Sem incidencia no periodo"
            descricao="A praca vem do local de resgate da OS; sem ele, o sistema usa o endereco do associado."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {linhas.map((l) => (
              <li key={`${l.cidade}-${l.uf}`} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[13px] font-medium text-slate-700">{l.rotulo}</span>
                  <span className="tnum shrink-0 text-[12.5px] text-slate-500">
                    <b className="text-slate-800">{inteiro.format(Number(l.acionamentos))}</b> acion. · {formatCurrency(Number(l.custo))}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${maiorTaxa > 0 ? Math.max((l.taxa / maiorTaxa) * 100, l.taxa > 0 ? 3 : 0) : 0}%`,
                        background: l.critica ? COR_ALERTA : COR_ACENTO,
                      }}
                    />
                  </div>
                  <span className="tnum w-[136px] shrink-0 text-right text-[11px] text-slate-400">
                    {Number(l.veiculos) > 0
                      ? `${formatPercent(l.taxa)} de ${inteiro.format(Number(l.veiculos))} veic.`
                      : 'frota nao mapeada'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Custo em 12 meses. Uma medida por eixo (dinheiro); o volume vai no tooltip.
// ---------------------------------------------------------------------------
function SerieMensal({ regionalId }: { regionalId: string | null }) {
  const { data, isLoading } = usePainelSerie(12, regionalId);
  const serie = useMemo(
    () => (data ?? []).map((m) => ({
      mes: rotuloMes(m.competencia),
      custo: Number(m.custo),
      acionamentos: Number(m.acionamentos),
    })),
    [data],
  );
  const comparativo = useMemo(() => compararUltimosMeses(data ?? []), [data]);

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-x-3">
        <div>
          <CardTitle>Custo da assistencia — 12 meses</CardTitle>
          <p className="mt-0.5 text-[11.5px] text-slate-400">
            O valor da OS que virou titulo no Contas a Pagar. O volume aparece no tooltip.
          </p>
        </div>
        <Tendencia fracao={comparativo.varCusto} />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-64 w-full animate-pulse rounded-xl bg-slate-100" />
        ) : (
          <div className="h-64 w-full text-slate-500">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.18} vertical={false} />
                <XAxis dataKey="mes" tick={EIXO} axisLine={false} tickLine={false} />
                <YAxis
                  tick={EIXO}
                  tickFormatter={(v: number) => (v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`)}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ fill: 'rgba(30,43,77,0.04)' }}
                  formatter={(v: number, _n: string, p: { payload?: { acionamentos?: number } }) => [
                    `${formatCurrency(v)} · ${inteiro.format(p.payload?.acionamentos ?? 0)} acionamentos`,
                    'Custo do mes',
                  ]}
                />
                <Bar dataKey="custo" radius={[4, 4, 0, 0]} maxBarSize={30}>
                  {serie.map((m, i) => (
                    <Cell key={m.mes} fill={COR_ACENTO} fillOpacity={i === serie.length - 1 ? 1 : 0.55} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Reincidencia: quem mais consome (alvo de vistoria / revisao de plano).
// ---------------------------------------------------------------------------
function Reincidencia({ periodo, regionalId }: { periodo: Periodo; regionalId: string | null }) {
  const { data, isLoading } = usePainelReincidencia({ inicio: periodo.inicio, fim: periodo.fim, regionalId }, 10);

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-x-3">
        <div>
          <CardTitle>Reincidencia — quem mais aciona</CardTitle>
          <p className="mt-0.5 text-[11.5px] text-slate-400">Veiculos ordenados por acionamentos no periodo.</p>
        </div>
        {(data?.length ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => baixarCsv('assistencia-reincidencia.csv', [
              ['Placa', 'Veiculo', 'Associado', 'Acionamentos', 'Custo', 'Ultimo uso'],
              ...(data ?? []).map((v) => [v.placa, v.descricao ?? '', v.associado, v.acionamentos, v.custo, formatDate(v.ultimo_uso)]),
            ])}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        )}
      </CardHeader>
      <CardContent className="px-0">
        {isLoading ? (
          <div className="mx-6 h-40 animate-pulse rounded-xl bg-slate-100" />
        ) : (data?.length ?? 0) === 0 ? (
          <div className="px-6">
            <Vazio icon={Repeat} titulo="Nenhuma reincidencia" descricao="Nenhum veiculo acionou a assistencia no periodo." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-2">Veiculo</th>
                  <th className="px-2 py-2">Associado</th>
                  <th className="px-2 py-2 text-right">Acion.</th>
                  <th className="px-2 py-2 text-right">Custo</th>
                  <th className="px-5 py-2 text-right">Ultimo</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((v) => (
                  <tr key={v.veiculo_id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-2.5">
                      <Link href={`/assistencia?placa=${encodeURIComponent(v.placa)}`} className="group inline-flex items-center gap-2">
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">{v.placa}</span>
                        <span className="hidden max-w-[130px] truncate text-xs text-slate-500 group-hover:text-cyan-700 sm:inline-block">
                          {v.descricao ?? '—'}
                        </span>
                        <ExternalLink className="h-3 w-3 text-slate-300 group-hover:text-cyan-600" />
                      </Link>
                    </td>
                    <td className="max-w-[150px] truncate px-2 py-2.5 text-slate-600">{v.associado}</td>
                    <td className="tnum px-2 py-2.5 text-right">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        Number(v.acionamentos) >= 3 ? 'bg-rose-50 text-rose-700'
                          : Number(v.acionamentos) >= 2 ? 'bg-amber-50 text-amber-700' : 'text-slate-600'
                      }`}>
                        {v.acionamentos}
                      </span>
                    </td>
                    <td className="tnum px-2 py-2.5 text-right text-slate-700">{formatCurrency(Number(v.custo))}</td>
                    <td className="tnum px-5 py-2.5 text-right text-xs text-slate-400">{formatDate(v.ultimo_uso).slice(0, 5)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------
export function AssistenciaPainel() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoPreset('mes'));
  const [regionalId, setRegionalId] = useState<string | null>(null);
  const { data: regionais } = useRegionais();
  const { data: r, isLoading } = usePainelResumo({ inicio: periodo.inicio, fim: periodo.fim, regionalId });

  return (
    <div className="space-y-5">
      <FiltroPeriodo periodo={periodo} onChange={setPeriodo}>
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Unidade</span>
          <select
            value={regionalId ?? ''}
            onChange={(e) => setRegionalId(e.target.value || null)}
            className="mt-1 block rounded-lg border border-slate-300 bg-superficie px-2.5 py-1.5 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          >
            <option value="">Todas</option>
            {(regionais ?? []).map((rg) => (
              <option key={rg.id} value={rg.id}>{rg.nome}</option>
            ))}
          </select>
        </label>
      </FiltroPeriodo>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Tile
          titulo="Acionamentos"
          valor={inteiro.format(Number(r?.acionamentos ?? 0))}
          detalhe={`Hoje: ${r?.acionamentos_hoje ?? 0} · media diaria ${Number(r?.media_diaria ?? 0).toFixed(2)}`}
          icon={LifeBuoy} tom="cyan" carregando={isLoading}
        />
        <Tile
          titulo="Custo no periodo"
          valor={formatCurrency(Number(r?.custo_total ?? 0))}
          detalhe={`Media de ${formatCurrency(Number(r?.custo_medio ?? 0))} por acionamento`}
          icon={Wallet} tom="navy" carregando={isLoading}
        />
        <Tile
          titulo="Custo por veiculo ativo"
          valor={formatCurrency(Number(r?.custo_por_veiculo ?? 0))}
          detalhe="Quanto a 24h pesa em cada mensalidade"
          icon={Car} tom="rose" carregando={isLoading}
        />
        <Tile
          titulo="Indice de acionamento"
          valor={formatPercent(Number(r?.indice_acionamento ?? 0))}
          detalhe={`${inteiro.format(Number(r?.veiculos_acionaram ?? 0))} veiculos acionaram de ${inteiro.format(Number(r?.veiculos_ativos ?? 0))} ativos`}
          icon={Gauge} tom="amber" carregando={isLoading}
        />
        <Tile
          titulo="Tempo medio"
          valor={formatarHoras(Number(r?.tempo_medio_horas ?? 0))}
          detalhe={`${r?.acionamentos_abertos ?? 0} OS ainda em andamento`}
          icon={Timer} tom="green" carregando={isLoading}
        />
        <Tile
          titulo="Reincidentes"
          valor={inteiro.format(Number(r?.reincidentes ?? 0))}
          detalhe="Veiculos com 2+ acionamentos no periodo"
          icon={Repeat} tom="rose" carregando={isLoading}
        />
      </div>

      <FrotaSituacao regionalId={regionalId} />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <GraficoServicos periodo={periodo} regionalId={regionalId} />
        <GraficoPracas periodo={periodo} regionalId={regionalId} />
      </div>

      <SerieMensal regionalId={regionalId} />

      <Reincidencia periodo={periodo} regionalId={regionalId} />

      <p className="text-right">
        <Link href="/assistencia" className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:text-cyan-800">
          Abrir a operacao da Assistencia 24h <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </p>
    </div>
  );
}
