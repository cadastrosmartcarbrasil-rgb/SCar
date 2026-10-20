'use client';

import { useMemo, useState } from 'react';
import { FileBarChart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDemonstrativo, useExtratoConta, useFluxoDiario, useSaldoEm, mensagemErro } from '@/hooks/use-tesouraria';
import { useCentrosCusto, useContasBancarias } from '@/hooks/use-financeiro';
import { usePlanoContas } from '@/hooks/use-config';
import { hojeEmSaoPaulo } from '@/lib/baixa-banco';
import { diaAnteriorIso, projetarFluxo, totaisFluxo } from '@/lib/tesouraria';
import { somarMoeda } from '@/lib/money';
import type { TabelaExportavel } from './exportar';
import { FiltroPeriodo, Vazio, periodoPreset, type Periodo } from './ui-financeiro';
import { BotoesExportar, Dinheiro, SELECT_CLS, SeletorConta, dataBR } from './tesouraria-ui';

type Tipo = 'extrato' | 'fluxo' | 'demonstrativo';
type Status = '' | 'PAGO' | 'PENDENTE' | 'ATRASADO' | 'CONCILIADO';

const TIPOS: { v: Tipo; r: string; d: string }[] = [
  { v: 'extrato', r: 'Extrato bancário', d: 'Movimentos realizados, com saldo, da conta ou consolidado' },
  { v: 'fluxo', r: 'Fluxo de caixa', d: 'Realizado x a realizar, dia a dia, com o saldo projetado' },
  { v: 'demonstrativo', r: 'Plano de contas x centro de custo', d: 'Realizado, a realizar e vencido por classificação' },
];

/**
 * Relatorios do financeiro (0119): os tres saem da MESMA fonte do saldo
 * (`tesouraria_movimentos`), entao o total de um bate com o outro. Exportam
 * em CSV, Excel e PDF com o mesmo conteudo da tela.
 */
export function RelatoriosFinanceiros() {
  const [tipo, setTipo] = useState<Tipo>('extrato');
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoPreset('mes'));
  const [conta, setConta] = useState<string | null>(null);
  const [centro, setCentro] = useState('');
  const [categoria, setCategoria] = useState('');
  const [status, setStatus] = useState<Status>('');
  const { data: centros } = useCentrosCusto();
  const { data: plano } = usePlanoContas();
  const { data: contas } = useContasBancarias();
  const nomeConta = conta ? contas?.find((c) => c.id === conta)?.nome ?? 'Conta' : 'Consolidado (todas as contas)';
  const filtros = [
    nomeConta,
    centro && `Centro: ${centros?.find((c) => c.id === centro)?.nome}`,
    categoria && `Plano: ${plano?.find((c) => c.id === categoria)?.codigo_estruturado}`,
    status && `Status: ${status.toLowerCase()}`,
  ].filter(Boolean).join(' · ');

  const statusValido = tipo === 'extrato' ? ['', 'PAGO', 'CONCILIADO'] : tipo === 'demonstrativo' ? ['', 'PAGO', 'PENDENTE', 'ATRASADO', 'CONCILIADO'] : [''];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {TIPOS.map((t) => (
          <button key={t.v} onClick={() => { setTipo(t.v); setStatus(''); }}
            className={`rounded-xl border p-3 text-left transition ${tipo === t.v ? 'border-cyan-500 bg-cyan-50/60' : 'border-slate-200 bg-superficie hover:border-slate-300'}`}>
            <p className="text-sm font-semibold text-slate-900">{t.r}</p>
            <p className="text-xs text-slate-500">{t.d}</p>
          </button>
        ))}
      </div>

      <FiltroPeriodo periodo={periodo} onChange={setPeriodo}>
        <SeletorConta value={conta} onChange={setConta} className="min-w-[200px]" />
        {tipo !== 'fluxo' && (
          <>
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Centro de custo</span>
              <select className={SELECT_CLS} value={centro} onChange={(e) => setCentro(e.target.value)}>
                <option value="">Todos</option>
                {(centros ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Plano de contas</span>
              <select className={SELECT_CLS} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="">Todos</option>
                {(plano ?? []).map((c) => <option key={c.id} value={c.id}>{c.codigo_estruturado} {c.nome}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Status</span>
              <select className={SELECT_CLS} value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                <option value="">Todos</option>
                {statusValido.includes('PAGO') && <option value="PAGO">Pago (realizado)</option>}
                {statusValido.includes('PENDENTE') && <option value="PENDENTE">Pendente (a vencer)</option>}
                {statusValido.includes('ATRASADO') && <option value="ATRASADO">Atrasado (vencido)</option>}
                {statusValido.includes('CONCILIADO') && <option value="CONCILIADO">Conciliado com o banco</option>}
              </select>
            </label>
          </>
        )}
      </FiltroPeriodo>

      {tipo === 'extrato' && <RelExtrato periodo={periodo} conta={conta} centro={centro} categoria={categoria} status={status} filtros={filtros} />}
      {tipo === 'fluxo' && <RelFluxo periodo={periodo} conta={conta} filtros={filtros} />}
      {tipo === 'demonstrativo' && <RelDemonstrativo periodo={periodo} conta={conta} centro={centro} categoria={categoria} status={status} filtros={filtros} />}
    </div>
  );
}

function Cabecalho({ titulo, filtros, periodo, nome, tabela, vazio }: {
  titulo: string; filtros: string; periodo: Periodo; nome: string; tabela: () => TabelaExportavel; vazio: boolean;
}) {
  return (
    <CardHeader className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <CardTitle>{titulo}</CardTitle>
        <p className="mt-0.5 text-xs text-slate-500">{dataBR(periodo.inicio)} a {dataBR(periodo.fim)} · {filtros}</p>
      </div>
      <BotoesExportar nome={nome} tabela={tabela} desabilitado={vazio} />
    </CardHeader>
  );
}

function RelExtrato({ periodo, conta, centro, categoria, status, filtros }: {
  periodo: Periodo; conta: string | null; centro: string; categoria: string; status: Status; filtros: string;
}) {
  const { data, isLoading, error } = useExtratoConta({
    conta, inicio: periodo.inicio, fim: periodo.fim, centro: centro || null, categoria: categoria || null,
    conciliacao: status === 'CONCILIADO' ? 'CONCILIADO' : null,
  });
  const { data: ini } = useSaldoEm(diaAnteriorIso(periodo.inicio), conta);
  const { data: fim } = useSaldoEm(periodo.fim, conta);
  const l = data ?? [];
  const ent = somarMoeda(...l.map((x) => Number(x.entrada)));
  const sai = somarMoeda(...l.map((x) => Number(x.saida)));
  const tabela = (): TabelaExportavel => ({
    titulo: 'Extrato bancário',
    subtitulo: `${dataBR(periodo.inicio)} a ${dataBR(periodo.fim)} · ${filtros} · saldo anterior ${Number(ini ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    cabecalho: ['Data', 'Conta', 'Descrição', 'Contraparte', 'Documento', 'Plano de contas', 'Centro de custo', 'Entrada', 'Saída', 'Saldo', 'Conciliado'],
    linhas: l.map((x) => [dataBR(x.data), x.conta, x.descricao ?? '', x.contraparte ?? '', x.documento ?? '',
      x.categoria_codigo ? `${x.categoria_codigo} ${x.categoria}` : '', x.centro_custo ?? '',
      Number(x.entrada) || '', Number(x.saida) || '', x.saldo === null ? '' : Number(x.saldo), x.conciliado ? 'sim' : 'nao']),
    rodape: ['Totais', '', '', '', '', '', '', ent, sai, Number(fim ?? 0), ''],
    colunasMoeda: [7, 8, 9],
  });
  return (
    <Card>
      <Cabecalho titulo="Extrato bancário" filtros={filtros} periodo={periodo} nome={`extrato-${periodo.inicio}-${periodo.fim}`} tabela={tabela} vazio={!l.length} />
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-rose-700">{mensagemErro(error)}</p>}
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Resumo r="Saldo anterior" v={ini ?? 0} />
          <Resumo r="Entradas" v={ent} />
          <Resumo r="Saídas" v={-sai} />
          <Resumo r="Saldo no fim" v={fim ?? 0} />
        </div>
        <Tabela carregando={isLoading} vazio={!l.length}
          cab={['Data', 'Conta', 'Descrição', 'Plano', 'Centro', 'Entrada', 'Saída', 'Saldo']}
          linhas={l.map((x) => [dataBR(x.data), x.conta, x.descricao ?? '', x.categoria_codigo ?? '', x.centro_custo ?? '',
            Number(x.entrada) ? <Dinheiro v={x.entrada} /> : '', Number(x.saida) ? <Dinheiro v={-Number(x.saida)} /> : '',
            x.saldo === null ? '' : <Dinheiro v={x.saldo} />])} numericas={[5, 6, 7]} />
      </CardContent>
    </Card>
  );
}

function RelFluxo({ periodo, conta, filtros }: { periodo: Periodo; conta: string | null; filtros: string }) {
  const hoje = hojeEmSaoPaulo();
  const { data, isLoading, error } = useFluxoDiario(periodo.inicio, periodo.fim, conta);
  const { data: ini } = useSaldoEm(diaAnteriorIso(periodo.inicio), conta);
  const proj = useMemo(() => projetarFluxo(data ?? [], ini ?? 0, hoje), [data, ini, hoje]);
  const t = totaisFluxo(data ?? []);
  const tabela = (): TabelaExportavel => ({
    titulo: 'Fluxo de caixa — realizado x a realizar',
    subtitulo: `${dataBR(periodo.inicio)} a ${dataBR(periodo.fim)} · ${filtros} · realizado até ${dataBR(hoje)}`,
    cabecalho: ['Dia', 'Situação', 'Recebido', 'Pago', 'A receber', 'Boletos previstos', 'A pagar', 'Vencido a pagar', 'Saldo'],
    linhas: proj.map((d) => [dataBR(d.dia), d.situacao === 'passado' ? 'Realizado' : d.situacao === 'hoje' ? 'Hoje' : 'A realizar',
      d.realizado_entrada, d.realizado_saida, d.previsto_entrada, d.previsto_boletos, d.previsto_saida, d.vencido_saida, d.saldo]),
    rodape: ['Totais', '', t.realizadoEntrada, t.realizadoSaida, t.previstoEntrada, t.previstoBoletos, t.previstoSaida, t.vencidoSaida, proj.at(-1)?.saldo ?? ''],
    colunasMoeda: [2, 3, 4, 5, 6, 7, 8],
  });
  return (
    <Card>
      <Cabecalho titulo="Fluxo de caixa — realizado x a realizar" filtros={filtros} periodo={periodo} nome={`fluxo-${periodo.inicio}-${periodo.fim}`} tabela={tabela} vazio={!proj.length} />
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-rose-700">{mensagemErro(error)}</p>}
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          <Resumo r="Recebido" v={t.realizadoEntrada} />
          <Resumo r="Pago" v={-t.realizadoSaida} />
          <Resumo r="A receber (+ boletos)" v={t.previstoEntrada + t.previstoBoletos} />
          <Resumo r="A pagar (+ vencido)" v={-(t.previstoSaida + t.vencidoSaida)} />
          <Resumo r="Saldo projetado no fim" v={proj.at(-1)?.saldo ?? ini ?? 0} />
        </div>
        <Tabela carregando={isLoading} vazio={!proj.length}
          cab={['Dia', 'Situação', 'Recebido', 'Pago', 'A receber', 'A pagar', 'Saldo']}
          linhas={proj.map((d) => [dataBR(d.dia), d.situacao === 'passado' ? 'Realizado' : d.situacao === 'hoje' ? 'Hoje' : 'A realizar',
            <Dinheiro key="a" v={d.realizado_entrada} />, <Dinheiro key="b" v={-d.realizado_saida} />,
            <Dinheiro key="c" v={d.previsto_entrada + d.previsto_boletos} />, <Dinheiro key="d" v={-(d.previsto_saida + d.vencido_saida)} />,
            <Dinheiro key="e" v={d.saldo} forte />])} numericas={[2, 3, 4, 5, 6]} />
      </CardContent>
    </Card>
  );
}

function RelDemonstrativo({ periodo, conta, centro, categoria, status, filtros }: {
  periodo: Periodo; conta: string | null; centro: string; categoria: string; status: Status; filtros: string;
}) {
  const { data, isLoading, error } = useDemonstrativo({
    inicio: periodo.inicio, fim: periodo.fim, conta, centro: centro || null, categoria: categoria || null, status: status || null,
  });
  const l = data ?? [];
  const tr = somarMoeda(...l.map((x) => Number(x.realizado)));
  const ta = somarMoeda(...l.map((x) => Number(x.a_realizar)));
  const tv = somarMoeda(...l.map((x) => Number(x.vencido)));
  const tabela = (): TabelaExportavel => ({
    titulo: 'Demonstrativo por plano de contas e centro de custo',
    subtitulo: `${dataBR(periodo.inicio)} a ${dataBR(periodo.fim)} · ${filtros} · valores com sinal (receita +, despesa -)`,
    cabecalho: ['Código', 'Plano de contas', 'Grupo', 'Centro de custo', 'Realizado', 'A realizar', 'Vencido', 'Lançamentos'],
    linhas: l.map((x) => [x.codigo, x.categoria, x.grupo, x.centro_custo, Number(x.realizado), Number(x.a_realizar), Number(x.vencido), x.quantidade]),
    rodape: ['', 'Total', '', '', tr, ta, tv, l.reduce((a, x) => a + x.quantidade, 0)],
    colunasMoeda: [4, 5, 6],
  });
  return (
    <Card>
      <Cabecalho titulo="Plano de contas x centro de custo" filtros={filtros} periodo={periodo} nome={`demonstrativo-${periodo.inicio}-${periodo.fim}`} tabela={tabela} vazio={!l.length} />
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-rose-700">{mensagemErro(error)}</p>}
        {conta && <p className="text-xs text-slate-500">Com conta escolhida, só o realizado: o que está a realizar ainda não tem conta.</p>}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <Resumo r="Realizado" v={tr} sinal />
          <Resumo r="A realizar" v={ta} sinal />
          <Resumo r="Vencido" v={tv} sinal />
        </div>
        <Tabela carregando={isLoading} vazio={!l.length}
          cab={['Plano de contas', 'Centro de custo', 'Realizado', 'A realizar', 'Vencido', 'Qtd']}
          linhas={l.map((x) => [`${x.codigo} ${x.categoria}`, x.centro_custo,
            <Dinheiro key="a" v={x.realizado} sinal />, <Dinheiro key="b" v={x.a_realizar} sinal />, <Dinheiro key="c" v={x.vencido} sinal />, x.quantidade])}
          numericas={[2, 3, 4, 5]} />
      </CardContent>
    </Card>
  );
}

function Resumo({ r, v, sinal }: { r: string; v: number; sinal?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{r}</p>
      <p className="mt-0.5"><Dinheiro v={v} sinal={sinal} forte /></p>
    </div>
  );
}

function Tabela({ cab, linhas, numericas, carregando, vazio }: {
  cab: string[]; linhas: React.ReactNode[][]; numericas: number[]; carregando: boolean; vazio: boolean;
}) {
  if (carregando) return <p className="py-6 text-center text-sm text-slate-400">Carregando...</p>;
  if (vazio) return <Vazio icon={FileBarChart} titulo="Nada no período" descricao="Ajuste o período ou os filtros." />;
  const n = new Set(numericas);
  return (
    <div className="max-h-[560px] overflow-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>{cab.map((c, i) => <th key={c} className={`px-3 py-2 ${n.has(i) ? 'text-right' : ''}`}>{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {linhas.map((l, k) => (
            <tr key={k}>{l.map((v, i) => <td key={i} className={`px-3 py-1.5 ${n.has(i) ? 'text-right' : ''}`}>{v}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
