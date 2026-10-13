'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, BadgeCheck, CalendarClock, Clock, Download, Handshake, Loader2, PhoneOff, Search, Timer,
} from 'lucide-react';
import { Vazio, baixarCsv } from '@/components/financeiro/ui-financeiro';
import { ErroLeitura } from '@/components/integracao/erro-leitura';
import { FiltroUnidadeCobranca, SemAcessoCobranca, TileCobranca } from '@/components/cobrancas/ui-cobranca';
import { FichaCobranca } from '@/components/cobrancas/ficha-cobranca';
import { useCobrancaEscopo } from '@/hooks/use-cobranca-painel';
import {
  POR_PAGINA_FILA, useCobrancaFila, useCobrancaFilaResumo, useCobrancaPromessasResumo,
} from '@/hooks/use-cobranca-fila';
import {
  CANAIS, FAIXAS, ORDEM_SITUACOES, RESULTADOS, SITUACOES_FILA, somarDias, taxaCumprimento,
  type Canal, type Faixa, type Resultado, type SituacaoFila,
} from '@/lib/cobranca-fila';
import { formatCurrency, formatDate, formatPercent } from '@/lib/utils';
import type { CobrancaFilaLinha } from '@/lib/database.types';

const ICONE: Record<SituacaoFila, React.ElementType> = {
  promessa_quebrada: AlertTriangle,
  retorno_atrasado: Timer,
  retorno_hoje: CalendarClock,
  sem_contato: PhoneOff,
  aguardando: Clock,
  promessa_em_dia: Handshake,
};
const TOM: Record<SituacaoFila, 'rose' | 'amber' | 'cyan' | 'navy' | 'slate' | 'green'> = {
  promessa_quebrada: 'rose',
  retorno_atrasado: 'amber',
  retorno_hoje: 'cyan',
  sem_contato: 'navy',
  aguardando: 'slate',
  promessa_em_dia: 'green',
};
const SELO: Record<SituacaoFila, string> = {
  promessa_quebrada: 'bg-rose-50 text-rose-700',
  retorno_atrasado: 'bg-amber-50 text-amber-700',
  retorno_hoje: 'bg-cyan-50 text-cyan-700',
  sem_contato: 'bg-brand-50 text-brand-600',
  aguardando: 'bg-slate-100 text-slate-600',
  promessa_em_dia: 'bg-emerald-50 text-emerald-700',
};

const hoje = () => new Date().toLocaleDateString('sv-SE');

/**
 * A FILA DE COBRANCA (0098): quem cobrar agora, na ordem de prioridade —
 * promessa quebrada, retorno atrasado, retorno de hoje, sem contato. Clicar
 * no associado abre a ficha: divida, contato, promessa e historico.
 */
export function FilaCobranca() {
  const escopo = useCobrancaEscopo();
  const temAcesso = !!escopo.data && (escopo.data.global || escopo.data.regionais.length > 0);
  const [regionalId, setRegionalId] = useState<string | null>(null);
  const [situacao, setSituacao] = useState<SituacaoFila | null>(null);
  const [faixa, setFaixa] = useState<Faixa | null>(null);
  const [digitado, setDigitado] = useState('');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);
  const [aberta, setAberta] = useState<CobrancaFilaLinha | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBusca(digitado), 350);
    return () => clearTimeout(t);
  }, [digitado]);
  useEffect(() => setPagina(0), [regionalId, situacao, faixa, busca]);

  const fila = useCobrancaFila({ regionalId, situacao, faixa, busca, pagina });
  const resumo = useCobrancaFilaResumo(regionalId);
  const fim = hoje();
  const inicio = somarDias(fim, -29);
  const promessas = useCobrancaPromessasResumo(inicio, fim, regionalId);

  const porSituacao = useMemo(() => {
    const m = new Map<string, { clientes: number; valor: number }>();
    for (const r of resumo.data ?? []) if (r.grupo === 'situacao') m.set(r.chave ?? '', { clientes: Number(r.clientes), valor: Number(r.valor) });
    return m;
  }, [resumo.data]);
  const porFaixa = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of resumo.data ?? []) if (r.grupo === 'faixa') m.set(r.chave ?? '', Number(r.clientes));
    return m;
  }, [resumo.data]);

  if (escopo.isSuccess && !temAcesso) return <SemAcessoCobranca />;

  const linhas = fila.data ?? [];
  const total = Number(linhas[0]?.total_registros ?? 0);
  const totalValor = Number(linhas[0]?.total_valor ?? 0);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA_FILA));
  const p = promessas.data;
  const taxa = p ? taxaCumprimento(Number(p.cumpridas), Number(p.quebradas)) : null;

  const exportar = () => baixarCsv('fila-cobranca.csv', [
    ['Associado', 'CPF/CNPJ', 'Celular', 'Regional', 'Placas', 'Boletos', 'Valor vencido', 'Dias', 'Situacao',
      'Ultimo contato', 'Resultado', 'Retorno'],
    ...linhas.map((l) => [
      l.associado, l.cpf_cnpj, l.celular ?? l.telefone ?? '', l.regional, l.placas ?? '', Number(l.boletos_vencidos),
      Number(l.valor_vencido), l.dias_atraso, SITUACOES_FILA[l.situacao_fila as SituacaoFila]?.rotulo ?? l.situacao_fila,
      l.ultimo_contato_em ? formatDate(l.ultimo_contato_em) : '', l.ultimo_resultado ?? '',
      l.retorno_em ? formatDate(l.retorno_em) : '',
    ]),
  ]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
        {ORDEM_SITUACOES.map((s) => {
          const r = porSituacao.get(s);
          return (
            <TileCobranca key={s} titulo={SITUACOES_FILA[s].rotulo} icon={ICONE[s]} tom={TOM[s]}
              carregando={resumo.isLoading}
              valor={(r?.clientes ?? 0).toLocaleString('pt-BR')}
              detalhe={formatCurrency(r?.valor ?? 0)}
              rotuloAcao={situacao === s ? 'mostrar todos ✕' : 'filtrar →'}
              onAbrir={() => setSituacao(situacao === s ? null : s)} />
          );
        })}
        <TileCobranca titulo="Promessas cumpridas" icon={BadgeCheck} tom="green" carregando={promessas.isLoading}
          valor={taxa === null ? '—' : formatPercent(taxa)}
          detalhe={p ? `${p.cumpridas} de ${Number(p.cumpridas) + Number(p.quebradas)} vencidas · 30 dias` : 'últimos 30 dias'}
          rodape={p ? <span className="text-[11px] text-slate-500">{formatCurrency(Number(p.valor_recuperado))} recuperados</span> : null} />
      </div>
      <ErroLeitura q={resumo} />

      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-2xl border border-slate-200/80 bg-superficie p-4">
        <FiltroUnidadeCobranca valor={regionalId} onChange={setRegionalId} />
        <label className="block min-w-[170px]">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Situação</span>
          <select value={situacao ?? ''} onChange={(e) => setSituacao((e.target.value || null) as SituacaoFila | null)}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">
            <option value="">Todas</option>
            {ORDEM_SITUACOES.map((s) => <option key={s} value={s}>{SITUACOES_FILA[s].rotulo}</option>)}
          </select>
        </label>
        <label className="block min-w-[170px]">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Atraso</span>
          <select value={faixa ?? ''} onChange={(e) => setFaixa((e.target.value || null) as Faixa | null)}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">
            <option value="">Todas as faixas</option>
            {(Object.keys(FAIXAS) as Faixa[]).map((f) => (
              <option key={f} value={f}>{FAIXAS[f]} ({porFaixa.get(f) ?? 0})</option>
            ))}
          </select>
        </label>
        <label className="block min-w-[240px] flex-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Buscar</span>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
            <input value={digitado} onChange={(e) => setDigitado(e.target.value)} placeholder="nome, CPF, telefone ou placa"
              className="block w-full rounded-lg border border-slate-300 py-1.5 pl-8 pr-2.5 text-sm" />
          </div>
        </label>
        <button type="button" onClick={exportar} disabled={!linhas.length}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <Download className="h-3.5 w-3.5" /> CSV da página
        </button>
      </div>

      <ErroLeitura q={fila} />
      <div className="rounded-2xl border border-slate-200/80 bg-superficie">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 text-sm">
          <span className="text-slate-600">
            <b className="tnum text-slate-900">{total.toLocaleString('pt-BR')}</b> associados ·{' '}
            <b className="tnum text-slate-900">{formatCurrency(totalValor)}</b> vencidos
            {fila.isFetching && <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin text-slate-400" />}
          </span>
          <span className="text-xs text-slate-500">ordem: prioridade → maior atraso → maior valor</span>
        </div>
        {fila.isLoading ? (
          <div className="flex items-center gap-2 px-4 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> carregando…</div>
        ) : !linhas.length ? (
          <Vazio icon={BadgeCheck} titulo="Ninguém na fila" descricao="Nenhum associado ativo com boleto vencido neste filtro." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Associado</th>
                  <th className="px-3 py-2">Situação</th>
                  <th className="px-3 py-2 text-right">Vencido</th>
                  <th className="px-3 py-2 text-right">Atraso</th>
                  <th className="px-3 py-2">Último contato</th>
                  <th className="px-3 py-2">Retorno / promessa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {linhas.map((l) => {
                  const s = l.situacao_fila as SituacaoFila;
                  return (
                    <tr key={l.cliente_id} onClick={() => setAberta(l)} className="cursor-pointer hover:bg-cyan-50/40">
                      <td className="px-4 py-2">
                        <p className="font-medium text-slate-900">{l.associado}</p>
                        <p className="text-[11.5px] text-slate-500">{l.placas ?? '—'} · {l.regional}</p>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SELO[s] ?? ''}`}>
                          {SITUACOES_FILA[s]?.rotulo ?? s}
                        </span>
                      </td>
                      <td className="tnum px-3 py-2 text-right">
                        {formatCurrency(Number(l.valor_vencido))}
                        <p className="text-[11px] text-slate-400">{l.boletos_vencidos} boleto(s)</p>
                      </td>
                      <td className="tnum px-3 py-2 text-right">{l.dias_atraso}d</td>
                      <td className="px-3 py-2 text-[12px]">
                        {l.ultimo_contato_em ? (
                          <>
                            <p>{formatDate(l.ultimo_contato_em)} · {CANAIS[l.ultimo_canal as Canal] ?? l.ultimo_canal}</p>
                            <p className="text-slate-500">{RESULTADOS[l.ultimo_resultado as Resultado] ?? l.ultimo_resultado}{l.ultimo_usuario ? ` · ${l.ultimo_usuario}` : ''}</p>
                          </>
                        ) : <span className="text-slate-400">nunca</span>}
                      </td>
                      <td className="px-3 py-2 text-[12px]">
                        {l.acordo_id ? (
                          <p>{l.acordo_tipo === 'ACORDO' ? 'Acordo' : 'Promessa'}
                            {l.proxima_parcela_em && ` · ${formatDate(l.proxima_parcela_em)} ${formatCurrency(Number(l.proxima_parcela_valor))}`}</p>
                        ) : l.retorno_em ? (
                          <p>{formatDate(l.retorno_em)}{l.proxima_acao ? ` · ${l.proxima_acao}` : ''}</p>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {total > POR_PAGINA_FILA && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-2 text-xs">
            <button type="button" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}
              className="rounded-lg border border-slate-300 px-2.5 py-1 disabled:opacity-40">Anterior</button>
            <span className="tnum text-slate-600">página {pagina + 1} de {paginas}</span>
            <button type="button" disabled={pagina + 1 >= paginas} onClick={() => setPagina(pagina + 1)}
              className="rounded-lg border border-slate-300 px-2.5 py-1 disabled:opacity-40">Próxima</button>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">
        O pagamento feito no Mutual só aparece aqui depois da recaptura de INVOICE e da importação do
        histórico (Painel de Inadimplência). Até lá, uma promessa paga lá pode aparecer como não cumprida.
      </p>

      <FichaCobranca linha={aberta} onClose={() => setAberta(null)} />
    </div>
  );
}
