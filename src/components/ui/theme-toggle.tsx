'use client';

import { Moon, Sun } from 'lucide-react';
import { useTema } from '@/hooks/use-tema';
import { rotuloAlternancia } from '@/lib/tema';
import { cn } from '@/lib/utils';

/**
 * Botao de tema do cabecalho.
 *
 * O icone mostra o DESTINO do clique, nao o estado atual: no escuro aparece o
 * sol (clicar leva ao claro) e no claro a lua. E a convencao que as pessoas ja
 * conhecem de outros produtos.
 *
 * `variante`:
 *   "clara"  — barra branca/superficie (matriz, portais)
 *   "cabine" — dentro do navy escuro (sidebar, faixa do portal)
 */
export function ThemeToggle({
  variante = 'clara',
  className,
}: {
  variante?: 'clara' | 'cabine';
  className?: string;
}) {
  const { efetivo, alternar, montado } = useTema();
  const rotulo = rotuloAlternancia(efetivo);

  return (
    <button
      type="button"
      onClick={alternar}
      title={rotulo}
      aria-label={rotulo}
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition',
        variante === 'cabine'
          ? 'text-slate-300 hover:bg-white/10 hover:text-white'
          : 'text-slate-500 hover:bg-slate-100 hover:text-brand-700',
        className,
      )}
    >
      {/* Antes de montar nao da para saber o tema do navegador; o botao guarda
          o espaco sem icone para o cabecalho nao "pular" na hidratacao. */}
      {montado ? (
        efetivo === 'escuro' ? (
          <Sun className="h-[18px] w-[18px]" />
        ) : (
          <Moon className="h-[18px] w-[18px]" />
        )
      ) : (
        <span className="h-[18px] w-[18px]" />
      )}
    </button>
  );
}
