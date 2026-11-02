'use client';

import { PainelEmails } from '@/components/comunicacao/painel-emails';

export default function EmailsCobrancaPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">E-mails de cobrança</h1>
        <p className="text-sm text-slate-500">
          Avisos automáticos dos boletos emitidos pelo SCar: 5 dias e 1 dia antes, no vencimento, e 2 e 7 dias
          depois. Os boletos do Mutual não entram — o Mutual já avisa os dele.
        </p>
      </div>
      <PainelEmails />
    </div>
  );
}
