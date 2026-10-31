'use client';

// Cancelamento de boleto(s) com MOTIVO (0157). Liberado pela celula
// `cobranca.cancelar` (perfil na grade ou permissao extra) — quem decide e o
// banco; a tela so nao oferece a quem ele recusaria. O boleto registrado no
// Sicredi recebe BAIXA no banco (mesma maquina da 2a via, 0121), entao o
// associado deixa de conseguir paga-lo.
import { useState } from 'react';
import { toast } from 'sonner';
import { Ban, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useCancelarBoletos } from '@/hooks/use-renegociacao';
import { MOTIVO_CANCELAMENTO_MINIMO, totalOriginais, validarMotivoCancelamento } from '@/lib/renegociacao';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { TituloCliente } from '@/lib/database.types';

export function ModalCancelarBoletos({
  clienteId, selecionados, onClose,
}: {
  clienteId: string;
  selecionados: TituloCliente[];
  onClose: () => void;
}) {
  const cancelar = useCancelarBoletos();
  const [motivo, setMotivo] = useState('');
  const invalido = validarMotivoCancelamento(motivo);
  const varios = selecionados.length > 1;

  function confirmar() {
    cancelar.mutate({
      cliente_id: clienteId,
      origens: selecionados.map((t) => ({ origem: t.origem === 'MUTUAL' ? 'MUTUAL' : 'SCAR', id: t.id })),
      motivo: motivo.trim(),
    }, {
      onSuccess: (r) => {
        if (r.erros_baixa > 0) {
          toast.warning(`${r.erros_baixa} boleto(s) sem baixa no banco ainda — use "Tentar a baixa de novo" no cartão do cancelamento.`);
        } else {
          toast.success(varios ? `${selecionados.length} boletos cancelados.` : 'Boleto cancelado.');
        }
        onClose();
      },
    });
  }

  return (
    <Modal open onClose={onClose} title={varios ? `Cancelar ${selecionados.length} boletos` : 'Cancelar boleto'}>
      <div className="space-y-3 text-sm text-slate-600">
        <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <tbody>
              {selecionados.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-1.5">
                    Vence {formatDate(t.data_vencimento)}{t.placa ? ` · ${t.placa}` : ''}
                    {t.origem === 'MUTUAL' && <span className="ml-1 rounded bg-brand-50 px-1.5 text-[0.6875rem] text-brand-600">Mutual</span>}
                  </td>
                  <td className="tnum px-3 py-1.5 text-right font-medium">{formatCurrency(Number(t.valor))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          Total: <b className="tnum">{formatCurrency(totalOriginais(selecionados))}</b>. O boleto registrado no Sicredi
          recebe <b>baixa no banco</b> e deixa de poder ser pago. Cancelar não se desfaz: para cobrar de novo, emita outro boleto.
        </p>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Motivo do cancelamento *</span>
          <textarea rows={3} value={motivo} autoFocus onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: boleto emitido em duplicidade; valor errado; associado cancelou o contrato..."
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <span className="text-[0.6875rem] text-slate-400">
            Fica gravado com o seu nome e a data. Mínimo de {MOTIVO_CANCELAMENTO_MINIMO} caracteres.
          </span>
        </label>
        {cancelar.error && <p className="text-xs text-rose-600">{cancelar.error.message}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
          <Button type="button" variant="danger" disabled={!!invalido || cancelar.isPending} onClick={confirmar}>
            {cancelar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            {varios ? `Cancelar ${selecionados.length} boletos` : 'Cancelar boleto'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
