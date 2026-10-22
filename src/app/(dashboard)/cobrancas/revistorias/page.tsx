'use client';

import { FilaRevistorias } from '@/components/revistoria/fila-revistorias';

export default function RevistoriasPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Revistorias</h1>
        <p className="text-sm text-slate-500">
          Boleto vencido acima do limite só vira 2ª via depois da revistoria do veículo (frente, traseira e um
          vídeo de até 30 segundos) aprovada aqui. Cada revistoria vale para UMA emissão.
        </p>
      </div>
      <FilaRevistorias />
    </div>
  );
}
