'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import {
  Users, UserCheck, UserX, Wallet, CalendarClock, Banknote, AlertTriangle, RotateCcw,
  Sparkles, Settings, TrendingUp, TrendingDown, Minus, Download, Database, Trash2, Plus,
  Repeat2, BadgeCheck, CalendarDays, UserMinus, Ban,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { baixarCsv } from '@/components/financeiro/ui-financeiro';
import { ErroLeitura } from '@/components/integracao/erro-leitura';
import {
  COR, FiltroUnidadeCobranca, ModalBoletos, SemAcessoCobranca, SeloSemaforo, TileCobranca,
} from '@/components/cobrancas/ui-cobranca';
import {
  useCobrancaCarteira, useCobrancaEscopo, useCobrancaInativados, useCobrancaIndicadores, useCobrancaParametros,
  useCobrancaPorRegional, useCobrancaSerie, useFeriadoCobranca, useSalvarParametrosCobranca,
  type FiltroListaBoletos,
} from '@/hooks/use-cobranca-painel';
import {
  DIAS_DADO_DEFASADO, PRESETS_COBRANCA, ROTULO_TAXA, SUBIR_E_BOM, compararTaxa, diasDesde,
  ehMesCheio, fracao, leituraAutomatica, mediaTaxas, periodoCobranca, presetCobrancaAtivo,
  rotuloRecorte, semaforo, taxas, textoPp, type ChaveTaxa, type PeriodoCobranca, type Taxas,
} from '@/lib/cobranca-painel';
import { direcaoVariacao } from '@/lib/regionais';
import { formatCurrency, formatDate, formatDateTime, formatPercent } from '@/lib/utils';
import type { CobrancaIndicadores } from '@/lib/database.types';

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid rgb(var(--superficie-alta))',
  backgroundColor: 'rgb(var(--superficie))',
  fontSize: 12,
} as const;
const EIXO = { fontSize: 11, fill: 'currentColor' } as const;
const inteiro = new Intl.NumberFormat('pt-BR');
const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const pct = (f: number | null) => (f === null ? '—' : formatPercent(f));
const num = (v: unknown) => Number(v ?? 0) || 0;

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------
function BarraFiltros({
  periodo, onPeriodo, regionalId, onRegional, podeConfigurar, onConfigurar, unidadeFixa,
}: {
  periodo: PeriodoCobranca; onPeriodo: (p: PeriodoCobranca) => void;
  regionalId: string | null; onRegional: (id: string | null) => void;
  podeConfigurar: boolean; onConfigurar: () => void;
  unidadeFixa?: string;
}) {
  const ativo = presetCobrancaAtivo(periodo);
  const campo = 'tnum mt-1 block rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40';
  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-2xl border border-slate-200/80 bg-superficie p-4 shadow-[0_1px_2px_rgba(20,33,61,0.04)]">
      <div className="flex flex-wrap gap-1">
        {PRESETS_COBRANCA.map((p) => (
          <button key={p.chave} type="button" onClick={() => onPeriodo(periodoCobranca(p.chave))}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
              ativo === p.chave ? 'bg-acao text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {p.rotulo}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Vencimento de</span>
          <input type="date" value={periodo.inicio} onChange={(e) => onPeriodo({ ...periodo, inicio: e.target.value })} className={campo} />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Até</span>
          <input type="date" value={periodo.fim} onChange={(e) => onPeriodo({ ...periodo, fim: e.target.value })} className={campo} />
        </label>
      </div>
      {unidadeFixa ? (
        <div className="block min-w-[190px]">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Regional</span>
          <p className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-medium text-slate-700">{unidadeFixa}</p>
        </div>
      ) : (
        <FiltroUnidadeCobranca valor={regionalId} onChange={onRegional} />
      )}
      {podeConfigurar && (
        <button type="button" onClick={onConfigurar}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50">
          <Settings className="h-4 w-4" /> Meta e feriados
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meta, limite e feriados (so a matriz)
// ---------------------------------------------------------------------------
function ModalParametros({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: p } = useCobrancaParametros();
  const salvar = useSalvarParametrosCobranca();
  const { salvar: salvarFeriado, remover } = useFeriadoCobranca();
  const [meta, setMeta] = useState<string>('');
  const [limite, setLimite] = useState<string>('');
  const [data, setData] = useState('');
  const [desc, setDesc] = useState('');
  const m = meta === '' ? p?.meta ?? 5 : Number(meta.replace(',', '.'));
  const l = limite === '' ? p?.limite ?? 10 : Number(limite.replace(',', '.'));
  const invalido = !(m >= 0 && l <= 100 && m <= l);
  const campo = 'tnum mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm';

  return (
    <Modal open={open} onClose={onClose} title="Meta da inadimplência e feriados" tamanho="lg">
      <div className="space-y-5">
        <section>
          <p className="text-sm text-slate-600">
            O semáforo usa a <b>inadimplência financeira</b> (vencido sem pagamento ÷ o que já venceu).
            Até a meta e verde; entre a meta e o limite, âmbar; acima do limite, vermelho.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block text-sm">Meta (%)
              <input inputMode="decimal" value={meta === '' ? String(p?.meta ?? '') : meta} onChange={(e) => setMeta(e.target.value)} className={campo} />
            </label>
            <label className="block text-sm">Limite (%)
              <input inputMode="decimal" value={limite === '' ? String(p?.limite ?? '') : limite} onChange={(e) => setLimite(e.target.value)} className={campo} />
            </label>
            <div className="flex items-end">
              <button type="button" disabled={invalido || salvar.isPending}
                onClick={() => salvar.mutate({ meta: m, limite: l }, { onSuccess: () => { setMeta(''); setLimite(''); } })}
                className="w-full rounded-lg bg-acao px-3 py-2 text-sm font-medium text-white hover:bg-acao-escura disabled:opacity-50">
                Salvar meta
              </button>
            </div>
          </div>
          {invalido && <p className="mt-1 text-xs text-rose-600">A meta tem de ficar entre 0 e o limite, e o limite até 100%.</p>}
          {salvar.error && <p className="mt-1 text-xs text-rose-600">{(salvar.error as Error).message}</p>}
        </section>

        <section>
          <h3 className="text-sm font-semibold text-slate-800">Feriados bancários</h3>
          <p className="text-xs text-slate-500">
            Boleto que vence em fim de semana ou feriado só conta como vencido depois do próximo dia útil.
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="tnum rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
            <input placeholder="Descrição" value={desc} onChange={(e) => setDesc(e.target.value)} className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
            <button type="button" disabled={!data || !desc.trim() || salvarFeriado.isPending}
              onClick={() => salvarFeriado.mutate({ data, descricao: desc }, { onSuccess: () => { setData(''); setDesc(''); } })}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50">
              <Plus className="h-4 w-4" /> Adicionar
            </button>
          </div>
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {(p?.feriados ?? []).length === 0 && <li className="px-3 py-2 text-xs text-slate-400">Nenhum feriado cadastrado.</li>}
            {(p?.feriados ?? []).map((f) => (
              <li key={f.data} className="flex items-center justify-between px-3 py-1.5 text-sm">
                <span><span className="tnum text-slate-500">{formatDate(f.data)}</span> · {f.descricao}</span>
                <button type="button" onClick={() => remover.mutate(f.data)} className="text-slate-400 hover:text-rose-600" title="Remover">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Comparativos: pontos percentuais E variacao relativa, lado a lado
// ---------------------------------------------------------------------------
function Delta({ atual, base, chave }: { atual: number | null; base: number | null; chave: ChaveTaxa }) {
  const c = compararTaxa(atual, base);
  if (c.pp === null) return <span className="text-[11px] text-slate-400">sem base</span>;
  const dir = direcaoVariacao(c.pp / 100, SUBIR_E_BOM[chave]);
  const cls = dir === 'boa' ? 'text-emerald-600' : dir === 'ruim' ? 'text-rose-600' : 'text-slate-400';
  const Icon = c.pp === 0 ? Minus : c.pp > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${cls}`}>
      <Icon className="h-3 w-3" />
      {textoPp(c.pp)}
      {c.relativa !== null && c.pp !== 0 && <span className="font-normal text-slate-400">({c.relativa > 0 ? '+' : ''}{formatPercent(c.relativa)})</span>}
    </span>
  );
}

function TabelaComparativos({ atual, refs, mesCheio }: {
  atual: Taxas;
  refs: { chave: string; taxas: Taxas }[];
  mesCheio: boolean;
}) {
  const linhas = Object.keys(ROTULO_TAXA) as ChaveTaxa[];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[12.5px]">
        <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-2 pr-3">Indicador</th>
            <th className="py-2 pr-3 text-right">{rotuloRecorte('atual', mesCheio)}</th>
            {refs.map((r) => <th key={r.chave} className="py-2 pr-3 text-right">{rotuloRecorte(r.chave, mesCheio)}</th>)}
          </tr>
        </thead>
        <tbody>
          {linhas.map((k) => (
            <tr key={k} className="border-t border-slate-100">
              <td className="py-2 pr-3 font-medium text-slate-700">{ROTULO_TAXA[k]}</td>
              <td className="tnum py-2 pr-3 text-right font-semibold text-slate-900">{pct(atual[k])}</td>
              {refs.map((r) => (
                <td key={r.chave} className="py-2 pr-3 text-right">
                  <p className="tnum text-slate-600">{pct(r.taxas[k])}</p>
                  <Delta atual={atual[k]} base={r.taxas[k]} chave={k} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-slate-400">
        A seta mostra a diferença em <b>pontos percentuais</b> e, entre parênteses, a <b>variação relativa</b>
        (6% → 8% = +2,0 p.p. e +33,3%). Verde e melhora, vermelho e piora.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------
/**
 * `unidade` = o painel dentro do PORTAL DA FRANQUIA (/regional): a unidade vem
 * travada, sem seletor, sem a tabela "por regional" (que compara unidades) e
 * sem a configuracao da matriz. Quem garante que o gestor so le a propria e o
 * banco (`cobranca_escopo`, 0097) — aqui e so para a tela nao oferecer o resto.
 */
export function PainelInadimplencia({ unidade }: { unidade?: { id: string; nome: string } } = {}) {
  const [periodo, setPeriodo] = useState<PeriodoCobranca>(() => periodoCobranca('mes_anterior'));
  const [regionalLivre, setRegionalId] = useState<string | null>(null);
  const regionalId = unidade?.id ?? regionalLivre;
  const [lista, setLista] = useState<FiltroListaBoletos | null>(null);
  const [config, setConfig] = useState(false);

  const escopo = useCobrancaEscopo();
  const temAcesso = !!escopo.data && (escopo.data.global || escopo.data.regionais.length > 0);
  const valido = periodo.inicio && periodo.fim && periodo.inicio <= periodo.fim;

  const qInd = useCobrancaIndicadores(periodo.inicio, periodo.fim, regionalId);
  const qCart = useCobrancaCarteira(regionalId);
  const qPar = useCobrancaParametros();
  const qReg = useCobrancaPorRegional(periodo.inicio, periodo.fim, !unidade);
  const qSerie = useCobrancaSerie(regionalId, 12);
  const qInat = useCobrancaInativados(periodo.inicio, periodo.fim, regionalId);

  const mesCheio = ehMesCheio(periodo);
  const porRecorte = useMemo(() => {
    const m = new Map<string, CobrancaIndicadores>();
    (qInd.data ?? []).forEach((r) => m.set(r.recorte, r));
    return m;
  }, [qInd.data]);
  const atual = porRecorte.get('atual') ?? null;
  const anterior = porRecorte.get('anterior_1') ?? null;
  const tAtual = taxas(atual);
  const refs = [
    { chave: 'anterior_1', taxas: taxas(anterior) },
    { chave: 'media_3', taxas: mediaTaxas(['anterior_1', 'anterior_2', 'anterior_3'].map((k) => taxas(porRecorte.get(k)))) },
    { chave: 'ano_anterior', taxas: taxas(porRecorte.get('ano_anterior')) },
  ];
  const meta = qPar.data?.meta ?? 5;
  const limite = qPar.data?.limite ?? 10;
  const sem = semaforo(tAtual.inadFinanceira, meta, limite);
  const frases = leituraAutomatica(atual, anterior, rotuloRecorte('anterior_1', mesCheio).toLowerCase());
  const carregando = qInd.isLoading;

  const abrir = (titulo: string, extra: Partial<FiltroListaBoletos>) =>
    setLista({ titulo, inicio: periodo.inicio, fim: periodo.fim, regionalId, ...extra });

  // Idade do dado do Mutual
  const idade = diasDesde(qCart.data?.ultima_captura_mutual);
  const defasado = idade !== null && idade > DIAS_DADO_DEFASADO;

  // Por regional x media nacional
  const nacional = useMemo(() => {
    const l = qReg.data ?? [];
    return fracao(l.reduce((a, r) => a + num(r.valor_aberto_vencido), 0), l.reduce((a, r) => a + num(r.valor_venceram), 0));
  }, [qReg.data]);

  const serie = (qSerie.data ?? []).map((s) => ({
    mes: new Date(s.mes + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
    'Pago no prazo': num(s.valor_pago_no_prazo),
    'Pago em atraso': num(s.valor_pago_em_atraso),
    'Em aberto (vencido)': num(s.valor_aberto_vencido),
    inad: (fracao(num(s.valor_aberto_vencido), num(s.valor_venceram)) ?? 0) * 100,
  }));

  if (escopo.isSuccess && !temAcesso) return <SemAcessoCobranca />;

  return (
    <div className="space-y-5">
      <BarraFiltros periodo={periodo} onPeriodo={setPeriodo} regionalId={regionalId} onRegional={setRegionalId}
        podeConfigurar={!!escopo.data?.global && !unidade} onConfigurar={() => setConfig(true)}
        unidadeFixa={unidade?.nome} />

      {!valido && <p className="text-sm text-rose-600">O início do período está depois do fim.</p>}

      {defasado && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <Database className="h-4 w-4" />
          O histórico do Mutual e de <b>{formatDateTime(qCart.data?.ultima_captura_mutual)}</b> ({idade} dias).
          Pagamentos feitos la depois disso ainda aparecem como em aberto.
          {unidade ? (
            <span>A matriz atualiza esse histórico.</span>
          ) : (
            <Link href="/integracao/mutual" className="font-medium underline">Recapturar boletos e importar</Link>
          )}
        </div>
      )}
      <ErroLeitura q={qInd} />

      {/* Carteira (hoje) */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Carteira — hoje</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <TileCobranca titulo="Associados ativos" icon={Users} tom="navy" carregando={qCart.isLoading}
            valor={inteiro.format(num(qCart.data?.clientes_ativos))} detalhe="com veículo na base" />
          <TileCobranca titulo="Em dia" icon={UserCheck} tom="green" carregando={qCart.isLoading}
            valor={inteiro.format(Math.max(0, num(qCart.data?.clientes_ativos) - num(qCart.data?.clientes_inadimplentes)))}
            detalhe={pct(fracao(num(qCart.data?.clientes_ativos) - num(qCart.data?.clientes_inadimplentes), num(qCart.data?.clientes_ativos)))} />
          <TileCobranca titulo="Inadimplentes" icon={UserX} tom="rose" carregando={qCart.isLoading}
            valor={inteiro.format(num(qCart.data?.clientes_inadimplentes))}
            detalhe={`${pct(fracao(num(qCart.data?.clientes_inadimplentes), num(qCart.data?.clientes_ativos)))} dos ativos`}
            onAbrir={() => setLista({ titulo: 'Todos os boletos vencidos em aberto', regionalId, situacoes: ['vencido'] })} />
          <TileCobranca titulo="Vencido em aberto" icon={Wallet} tom="amber" carregando={qCart.isLoading}
            valor={formatCurrency(num(qCart.data?.valor_vencido))}
            detalhe={`${inteiro.format(num(qCart.data?.boletos_vencidos))} boletos, qualquer competência`}
            onAbrir={() => setLista({ titulo: 'Todos os boletos vencidos em aberto', regionalId, situacoes: ['vencido'] })} />
          <TileCobranca titulo="A inativar" icon={Ban} tom="slate" carregando={qCart.isLoading}
            valor={inteiro.format(num(qCart.data?.clientes_a_inativar))}
            detalhe={`${formatCurrency(num(qCart.data?.valor_a_inativar))} · passaram do prazo da régua, fora das métricas acima`} />
        </div>
      </section>

      {/* Financeiro do periodo */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Financeiro do período — por vencimento
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <TileCobranca titulo="Emitido" icon={Banknote} tom="navy" carregando={carregando}
            valor={formatCurrency(num(atual?.valor_emitido))} detalhe={`${inteiro.format(num(atual?.boletos))} boletos`}
            onAbrir={() => abrir('Boletos emitidos no período', {})} />
          <TileCobranca titulo="Já venceu" icon={CalendarClock} tom="slate" carregando={carregando}
            valor={formatCurrency(num(atual?.valor_venceram))} detalhe="base das taxas"
            onAbrir={() => abrir('Boletos que já venceram', { situacoes: ['vencido', 'pago_no_prazo', 'pago_em_atraso'] })} />
          <TileCobranca titulo="Recebido" icon={BadgeCheck} tom="green" carregando={carregando}
            valor={formatCurrency(num(atual?.valor_pago_no_prazo) + num(atual?.valor_pago_em_atraso))}
            detalhe={<>no prazo {formatCurrency(num(atual?.valor_pago_no_prazo))}<br />em atraso {formatCurrency(num(atual?.valor_pago_em_atraso))}</>}
            onAbrir={() => abrir('Boletos pagos', { situacoes: ['pago_no_prazo', 'pago_em_atraso'] })} />
          <TileCobranca titulo="Inadimplente" icon={AlertTriangle} tom="rose" carregando={carregando}
            valor={formatCurrency(num(atual?.valor_aberto_vencido))}
            detalhe={<>inadimplência financeira <b>{pct(tAtual.inadFinanceira)}</b></>}
            rodape={<SeloSemaforo s={sem} />}
            onAbrir={() => abrir('Boletos vencidos sem pagamento', { situacoes: ['vencido'] })} />
          <TileCobranca titulo="Previsão de recebimento" icon={CalendarDays} tom="cyan" carregando={carregando}
            valor={formatCurrency(num(atual?.valor_a_vencer) + num(atual?.valor_vence_hoje))}
            detalhe={`a vencer, ${formatCurrency(num(atual?.valor_vence_hoje))} vencem hoje`}
            onAbrir={() => abrir('Boletos a vencer', { situacoes: ['a_vencer', 'vence_hoje'] })} />
        </div>
      </section>

      {/* Recuperacao e qualidade */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recuperação e qualidade do pagador</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <TileCobranca titulo="Inadimplência por clientes" icon={UserX} tom="rose" carregando={carregando}
            valor={pct(tAtual.inadClientes)}
            detalhe={`${inteiro.format(num(atual?.clientes_inadimplentes))} de ${inteiro.format(num(atual?.clientes_venceram))} com boleto vencido`}
            rodape={<Delta atual={tAtual.inadClientes} base={refs[0].taxas.inadClientes} chave="inadClientes" />} />
          <TileCobranca titulo="Taxa de recuperação" icon={RotateCcw} tom="green" carregando={carregando}
            valor={pct(tAtual.recuperacao)} detalhe={`${formatCurrency(num(atual?.valor_pago_em_atraso))} pagos depois do vencimento`}
            rodape={<Delta atual={tAtual.recuperacao} base={refs[0].taxas.recuperacao} chave="recuperacao" />}
            onAbrir={() => abrir('Pagos em atraso (recuperados)', { situacoes: ['pago_em_atraso'] })} />
          <TileCobranca titulo="Inadimplência no 1º boleto" icon={Sparkles} tom="amber" carregando={carregando}
            valor={pct(tAtual.inadInicial)}
            detalhe={`${inteiro.format(num(atual?.primeiros_nao_pagos))} de ${inteiro.format(num(atual?.primeiros_venceram))} novos não pagaram o 1º`}
            rodape={<Delta atual={tAtual.inadInicial} base={refs[0].taxas.inadInicial} chave="inadInicial" />}
            onAbrir={() => abrir('1º boleto do associado', { somentePrimeiro: true })} />
          <TileCobranca titulo="Reincidentes" icon={Repeat2} tom="rose" carregando={carregando}
            valor={inteiro.format(num(atual?.reincidentes))}
            detalhe={`dos ${inteiro.format(num(atual?.clientes_inadimplentes))} inadimplentes já atrasaram nos 12 meses anteriores · ${inteiro.format(Math.max(0, num(atual?.clientes_inadimplentes) - num(atual?.reincidentes)))} novos`} />
          <TileCobranca titulo="Regularizados" icon={UserCheck} tom="green" carregando={carregando}
            valor={inteiro.format(num(atual?.regularizados))} detalhe="associados que pagaram atrasado no período"
            onAbrir={() => setLista({ titulo: 'Pagamentos em atraso feitos no período', regionalId, situacoes: ['pago_em_atraso'], pagoInicio: periodo.inicio, pagoFim: periodo.fim })} />
          <TileCobranca titulo="Inativados no período" icon={UserMinus} tom="slate" carregando={qInat.isLoading}
            valor={inteiro.format(num(qInat.data?.veiculos))}
            detalhe={`veículos de ${inteiro.format(num(qInat.data?.clientes))} associados · ${inteiro.format(num(qInat.data?.pela_regua))} pela régua de cobrança`} />
        </div>
      </section>

      {/* Leitura automatica + comparativos */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle className="text-base">Leitura automática</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {frases.length === 0 && <p className="text-sm text-slate-400">Sem boletos vencidos no período para comentar.</p>}
            {frases.map((f, i) => (
              <p key={i} className={`rounded-lg border-l-4 px-3 py-2 text-sm ${
                f.tom === 'positivo' ? 'border-emerald-500 bg-emerald-50/60 text-emerald-900'
                  : f.tom === 'negativo' ? 'border-rose-500 bg-rose-50/60 text-rose-900'
                    : f.tom === 'atencao' ? 'border-amber-500 bg-amber-50/60 text-amber-900'
                      : 'border-slate-300 bg-slate-50 text-slate-700'}`}>
                {f.texto}
              </p>
            ))}
            <p className="pt-1 text-[11px] text-slate-400">
              Cada frase sai dos números acima. Situação de hoje: um período passado mostra o que dele continua em aberto agora.
            </p>
          </CardContent>
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader><CardTitle className="text-base">Comparativos</CardTitle></CardHeader>
          <CardContent><TabelaComparativos atual={tAtual} refs={refs} mesCheio={mesCheio} /></CardContent>
        </Card>
      </div>

      {/* Evolucao 12 meses */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Últimos 12 meses — por mês de vencimento</CardTitle>
          <button type="button" onClick={() => baixarCsv('cobranca-12-meses.csv', [
            ['Mês', 'Emitido', 'Já venceu', 'Pago no prazo', 'Pago em atraso', 'Em aberto vencido', 'Inadimplência %'],
            ...(qSerie.data ?? []).map((s) => [s.mes, num(s.valor_emitido), num(s.valor_venceram), num(s.valor_pago_no_prazo),
              num(s.valor_pago_em_atraso), num(s.valor_aberto_vencido),
              Math.round((fracao(num(s.valor_aberto_vencido), num(s.valor_venceram)) ?? 0) * 10000) / 100]),
          ])} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </CardHeader>
        <CardContent>
          <ErroLeitura q={qSerie} />
          <div className="h-72 text-slate-500">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--slate-200))" vertical={false} />
                <XAxis dataKey="mes" tick={EIXO} />
                <YAxis yAxisId="v" tick={EIXO} tickFormatter={(v) => compacto.format(v)} width={48} />
                <YAxis yAxisId="p" orientation="right" tick={EIXO} tickFormatter={(v) => `${v.toFixed(0)}%`} width={40} />
                <Tooltip contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number, nome: string) => (nome === 'Inadimplencia' ? `${v.toFixed(1)}%` : formatCurrency(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="v" dataKey="Pago no prazo" stackId="a" fill={COR.verde} />
                <Bar yAxisId="v" dataKey="Pago em atraso" stackId="a" fill={COR.ambar} />
                <Bar yAxisId="v" dataKey="Em aberto (vencido)" stackId="a" fill={COR.vermelho} radius={[4, 4, 0, 0]} />
                <Line yAxisId="p" dataKey="inad" name="Inadimplencia" stroke={COR.acento} strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Regional x media nacional — so fora do portal da franquia */}
      {!unidade && (
      <Card>
        <CardHeader><CardTitle className="text-base">Por regional — contra a média</CardTitle></CardHeader>
        <CardContent>
          <ErroLeitura q={qReg} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[12.5px]">
              <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Regional</th>
                  <th className="py-2 pr-3 text-right">Emitido</th>
                  <th className="py-2 pr-3 text-right">Já venceu</th>
                  <th className="py-2 pr-3 text-right">Em aberto</th>
                  <th className="py-2 pr-3 text-right">Inadimplencia</th>
                  <th className="py-2 pr-3 text-right">vs média</th>
                  <th className="py-2 pr-3 text-right">Clientes inad.</th>
                  <th className="py-2 pr-3">Semáforo</th>
                </tr>
              </thead>
              <tbody>
                {(qReg.data ?? []).map((r) => {
                  const t = fracao(num(r.valor_aberto_vencido), num(r.valor_venceram));
                  return (
                    <tr key={r.regional_id ?? 'matriz'} className="border-t border-slate-100">
                      <td className="py-2 pr-3">
                        {r.regional_id ? (
                          <button type="button" onClick={() => setRegionalId(r.regional_id)} className="font-medium text-slate-800 hover:text-cyan-600">{r.regional}</button>
                        ) : <span className="font-medium text-slate-800">{r.regional}</span>}
                      </td>
                      <td className="tnum py-2 pr-3 text-right">{formatCurrency(num(r.valor_emitido))}</td>
                      <td className="tnum py-2 pr-3 text-right">{formatCurrency(num(r.valor_venceram))}</td>
                      <td className="tnum py-2 pr-3 text-right">{formatCurrency(num(r.valor_aberto_vencido))}</td>
                      <td className="tnum py-2 pr-3 text-right font-semibold">{pct(t)}</td>
                      <td className="py-2 pr-3 text-right"><Delta atual={t} base={nacional} chave="inadFinanceira" /></td>
                      <td className="tnum py-2 pr-3 text-right">{inteiro.format(num(r.clientes_inadimplentes))} / {inteiro.format(num(r.clientes_venceram))}</td>
                      <td className="py-2 pr-3"><SeloSemaforo s={semaforo(t, meta, limite)} /></td>
                    </tr>
                  );
                })}
                {!(qReg.data ?? []).length && !qReg.isLoading && (
                  <tr><td colSpan={8} className="py-6 text-center text-sm text-slate-400">Sem boletos no período.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Média = inadimplência financeira de todas as regionais que você enxerga ({pct(nacional)}).
            Clique numa regional para filtrar o painel.
          </p>
        </CardContent>
      </Card>
      )}

      <ModalBoletos filtro={lista} onClose={() => setLista(null)} />
      <ModalParametros open={config} onClose={() => setConfig(false)} />
    </div>
  );
}
