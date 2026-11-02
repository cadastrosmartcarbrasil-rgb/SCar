'use client';

import { ComunicadosEmail } from '@/components/comunicacao/comunicados-email';

export default function ComunicadosPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Comunicados por e-mail</h1>
        <p className="text-sm text-slate-500">
          Escreva um comunicado e mande para um associado ou para uma lista (unidade, situação do veículo, plano, tipo).
          Antes de enviar, a tela mostra quantas pessoas recebem.
        </p>
      </div>
      <ComunicadosEmail />
    </div>
  );
}
