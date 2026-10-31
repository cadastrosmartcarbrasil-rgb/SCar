'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Eraser, FileSpreadsheet, Loader2, Minus, Plus, RefreshCw, SquarePen, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Paginador } from '@/components/ui/paginador';
import { baixarCsv } from '@/components/financeiro/ui-financeiro';
import {
  useAcionamentosConsulta,
  useExcluirAcionamento,
  useExportarAcionamentos,
  type AcionamentoConsulta,
} from '@/hooks/use-assistencia';
import { useEquipeAtiva, usePerfilAtual } from '@/hooks/use-config';
import { usePode } from '@/hooks/use-permissoes';
import {
  STATUS_ACIONAMENTO_LABEL,
  podeExcluirAcionamento,
  rotuloAgendamento,
  rotuloMotivoNegativa,
} from '@/lib/assistencia';
import {
  CABECALHO_CSV,
  FILTROS_VAZIOS,
  contarFiltros,
  indiceDaCorDoAtendente,
  formatarDataHora,
  linhaCsv,
  type FiltrosConsulta,
} from '@/lib/acionamentos-consulta';
import { cn, formatCurrency } from '@/lib/utils';
import type { StatusAcionamento } from '@/lib/database.types';
import { ModalExcluirAcionamento, OrdemServico } from './painel-acionamento';

// Consultar acionamentos 24h — substitui a tela de "Atendimento > Normal >
// Consultar" do sistema antigo. Mesmo desenho (filtro embaixo de cada coluna,
// "+" para abrir o detalhe, selo de situacao, chip do atendente), na identidade
// do Scar. O filtro e a pagina sao feitos NO BANCO (useAcionamentosConsulta).

const SITUACOES = Object.keys(STATUS_ACIONAMENTO_LABEL) as StatusAcionamento[];

// As classes de cor ficam AQUI (e nao em src/lib): o Tailwind do projeto so
// varre src/components, src/app e src/pages. Record<StatusAcionamento, ...>
// obriga o compilador a exigir um selo para toda situacao nova. Texto branco
// exige fundo que NAO clareia no tema escuro: por isso `acao` e `zinc`, e nao
// `brand`/`slate` (essas escalas invertem).
const SELO_SITUACAO: Record<StatusAcionamento, string> = {
  ABERTO: 'bg-cyan-700 text-white',
  EM_COTACAO: 'bg-amber-700 text-white',
  AUTORIZADO: 'bg-acao text-white',
  EM_ATENDIMENTO: 'bg-sky-700 text-white',
  CONCLUIDO: 'bg-emerald-700 text-white',
  CANCELADO: 'bg-zinc-600 text-white',
  NEGADO: 'bg-rose-700 text-white',
};

// Chip do atendente: cada pessoa tem sempre a mesma cor (hash do id).
const CORES_ATENDENTE = [
  'border-sky-500 bg-sky-100 text-sky-950 dark:bg-sky-500/20 dark:text-sky-100',
  'border-pink-500 bg-pink-100 text-pink-950 dark:bg-pink-500/20 dark:text-pink-100',
  'border-violet-500 bg-violet-100 text-violet-950 dark:bg-violet-500/20 dark:text-violet-100',
  'border-emerald-500 bg-emerald-100 text-emerald-950 dark:bg-emerald-500/20 dark:text-emerald-100',
  'border-amber-500 bg-amber-100 text-amber-950 dark:bg-amber-500/20 dark:text-amber-100',
  'border-teal-500 bg-teal-100 text-teal-950 dark:bg-teal-500/20 dark:text-teal-100',
];
const COR_SEM_ATENDENTE = 'border-slate-300 bg-slate-100 text-slate-600';
const corDoAtendente = (id: string | null) =>
  CORES_ATENDENTE[indiceDaCorDoAtendente(id, CORES_ATENDENTE.length)] ?? COR_SEM_ATENDENTE;

/** Espera o usuario parar de digitar antes de consultar o banco. */
function useAtraso<T>(valor: T, ms = 300): T {
  const [atual, setAtual] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setAtual(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return atual;
}

const campoFiltro =
  'h-8 w-full rounded-md border border-slate-300 bg-superficie px-2 text-xs text-slate-700 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30';

const botaoIcone =
  'grid h-8 w-8 place-items-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500';

function FiltroTexto({ rotulo, valor, onChange }: { rotulo: string; valor: string; onChange: (v: string) => void }) {
  return (
    <input
      type="search"
      aria-label={`Filtrar por ${rotulo}`}
      placeholder={`Filtrar ${rotulo.toLowerCase()}...`}
      className={campoFiltro}
      value={valor}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Marca({ children, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-brand-700" {...props} />
      {children}
    </label>
  );
}

export function AcionamentosLista({ onNovo }: { onNovo?: () => void }) {
  const [filtros, setFiltros] = useState<FiltrosConsulta>(FILTROS_VAZIOS);
  const [pagina, setPagina] = useState(0);
  const [aberto, setAberto] = useState<string | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [excluir, setExcluir] = useState<AcionamentoConsulta | null>(null);

  const aplicados = useAtraso(filtros);
  const { data: perfil } = usePerfilAtual();
  const { data: equipe } = useEquipeAtiva();
  const podeExcluir = usePode('assistencia.excluir');
  const exclusao = useExcluirAcionamento();
  const exportacao = useExportarAcionamentos();

  const ctx = { meuId: perfil?.id ?? null, equipe };
  const { data, isLoading, isFetching, isError, error, refetch } = useAcionamentosConsulta(aplicados, pagina, ctx);
  const linhas = data?.linhas ?? [];
  const total = data?.total ?? 0;
  // Falha ao atualizar com a lista ja na tela nao a apaga: o erro so aparece sem dados.
  const falhou = isError && !data;
  const nomes = useMemo(() => new Map((equipe ?? []).map((m) => [m.id, m.nome])), [equipe]);
  const nomeAtendente = (id: string | null) => (id ? nomes.get(id) ?? null : null);
  const ligados = contarFiltros(filtros);

  // Mudar qualquer filtro volta para a primeira pagina.
  const mudar = (parcial: Partial<FiltrosConsulta>) => {
    setFiltros((f) => ({ ...f, ...parcial }));
    setPagina(0);
  };
  const limpar = () => {
    setFiltros(FILTROS_VAZIOS);
    setPagina(0);
  };
  const alternar = (id: string) =>
    setExpandidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  if (aberto) return <OrdemServico acionamentoId={aberto} onVoltar={() => setAberto(null)} />;

  const exportar = () =>
    exportacao.mutate(
      { filtros: aplicados, ctx },
      {
        onSuccess: (todas) => {
          if (todas.length === 0) return toast.info('Nenhum acionamento para exportar com esses filtros');
          const hoje = new Date().toISOString().slice(0, 10);
          baixarCsv(`acionamentos-24h-${hoje}.csv`, [
            CABECALHO_CSV,
            ...todas.map((a) =>
              linhaCsv(a, nomeAtendente(a.aberto_por) ?? '', STATUS_ACIONAMENTO_LABEL[a.status].label),
            ),
          ]);
          toast.success(`${todas.length.toLocaleString('pt-BR')} acionamentos exportados`);
        },
        onError: (e) => toast.error(e.message),
      },
    );

  return (
    <div className="space-y-3">
      {/* Barra de acoes: novo + recortes rapidos + ferramentas */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        {onNovo ? (
          <Button onClick={onNovo}>
            <Plus className="h-4 w-4" /> Novo acionamento
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Marca checked={filtros.meus} onChange={(e) => mudar({ meus: e.target.checked })}>
            Meus acionamentos
          </Marca>
          <Marca checked={filtros.agendados} onChange={(e) => mudar({ agendados: e.target.checked })}>
            Agendados
          </Marca>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={limpar}
              disabled={ligados === 0}
              aria-label="Limpar filtros"
              title="Limpar filtros"
              className={cn(botaoIcone, 'bg-acao text-white hover:bg-acao-escura disabled:cursor-not-allowed disabled:opacity-40')}
            >
              <Eraser className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={exportar}
              disabled={exportacao.isPending}
              aria-label="Exportar para planilha"
              title="Exportar o resultado para planilha (CSV)"
              className={cn(botaoIcone, 'bg-acao text-white hover:bg-acao-escura disabled:cursor-wait disabled:opacity-60')}
            >
              {exportacao.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              aria-label="Atualizar a lista"
              title="Atualizar a lista"
              className={cn(botaoIcone, 'bg-acao text-white hover:bg-acao-escura')}
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-superficie">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="bg-superficie-alta">
              <tr className="text-left text-[0.8125rem] font-semibold text-slate-600">
                <th scope="col" className="w-10 px-2 pb-1 pt-3"><span className="sr-only">Detalhes</span></th>
                <th scope="col" className="px-2 pb-1 pt-3">Placa</th>
                <th scope="col" className="px-2 pb-1 pt-3">Beneficiário</th>
                <th scope="col" className="px-2 pb-1 pt-3">Serviço</th>
                <th scope="col" className="px-2 pb-1 pt-3">Protocolo</th>
                <th scope="col" className="px-2 pb-1 pt-3">Data/Hora</th>
                <th scope="col" className="px-2 pb-1 pt-3">Regional</th>
                <th scope="col" className="px-2 pb-1 pt-3">Atendente</th>
                <th scope="col" className="px-2 pb-1 pt-3">Situação</th>
                <th scope="col" className="px-2 pb-1 pt-3 text-right">Ações</th>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="px-2 pb-2.5" />
                <td className="w-32 px-2 pb-2.5">
                  <FiltroTexto rotulo="Placa" valor={filtros.placa} onChange={(v) => mudar({ placa: v })} />
                </td>
                <td className="px-2 pb-2.5">
                  <FiltroTexto rotulo="Beneficiário" valor={filtros.beneficiario} onChange={(v) => mudar({ beneficiario: v })} />
                </td>
                <td className="px-2 pb-2.5">
                  <FiltroTexto rotulo="Serviço" valor={filtros.servico} onChange={(v) => mudar({ servico: v })} />
                </td>
                <td className="w-36 px-2 pb-2.5">
                  <FiltroTexto rotulo="Protocolo" valor={filtros.protocolo} onChange={(v) => mudar({ protocolo: v })} />
                </td>
                <td className="w-40 px-2 pb-2.5">
                  <input
                    type="date"
                    aria-label="Filtrar por data"
                    className={campoFiltro}
                    value={filtros.dia}
                    onChange={(e) => mudar({ dia: e.target.value })}
                  />
                </td>
                <td className="w-36 px-2 pb-2.5">
                  <FiltroTexto rotulo="Regional" valor={filtros.regional} onChange={(v) => mudar({ regional: v })} />
                </td>
                <td className="w-40 px-2 pb-2.5">
                  <FiltroTexto rotulo="Atendente" valor={filtros.atendente} onChange={(v) => mudar({ atendente: v })} />
                </td>
                <td className="w-48 px-2 pb-2.5">
                  <select
                    aria-label="Filtrar por situação"
                    className={campoFiltro}
                    value={filtros.status}
                    onChange={(e) => mudar({ status: e.target.value as StatusAcionamento | '' })}
                  >
                    <option value="">Todas</option>
                    {SITUACOES.map((s) => (
                      <option key={s} value={s}>{STATUS_ACIONAMENTO_LABEL[s].label}</option>
                    ))}
                  </select>
                </td>
                <td className="w-24 px-2 pb-2.5" />
              </tr>
            </thead>

            <tbody className={cn(isFetching && !isLoading && 'opacity-60 transition-opacity')}>
              {isLoading && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-500">Carregando acionamentos...</td></tr>
              )}
              {falhou && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center">
                    <p className="text-rose-700">Não foi possível carregar a lista: {(error as Error)?.message ?? 'erro desconhecido'}.</p>
                    <Button variant="secondary" className="mt-3" onClick={() => refetch()}>Tentar de novo</Button>
                  </td>
                </tr>
              )}
              {!isLoading && !falhou && linhas.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                    {ligados > 0 ? (
                      <>
                        Nenhum acionamento com esses filtros.
                        <Button variant="secondary" className="ml-3" onClick={limpar}>Limpar filtros</Button>
                      </>
                    ) : (
                      'Nenhum acionamento aberto ainda.'
                    )}
                  </td>
                </tr>
              )}

              {linhas.map((a) => {
                const expandido = expandidos.has(a.id);
                const atendente = nomeAtendente(a.aberto_por);
                return (
                  <Fragment key={a.id}>
                    <tr className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                      <td className="px-2 py-2.5">
                        <button
                          type="button"
                          onClick={() => alternar(a.id)}
                          aria-expanded={expandido}
                          aria-label={expandido ? `Recolher detalhes de ${a.protocolo ?? 'acionamento'}` : `Ver detalhes de ${a.protocolo ?? 'acionamento'}`}
                          className={cn(botaoIcone, 'h-6 w-6 border border-slate-300 text-brand-700 hover:bg-slate-100')}
                        >
                          {expandido ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                        </button>
                      </td>
                      <td className="px-2 py-2.5">
                        <span className="font-mono text-[0.8125rem] font-semibold text-slate-800">{a.veiculos?.placa ?? '-'}</span>
                        {a.veiculos?.modelo && (
                          <span className="block max-w-[8rem] truncate text-[0.6875rem] text-slate-500">{a.veiculos.modelo}</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 font-medium text-slate-800">{a.clientes?.nome_razao_social ?? '-'}</td>
                      <td className="px-2 py-2.5 text-slate-700">{a.servicos_assistencia?.descricao ?? '-'}</td>
                      <td className="px-2 py-2.5">
                        <button
                          type="button"
                          onClick={() => setAberto(a.id)}
                          title="Abrir a OS"
                          className="rounded font-mono text-[0.8125rem] text-brand-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                        >
                          {a.protocolo ?? '-'}
                        </button>
                        {a.codigo_os && <span className="block font-mono text-[0.6875rem] text-slate-500">{a.codigo_os}</span>}
                      </td>
                      <td className="tnum whitespace-nowrap px-2 py-2.5 text-slate-700">
                        {formatarDataHora(a.created_at)}
                        {a.agendado_para && (
                          <span className="block text-[0.6875rem] text-amber-700">agendado {rotuloAgendamento(a.agendado_para)}</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-slate-700">{a.regionais?.nome ?? '-'}</td>
                      <td className="px-2 py-2.5">
                        <span
                          className={cn(
                            'inline-block max-w-[11rem] truncate rounded border-l-4 px-2 py-1 align-middle text-xs font-semibold',
                            corDoAtendente(a.aberto_por),
                          )}
                          title={atendente ?? undefined}
                        >
                          {atendente ?? '—'}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        <span className={cn('inline-block rounded px-2.5 py-1 text-xs font-semibold uppercase tracking-wide', SELO_SITUACAO[a.status])}>
                          {STATUS_ACIONAMENTO_LABEL[a.status].label}
                        </span>
                        {a.liberado_por && (
                          <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[0.6875rem] text-amber-900">liberado</span>
                        )}
                        {a.status === 'NEGADO' && a.negado_motivo && (
                          <span className="mt-0.5 block text-[0.6875rem] text-rose-700">{rotuloMotivoNegativa(a.negado_motivo)}</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setAberto(a.id)}
                            aria-label={`Abrir a OS ${a.protocolo ?? ''}`}
                            title="Abrir a OS"
                            className={cn(botaoIcone, 'text-brand-700 hover:bg-slate-100')}
                          >
                            <SquarePen className="h-4 w-4" />
                          </button>
                          {podeExcluir && podeExcluirAcionamento(a) && (
                            <button
                              type="button"
                              onClick={() => setExcluir(a)}
                              aria-label={`Excluir o acionamento ${a.protocolo ?? ''}`}
                              title="Excluir (lançado por engano)"
                              className={cn(botaoIcone, 'text-rose-700 hover:bg-rose-50')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandido && (
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <td />
                        <td colSpan={9} className="px-2 py-3">
                          <Detalhe a={a} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100">
          <Paginador pagina={pagina} total={total} onPagina={setPagina} carregando={isFetching && !isLoading} />
        </div>
      </div>

      {excluir && (
        <ModalExcluirAcionamento
          protocolo={excluir.codigo_os ?? excluir.protocolo}
          concluida={excluir.status === 'CONCLUIDO'}
          temTitulo={!!excluir.lancamento_id}
          voucherEnviado={!!excluir.voucher_enviado_em}
          carregando={exclusao.isPending}
          onClose={() => setExcluir(null)}
          onConfirmar={(motivo) =>
            exclusao.mutate(
              { acionamento_id: excluir.id, motivo },
              {
                onSuccess: (r) => {
                  toast.success(
                    `Acionamento ${r.protocolo ?? ''} excluído${r.lancamento_excluido ? ' (o título em aberto no Contas a Pagar saiu junto)' : ''}`,
                  );
                  setExcluir(null);
                },
                onError: (e) => toast.error(e.message),
              },
            )
          }
        />
      )}
    </div>
  );
}

// Linha aberta pelo "+": o que a equipe precisa ver sem entrar na OS. Solicitante
// e trajeto aparecem sempre (e o que se confere ao telefone); o resto so quando
// existe — pedido negado nao tem prestador, voucher nem valor.
function Detalhe({ a }: { a: AcionamentoConsulta }) {
  const item = (rotulo: string, valor: React.ReactNode, sempre = false) =>
    valor || sempre ? (
      <div className="min-w-0">
        <dt className="text-xs text-slate-500">{rotulo}</dt>
        <dd className="text-sm text-slate-800">{valor || '-'}</dd>
      </div>
    ) : null;
  const km1 = (n: number | string) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const solicitante = [a.solicitante_nome, a.solicitante_telefone].filter(Boolean).join(' · ');
  const distancia =
    a.km_percorrido != null ? `${km1(a.km_percorrido)} km rodados`
    : a.distancia_km_calculada != null ? `${km1(a.distancia_km_calculada)} km (rota calculada)`
    : a.km_previsto != null ? `${km1(a.km_previsto)} km previstos`
    : '';
  const voucher = a.voucher_enviado_em
    ? formatarDataHora(a.voucher_enviado_em)
    : a.status === 'AUTORIZADO' || a.status === 'EM_ATENDIMENTO'
      ? 'ainda não enviado'
      : '';

  return (
    <div className="space-y-3">
      <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {item('Solicitante', solicitante, true)}
        {item('Origem (resgate)', a.endereco_origem, true)}
        {item('Destino', a.endereco_destino, true)}
        {item('Prestador', a.fornecedores?.razao_social)}
        {item('Valor da OS', Number(a.valor_total) > 0 ? formatCurrency(Number(a.valor_total)) : '')}
        {item('Distância', distancia)}
        {item('Voucher enviado ao prestador', voucher)}
        {item('Concluído em', a.concluido_em ? formatarDataHora(a.concluido_em) : '')}
      </dl>
      {a.observacoes && (
        <p className="text-sm text-slate-700">
          <span className="text-xs text-slate-500">Observações: </span>
          {a.observacoes}
        </p>
      )}
      {a.status === 'NEGADO' && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-900">
          <strong>Negado:</strong> {rotuloMotivoNegativa(a.negado_motivo)}
          {a.negado_observacao ? ` — ${a.negado_observacao}` : ''}
        </p>
      )}
      {a.status === 'CANCELADO' && a.cancelado_motivo && (
        <p className="rounded-lg bg-slate-100 p-2 text-xs text-slate-700">
          <strong>Cancelado:</strong> {a.cancelado_motivo}
        </p>
      )}
      {a.liberado_por && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          <strong>Liberado por superior:</strong> {a.liberacao_justificativa}
        </p>
      )}
    </div>
  );
}
