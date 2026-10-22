'use client';

// Revistoria liberada -> a 2a via na sequencia (0137). Pedido do usuario:
// "assim que o atendente liberou a vistoria, ja pergunta se quer gerar o
// boleto". Monta a selecao (os vencidos do veiculo + os sem veiculo) e abre o
// MESMO modal de negociacao do historico financeiro — nada de segundo caminho
// de emissao. A trava do banco confere a revistoria de novo na emissao.
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { ModalNegociarBoletos } from '@/components/cobrancas/negociacao-boletos';
import { useTitulosCliente } from '@/hooks/use-protocolos';
import { boletosParaSegundaVia } from '@/lib/revistoria';
import { podeNegociar } from '@/lib/renegociacao';

export function ModalBoletoAposRevistoria({ clienteId, veiculoId, onClose }: {
  clienteId: string; veiculoId: string; onClose: () => void;
}) {
  // Todos os boletos do associado (o sem veiculo tambem entra).
  const q = useTitulosCliente(clienteId, null, 300);
  if (q.isLoading) {
    return (
      <Modal open onClose={onClose} title="Gerar a 2ª via">
        <p className="flex items-center gap-2 py-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Buscando os boletos vencidos…</p>
      </Modal>
    );
  }
  const selecionados = boletosParaSegundaVia(q.data ?? [], veiculoId, podeNegociar);
  if (q.error || selecionados.length === 0) {
    return (
      <Modal open onClose={onClose} title="Gerar a 2ª via">
        <div className="space-y-3 text-sm text-slate-600">
          <p>
            {q.error
              ? `Não foi possível ler os boletos: ${(q.error as Error).message}`
              : 'Não há boleto vencido que possa ser reemitido para este veículo. Confira no Histórico Financeiro (boleto do Mutual sem linha do Sicredi é tratado no Mutual).'}
          </p>
          <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Fechar</Button></div>
        </div>
      </Modal>
    );
  }
  return <ModalNegociarBoletos clienteId={clienteId} selecionados={selecionados} onClose={onClose} />;
}
