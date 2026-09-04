'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { DivergenciasRastreadores } from '@/components/rastreadores/divergencias-rastreadores';

// Rota propria para o link do painel (e para a pagina ser compartilhavel).
export default function DivergenciasPage() {
  return (
    <div className="space-y-5">
      <Link href="/rastreadores" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ChevronLeft className="h-4 w-4" /> Rastreadores
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Divergencias</h1>
        <p className="text-sm text-slate-500">
          Onde o parque de equipamentos e o cadastro de veiculos discordam.
        </p>
      </div>
      <DivergenciasRastreadores />
    </div>
  );
}
