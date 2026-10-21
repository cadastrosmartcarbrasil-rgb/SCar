'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Textarea } from '@/components/ui/field';
import {
  useBaixas, useContasBancarias, useEstornarBaixa, useExcluirLancamento, type LancamentoComRel,
} from '@/hooks/use-financeiro';
import { usePode } from '@/hooks/use-permissoes';
import { formatCurrency, formatDate } from '@/lib/utils';
import { MOTIVO_MINIMO, mensagemErroFinanceiro } from '@/lib/financeiro';

/**
 * Pagamentos ja registrados de um titulo, com o ESTORNO (0132). Estornar tira
 * a baixa: o saldo volta, a situacao volta e, se a baixa estava conciliada com
 * o extrato, o item do extrato volta para a fila. O comprovante continua no
 * titulo. Quem pode: Financeiro > Estornar (admin sempre; extra por usuario).
 */
export function PagamentosModal({ lancamento, onClose }: { lancamento: LancamentoComRel; onClose: () => void }) {
  const { data: baixas, isLoading } = useBaixas(lancamento.id);
  const { data: contas } = useContasBancarias();
  const podeEstornar = usePode('financeiro.estornar');
  const estornar = useEstornarBaixa();
  const [estornando, setEstornando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const receita = lancamento.tipo === 'RECEITA';
  const nomeConta = (id: string | null) => (contas ?? []).find((c) => c.id === id)?.nome ?? '—';
  const doBanco = (lancamento.numero_documento ?? '').startsWith('SICREDI-');

  function confirmar(baixaId: string) {
    if (motivo.trim().length < MOTIVO_MINIMO) return toast.error('Explique o motivo do estorno');
    estornar.mutate(
      { baixaId, motivo: motivo.trim() },
      {
        onSuccess: (r) => {
          toast.success(
            r.extrato_reaberto
              ? 'Pagamento estornado — o item do extrato voltou para a conciliação'
              : 'Pagamento estornado',
          );
          setEstornando(null);
          setMotivo('');
        },
        onError: (e) => toast.error(mensagemErroFinanceiro(e.message)),
      },
    );
  }

  return (
    <Modal open onClose={onClose} tamanho="lg" title={receita ? 'Recebimentos do título' : 'Pagamentos do título'} subtitulo={lancamento.descricao}>
      {isLoading ? (
        <p className="text-sm text-slate-400">Carregando...</p>
      ) : (baixas ?? []).length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum pagamento registrado neste título.</p>
      ) : (
        <div className="space-y-3">
          {doBanco && (
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              Pagamento confirmado pelo banco (Sicredi): o dinheiro entrou na conta, então não se estorna por aqui.
            </p>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="py-2">Data</th>
                <th className="py-2">Conta</th>
                <th className="py-2">Encargos</th>
                <th className="py-2 text-right">Valor</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {(baixas ?? []).map((b) => (
                <tr key={b.id} className="border-b border-slate-100 align-top last:border-0">
                  <td className="tnum py-2 text-slate-700">{formatDate(b.data_pagamento)}</td>
                  <td className="py-2 text-slate-600">{nomeConta(b.conta_bancaria_id)}</td>
                  <td className="py-2 text-xs text-slate-400">
                    {Number(b.desconto) > 0 && `desc. ${formatCurrency(b.desconto)} `}
                    {Number(b.juros_multa) > 0 && `juros ${formatCurrency(b.juros_multa)}`}
                  </td>
                  <td className="tnum py-2 text-right font-medium text-slate-800">{formatCurrency(b.valor_pago)}</td>
                  <td className="py-2 pl-2 text-right">
                    {podeEstornar && !doBanco && estornando !== b.id && (
                      <button
                        type="button"
                        onClick={() => { setEstornando(b.id); setMotivo(''); }}
                        className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Estornar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {estornando && (
            <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/50 p-3">
              <p className="text-sm font-medium text-rose-800">
                Estornar o pagamento de {formatCurrency((baixas ?? []).find((b) => b.id === estornando)?.valor_pago)}?
              </p>
              <p className="text-[11.5px] text-rose-700">
                O valor volta a ficar em aberto no título e sai do saldo da conta. A trilha guarda quem estornou e por quê.
              </p>
              <FormField label="Motivo do estorno *">
                <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: pagamento lançado em duplicidade" autoFocus />
              </FormField>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setEstornando(null)}>Voltar</Button>
                <Button type="button" variant="danger" disabled={estornar.isPending} onClick={() => confirmar(estornando)}>
                  {estornar.isPending ? 'Estornando...' : 'Confirmar estorno'}
                </Button>
              </div>
            </div>
          )}
          {!podeEstornar && (
            <p className="text-[11.5px] text-slate-400">
              Estornar pagamento é da permissão Financeiro &gt; Estornar (admin, financeiro ou extra liberado).
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

/**
 * Exclui um titulo SEM pagamento (0132), com motivo. Diferente de cancelar:
 * cancelar deixa o titulo na lista como cancelado; excluir tira da carteira
 * (a trilha em financeiro_auditoria guarda a foto do que saiu).
 */
export function ExcluirLancamentoModal({ lancamento, onClose }: { lancamento: LancamentoComRel; onClose: () => void }) {
  const excluir = useExcluirLancamento();
  const [motivo, setMotivo] = useState('');

  function confirmar() {
    if (motivo.trim().length < MOTIVO_MINIMO) return toast.error('Explique o motivo da exclusão');
    excluir.mutate(
      { lancamentoId: lancamento.id, motivo: motivo.trim() },
      {
        onSuccess: () => { toast.success('Lançamento excluído'); onClose(); },
        onError: (e) => toast.error(mensagemErroFinanceiro(e.message)),
      },
    );
  }

  return (
    <Modal open onClose={onClose} title="Excluir lançamento" subtitulo={lancamento.descricao}>
      <div className="space-y-3">
        <p className="flex items-start gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
          <Trash2 className="mt-px h-3.5 w-3.5 shrink-0" />
          O título de {formatCurrency(lancamento.valor_original)} (venc. {formatDate(lancamento.data_vencimento)}) sai do
          contas a {lancamento.tipo === 'RECEITA' ? 'receber' : 'pagar'}, do DRE e do fluxo de caixa, junto com os anexos.
          {Number(lancamento.parcela_total) > 1 && ' As outras parcelas do carnê continuam.'}
        </p>
        <FormField label="Motivo da exclusão *">
          <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: lançado em duplicidade" autoFocus />
        </FormField>
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
          <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
          <Button type="button" variant="danger" disabled={excluir.isPending} onClick={confirmar}>
            {excluir.isPending ? 'Excluindo...' : 'Excluir lançamento'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
