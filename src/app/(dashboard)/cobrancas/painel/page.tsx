'use client';

import { PainelInadimplencia } from '@/components/cobrancas/painel-inadimplencia';

export default function PainelCobrancaPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Inadimplencia e Cobrancas</h1>
        <p className="text-sm text-slate-500">
          Quem precisa ser cobrado, quanto, e como o recebimento evolui. Boleto que ainda nao venceu nao
          entra em nenhuma taxa — todo numero abre os boletos que o compoem.
        </p>
      </div>
      <PainelInadimplencia />
    </div>
  );
}
