import { describe, it, expect } from 'vitest';
import { deveFecharPeloFundo, GESTO_ZERADO } from './overlay';

describe('deveFecharPeloFundo — os quatro gestos possiveis', () => {
  it('clique limpo no fundo: FECHA (e o comportamento esperado)', () => {
    expect(deveFecharPeloFundo({ inicio: true, fim: true })).toBe(true);
  });

  it('🔴 selecao de texto que comeca no campo e termina no fundo: NAO fecha', () => {
    // Este e o bug relatado: cadastro longo preenchido, o operador seleciona um
    // texto arrastando para fora e perde tudo. O `click` nasce no fundo porque
    // ele e o ancestral comum — entao olhar so o alvo do clique nao resolve.
    expect(deveFecharPeloFundo({ inicio: false, fim: true })).toBe(false);
  });

  it('selecao em que o ponteiro fica capturado pelo campo: NAO fecha', () => {
    expect(deveFecharPeloFundo({ inicio: false, fim: false })).toBe(false);
  });

  it('arrastar de fora para DENTRO do modal: NAO fecha', () => {
    // Ninguem arrasta do fundo para dentro querendo fechar. Antes disto, esse
    // gesto tambem fechava.
    expect(deveFecharPeloFundo({ inicio: true, fim: false })).toBe(false);
  });

  it('o gesto zerado nunca fecha — e o estado em que o modal abre', () => {
    expect(deveFecharPeloFundo(GESTO_ZERADO)).toBe(false);
  });
});
