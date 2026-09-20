'use client';

import { useRef } from 'react';
import { deveFecharPeloFundo, GESTO_ZERADO, type GestoNoFundo } from '@/lib/overlay';

/**
 * As props do elemento de FUNDO de um overlay (modal, painel, visor).
 *
 * Espalhe o retorno no elemento que tem o `fixed inset-0` e **nao ponha
 * `onClick={onClose}` nele** — era exatamente isso que fechava o cadastro
 * quando o operador selecionava um texto arrastando para fora. A regra esta
 * em `deveFecharPeloFundo` (`src/lib/overlay.ts`), com os quatro gestos
 * cobertos por teste.
 *
 * `e.target === e.currentTarget` e como se pergunta "foi no FUNDO?": qualquer
 * coisa dentro do modal chega aqui com `target` no filho.
 *
 * Usa eventos de PONTEIRO, entao vale para mouse, toque e caneta de uma vez.
 *
 * O `stopPropagation()` do conteudo continua onde esta e NAO e o que conserta
 * a selecao de texto — o clique do arrasto nasce no fundo e nem passa pelo
 * conteudo. Ele existe por outro motivo: o modal e renderizado dentro da arvore
 * da pagina, entao sem ele um clique no formulario borbulharia ate um ancestral
 * clicavel.
 */
export function useFecharNoFundo(onClose: () => void) {
  const gesto = useRef<GestoNoFundo>(GESTO_ZERADO);

  return {
    onPointerDown: (e: React.PointerEvent) => {
      gesto.current = { inicio: e.target === e.currentTarget, fim: false };
    },
    onPointerUp: (e: React.PointerEvent) => {
      gesto.current = { ...gesto.current, fim: e.target === e.currentTarget };
    },
    onClick: () => {
      const fechar = deveFecharPeloFundo(gesto.current);
      // Zera SEMPRE: um gesto que nao fechou nao pode deixar credito para o
      // proximo clique (senao o segundo clique fecharia pelo primeiro).
      gesto.current = GESTO_ZERADO;
      if (fechar) onClose();
    },
  };
}
