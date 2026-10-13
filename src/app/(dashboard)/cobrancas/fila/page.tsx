'use client';

import { FilaCobranca } from '@/components/cobrancas/fila-cobranca';

export default function FilaCobrancaPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Fila de Cobranca</h1>
        <p className="text-sm text-slate-500">
          Quem cobrar agora, na ordem: promessa quebrada, retorno atrasado, retorno de hoje e quem ainda nao
          foi contatado. Todo contato fica no historico — e nao se apaga.
        </p>
      </div>
      <FilaCobranca />
    </div>
  );
}
