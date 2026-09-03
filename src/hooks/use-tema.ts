'use client';

import { useCallback, useEffect, useState } from 'react';
import { CHAVE_TEMA, type Tema, ehTema, proximoTema, temaEfetivo } from '@/lib/tema';

const CONSULTA_ESCURO = '(prefers-color-scheme: dark)';

function lerEscolha(): Tema | null {
  try {
    const guardado = localStorage.getItem(CHAVE_TEMA);
    return ehTema(guardado) ? guardado : null;
  } catch {
    return null; // armazenamento bloqueado — vale a preferencia do sistema
  }
}

/**
 * Estado do tema, com a escolha guardada no navegador.
 *
 * Quem aplica a classe `dark` na primeira pintura e o SCRIPT_TEMA_INICIAL, no
 * <head> — este hook cuida do que acontece depois: o clique no botao, a
 * gravacao e o acompanhamento do sistema para quem nunca escolheu.
 *
 * `montado` existe porque o servidor nao sabe o tema do navegador: renderizar
 * o icone antes da hidratacao daria erro de HTML incompativel. Ate montar, o
 * botao ocupa o espaco sem desenhar icone.
 */
export function useTema() {
  const [escolha, setEscolha] = useState<Tema | null>(null);
  const [sistemaEscuro, setSistemaEscuro] = useState(false);
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setEscolha(lerEscolha());
    const mq = window.matchMedia(CONSULTA_ESCURO);
    setSistemaEscuro(mq.matches);
    setMontado(true);

    // Se o usuario nunca escolheu, mudar o tema do sistema muda o da tela.
    const aoMudar = (e: MediaQueryListEvent) => setSistemaEscuro(e.matches);
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, []);

  const efetivo = temaEfetivo(escolha, sistemaEscuro);

  // Mantem o <html> em dia — inclusive quando o sistema muda sem clique.
  useEffect(() => {
    if (!montado) return;
    document.documentElement.classList.toggle('dark', efetivo === 'escuro');
  }, [efetivo, montado]);

  const alternar = useCallback(() => {
    const proximo = proximoTema(escolha, sistemaEscuro);
    setEscolha(proximo);
    try {
      localStorage.setItem(CHAVE_TEMA, proximo);
    } catch {
      /* sem armazenamento: vale para esta navegacao */
    }
  }, [escolha, sistemaEscuro]);

  return { escolha, efetivo, alternar, montado };
}
