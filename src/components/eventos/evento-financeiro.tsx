'use client';

import { useState } from 'react';
import { HandCoins, History, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LancamentoModal } from '@/components/financeiro/lancamento-modal';
import { BaixaModal } from '@/components/financeiro/baixa-modal';
import { ExcluirLancamentoModal, PagamentosModal } from '@/components/financeiro/acoes-titulo';
import { Selo } from '@/components/financeiro/ui-financeiro';
import { usePerfilAtual, usePlanoContas } from '@/hooks/use-config';
import { usePode } from '@/hooks/use-permissoes';
import { useEvento } from '@/hooks/use-eventos';
import { useLancamentosEvento, useMovimentacoesLegadasEvento, useTerceirosEvento } from '@/hooks/use-terceiros';
import type { LancamentoComRel } from '@/hooks/use-financeiro';
import { resumoFinanceiroEvento, tipoFavorecido } from '@/lib/terceiros';
import { situacaoTitulo, tituloDoBanco } from '@/lib/financeiro';
import { rotuloFornecedor } from '@/lib/fornecedores';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { LancamentosFinanceirosRow } from '@/lib/database.types';

/**
 * Compras e pagamentos do evento. Grava em lancamentos_financeiros (o mesmo
 * Contas a Pagar/Receber do /financeiro, com baixa, saldo e DRE), sempre com
 * FAVORECIDO na conta a pagar: fornecedor, terceiro do evento ou o proprio
 * associado (indenizacao, 0156).
 * Com `terceiroId`, a tela mostra so o que trata daquele terceiro e ja abre o
 * lancamento amarrado a ele.
 */
export function EventoFinanceiro({
  eventoId,
  regionalId,
  protocolo,
  terceiroId,
}: {
  eventoId: string;
  regionalId?: string | null;
  protocolo: string | null;
  terceiroId?: string;
}) {
  const { data: lancs, isLoading } = useLancamentosEvento(eventoId, terceiroId);
  const { data: terceiros } = useTerceirosEvento(eventoId);
  const { data: legado } = useMovimentacoesLegadasEvento(terceiroId ? '' : eventoId);
  const { data: ev } = useEvento(eventoId);
  const associado = ev?.cliente_id
    ? { id: ev.cliente_id as string, nome: (ev.clientes as { nome_razao_social?: string } | null)?.nome_razao_social ?? 'Associado' }
    : null;
  const [editando, setEditando] = useState<Partial<LancamentosFinanceirosRow> | null>(null);
  const [baixando, setBaixando] = useState<LancamentoComRel | null>(null);
  const [pagamentos, setPagamentos] = useState<LancamentoComRel | null>(null);
  const [excluindo, setExcluindo] = useState<LancamentoComRel | null>(null);
  const podeExcluir = usePode('financeiro.excluir');
  const { data: categorias } = usePlanoContas();
  const { data: perfil } = usePerfilAtual();
  // Gastar no evento e TRATAR o evento (0077): o botao so aparece para o time.
  const trata = usePode('eventos.editar');
  // Sugestao de classificacao (0103): reparo de evento. Indenizacao = 3.1.05.
  const categoriaPadrao = (categorias ?? []).find((c) => c.codigo_estruturado === '4.1.4.02')?.id ?? null;

  const lista = lancs ?? [];
  const r = resumoFinanceiroEvento(lista);
  const hoje = new Date().toISOString().slice(0, 10);

  function novo() {
    setEditando({
      tipo: 'DESPESA',
      evento_id: eventoId,
      evento_terceiro_id: terceiroId ?? null,
      regional_id: regionalId ?? null,
      categoria_dre_id: categoriaPadrao,
      data_emissao: hoje,
      data_vencimento: hoje,
      competencia: hoje,
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Box titulo="A pagar (total)" valor={r.aPagar} detalhe={`em aberto ${formatCurrency(r.saldoPagar)}`} cor="text-rose-600" />
        <Box titulo="Pago" valor={r.pago} cor="text-slate-800" />
        <Box titulo="A receber" valor={r.aReceber} detalhe={`em aberto ${formatCurrency(r.saldoReceber)}`} cor="text-emerald-600" />
        <Box titulo={terceiroId ? 'Custo do terceiro' : 'Custo líquido do evento'} valor={r.custoLiquido} cor="text-brand-700" />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Lançamentos entram no Contas a Pagar/Receber e no DRE. Conta a pagar exige fornecedor, terceiro ou a indenização ao associado.
        </p>
        {trata && (
          <Button type="button" onClick={novo}>
            <Plus className="h-4 w-4" /> Novo lançamento
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400">Carregando...</p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum lançamento {terceiroId ? 'para este terceiro' : 'neste evento'}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="py-2">Vencimento</th>
                <th className="py-2">Descrição</th>
                <th className="py-2">Favorecido / Pagador</th>
                <th className="py-2">Situação</th>
                <th className="py-2 text-right">Valor</th>
                <th className="py-2 text-right">Saldo</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {lista.map((l) => {
                const sit = situacaoTitulo(l);
                return (
                  <tr key={l.id} className="border-b border-slate-50">
                    <td className="tnum py-2">{formatDate(l.data_vencimento)}</td>
                    <td className="py-2">
                      <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[0.625rem] ${l.tipo === 'RECEITA' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {l.tipo === 'RECEITA' ? 'Receber' : 'Pagar'}
                      </span>
                      {l.descricao}
                    </td>
                    <td className="py-2 text-slate-600">
                      <Favorecido l={l} />
                    </td>
                    <td className="py-2"><Selo situacao={sit} /></td>
                    <td className="tnum py-2 text-right font-medium">{formatCurrency(l.valor_original)}</td>
                    <td className="tnum py-2 text-right">{formatCurrency(l.valor_saldo)}</td>
                    <td className="py-2 text-right">
                      {l.status !== 'cancelado' && l.status !== 'quitado' && (
                        <button title="Registrar baixa" onClick={() => setBaixando(l)} className="p-1 text-slate-400 hover:text-emerald-600">
                          <HandCoins className="h-4 w-4" />
                        </button>
                      )}
                      {Number(l.valor_pago ?? 0) > 0 && (
                        <button title="Pagamentos registrados / estornar" onClick={() => setPagamentos(l)} className="p-1 text-slate-400 hover:text-slate-700">
                          <History className="h-4 w-4" />
                        </button>
                      )}
                      {l.status !== 'cancelado' && (
                        <button title="Editar" onClick={() => setEditando(l)} className="p-1 text-slate-400 hover:text-brand-600">
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {podeExcluir && Number(l.valor_pago ?? 0) === 0 && !tituloDoBanco(l) && (
                        <button title="Excluir lançamento" onClick={() => setExcluindo(l)} className="p-1 text-slate-400 hover:text-rose-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(legado ?? []).length > 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-400">
            <Receipt className="h-3.5 w-3.5" /> Movimentações antigas (antes do controle por favorecido) · somente leitura
          </p>
          <table className="w-full text-xs text-slate-500">
            <tbody>
              {(legado ?? []).map((m) => (
                <tr key={m.id}>
                  <td className="py-1">{formatDate(m.data_competencia)}</td>
                  <td className="py-1">{m.tipo === 'RECEITA' ? 'Receber' : 'Pagar'}</td>
                  <td className="py-1">{m.descricao ?? '-'}</td>
                  <td className="tnum py-1 text-right">{formatCurrency(m.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <LancamentoModal
          aberto
          inicial={editando}
          onClose={() => setEditando(null)}
          evento={{
            protocolo,
            terceiros: (terceiros ?? []).map((t) => ({ id: t.id, codigo: t.codigo, nome: t.nome })),
            associado,
          }}
        />
      )}
      {baixando && <BaixaModal lancamento={baixando} onClose={() => setBaixando(null)} />}
      {pagamentos && <PagamentosModal lancamento={pagamentos} onClose={() => setPagamentos(null)} />}
      {excluindo && <ExcluirLancamentoModal lancamento={excluindo} onClose={() => setExcluindo(null)} />}
    </div>
  );
}

function Favorecido({ l }: { l: LancamentoComRel }) {
  if (l.tipo === 'RECEITA') return <>{l.clientes?.nome_razao_social ?? '-'}</>;
  const tipo = tipoFavorecido(l);
  if (tipo === 'FORNECEDOR') {
    return (
      <>
        {l.fornecedores ? rotuloFornecedor(l.fornecedores) : null}
        {l.evento_terceiros && <span className="block text-[0.6875rem] text-slate-400">ref. terceiro {l.evento_terceiros.codigo}</span>}
      </>
    );
  }
  if (tipo === 'TERCEIRO') {
    return (
      <>
        {l.evento_terceiros?.nome}
        <span className="block text-[0.6875rem] text-slate-400">terceiro {l.evento_terceiros?.codigo}</span>
      </>
    );
  }
  if (tipo === 'ASSOCIADO') {
    return (
      <>
        {l.clientes?.nome_razao_social}
        <span className="block text-[0.6875rem] text-slate-400">indenização ao associado</span>
      </>
    );
  }
  return <span className="text-amber-600">sem favorecido (legado)</span>;
}

function Box({ titulo, valor, cor, detalhe }: { titulo: string; valor: number; cor: string; detalhe?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-superficie p-3">
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className={`tnum mt-1 text-lg font-semibold ${cor}`}>{formatCurrency(valor)}</p>
      {detalhe && <p className="tnum text-[0.6875rem] text-slate-400">{detalhe}</p>}
    </div>
  );
}
