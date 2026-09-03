'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/field';
import { useMoverLead } from '@/hooks/use-vendas';

const MOTIVOS = [
  'Fechou com concorrente',
  'Preco acima do esperado',
  'Sem interesse',
  'Nao conseguimos contato',
  'Veiculo nao aceito',
];

/**
 * Marcar perdido exige motivo — a regra e do banco (`mover_lead_status`), e
 * agora as duas telas passam por aqui: o Kanban ao arrastar para "Perdido" e a
 * ficha do lead. Antes a ficha gravava um motivo fixo e o dado se perdia.
 */
export function ModalPerda({ lead, onClose, onPerdido }: {
  lead: { id: string; nome: string };
  onClose: () => void;
  onPerdido?: () => void;
}) {
  const mover = useMoverLead();
  const [motivo, setMotivo] = useState('');

  function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!motivo.trim()) return toast.error('Informe o motivo da perda');
    mover.mutate(
      { id: lead.id, status: 'PERDIDO', obs: motivo.trim() },
      {
        onSuccess: () => { toast.success('Lead marcado como perdido'); onPerdido?.(); onClose(); },
        onError: (e2) => toast.error(e2.message),
      },
    );
  }

  return (
    <Modal open onClose={onClose} title="Marcar lead como perdido">
      <form onSubmit={confirmar} className="space-y-3">
        <p className="text-sm text-slate-600">
          {lead.nome} — o motivo fica no historico do lead e alimenta o relatorio de perdas.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {MOTIVOS.map((m) => (
            <button
              key={m} type="button" onClick={() => setMotivo(m)}
              className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium transition ${
                motivo === m ? 'bg-acao text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <FormField label="Motivo da perda">
          <Input
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: fechou com concorrente / sem interesse"
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
          <Button type="submit" variant="danger" disabled={mover.isPending}>Marcar como perdido</Button>
        </div>
      </form>
    </Modal>
  );
}
