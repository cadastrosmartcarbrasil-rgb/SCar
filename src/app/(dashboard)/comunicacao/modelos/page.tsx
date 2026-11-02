'use client';

import { ModelosEmail } from '@/components/comunicacao/modelos-email';

export default function ModelosMensagensPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Modelos de mensagens</h1>
        <p className="text-sm text-slate-500">
          Os textos dos e-mails que o sistema envia. O visual, os boletos e os botões ficam como estão; aqui se
          muda o assunto e as frases. Cada gravação vira uma versão e vale para os próximos envios.
        </p>
      </div>
      <ModelosEmail />
    </div>
  );
}
