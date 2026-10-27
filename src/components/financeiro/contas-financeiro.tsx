'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowDownCircle, ArrowUpCircle, Ban, Download, FileSpreadsheet,
  HandCoins, History, Pencil, Plus, Scale, Search, Trash2, Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import {
  useCancelarLancamento, useCentrosCusto, useFinanceiroResumo, useLancamentos,
  type FiltroLancamentos, type LancamentoComRel,
} from '@/hooks/use-financeiro';
import { usePlanoContas } from '@/hooks/use-config';
import { acoesDoTitulo, diasAtraso, saldoTitulo, situacaoTitulo } from '@/lib/financeiro';
import { rotuloFornecedor } from '@/lib/fornecedores';
import { rotuloFavorecido } from '@/lib/terceiros';
import { SeletorFornecedor } from '@/components/fornecedores/seletor-fornecedor';
import { ExcluirLancamentoModal, PagamentosModal } from './acoes-titulo';
import { somarMoeda } from '@/lib/money';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { StatusLancamento, TipoMovimentacao } from '@/lib/database.types';
import { BaixaModal } from './baixa-modal';
import { LancamentoModal } from './lancamento-modal';
import { FiltroPeriodo, Indicador, Selo, Vazio, baixarCsv, periodoPreset, type Periodo } from './ui-financeiro';
import { usePode } from '@/hooks/use-permissoes';
import { ehAnalitica, ordenarPlano } from '@/lib/plano-contas';

const CAMPOS_DATA = [
  { valor: 'data_vencimento', rotulo: 'Vencimento' },
  { valor: 'competencia', rotulo: 'Competência' },
  { valor: 'data_emissao', rotulo: 'Emissão' },
] as const;

const STATUS_FILTRO: { valor: StatusLancamento | ''; rotulo: string }[] = [
  { valor: '', rotulo: 'Todas as situações' },
  { valor: 'pendente', rotulo: 'Pendente' },
  { valor: 'atrasado', rotulo: 'Em atraso' },
  { valor: 'pago_parcial', rotulo: 'Pago parcial' },
  { valor: 'quitado', rotulo: 'Quitado' },
  { valor: 'cancelado', rotulo: 'Cancelado' },
];

/**
 * Contas a pagar / a receber.
 * A tela abre com o painel do periodo (previsto x realizado x inadimplencia),
 * a carteira filtrada e o rodape somando o que esta em tela.
 */
export function ContasFinanceiro({
  lancamentoId, onLimparLancamento,
}: {
  /** Link de um titulo so (historico do fornecedor): a carteira mostra so ele. */
  lancamentoId?: string | null;
  onLimparLancamento?: () => void;
} = {}) {
  // Permissoes do perfil (0111): os botoes so aparecem para quem tem a acao.
  const pode = {
    criar: usePode('financeiro.criar'), editar: usePode('financeiro.editar'),
    baixar: usePode('financeiro.baixar'), cancelar: usePode('financeiro.cancelar'),
    excluir: usePode('financeiro.excluir'), estornar: usePode('financeiro.estornar'),
    exportar: usePode('financeiro.exportar'),
  };
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoPreset('mes'));
  const [tipo, setTipo] = useState<TipoMovimentacao | ''>('');
  const [status, setStatus] = useState<StatusLancamento | ''>('');
  const [campoData, setCampoData] = useState<FiltroLancamentos['campoData']>('data_vencimento');
  const [categoriaId, setCategoriaId] = useState('');
  const [centroCustoId, setCentroCustoId] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');
  const [busca, setBusca] = useState('');

  const [editando, setEditando] = useState<Partial<LancamentoComRel> | null>(null);
  const [baixando, setBaixando] = useState<LancamentoComRel | null>(null);
  const [pagamentos, setPagamentos] = useState<LancamentoComRel | null>(null);
  const [excluindo, setExcluindo] = useState<LancamentoComRel | null>(null);

  const filtro: FiltroLancamentos = {
    tipo: tipo || undefined,
    status: status || undefined,
    inicio: periodo.inicio,
    fim: periodo.fim,
    campoData,
    categoriaId: categoriaId || undefined,
    centroCustoId: centroCustoId || undefined,
    fornecedorId: fornecedorId || undefined,
    id: lancamentoId || undefined,
  };

  const { data: lancamentos, isLoading } = useLancamentos(filtro);
  const { data: resumo, isLoading: carregandoResumo } = useFinanceiroResumo(periodo);
  const { data: categorias } = usePlanoContas();
  const { data: centros } = useCentrosCusto();
  const cancelar = useCancelarLancamento();

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return lancamentos ?? [];
    return (lancamentos ?? []).filter((l) =>
      [l.descricao, l.numero_documento, l.fornecedores?.razao_social, l.fornecedores?.nome_fantasia, l.evento_terceiros?.nome, l.clientes?.nome_razao_social, l.centros_custo?.nome]
        .filter(Boolean)
        .some((campo) => String(campo).toLowerCase().includes(termo)),
    );
  }, [lancamentos, busca]);

  const totais = useMemo(() => {
    const receber = lista.filter((l) => l.tipo === 'RECEITA' && l.status !== 'cancelado');
    const pagar = lista.filter((l) => l.tipo === 'DESPESA' && l.status !== 'cancelado');
    return {
      receber: somarMoeda(...receber.map((l) => Number(l.valor_original))),
      pagar: somarMoeda(...pagar.map((l) => Number(l.valor_original))),
      saldoAberto: somarMoeda(
        ...receber.map(saldoTitulo),
        ...pagar.map((l) => -saldoTitulo(l)),
      ),
    };
  }, [lista]);

  const inadimplencia =
    resumo && resumo.aberto_receber > 0
      ? (Number(resumo.vencido_receber) / Number(resumo.aberto_receber)) * 100
      : 0;

  function exportar() {
    baixarCsv(`contas-${periodo.inicio}-a-${periodo.fim}.csv`, [
      ['Tipo', 'Documento', 'Descrição', 'Favorecido/Pagador', 'Categoria', 'Centro de custo',
       'Emissão', 'Vencimento', 'Competência', 'Valor', 'Pago', 'Saldo', 'Situação'],
      ...lista.map((l) => [
        l.tipo === 'RECEITA' ? 'A Receber' : 'A Pagar',
        l.numero_documento ?? '',
        l.descricao,
        favorecidoTexto(l),
        l.categorias_dre ? `${l.categorias_dre.codigo_estruturado} ${l.categorias_dre.nome}` : '',
        l.centros_custo?.nome ?? '',
        l.data_emissao, l.data_vencimento, l.competencia,
        Number(l.valor_original), Number(l.valor_pago ?? 0), saldoTitulo(l),
        l.status,
      ]),
    ]);
  }

  return (
    <div className="space-y-5">
      {/* Painel do periodo */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          titulo="A receber no período" valor={resumo?.previsto_receber} icon={ArrowUpCircle} tom="receita"
          carregando={carregandoResumo}
          detalhe={`Recebido ${formatCurrency(resumo?.recebido)} · ${formatCurrency(resumo?.aberto_receber)} em aberto na carteira`}
        />
        <Indicador
          titulo="A pagar no período" valor={resumo?.previsto_pagar} icon={ArrowDownCircle} tom="despesa"
          carregando={carregandoResumo}
          detalhe={`Pago ${formatCurrency(resumo?.pago)} · ${formatCurrency(resumo?.aberto_pagar)} em aberto na carteira`}
        />
        <Indicador
          titulo="Resultado de caixa" valor={resumo?.saldo_realizado} icon={Scale}
          tom={(resumo?.saldo_realizado ?? 0) >= 0 ? 'receita' : 'despesa'}
          carregando={carregandoResumo}
          detalhe="Entradas menos saídas efetivamente liquidadas no período"
        />
        <Indicador
          titulo="Inadimplencia" valor={resumo?.vencido_receber} icon={AlertTriangle} tom="alerta"
          carregando={carregandoResumo}
          detalhe={`${resumo?.titulos_vencidos ?? 0} título(s) vencido(s) · ${inadimplencia.toFixed(1)}% da carteira a receber · ${formatCurrency(resumo?.vence_em_7_dias)} vence em 7 dias`}
        />
      </div>

      {/* Filtros */}
      <FiltroPeriodo periodo={periodo} onChange={setPeriodo}>
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Filtrar pela data de</span>
          <Select className="mt-1 w-40 py-1.5" value={campoData} onChange={(e) => setCampoData(e.target.value as FiltroLancamentos['campoData'])}>
            {CAMPOS_DATA.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
          </Select>
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {pode.exportar && (
            <Button variant="secondary" onClick={exportar} disabled={lista.length === 0}>
              <Download className="h-4 w-4" /> Exportar
            </Button>
          )}
          {pode.criar && (
            <Button onClick={() => setEditando({ tipo: 'DESPESA' })}>
              <Plus className="h-4 w-4" /> Novo lançamento
            </Button>
          )}
        </div>
      </FiltroPeriodo>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {([
            { v: '', r: 'Todos' },
            { v: 'RECEITA', r: 'A Receber' },
            { v: 'DESPESA', r: 'A Pagar' },
          ] as const).map((t) => (
            <button
              key={t.v}
              onClick={() => setTipo(t.v)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                tipo === t.v ? 'bg-superficie text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.r}
            </button>
          ))}
        </div>
        <Select className="mt-0 w-44 py-1.5" value={status} onChange={(e) => setStatus(e.target.value as StatusLancamento | '')}>
          {STATUS_FILTRO.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
        </Select>
        <Select className="mt-0 w-56 py-1.5" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
          <option value="">Todas as categorias</option>
          {ordenarPlano(categorias ?? []).filter(ehAnalitica).map((c) => <option key={c.id} value={c.id}>{c.codigo_estruturado} · {c.nome}</option>)}
        </Select>
        <Select className="mt-0 w-48 py-1.5" value={centroCustoId} onChange={(e) => setCentroCustoId(e.target.value)}>
          <option value="">Todos os centros de custo</option>
          {(centros ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Select>
        <div className="w-72">
          <SeletorFornecedor
            value={fornecedorId}
            onChange={(id) => { setFornecedorId(id); if (id) setTipo('DESPESA'); }}
            placeholder="Filtrar por fornecedor"
            permiteCadastrar={false}
          />
        </div>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar descrição, documento ou favorecido"
            className="w-72 rounded-lg border border-slate-300 py-1.5 pl-8 pr-3 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          />
        </div>
      </div>

      {lancamentoId && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-2.5 text-sm text-cyan-800">
          <span>
            Mostrando só o lançamento aberto pelo link
            {lista[0] ? <> — <strong>{lista[0].descricao}</strong></> : !isLoading && ' (não encontrado ou sem permissão)'}.
            Os filtros de período e situação não valem enquanto ele estiver aberto.
          </span>
          {onLimparLancamento && (
            <button onClick={onLimparLancamento} className="font-medium underline hover:text-cyan-900">Ver toda a carteira</button>
          )}
        </div>
      )}

      {/* Carteira */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-superficie shadow-[0_1px_2px_rgba(20,33,61,0.04)]">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2.5 font-semibold">Título</th>
              <th className="px-4 py-2.5 font-semibold">Favorecido / Pagador</th>
              <th className="px-4 py-2.5 font-semibold">Classificação</th>
              <th className="px-4 py-2.5 font-semibold">Vencimento</th>
              <th className="px-4 py-2.5 text-right font-semibold">Valor</th>
              <th className="px-4 py-2.5 text-right font-semibold">Saldo</th>
              <th className="px-4 py-2.5 font-semibold">Situação</th>
              <th className="px-4 py-2.5 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td colSpan={8} className="px-4 py-3"><div className="h-4 w-full animate-pulse rounded bg-slate-100" /></td>
                </tr>
              ))}

            {!isLoading && lista.map((l) => {
              const situacao = situacaoTitulo(l);
              const saldo = saldoTitulo(l);
              const atraso = diasAtraso(l.data_vencimento);
              const acoes = acoesDoTitulo(l, pode);
              return (
                <tr key={l.id} className="border-b border-slate-50 transition last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`h-6 w-1 shrink-0 rounded-full ${l.tipo === 'RECEITA' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                      <div>
                        <p className="font-medium text-slate-800">{l.descricao}</p>
                        <p className="text-[11px] text-slate-400">
                          {l.tipo === 'RECEITA' ? 'A receber' : 'A pagar'}
                          {l.numero_documento && ` · doc. ${l.numero_documento}`}
                          {l.parcela_total > 1 && ` · parcela ${l.parcela_numero}/${l.parcela_total}`}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {(() => {
                      const f = favorecido(l);
                      if (!f.nome && !f.detalhe) return <span className="text-slate-300">—</span>;
                      return (
                        <>
                          {f.nome || <span className="text-amber-600">sem favorecido</span>}
                          {f.detalhe && <span className="block text-[11px] text-slate-400">{f.detalhe}</span>}
                        </>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-2.5">
                    {l.categorias_dre ? (
                      <p className="text-xs text-slate-600">
                        <span className="font-mono text-slate-400">{l.categorias_dre.codigo_estruturado}</span> {l.categorias_dre.nome}
                      </p>
                    ) : (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">Sem categoria</span>
                    )}
                    {l.centros_custo?.nome && <p className="text-[11px] text-slate-400">{l.centros_custo.nome}</p>}
                  </td>
                  <td className="tnum px-4 py-2.5 text-slate-600">
                    {formatDate(l.data_vencimento)}
                    {l.competencia !== l.data_vencimento && (
                      <p className="text-[11px] text-slate-400">comp. {formatDate(l.competencia)}</p>
                    )}
                  </td>
                  <td className="tnum px-4 py-2.5 text-right font-medium text-slate-800">{formatCurrency(l.valor_original)}</td>
                  <td className={`tnum px-4 py-2.5 text-right font-semibold ${saldo > 0 ? 'text-slate-800' : 'text-emerald-600'}`}>
                    {formatCurrency(saldo)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Selo situacao={situacao} detalhe={situacao === 'atrasado' ? `${atraso}d` : undefined} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {acoes.baixar && (
                        <IconeAcao
                          titulo={`Registrar baixa (saldo ${formatCurrency(saldo)})`}
                          onClick={() => setBaixando(l)}
                          classe="text-emerald-700 hover:bg-emerald-50"
                        >
                          <HandCoins className="h-3.5 w-3.5" />
                        </IconeAcao>
                      )}
                      {acoes.pagamentos && (
                        <IconeAcao
                          titulo={acoes.estornar ? 'Pagamentos registrados / estornar' : 'Pagamentos registrados'}
                          onClick={() => setPagamentos(l)}
                          classe="text-slate-600 hover:bg-slate-100"
                        >
                          <History className="h-3.5 w-3.5" />
                        </IconeAcao>
                      )}
                      {acoes.editar && (
                        <IconeAcao titulo="Editar" onClick={() => setEditando(l)} classe="text-slate-600 hover:bg-slate-100">
                          <Pencil className="h-3.5 w-3.5" />
                        </IconeAcao>
                      )}
                      {acoes.cancelar && (
                        <IconeAcao
                          titulo="Cancelar título (fica na lista como cancelado)"
                          classe="text-amber-700 hover:bg-amber-50"
                          onClick={() => {
                            if (!confirm(`Cancelar o título "${l.descricao}"? Ele deixa de contar no DRE e no fluxo de caixa.`)) return;
                            cancelar.mutate(l.id, {
                              onSuccess: () => toast.success('Título cancelado'),
                              onError: (err) => toast.error(err.message),
                            });
                          }}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </IconeAcao>
                      )}
                      {acoes.excluir && (
                        <IconeAcao titulo="Excluir lançamento" onClick={() => setExcluindo(l)} classe="text-rose-600 hover:bg-rose-50">
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconeAcao>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {!isLoading && lista.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <Vazio
                    icon={busca ? Search : FileSpreadsheet}
                    titulo={busca ? 'Nenhum título para essa busca' : 'Nenhum título neste período'}
                    descricao={
                      busca
                        ? 'Revise o termo pesquisado ou limpe os filtros de situação, categoria, centro de custo e fornecedor.'
                        : 'Amplie o período nos atalhos acima ou registre a primeira conta a pagar/receber deste mês.'
                    }
                    acao={
                      !busca && pode.criar && (
                        <Button onClick={() => setEditando({ tipo: 'DESPESA' })}>
                          <Plus className="h-4 w-4" /> Novo lançamento
                        </Button>
                      )
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>

          {lista.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50/70 text-xs">
                <td colSpan={4} className="px-4 py-3 font-semibold text-slate-600">
                  <Wallet className="mr-1.5 inline h-3.5 w-3.5 text-slate-400" />
                  {lista.length} título(s) em tela
                </td>
                <td className="tnum px-4 py-3 text-right">
                  <span className="block text-emerald-700">+{formatCurrency(totais.receber)}</span>
                  <span className="block text-rose-700">-{formatCurrency(totais.pagar)}</span>
                </td>
                <td className={`tnum px-4 py-3 text-right font-bold ${totais.saldoAberto >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {formatCurrency(totais.saldoAberto)}
                </td>
                <td colSpan={2} className="px-4 py-3 text-right text-slate-400">saldo em aberto</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {editando && (
        <LancamentoModal
          aberto
          inicial={editando}
          onClose={() => setEditando(null)}
        />
      )}
      {baixando && <BaixaModal lancamento={baixando} onClose={() => setBaixando(null)} />}
      {pagamentos && <PagamentosModal lancamento={pagamentos} onClose={() => setPagamentos(null)} />}
      {excluindo && <ExcluirLancamentoModal lancamento={excluindo} onClose={() => setExcluindo(null)} />}
    </div>
  );
}

/** Favorecido/pagador (0103/0156): quem recebe e, na conta de evento, o numero do evento. */
function favorecido(l: LancamentoComRel) {
  return rotuloFavorecido({
    tipo: l.tipo,
    fornecedor: l.fornecedores?.razao_social ? rotuloFornecedor(l.fornecedores) : null,
    terceiro: l.evento_terceiros ?? null,
    associado: l.clientes?.nome_razao_social ?? null,
    evento: l.eventos_sinistro?.numero_protocolo ?? null,
  });
}

function favorecidoTexto(l: LancamentoComRel): string {
  const f = favorecido(l);
  return [f.nome, f.detalhe].filter(Boolean).join(' — ');
}

function IconeAcao({
  titulo, onClick, classe, children,
}: { titulo: string; onClick: () => void; classe: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      onClick={onClick}
      className={`grid h-7 w-7 place-items-center rounded-lg border border-transparent transition ${classe}`}
    >
      {children}
    </button>
  );
}
