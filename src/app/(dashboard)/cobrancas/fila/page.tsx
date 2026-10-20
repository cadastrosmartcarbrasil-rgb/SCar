'use client';

import { FilaCobranca } from '@/components/cobrancas/fila-cobranca';

export default function FilaCobrancaPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Fila de Cobrança</h1>
        <p className="text-sm text-slate-500">
          Quem cobrar agora, na ordem: promessa quebrada, retorno atrasado, retorno de hoje e quem ainda não
          foi contatado. Todo contato fica no histórico — e não se apaga.
        </p>
      </div>
      <FilaCobranca />
    </div>
  );
}
