'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { resumoPagina, TAMANHO_PAGINA_CADASTRO } from '@/lib/busca-cadastro';

/** Rodape "51–100 de 6.807" com anterior/proxima. */
export function Paginador({ pagina, total, onPagina, carregando }: {
  pagina: number; total: number; onPagina: (p: number) => void; carregando?: boolean;
}) {
  const { paginas, atual, de, ate } = resumoPagina(pagina, total, TAMANHO_PAGINA_CADASTRO);
  const n = (v: number) => v.toLocaleString('pt-BR');
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs text-slate-500">
      <span className="tnum">
        {total === 0 ? 'Nenhum registro' : `${n(de)}–${n(ate)} de ${n(total)}`}
        {carregando && ' · atualizando...'}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" disabled={atual === 0} onClick={() => onPagina(atual - 1)}
          className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-30" aria-label="Página anterior">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="tnum px-1">{n(atual + 1)} / {n(paginas)}</span>
        <button type="button" disabled={atual >= paginas - 1} onClick={() => onPagina(atual + 1)}
          className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-30" aria-label="Próxima página">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
