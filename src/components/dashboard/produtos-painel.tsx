'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell, LabelList,
} from 'recharts';
import {
  Wallet, Package, Car, Receipt, AlertTriangle, Trophy, Layers, PieChart as PieIcon,
  Table2, Download, Info, ArrowRight,
} from 'lucide-react';
import { usePainelProdutos } from '@/hooks/use-dashboard';
import { usePerfilAtual, useRegionais } from '@/hooks/use-config';
import { useTema } from '@/hooks/use-tema';
import { opcoesParaFiltrar, rotuloUnidade } from '@/lib/regional';
import { coresPorEntidade, PALETA_CATEGORICA, COR_OUTROS } from '@/lib/visao-geral';
import {
  categoriasRotuladas, maisContratados, penetracao, pilhaPorTipo, receitaPorVeiculo,
  rotuloCategoria, ROTULO_OUTROS_PRODUTOS, type PainelProdutos,
} from '@/lib/painel-produtos';
import { baixarCsv } from '@/components/financeiro/ui-financeiro';
import { formatCurrency, formatPercent } from '@/lib/utils';

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid rgb(var(--superficie-alta))',
  backgroundColor: 'rgb(var(--superficie))',
  fontSize: 12,
} as const;
const EIXO = { fontSize: 11, fill: 'currentColor' } as const;
const inteiro = new Intl.NumberFormat('pt-BR');
const n = (v: unknown) => Number(v ?? 0) || 0;
const CARTAO =
  'rounded-2xl border border-slate-200/80 bg-superficie p-4 shadow-[0_1px_2px_rgba(20,33,61,0.04),0_10px_26px_-16px_rgba(20,33,61,0.18)]';

function Tile({
  titulo, valor, detalhe, icon: Icon, tom, carregando,
}: {
  titulo: string; valor: string; detalhe?: React.ReactNode; icon: React.ElementType;
  tom: 'cyan' | 'navy' | 'green' | 'violet' | 'amber'; carregando?: boolean;
}) {
  const chip = {
    cyan: 'bg-cyan-50 text-cyan-600',
    navy: 'bg-brand-50 text-brand-600',
    green: 'bg-emerald-50 text-emerald-600',
    violet: 'bg-violet-50 text-violet-600',
    amber: 'bg-amber-50 text-amber-600',
  }[tom];
  return (
    <div className={CARTAO}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.7188rem] font-semibold uppercase leading-tight tracking-wide text-slate-500">{titulo}</p>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] ${chip}`}>
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
      </div>
      {carregando ? (
        <div className="mt-3 h-7 w-24 animate-pulse rounded bg-slate-100" />
      ) : (
        <p className="tnum mt-2.5 text-[1.4375rem] font-bold leading-none text-slate-900">{valor}</p>
      )}
      {detalhe && <div className="mt-2 text-[0.7188rem] leading-snug text-slate-500">{detalhe}</div>}
    </div>
  );
}

function Secao({ titulo, icon: Icon, children, acao, subtitulo }: {
  titulo: string; icon: React.ElementType; children: React.ReactNode; acao?: React.ReactNode; subtitulo?: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-[0.8125rem] font-semibold uppercase tracking-wide text-slate-600">
            <Icon className="h-4 w-4 text-cyan-600" /> {titulo}
          </h2>
          {subtitulo && <p className="mt-0.5 text-xs text-slate-500">{subtitulo}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

function SemDados({ texto }: { texto: string }) {
  return <p className="py-10 text-center text-sm text-slate-400">{texto}</p>;
}

// ---------------------------------------------------------------------------
// TOP 5
// ---------------------------------------------------------------------------
function Top5({ d, cores }: { d: PainelProdutos; cores: Record<string, string> }) {
  const top = maisContratados(d.produtos, 5);
  const base = n(d.kpis.veiculos_base);
  const receitaTotal = n(d.kpis.receita_mensal);
  const maior = Math.max(1, ...top.map((p) => n(p.contratacoes)));
  if (!top.length) return <div className={CARTAO}><SemDados texto="Nenhum opcional contratado na base." /></div>;

  return (
    <div className={`${CARTAO} p-0`}>
      <ol className="divide-y divide-slate-200/70">
        {top.map((p, i) => {
          const pen = penetracao(n(p.contratacoes), base);
          const fatia = receitaTotal > 0 ? n(p.receita) / receitaTotal : null;
          return (
            <li key={p.produto_id} className="grid items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:grid-cols-[2.25rem_minmax(0,1fr)_auto]">
              <span
                className="tnum grid h-9 w-9 place-items-center rounded-full text-sm font-bold text-white"
                style={{ background: cores[p.nome] ?? COR_OUTROS }}
              >
                {i + 1}º
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold text-slate-900" title={p.nome}>{p.nome}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6875rem] font-medium text-slate-600">
                    {rotuloCategoria(p.categoria)}
                  </span>
                  {n(p.sem_preco) > 0 && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.6875rem] font-medium text-amber-700">sem preço</span>
                  )}
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(n(p.contratacoes) / maior) * 100}%`, background: cores[p.nome] ?? COR_OUTROS }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-right sm:min-w-[19rem]">
                <div>
                  <p className="tnum text-base font-bold text-slate-900">{inteiro.format(n(p.contratacoes))}</p>
                  <p className="text-[0.6875rem] text-slate-500">contratações</p>
                </div>
                <div>
                  <p className="tnum text-base font-bold text-slate-900">{pen === null ? '—' : formatPercent(pen)}</p>
                  <p className="text-[0.6875rem] text-slate-500">da base</p>
                </div>
                <div>
                  <p className="tnum text-base font-bold text-slate-900">{formatCurrency(n(p.receita))}</p>
                  <p className="text-[0.6875rem] text-slate-500">
                    por mês{fatia !== null && n(p.receita) > 0 ? ` · ${formatPercent(fatia)}` : ''}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// POR TIPO DE VEICULO
// ---------------------------------------------------------------------------
function PorTipo({ d, cores, destaque }: { d: PainelProdutos; cores: Record<string, string>; destaque: string[] }) {
  const pilha = pilhaPorTipo(d.por_tipo, d.matriz, destaque);
  const series = [...destaque, ROTULO_OUTROS_PRODUTOS];
  const temOutros = pilha.some((l) => n(l[ROTULO_OUTROS_PRODUTOS]) > 0);
  const visiveis = temOutros ? series : destaque;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className={CARTAO}>
        <p className="text-sm font-semibold text-slate-800">Contratações por tipo de veículo</p>
        <p className="text-xs text-slate-500">Cada barra é um tipo; as cores mostram os 5 produtos mais contratados.</p>
        {pilha.length === 0 ? (
          <SemDados texto="Nenhum opcional contratado na base." />
        ) : (
          <div className="mt-3 h-[320px] w-full text-slate-500">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pilha} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(var(--superficie-alta))" />
                <XAxis dataKey="tipo" tick={EIXO} axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={EIXO} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => inteiro.format(v)} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(30,43,77,0.05)' }}
                  formatter={(v: number, nome: string) => [inteiro.format(v), nome]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                {visiveis.map((s, i) => (
                  <Bar
                    key={s} dataKey={s} stackId="t" fill={cores[s] ?? COR_OUTROS} maxBarSize={56} isAnimationActive={false}
                    radius={i === visiveis.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className={`${CARTAO} overflow-x-auto p-0`}>
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="bg-superficie-alta text-left text-[0.6875rem] uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5 font-semibold">Tipo</th>
              <th className="px-3 py-2.5 text-right font-semibold">Na base</th>
              <th className="px-3 py-2.5 text-right font-semibold">Com opcional</th>
              <th className="px-3 py-2.5 text-right font-semibold">Contratações</th>
              <th className="px-4 py-2.5 text-right font-semibold">Receita/mês</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70">
            {d.por_tipo.map((t) => {
              const pen = penetracao(n(t.com_opcional), n(t.veiculos));
              return (
                <tr key={t.tipo}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{t.tipo}</td>
                  <td className="tnum px-3 py-2.5 text-right text-slate-700">{inteiro.format(n(t.veiculos))}</td>
                  <td className="tnum px-3 py-2.5 text-right text-slate-700">
                    {inteiro.format(n(t.com_opcional))}
                    <span className="ml-1 text-xs text-slate-400">{pen === null ? '' : formatPercent(pen)}</span>
                  </td>
                  <td className="tnum px-3 py-2.5 text-right text-slate-700">{inteiro.format(n(t.contratacoes))}</td>
                  <td className="tnum px-4 py-2.5 text-right font-semibold text-slate-900">{formatCurrency(n(t.receita))}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 text-slate-900">
              <td className="px-4 py-2.5 font-semibold">Total</td>
              <td className="tnum px-3 py-2.5 text-right font-semibold">{inteiro.format(n(d.kpis.veiculos_base))}</td>
              <td className="tnum px-3 py-2.5 text-right font-semibold">{inteiro.format(n(d.kpis.veiculos_com_opcional))}</td>
              <td className="tnum px-3 py-2.5 text-right font-semibold">{inteiro.format(n(d.kpis.contratacoes))}</td>
              <td className="tnum px-4 py-2.5 text-right font-bold">{formatCurrency(n(d.kpis.receita_mensal))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RECEITA
// ---------------------------------------------------------------------------
function Receita({ d, escuro }: { d: PainelProdutos; escuro: boolean }) {
  const categorias = categoriasRotuladas(d.categorias).filter((c) => c.receita > 0);
  const total = categorias.reduce((s, c) => s + c.receita, 0);
  const paleta = escuro ? PALETA_CATEGORICA.escuro : PALETA_CATEGORICA.claro;
  const corCat: Record<string, string> = {};
  [...categorias].map((c) => c.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .forEach((nome, i) => { corCat[nome] = paleta[i] ?? COR_OUTROS; });

  const porTipo = d.por_tipo
    .filter((t) => n(t.receita) > 0)
    .map((t) => ({ nome: t.tipo, valor: n(t.receita) }))
    .sort((a, b) => b.valor - a.valor);
  const corBarra = escuro ? PALETA_CATEGORICA.escuro[0] : PALETA_CATEGORICA.claro[0];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className={CARTAO}>
        <p className="text-sm font-semibold text-slate-800">Receita por categoria</p>
        <p className="text-xs text-slate-500">De onde vem o valor mensal dos opcionais.</p>
        {categorias.length === 0 ? (
          <SemDados texto="Nenhum opcional com preço cadastrado." />
        ) : (
          <div className="mt-3 grid items-center gap-4 sm:grid-cols-[200px_1fr]">
            <div className="relative mx-auto h-[200px] w-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categorias} dataKey="receita" nameKey="nome" innerRadius={62} outerRadius={94}
                    paddingAngle={categorias.length > 1 ? 1.5 : 0} stroke="rgb(var(--superficie))" strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {categorias.map((c) => <Cell key={c.nome} fill={corCat[c.nome]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number, nome: string) => [`${formatCurrency(v)} (${formatPercent(v / total)})`, nome]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div>
                  <p className="tnum text-base font-bold text-slate-900">{formatCurrency(total)}</p>
                  <p className="text-[0.6875rem] text-slate-500">por mês</p>
                </div>
              </div>
            </div>
            <ul className="space-y-2 text-sm">
              {categorias.map((c) => (
                <li key={c.nome} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: corCat[c.nome] }} />
                  <span className="min-w-0 flex-1 truncate text-slate-700">{c.nome}</span>
                  <span className="tnum font-semibold text-slate-900">{formatCurrency(c.receita)}</span>
                  <span className="tnum w-12 text-right text-xs text-slate-500">{formatPercent(c.receita / total)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className={CARTAO}>
        <p className="text-sm font-semibold text-slate-800">Receita mensal por tipo de veículo</p>
        <p className="text-xs text-slate-500">Quanto os opcionais de cada tipo representam por mês.</p>
        {porTipo.length === 0 ? (
          <SemDados texto="Sem receita de opcionais." />
        ) : (
          <div style={{ height: Math.max(200, porTipo.length * 40 + 20) }} className="mt-3 w-full text-slate-500">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porTipo} layout="vertical" margin={{ left: 4, right: 92, top: 4, bottom: 4 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="nome" width={120} tick={EIXO} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(30,43,77,0.05)' }}
                  formatter={(v: number) => [formatCurrency(v), 'Receita/mês']}
                />
                <Bar dataKey="valor" fill={corBarra} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
                  <LabelList dataKey="valor" position="right" fontSize={11} fill="currentColor" formatter={(v: number) => formatCurrency(v)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TABELA COMPLETA
// ---------------------------------------------------------------------------
function TabelaProdutos({ d }: { d: PainelProdutos }) {
  const [ordem, setOrdem] = useState<'contratacoes' | 'receita'>('contratacoes');
  const base = n(d.kpis.veiculos_base);
  const linhas = useMemo(
    () => [...d.produtos].sort((a, b) => n(b[ordem]) - n(a[ordem]) || a.nome.localeCompare(b.nome, 'pt-BR')),
    [d.produtos, ordem],
  );

  const exportar = () => {
    baixarCsv('produtos-contratados.csv', [
      ['Produto', 'Categoria', 'Contratações', '% da base', 'Receita mensal', 'Valor médio', 'Sem preço'],
      ...linhas.map((p) => [
        p.nome, rotuloCategoria(p.categoria), n(p.contratacoes),
        Math.round((penetracao(n(p.contratacoes), base) ?? 0) * 10000) / 100,
        n(p.receita), n(p.contratacoes) > 0 ? Math.round((n(p.receita) / n(p.contratacoes)) * 100) / 100 : 0,
        n(p.sem_preco),
      ]),
    ]);
  };

  return (
    <div className={`${CARTAO} p-0`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 px-4 py-3">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 text-xs">
          {(['contratacoes', 'receita'] as const).map((o) => (
            <button
              key={o} type="button" onClick={() => setOrdem(o)}
              className={`rounded-md px-2.5 py-1 font-medium ${ordem === o ? 'bg-superficie text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              {o === 'contratacoes' ? 'Mais contratados' : 'Maior receita'}
            </button>
          ))}
        </div>
        <button
          type="button" onClick={exportar}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-3.5 w-3.5" /> Exportar CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] text-sm">
          <thead>
            <tr className="bg-superficie-alta text-left text-[0.6875rem] uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5 font-semibold">Produto</th>
              <th className="px-3 py-2.5 font-semibold">Categoria</th>
              <th className="px-3 py-2.5 text-right font-semibold">Contratações</th>
              <th className="px-3 py-2.5 text-right font-semibold">% da base</th>
              <th className="px-3 py-2.5 text-right font-semibold">Valor médio</th>
              <th className="px-4 py-2.5 text-right font-semibold">Receita/mês</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70">
            {linhas.map((p) => {
              const pen = penetracao(n(p.contratacoes), base);
              const medio = n(p.contratacoes) > 0 ? n(p.receita) / n(p.contratacoes) : 0;
              return (
                <tr key={p.produto_id}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{p.nome}</td>
                  <td className="px-3 py-2.5 text-slate-600">{rotuloCategoria(p.categoria)}</td>
                  <td className="tnum px-3 py-2.5 text-right text-slate-700">{inteiro.format(n(p.contratacoes))}</td>
                  <td className="tnum px-3 py-2.5 text-right text-slate-700">{pen === null ? '—' : formatPercent(pen)}</td>
                  <td className="tnum px-3 py-2.5 text-right text-slate-700">
                    {n(p.sem_preco) > 0 && medio === 0
                      ? <span className="text-amber-600">sem preço</span>
                      : formatCurrency(medio)}
                  </td>
                  <td className="tnum px-4 py-2.5 text-right font-semibold text-slate-900">{formatCurrency(n(p.receita))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A ABA
// ---------------------------------------------------------------------------
export function ProdutosPainel() {
  const [regionalId, setRegionalId] = useState<string | null>(null);
  const { data: perfil } = usePerfilAtual();
  const { data: regionais } = useRegionais();
  const { efetivo } = useTema();
  const escuro = efetivo === 'escuro';
  const global = perfil?.papel === 'admin' || perfil?.papel === 'financeiro';
  const { ativas, inativas } = opcoesParaFiltrar(regionais);
  const { data: d, isLoading, error } = usePainelProdutos(global ? regionalId : null);

  const destaque = useMemo(() => (d ? maisContratados(d.produtos, 5).map((p) => p.nome) : []), [d]);
  const cores = useMemo(() => coresPorEntidade(destaque, escuro), [destaque, escuro]);
  const coresComOutros = { ...cores, [ROTULO_OUTROS_PRODUTOS]: COR_OUTROS };

  const k = d?.kpis;
  const pen = penetracao(n(k?.veiculos_com_opcional), n(k?.veiculos_base));
  const porVeiculo = receitaPorVeiculo(n(k?.receita_mensal), n(k?.veiculos_com_opcional));
  const mediaItens = n(k?.veiculos_com_opcional) > 0 ? n(k?.contratacoes) / n(k?.veiculos_com_opcional) : 0;

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {global ? (
          <label className="block">
            <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-slate-400">Unidade</span>
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
          <p className="text-[0.6875rem] text-slate-400">
            Atualizado às {new Date(d.gerado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Não foi possível carregar o painel de produtos: {(error as { message?: string }).message ?? 'erro desconhecido'}.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Tile
          titulo="Receita mensal dos opcionais" icon={Wallet} tom="green" carregando={isLoading}
          valor={formatCurrency(n(k?.receita_mensal))}
          detalhe={`${formatCurrency(n(k?.receita_mensal) * 12)} em 12 meses`}
        />
        <Tile
          titulo="Opcionais contratados" icon={Package} tom="cyan" carregando={isLoading}
          valor={inteiro.format(n(k?.contratacoes))}
          detalhe={`${inteiro.format(n(k?.produtos_distintos))} produtos diferentes`}
        />
        <Tile
          titulo="Veículos com opcional" icon={Car} tom="navy" carregando={isLoading}
          valor={pen === null ? '—' : formatPercent(pen)}
          detalhe={`${inteiro.format(n(k?.veiculos_com_opcional))} de ${inteiro.format(n(k?.veiculos_base))} na base`}
        />
        <Tile
          titulo="Receita por veículo" icon={Receipt} tom="violet" carregando={isLoading}
          valor={formatCurrency(porVeiculo)}
          detalhe={`${mediaItens.toFixed(1).replace('.', ',')} opcionais por veículo, em média`}
        />
        <Tile
          titulo="Contratações sem preço" icon={AlertTriangle} tom="amber" carregando={isLoading}
          valor={inteiro.format(n(k?.sem_preco))}
          detalhe={
            n(k?.sem_preco) > 0 ? (
              <Link href="/configuracoes/produtos" className="inline-flex items-center gap-1 font-medium text-cyan-700 hover:text-cyan-800">
                Cadastrar valor em Produtos <ArrowRight className="h-3 w-3" />
              </Link>
            ) : 'Todos os opcionais têm preço'
          }
        />
      </div>

      <div className="flex gap-2 rounded-2xl border border-slate-200/80 bg-superficie-alta px-4 py-3 text-xs leading-relaxed text-slate-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />
        <p>
          Conta os <b>opcionais contratados</b> pelos veículos que estão na base hoje (o que já vem incluso no plano não entra).
          A receita é o <b>valor de tabela</b> de cada produto por mês. Na carteira migrada do Mutual o boleto tem um valor
          único negociado, então este número mostra quanto os opcionais representam, não um recebimento separado.
        </p>
      </div>

      {isLoading && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      )}

      {d && (
        <>
          <Secao titulo="Os 5 produtos mais contratados" icon={Trophy} subtitulo="Contratações, alcance na base e receita mensal de cada um.">
            <Top5 d={d} cores={cores} />
          </Secao>
          <Secao titulo="Por tipo de veículo" icon={Layers}>
            <PorTipo d={d} cores={coresComOutros} destaque={destaque} />
          </Secao>
          <Secao titulo="Receita dos produtos" icon={PieIcon}>
            <Receita d={d} escuro={escuro} />
          </Secao>
          <Secao titulo="Todos os produtos" icon={Table2}>
            <TabelaProdutos d={d} />
          </Secao>
        </>
      )}

      {!isLoading && !error && !d && (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-slate-500">
          <Package className="h-8 w-8 text-slate-300" />
          Seu acesso não inclui os indicadores da operação.
        </div>
      )}
    </div>
  );
}
