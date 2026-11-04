import { describe, expect, it } from 'vitest';
import { calcularDescontoMensalidade, textoValidade } from './desconto-mensalidade';

describe('calcularDescontoMensalidade', () => {
  it('percentual', () => {
    expect(calcularDescontoMensalidade(150, 'PERCENTUAL', 3, 5)).toEqual({
      percentual: 3, desconto: 4.5, mensalidadeFinal: 145.5, acimaDoLimite: false,
    });
  });
  it('valor vira o % equivalente', () => {
    const r = calcularDescontoMensalidade(150, 'VALOR', 6, 5);
    expect(r.percentual).toBe(4);
    expect(r.mensalidadeFinal).toBe(144);
  });
  it('acima do limite', () => expect(calcularDescontoMensalidade(150, 'PERCENTUAL', 10, 5).acimaDoLimite).toBe(true));
  it('valor maior que a mensalidade fica na mensalidade', () =>
    expect(calcularDescontoMensalidade(100, 'VALOR', 300, 100).desconto).toBe(100));
  it('validade', () => {
    expect(textoValidade(null)).toBe('sem prazo');
    expect(textoValidade('2026-12-31')).toContain('31/12/2026');
  });
});
