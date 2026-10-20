'use client';

import { PainelInadimplencia } from '@/components/cobrancas/painel-inadimplencia';

export default function PainelCobrancaPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Inadimplência e Cobranças</h1>
        <p className="text-sm text-slate-500">
          Quem precisa ser cobrado, quanto, e como o recebimento evolui. Boleto que ainda não venceu não
          entra em nenhuma taxa — todo número abre os boletos que o compõem.
        </p>
      </div>
      <PainelInadimplencia />
    </div>
  );
}
