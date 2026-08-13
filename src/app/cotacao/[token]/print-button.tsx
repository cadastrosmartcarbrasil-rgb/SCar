'use client';

import { Printer } from 'lucide-react';

// Botao "Salvar/Imprimir PDF": usa o print-to-PDF nativo do navegador
// (funciona no celular e no desktop, sem dependencia de servidor).
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700"
    >
      <Printer className="h-4 w-4" /> Salvar / Imprimir PDF
    </button>
  );
}
