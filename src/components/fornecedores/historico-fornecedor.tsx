'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownCircle, ArrowUpCircle, AlertTriangle, ChevronRight, LifeBuoy, ShieldAlert, Users, Wallet } from 'lucide-react';
import { useHistoricoFornecedor, type LancamentoHistoricoFornecedor } from '@/hooks/use-financeiro';
import { origemDoLancamento, resumoHistoricoFornecedor, type TipoOrigemLancamento } from '@/lib/origem-lancamento';
import { diasAtraso, saldoTitulo, situacaoTitulo } from '@/lib/financeiro';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Indicador, Selo, Vazio } from '@/components/financeiro/ui-financeiro';
import { SeletorFornecedor } from './seletor-fornecedor';

type Filtro = 'todos' | 'aberto' | 'pago' | 'cancelado';

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'aberto', rotulo: 'Em aberto' },
  { id: 'pago', rotulo: 'Com pagamento' },
  { id: 'cancelado', rotulo: 'Cancelados' },
];

const SELO_ORIGEM: Record<TipoOrigemLancamento, { classe: string; icon: React.ElementType }> = {
  ASSISTENCIA: { classe: 'bg-amber-50 text-amber-700', icon: LifeBuoy },
  EVENTO: { classe: 'bg-rose-50 text-rose-700', icon: ShieldAlert },
  TERCEIRO: { classe: 'bg-rose-50 text-rose-700', icon: Users },
  FINANCEIRO: { classe: 'bg-slate-100 text-slate-600', icon: Wallet },
};

const FORMA: Record<string, string> = {
  PIX: 'PIX', BOLETO: 'Boleto', CARTAO: 'Cartão', TRANSFERENCIA: 'Transferência', DINHEIRO: 'Dinheiro',
};

/**
 * Historico financeiro de UM fornecedor: titulos a pagar e a receber, com os
 * pagamentos de cada um. Clicar numa linha leva a origem do lancamento — a OS
 * da 24h, o evento (ou o terceiro) ou o proprio titulo no Financeiro.
 */
export function HistoricoFornecedor({
  fornecedorId, onFornecedor,
}: { fornecedorId: string; onFornecedor: (id: string) => void }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const { data, isLoading, error } = useHistoricoFornecedor(fornecedorId || null);
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  const resumo = useMemo(() => resumoHistoricoFornecedor(data ?? [], hoje), [data, hoje]);
  const lista = useMemo(() => (data ?? []).filter((l) => {
    if (filtro === 'cancelado') return l.status === 'cancelado';
    if (filtro === 'aberto') return l.status !== 'cancelado' && saldoTitulo(l) > 0;
    if (filtro === 'pago') return (l.baixas_financeiras ?? []).length > 0;
    return true;
  }), [data, filtro]);

  return (
    <div className="space-y-4">
      <div className="max-w-md">
        <SeletorFornecedor
          value={fornecedorId}
          onChange={(id) => onFornecedor(id)}
          placeholder="Escolha o fornecedor (nome, razão social ou CNPJ)"
          permiteCadastrar={false}
        />
      </div>

      {!fornecedorId && (
        <Vazio icon={Wallet} titulo="Escolha um fornecedor"
          descricao="O histórico mostra todos os títulos a pagar e a receber dele, com os pagamentos. Clique numa linha para abrir a origem do lançamento." />
      )}

      {fornecedorId && error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Não foi possível ler o histórico: {(error as { message?: string }).message ?? String(error)}
        </p>
      )}

      {fornecedorId && !error && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador titulo="Pago ao fornecedor" valor={resumo.pago} icon={ArrowDownCircle} tom="despesa" carregando={isLoading}
              detalhe={`${resumo.titulos} título(s) no histórico, fora os cancelados`} />
            <Indicador titulo="A pagar em aberto" valor={resumo.aPagar} icon={Wallet} carregando={isLoading}
              detalhe="Saldo dos títulos a pagar ainda não quitados" />
            <Indicador titulo="Vencido" valor={resumo.vencido} icon={AlertTriangle} tom="alerta" carregando={isLoading}
              detalhe="Saldo em aberto com vencimento já passado" />
            <Indicador titulo="Recebido do fornecedor" valor={resumo.recebido} icon={ArrowUpCircle} tom="receita" carregando={isLoading}
              detalhe={`${formatCurrency(resumo.aReceber)} a receber em aberto`} />
          </div>

          <div className="flex w-fit gap-1 rounded-lg bg-slate-100 p-1">
            {FILTROS.map((f) => (
              <button key={f.id} onClick={() => setFiltro(f.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  filtro === f.id ? 'bg-superficie text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                {f.rotulo}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-superficie">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5 font-semibold">Título</th>
                  <th className="px-4 py-2.5 font-semibold">Origem</th>
                  <th className="px-4 py-2.5 font-semibold">Vencimento</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Valor</th>
                  <th className="px-4 py-2.5 font-semibold">Pagamentos / recebimentos</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Saldo</th>
                  <th className="px-4 py-2.5 font-semibold">Situação</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">Carregando...</td></tr>
                )}
                {!isLoading && lista.map((l) => (
                  <LinhaHistorico key={l.id} l={l} onAbrir={(href) => router.push(href)} />
                ))}
                {!isLoading && lista.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                    {(data ?? []).length === 0 ? 'Nenhum lançamento para este fornecedor.' : 'Nenhum título neste filtro.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          {(data ?? []).length >= 1000 && (
            <p className="text-xs text-amber-700">Mostrando os 1.000 títulos mais recentes deste fornecedor.</p>
          )}
        </>
      )}
    </div>
  );
}

function LinhaHistorico({ l, onAbrir }: { l: LancamentoHistoricoFornecedor; onAbrir: (href: string) => void }) {
  const origem = origemDoLancamento(l);
  const selo = SELO_ORIGEM[origem.tipo];
  const situacao = situacaoTitulo(l);
  const saldo = saldoTitulo(l);
  const baixas = [...(l.baixas_financeiras ?? [])].sort((a, b) => b.data_pagamento.localeCompare(a.data_pagamento));
  const abrir = () => onAbrir(origem.href);

  return (
    <tr
      role="link" tabIndex={0}
      title={`Abrir a origem: ${origem.rotulo}${origem.referencia ? ` ${origem.referencia}` : ''}`}
      onClick={abrir}
      onKeyDown={(e) => { if (e.key === 'Enter') abrir(); }}
      className="cursor-pointer border-b border-slate-100 align-top transition last:border-0 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
    >
      <td className="px-4 py-2.5">
        <div className="flex items-start gap-2">
          <span className={`mt-0.5 h-6 w-1 shrink-0 rounded-full ${l.tipo === 'RECEITA' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          <div>
            <p className="font-medium text-slate-800">{l.descricao}</p>
            <p className="text-[11px] text-slate-400">
              {l.tipo === 'RECEITA' ? 'A receber' : 'A pagar'}
              {l.numero_documento && ` · doc. ${l.numero_documento}`}
              {l.parcela_total > 1 && ` · parcela ${l.parcela_numero}/${l.parcela_total}`}
              {l.categorias_dre && ` · ${l.categorias_dre.codigo_estruturado} ${l.categorias_dre.nome}`}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-2.5">
        <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${selo.classe}`}>
          <selo.icon className="h-3 w-3" /> {origem.rotulo}
        </span>
        {origem.referencia && <span className="block font-mono text-[11px] text-slate-400">{origem.referencia}</span>}
      </td>
      <td className="tnum px-4 py-2.5 text-slate-600">{formatDate(l.data_vencimento)}</td>
      <td className="tnum px-4 py-2.5 text-right font-medium text-slate-800">{formatCurrency(l.valor_original)}</td>
      <td className="px-4 py-2.5">
        {baixas.length === 0 ? <span className="text-slate-300">—</span> : (
          <ul className="space-y-0.5 text-xs text-slate-600">
            {baixas.map((b) => (
              <li key={b.id} className="tnum">
                {formatDate(b.data_pagamento)} · <span className="font-medium">{formatCurrency(b.valor_liquido ?? b.valor_pago)}</span>
                {(b.contas_bancarias?.nome || b.forma_pagamento) && (
                  <span className="text-slate-400"> · {b.contas_bancarias?.nome ?? FORMA[b.forma_pagamento ?? ''] ?? b.forma_pagamento}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className={`tnum px-4 py-2.5 text-right font-semibold ${saldo > 0 ? 'text-slate-800' : 'text-emerald-600'}`}>
        {formatCurrency(saldo)}
      </td>
      <td className="px-4 py-2.5">
        <Selo situacao={situacao} detalhe={situacao === 'atrasado' ? `${diasAtraso(l.data_vencimento)}d` : undefined} />
      </td>
      <td className="px-2 py-2.5 text-slate-400"><ChevronRight className="h-4 w-4" /></td>
    </tr>
  );
}
