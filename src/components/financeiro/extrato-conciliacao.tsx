'use client';

import { Fragment, useMemo, useRef, useState } from 'react';
import { CheckCheck, CheckCircle2, ChevronDown, ChevronRight, FileUp, Layers, Link2, RefreshCw, Undo2, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select } from '@/components/ui/field';
import {
  mensagemErro,
  useCandidatosExtrato,
  useConciliarItem,
  useConfirmarSugestoes,
  useCriarLancamentoExtrato,
  useDesfazerItem,
  useExtratoConta,
  useIgnorarItem,
  useImportacoesExtrato,
  useImportarOfx,
  useItensExtrato,
  useConciliarLotes,
  useLoteDoItem,
  useReclassificarExtrato,
  useSaldoEm,
  useTransferenciaExtrato,
} from '@/hooks/use-tesouraria';
import { useCentrosCusto, useContasBancarias } from '@/hooks/use-financeiro';
import { usePlanoContas } from '@/hooks/use-config';
import { useFornecedores } from '@/hooks/use-fornecedores';
import { contaDoArquivoConfere, decodificarOfx, interpretarOfx, resumoOfx, type ExtratoOfx } from '@/lib/ofx';
import { ROTULO_GRUPO_EXTRATO, ROTULO_ORIGEM, ROTULO_SITUACAO_EXTRATO, agruparExtrato, resumoConciliacao, diaAnteriorIso } from '@/lib/tesouraria';
import { somarMoeda } from '@/lib/money';
import { formatCurrency } from '@/lib/utils';
import type { ExtratoContaRow, ExtratoItensRow } from '@/lib/database.types';
import { FiltroPeriodo, periodoPreset, Vazio, type Periodo } from './ui-financeiro';
import { BotoesExportar, Dinheiro, SELECT_CLS, SeletorConta, dataBR } from './tesouraria-ui';
import { contasParaLancamento, ehAnalitica, ordenarPlano } from '@/lib/plano-contas';

type Visao = 'extrato' | 'conciliacao';

export function ExtratoConciliacao({ contaInicial }: { contaInicial?: string | null }) {
  const [conta, setConta] = useState<string | null>(contaInicial ?? null);
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoPreset('mes'));
  const [visao, setVisao] = useState<Visao>('extrato');

  return (
    <div className="space-y-4">
      <FiltroPeriodo periodo={periodo} onChange={setPeriodo}>
        <SeletorConta value={conta} onChange={setConta} className="min-w-[220px]" />
      </FiltroPeriodo>

      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm sm:w-fit">
        {([['extrato', 'Extrato'], ['conciliacao', 'Conciliação OFX']] as const).map(([v, r]) => (
          <button key={v} onClick={() => setVisao(v)}
            className={`rounded-md px-3 py-1.5 font-medium ${visao === v ? 'bg-superficie text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {r}
          </button>
        ))}
      </div>

      {visao === 'extrato' && <ExtratoTabela conta={conta} periodo={periodo} />}
      {visao === 'conciliacao' && (conta
        ? <Conciliacao conta={conta} periodo={periodo} />
        : <Card><Vazio icon={Link2} titulo="Escolha uma conta" descricao="A conciliação do OFX é feita conta por conta: escolha a conta bancária no filtro acima." /></Card>)}
    </div>
  );
}

// ------------------------------------------------------------------ extrato

function ExtratoTabela({ conta, periodo }: { conta: string | null; periodo: Periodo }) {
  const [conciliacao, setConciliacao] = useState<'' | 'CONCILIADO' | 'NAO_CONCILIADO'>('');
  const [centro, setCentro] = useState('');
  const [categoria, setCategoria] = useState('');
  const [transf, setTransf] = useState(false);
  // 0149: os recebimentos da cobranca (PIX, COMPE/REDE) viram uma linha de total por dia
  const [agrupar, setAgrupar] = useState(true);
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set());
  const { data: centros } = useCentrosCusto();
  const { data: plano } = usePlanoContas();
  const { data: contas } = useContasBancarias();
  const { data, isLoading, error } = useExtratoConta({
    conta, inicio: periodo.inicio, fim: periodo.fim, centro: centro || null, categoria: categoria || null,
    conciliacao: conciliacao || null, transferencias: transf,
  });
  const { data: saldoFim } = useSaldoEm(periodo.fim, conta);
  const linhas = data ?? [];
  const itens = useMemo(() => agruparExtrato(linhas, agrupar), [linhas, agrupar]);
  const alternar = (chave: string) => setAbertos((a) => {
    const n = new Set(a);
    if (n.has(chave)) n.delete(chave); else n.add(chave);
    return n;
  });
  const anterior = linhas[0]?.saldo_anterior ?? null;
  const { data: saldoIni } = useSaldoEm(diaAnteriorIso(periodo.inicio), conta);
  const tEnt = somarMoeda(...linhas.map((l) => Number(l.entrada)));
  const tSai = somarMoeda(...linhas.map((l) => Number(l.saida)));
  const filtrado = !!(centro || categoria || conciliacao);
  const nomeConta = conta ? contas?.find((c) => c.id === conta)?.nome ?? 'Conta' : 'Consolidado';

  const tabela = () => ({
    titulo: `Extrato — ${nomeConta}`,
    subtitulo: `${dataBR(periodo.inicio)} a ${dataBR(periodo.fim)} · saldo anterior ${Number(saldoIni ?? anterior ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}${filtrado ? ' · com filtros' : ''}`,
    cabecalho: ['Data', ...(conta ? [] : ['Conta']), 'Descrição', 'Contraparte', 'Documento', 'Plano de contas', 'Centro de custo', 'Entrada', 'Saída', 'Saldo', 'Conferido'],
    linhas: itens.map((i) => {
      if (i.tipo === 'grupo') {
        const p = i.linhas[0];
        return [
          dataBR(i.data), ...(conta ? [] : [p.conta]), `${ROTULO_GRUPO_EXTRATO[i.grupo]} (${i.linhas.length})`, '', '',
          p.categoria_codigo ? `${p.categoria_codigo} ${p.categoria}` : '', '',
          i.entrada || '', i.saida || '', i.saldo === null ? '' : i.saldo,
          i.conciliados === i.linhas.length ? 'sim' : `${i.conciliados}/${i.linhas.length}`,
        ];
      }
      const l = i.linha;
      return [
        dataBR(l.data), ...(conta ? [] : [l.conta]), l.descricao ?? '', l.contraparte ?? '', l.documento ?? '',
        l.categoria_codigo ? `${l.categoria_codigo} ${l.categoria}` : '', l.centro_custo ?? '',
        Number(l.entrada) || '', Number(l.saida) || '', l.saldo === null ? '' : Number(l.saldo), l.conciliado ? 'sim' : 'nao',
      ];
    }),
    rodape: ['Totais', ...(conta ? [] : ['']), '', '', '', '', '', tEnt, tSai, Number(saldoFim ?? 0), ''],
    colunasMoeda: conta ? [6, 7, 8] : [7, 8, 9],
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-slate-400">Conferência</span>
            <select className={SELECT_CLS} value={conciliacao} onChange={(e) => setConciliacao(e.target.value as typeof conciliacao)}>
              <option value="">Todos</option>
              <option value="CONCILIADO">Conciliados</option>
              <option value="NAO_CONCILIADO">Não conciliados</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-slate-400">Centro de custo</span>
            <select className={SELECT_CLS} value={centro} onChange={(e) => setCentro(e.target.value)}>
              <option value="">Todos</option>
              {(centros ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-slate-400">Plano de contas</span>
            <select className={SELECT_CLS} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Todos</option>
              {ordenarPlano(plano ?? []).filter(ehAnalitica).map((c) => <option key={c.id} value={c.id}>{c.codigo_estruturado} {c.nome}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-sm text-slate-600"
            title="Os boletos pagos pelo banco viram uma linha por dia e tipo (PIX, COMPE/REDE); clique na linha para ver os boletos">
            <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} /> Agrupar recebimentos da cobrança
          </label>
          {!conta && (
            <label className="flex items-center gap-1.5 pb-2 text-sm text-slate-600">
              <input type="checkbox" checked={transf} onChange={(e) => setTransf(e.target.checked)} /> Mostrar transferências internas
            </label>
          )}
        </div>
        <BotoesExportar nome={`extrato-${periodo.inicio}-${periodo.fim}`} tabela={tabela} desabilitado={!linhas.length} />
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        {error && <p className="px-4 py-3 text-sm text-rose-700">Não foi possível ler o extrato: {mensagemErro(error)}</p>}
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Data</th>
              {!conta && <th className="px-3 py-2">Conta</th>}
              <th className="px-3 py-2">Descrição</th>
              <th className="px-3 py-2">Plano / centro</th>
              <th className="px-3 py-2 text-right">Entrada</th>
              <th className="px-3 py-2 text-right">Saída</th>
              <th className="px-3 py-2 text-right">Saldo</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr className="bg-slate-50/60">
              <td className="px-3 py-2 text-xs text-slate-500" colSpan={conta ? 5 : 6}>Saldo anterior (fim de {dataBR(diaAnteriorIso(periodo.inicio))})</td>
              <td className="px-3 py-2 text-right"><Dinheiro v={saldoIni ?? anterior ?? 0} forte /></td>
              <td />
            </tr>
            {isLoading && <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">Carregando...</td></tr>}
            {!isLoading && !linhas.length && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-500">Nenhum movimento no período.</td></tr>
            )}
            {itens.map((i) => {
              if (i.tipo === 'linha') return <LinhaExtrato key={`${i.linha.origem}-${i.linha.ref_id}-${i.linha.conta_id}`} l={i.linha} conta={conta} />;
              const aberto = abertos.has(i.chave);
              const todos = i.conciliados === i.linhas.length;
              return (
                <Fragment key={i.chave}>
                  <tr className="cursor-pointer bg-cyan-50/40 hover:bg-cyan-50" onClick={() => alternar(i.chave)}>
                    <td className="tnum whitespace-nowrap px-3 py-2">{dataBR(i.data)}</td>
                    {!conta && <td className="px-3 py-2 text-xs text-slate-600">{i.linhas[0].conta}</td>}
                    <td className="px-3 py-2">
                      <p className="flex items-center gap-1 font-medium text-slate-800">
                        {aberto ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                        {ROTULO_GRUPO_EXTRATO[i.grupo]}
                      </p>
                      <p className="pl-5 text-xs text-slate-500">
                        {i.linhas.length} boleto(s) · {aberto ? 'clique para fechar' : 'clique para ver os boletos'}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {i.linhas[0].categoria_codigo ? `${i.linhas[0].categoria_codigo} ${i.linhas[0].categoria}` : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right">{i.entrada ? <Dinheiro v={i.entrada} forte /> : ''}</td>
                    <td className="px-3 py-2 text-right">{i.saida ? <Dinheiro v={-i.saida} forte /> : ''}</td>
                    <td className="px-3 py-2 text-right">{i.saldo === null ? '' : <Dinheiro v={i.saldo} />}</td>
                    <td className="px-3 py-2 text-center"
                      title={todos ? 'Todos conferidos com o extrato do banco' : `${i.conciliados} de ${i.linhas.length} conferidos com o extrato`}>
                      {todos
                        ? <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" />
                        : <span className="tnum text-xs text-slate-500">{i.conciliados}/{i.linhas.length}</span>}
                    </td>
                  </tr>
                  {aberto && i.linhas.map((l) => (
                    <LinhaExtrato key={`${l.origem}-${l.ref_id}-${l.conta_id}`} l={l} conta={conta} membro />
                  ))}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 bg-slate-50">
            <tr>
              <td className="px-3 py-2 font-semibold" colSpan={conta ? 3 : 4}>Totais{filtrado ? ' (das linhas filtradas)' : ''}</td>
              <td className="px-3 py-2 text-right"><Dinheiro v={tEnt} forte /></td>
              <td className="px-3 py-2 text-right"><Dinheiro v={-tSai} forte /></td>
              <td className="px-3 py-2 text-right" title="Saldo real no fim do período"><Dinheiro v={saldoFim ?? 0} forte /></td>
              <td />
            </tr>
          </tfoot>
        </table>
        {filtrado && <p className="px-4 py-2 text-xs text-slate-500">Com filtro, o saldo de cada linha continua sendo o saldo real da conta naquele ponto.</p>}
      </CardContent>
    </Card>
  );
}

function LinhaExtrato({ l, conta, membro }: { l: ExtratoContaRow; conta: string | null; membro?: boolean }) {
  return (
    <tr className={membro ? 'bg-slate-50/70 text-[0.8125rem]' : undefined}>
      <td className="tnum whitespace-nowrap px-3 py-2">{membro ? '' : dataBR(l.data)}</td>
      {!conta && <td className="px-3 py-2 text-xs text-slate-600">{membro ? '' : l.conta}</td>}
      <td className={`px-3 py-2 ${membro ? 'pl-9' : ''}`}>
        <p className="text-slate-800">{membro ? (l.contraparte || l.descricao) : l.descricao}</p>
        <p className="text-xs text-slate-500">
          {(membro ? [l.forma, l.documento] : [ROTULO_ORIGEM[l.origem], l.contraparte, l.documento]).filter(Boolean).join(' · ')}
        </p>
      </td>
      <td className="px-3 py-2 text-xs text-slate-600">
        {membro ? '' : l.categoria_codigo ? `${l.categoria_codigo} ${l.categoria}` : <span className="text-slate-400">—</span>}
        {!membro && l.centro_custo && <p className="text-slate-400">{l.centro_custo}</p>}
      </td>
      <td className="px-3 py-2 text-right">{Number(l.entrada) ? <Dinheiro v={l.entrada} /> : ''}</td>
      <td className="px-3 py-2 text-right">{Number(l.saida) ? <Dinheiro v={-Number(l.saida)} /> : ''}</td>
      <td className="px-3 py-2 text-right">{membro || l.saldo === null ? '' : <Dinheiro v={l.saldo} />}</td>
      <td className="px-3 py-2 text-center" title={l.conciliado ? 'Conferido com o extrato do banco' : 'Ainda não conferido com o extrato'}>
        {l.conciliado ? <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" /> : <span className="text-xs text-slate-300">·</span>}
      </td>
    </tr>
  );
}

// -------------------------------------------------------------- conciliacao

const FILTROS: { v: string; r: string }[] = [
  { v: 'abertos', r: 'A conciliar' },
  { v: 'SUGERIDO', r: 'Sugestões' },
  { v: 'CONCILIADO', r: 'Conciliados' },
  { v: 'IGNORADO', r: 'Ignorados' },
  { v: '', r: 'Todos' },
];

const SELO: Record<string, string> = {
  PENDENTE: 'bg-amber-100 text-amber-800',
  SUGERIDO: 'bg-cyan-100 text-cyan-800',
  CONCILIADO: 'bg-emerald-100 text-emerald-800',
  IGNORADO: 'bg-slate-100 text-slate-600',
};

function Conciliacao({ conta, periodo }: { conta: string; periodo: Periodo }) {
  const [filtro, setFiltro] = useState('abertos');
  const { data: itens, isLoading } = useItensExtrato(conta, periodo.inicio, periodo.fim, null);
  const { data: importacoes } = useImportacoesExtrato(conta);
  const confirmar = useConfirmarSugestoes();
  const reclassificar = useReclassificarExtrato();
  const desfazer = useDesfazerItem();
  const lotes = useConciliarLotes();
  const lote = useLoteDoItem();
  const [aberto, setAberto] = useState<ExtratoItensRow | null>(null);

  // 0147: credito somado da cobranca (COMPE/REDE) x as baixas de boleto creditadas no dia
  async function conciliarLote(i: ExtratoItensRow) {
    try {
      const pv = await lote.mutateAsync({ item: i.id, gravar: false });
      if (!pv || !pv.quantidade) {
        alert(`Nenhuma baixa de boleto (COMPE/REDE) com crédito em ${dataBR(i.data)} nesta conta.`);
        return;
      }
      const qtdExtrato = pv.quantidade_extrato != null ? ` (o extrato diz ${pv.quantidade_extrato})` : '';
      if (!pv.confere) {
        alert(`Não fecha: ${pv.quantidade} baixa(s) de boleto creditada(s) em ${dataBR(i.data)}${qtdExtrato} somam `
          + `${formatCurrency(pv.soma)}; o extrato tem ${formatCurrency(pv.valor_extrato)} (diferença ${formatCurrency(pv.diferenca)}).`);
        return;
      }
      if (!confirm(`Conciliar este crédito com ${pv.quantidade} baixa(s) de boleto${qtdExtrato}, `
        + `somando ${formatCurrency(pv.soma)}? O saldo não muda.`)) return;
      await lote.mutateAsync({ item: i.id, gravar: true });
      setAviso(`Lote conciliado: ${pv.quantidade} boleto(s), ${formatCurrency(pv.soma)}.`);
    } catch (e) {
      alert(mensagemErro(e));
    }
  }
  const [aviso, setAviso] = useState('');

  const todos = itens ?? [];
  const resumo = resumoConciliacao(todos);
  const lista = todos.filter((i) =>
    filtro === 'abertos' ? i.situacao === 'PENDENTE' || i.situacao === 'SUGERIDO' : !filtro || i.situacao === filtro);

  return (
    <div className="space-y-4">
      <ImportarOfx conta={conta} onImportado={(m) => setAviso(m)} />
      {aviso && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{aviso}</p>}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1">
            {FILTROS.map((f) => {
              const n = f.v === 'abertos' ? resumo.PENDENTE + resumo.SUGERIDO : f.v ? (resumo as Record<string, number>)[f.v] : resumo.total;
              return (
                <button key={f.v} onClick={() => setFiltro(f.v)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${filtro === f.v ? 'bg-acao text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {f.r} ({n})
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={lotes.isPending}
              title="Crédito somado da cobrança (LIQ.COBRANCA) com as baixas COMPE/REDE do dia, e cada PIX da cobrança com a baixa PIX de mesmo valor no dia"
              onClick={() => lotes.mutate(conta, {
                onSuccess: (r) => setAviso(r.lotes || r.pix
                  ? `Cobrança conciliada: ${r.lotes} crédito(s) em lote (${formatCurrency(r.valorLotes)}) e `
                    + `${r.pix} PIX por valor no dia (${formatCurrency(r.valorPix)}).`
                  : 'Nada da cobrança fechou com as baixas do banco.'),
                onError: (e) => alert(mensagemErro(e)),
              })}>
              <Layers className="h-4 w-4" /> Conciliar cobrança (lotes e PIX)
            </Button>
            <Button variant="secondary" disabled={reclassificar.isPending}
              onClick={() => reclassificar.mutate(conta, {
                onSuccess: (r) => setAviso(`Regras reaplicadas: ${r.sugeridos} sugestão(oes) nova(s), ${r.ignorados} ignorado(s).`),
                onError: (e) => alert(mensagemErro(e)),
              })}>
              <RefreshCw className="h-4 w-4" /> Reaplicar regras
            </Button>
            <Button disabled={!resumo.SUGERIDO || confirmar.isPending}
              onClick={() => {
                if (!confirm(`Confirmar as ${resumo.SUGERIDO} sugestões de conciliação? Cada item do extrato fica ligado ao movimento sugerido; o saldo não muda.`)) return;
                confirmar.mutate({ conta }, { onSuccess: (n) => setAviso(`${n} item(ns) conciliado(s).`), onError: (e) => alert(mensagemErro(e)) });
              }}>
              <CheckCheck className="h-4 w-4" /> Confirmar sugestões ({resumo.SUGERIDO})
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Histórico do banco</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2">Situação</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">Carregando...</td></tr>}
              {!isLoading && !lista.length && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">
                  {todos.length ? 'Nada nesta situação.' : 'Nenhum extrato importado neste período. Envie o OFX acima.'}
                </td></tr>
              )}
              {lista.map((i) => (
                <tr key={i.id}>
                  <td className="tnum whitespace-nowrap px-3 py-2">{dataBR(i.data)}</td>
                  <td className="px-3 py-2">
                    <p className="text-slate-800">{i.historico ?? '—'}</p>
                    <p className="text-xs text-slate-400">{[i.tipo_ofx, i.documento, `FITID ${i.fitid}`].filter(Boolean).join(' · ')}</p>
                  </td>
                  <td className="px-3 py-2 text-right"><Dinheiro v={i.valor} sinal forte /></td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${SELO[i.situacao]}`}>{ROTULO_SITUACAO_EXTRATO[i.situacao]}</span>
                    {i.situacao === 'SUGERIDO' && <p className="mt-0.5 text-xs text-slate-500">casa com {ROTULO_ORIGEM[i.sugestao_tipo ?? ''] ?? i.sugestao_tipo}</p>}
                    {i.motivo && <p className="mt-0.5 max-w-xs text-xs text-slate-500">{i.motivo}</p>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      {i.situacao === 'SUGERIDO' && (
                        <button className="rounded-md px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                          onClick={() => confirmar.mutate({ conta, itens: [i.id] }, { onError: (e) => alert(mensagemErro(e)) })}>
                          Confirmar
                        </button>
                      )}
                      {i.valor > 0 && (i.situacao === 'PENDENTE' || i.situacao === 'SUGERIDO'
                        || (i.situacao === 'IGNORADO' && (i.motivo ?? '').startsWith('MENSALIDADE'))) && (
                        <button className="rounded-md px-2 py-1 text-xs font-medium text-cyan-700 hover:bg-cyan-50"
                          disabled={lote.isPending} title="Conciliar com as baixas de boleto (COMPE/REDE) creditadas neste dia"
                          onClick={() => conciliarLote(i)}>
                          Lote da cobrança
                        </button>
                      )}
                      {(i.situacao === 'PENDENTE' || i.situacao === 'SUGERIDO') && (
                        <button className="rounded-md px-2 py-1 text-xs font-medium text-cyan-700 hover:bg-cyan-50" onClick={() => setAberto(i)}>
                          Conciliar...
                        </button>
                      )}
                      {(i.situacao === 'CONCILIADO' || i.situacao === 'IGNORADO') && (
                        <button className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Desfazer (volta para a conciliar)"
                          onClick={() => {
                            if (!confirm('Voltar este item para "a conciliar"? Se a conciliação criou um lançamento, ele continua no financeiro.')) return;
                            desfazer.mutate(i.id, { onError: (e) => alert(mensagemErro(e)) });
                          }}>
                          <Undo2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {!!importacoes?.length && (
        <Card>
          <CardHeader><CardTitle>Arquivos importados nesta conta</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-slate-100">
                {importacoes.map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-2 tnum">{new Date(m.created_at).toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-2">{m.arquivo_nome}</td>
                    <td className="px-3 py-2">{dataBR(m.data_inicio)} a {dataBR(m.data_fim)}</td>
                    <td className="px-3 py-2">{m.itens} lidos · {m.novos} novos · {m.repetidos} já importados · {m.sugeridos} sugestões · {m.ignorados} ignorados</td>
                    <td className="px-3 py-2 text-right">{m.saldo_banco === null ? '' : <>saldo do banco <Dinheiro v={m.saldo_banco} /> em {dataBR(m.saldo_banco_em)}</>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {aberto && <ModalConciliar item={aberto} onClose={() => setAberto(null)} />}
    </div>
  );
}

async function hashArquivo(bytes: ArrayBuffer): Promise<string> {
  try {
    const d = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${bytes.byteLength}`;
  }
}

function ImportarOfx({ conta, onImportado }: { conta: string; onImportado: (msg: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const { data: contas } = useContasBancarias();
  const importar = useImportarOfx();
  const [arquivo, setArquivo] = useState<{ nome: string; hash: string; ex: ExtratoOfx } | null>(null);
  const [erro, setErro] = useState('');
  const cad = contas?.find((c) => c.id === conta);
  const confere = arquivo ? contaDoArquivoConfere(arquivo.ex.conta, cad?.conta) : null;
  const res = arquivo ? resumoOfx(arquivo.ex) : null;

  const ler = async (f: File) => {
    setErro('');
    const bytes = await f.arrayBuffer();
    const ex = interpretarOfx(decodificarOfx(bytes));
    if (!ex.itens.length) { setErro(ex.avisos.join(' ') || 'Nenhum lançamento no arquivo.'); setArquivo(null); return; }
    setArquivo({ nome: f.name, hash: await hashArquivo(bytes), ex });
  };

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>Importar extrato OFX</CardTitle>
        <input ref={ref} type="file" accept=".ofx,.OFX,application/x-ofx" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void ler(f); e.target.value = ''; }} />
        <Button variant="secondary" onClick={() => ref.current?.click()}><FileUp className="h-4 w-4" /> Escolher arquivo .ofx</Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!arquivo && !erro && (
          <p className="text-slate-500">
            Baixe o extrato no internet banking em formato OFX e envie aqui. Reenviar o mesmo arquivo (ou períodos que se
            sobrepõem) não duplica nada: cada lançamento do banco entra uma vez só. O extrato não muda o saldo — ele confere
            o que já foi registrado.
          </p>
        )}
        {erro && <p className="text-rose-700">{erro}</p>}
        {arquivo && res && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div><p className="text-xs text-slate-500">Arquivo</p><p className="truncate font-medium">{arquivo.nome}</p></div>
              <div><p className="text-xs text-slate-500">Período</p><p className="tnum">{dataBR(arquivo.ex.dataInicio)} a {dataBR(arquivo.ex.dataFim)}</p></div>
              <div><p className="text-xs text-slate-500">{res.qtdCreditos} créditos / {res.qtdDebitos} débitos</p>
                <p><Dinheiro v={res.creditos} /> / <Dinheiro v={-res.debitos} /></p></div>
              <div><p className="text-xs text-slate-500">Saldo do banco</p>
                <p>{arquivo.ex.saldo === null ? '—' : <><Dinheiro v={arquivo.ex.saldo} forte /> em {dataBR(arquivo.ex.saldoEm)}</>}</p></div>
            </div>
            {confere === false && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">
                A conta do arquivo ({arquivo.ex.conta}) não parece ser a conta escolhida ({cad?.nome} {cad?.conta ?? ''}). Confira antes de importar.
              </p>
            )}
            {arquivo.ex.avisos.map((a) => <p key={a} className="text-amber-700">{a}</p>)}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setArquivo(null)}>Descartar</Button>
              <Button disabled={importar.isPending} onClick={() => importar.mutate({
                conta, arquivo: arquivo.nome, hash: arquivo.hash, dataInicio: arquivo.ex.dataInicio, dataFim: arquivo.ex.dataFim,
                saldo: arquivo.ex.saldo, saldoEm: arquivo.ex.saldoEm, itens: arquivo.ex.itens,
              }, {
                onSuccess: (r) => {
                  setArquivo(null);
                  onImportado(r
                    ? `Importado: ${r.novos} novo(s), ${r.repetidos} já importado(s), ${r.sugeridos} com sugestão de conciliação, ${r.ignorados} ignorado(s) pela regra de mensalidade.`
                    : 'Importado.');
                },
                onError: (e) => setErro(mensagemErro(e)),
              })}>
                <Upload className="h-4 w-4" /> {importar.isPending ? 'Importando...' : `Importar ${arquivo.ex.itens.length} lançamento(s)`}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

type Aba = 'existente' | 'criar' | 'transferencia' | 'ignorar';

function ModalConciliar({ item, onClose }: { item: ExtratoItensRow; onClose: () => void }) {
  const credito = item.valor > 0;
  const [aba, setAba] = useState<Aba>('existente');
  const [erro, setErro] = useState('');
  const { data: candidatos, isLoading } = useCandidatosExtrato(item.id);
  const conciliar = useConciliarItem();
  const criar = useCriarLancamentoExtrato();
  const transf = useTransferenciaExtrato();
  const ignorar = useIgnorarItem();
  const { data: plano } = usePlanoContas();
  const { data: centros } = useCentrosCusto();
  const { data: fornecedores } = useFornecedores('todos');
  const { data: contas } = useContasBancarias();
  const [descricao, setDescricao] = useState(item.historico ?? '');
  const [categoria, setCategoria] = useState('');
  const [centro, setCentro] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [outra, setOutra] = useState('');
  const [motivo, setMotivo] = useState('');
  const cats = useMemo(() => contasParaLancamento(plano ?? [], credito ? 'RECEITA' : 'DESPESA'), [plano, credito]);
  const ok = () => onClose();
  const falha = (e: unknown) => setErro(mensagemErro(e));

  return (
    <Modal open onClose={onClose} tamanho="lg" title="Conciliar item do extrato"
      subtitulo={`${dataBR(item.data)} · ${item.historico ?? ''} · ${credito ? 'credito' : 'debito'} de ${Math.abs(item.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {([['existente', 'Movimento já registrado'], ['criar', 'Criar lançamento'], ['transferencia', 'Transferência'], ['ignorar', 'Ignorar']] as const).map(([v, r]) => (
          <button key={v} onClick={() => { setAba(v); setErro(''); }}
            className={`border-b-2 px-3 py-2 text-sm ${aba === v ? 'border-cyan-500 font-semibold text-brand-700' : 'border-transparent text-slate-500'}`}>{r}</button>
        ))}
      </div>

      {aba === 'existente' && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Baixas, lançamentos em aberto e transferências desta conta com data próxima. O mesmo valor aparece primeiro.</p>
          {isLoading && <p className="text-sm text-slate-400">Procurando...</p>}
          {!isLoading && !candidatos?.length && <p className="text-sm text-slate-500">Nenhum movimento parecido. Use &ldquo;Criar lançamento&rdquo; ou &ldquo;Transferência&rdquo;.</p>}
          <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {(candidatos ?? []).map((c) => (
              <div key={`${c.tipo}-${c.ref_id}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-slate-800">{c.descricao}</p>
                  <p className="text-xs text-slate-500">
                    {c.tipo === 'BAIXA' ? 'Já baixado' : c.tipo === 'LANCAMENTO' ? 'Em aberto (será baixado com este item)' : 'Transferência'} ·
                    {' '}{dataBR(c.data)}{c.contraparte ? ` · ${c.contraparte}` : ''}{c.dias ? ` · ${c.dias} dia(s) de diferença` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={c.valor_igual ? '' : 'text-amber-700'}><Dinheiro v={c.valor} /></span>
                  <Button disabled={conciliar.isPending} onClick={() => {
                    if (!c.valor_igual && c.tipo !== 'LANCAMENTO') { setErro('O valor é diferente do extrato: só lançamento em aberto pode ser baixado parcialmente.'); return; }
                    conciliar.mutate({ item: item.id, tipo: c.tipo, ref: c.ref_id }, { onSuccess: ok, onError: falha });
                  }}>Usar</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {aba === 'criar' && (
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          if (!categoria) { setErro('Escolha o plano de contas.'); return; }
          criar.mutate({ item: item.id, descricao, categoria, centro: centro || null, fornecedor: fornecedor || null }, { onSuccess: ok, onError: falha });
        }}>
          <p className="text-xs text-slate-500">
            Para o que não tem lançamento: tarifa, rendimento, pagamento sem título. Cria o {credito ? 'recebimento' : 'pagamento'} já
            quitado nesta conta, nesta data, e ele entra no DRE.
          </p>
          <FormField label="Descrição"><Input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></FormField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Plano de contas">
              <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="">Escolha</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.codigo_estruturado} {c.nome}</option>)}
              </Select>
            </FormField>
            <FormField label="Centro de custo">
              <Select value={centro} onChange={(e) => setCentro(e.target.value)}>
                <option value="">Nenhum</option>
                {(centros ?? []).filter((c) => c.ativo).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Select>
            </FormField>
            {!credito && (
              <FormField label="Fornecedor (opcional)">
                <Select value={fornecedor} onChange={(e) => setFornecedor(e.target.value)}>
                  <option value="">Nenhum</option>
                  {(fornecedores ?? []).filter((f) => f.ativo !== false).map((f) => <option key={f.id} value={f.id}>{f.nome_fantasia || f.razao_social}</option>)}
                </Select>
              </FormField>
            )}
          </div>
          <div className="flex justify-end"><Button type="submit" disabled={criar.isPending}>Criar e conciliar</Button></div>
        </form>
      )}

      {aba === 'transferencia' && (
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          if (!outra) { setErro('Escolha a outra conta.'); return; }
          transf.mutate({ item: item.id, outraConta: outra, descricao }, { onSuccess: ok, onError: falha });
        }}>
          <p className="text-xs text-slate-500">
            Dinheiro entre contas próprias. Registra a transferência {credito ? 'vinda da' : 'para a'} conta escolhida e concilia este item;
            no extrato da outra conta o lançamento correspondente aparece como sugestão.
          </p>
          <FormField label={credito ? 'Veio da conta' : 'Foi para a conta'}>
            <Select value={outra} onChange={(e) => setOutra(e.target.value)}>
              <option value="">Escolha</option>
              {(contas ?? []).filter((c) => c.id !== item.conta_id && c.ativo).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </FormField>
          <FormField label="Descrição"><Input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></FormField>
          <div className="flex justify-end"><Button type="submit" disabled={transf.isPending}>Registrar transferência</Button></div>
        </form>
      )}

      {aba === 'ignorar' && (
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          ignorar.mutate({ item: item.id, motivo }, { onSuccess: ok, onError: falha });
        }}>
          <p className="text-xs text-slate-500">
            Ignorar não lança nada: use para o que já está registrado de outro jeito (por exemplo, o crédito somado das
            mensalidades que o banco já baixou uma a uma).
          </p>
          <FormField label="Motivo"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: crédito somado das mensalidades do dia" /></FormField>
          <div className="flex justify-end"><Button type="submit" variant="secondary" disabled={ignorar.isPending || !motivo.trim()}>Ignorar</Button></div>
        </form>
      )}

      {erro && <p className="mt-3 text-sm text-rose-700">{erro}</p>}
    </Modal>
  );
}
