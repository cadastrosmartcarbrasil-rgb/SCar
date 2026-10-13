'use client';

import { CalendarioVencimentos } from '@/components/cobrancas/calendario-vencimentos';

export default function CalendarioCobrancaPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Calendario de Vencimentos</h1>
        <p className="text-sm text-slate-500">
          Os seis ciclos do mes (dias 5, 10, 15, 20, 25 e 30): emitido, pago, a vencer, vencido e recuperado.
        </p>
      </div>
      <CalendarioVencimentos />
    </div>
  );
}
