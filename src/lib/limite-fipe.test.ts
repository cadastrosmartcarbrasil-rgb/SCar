import { describe, expect, it } from 'vitest';
import {
  acimaDoLimite, baseDoCalculo, erroValorProtegido, textoAcimaDoLimite, textoProtecaoLimitada,
  tipoRastreamentoSemProtecao,
} from './limite-fipe';

describe('limite da FIPE (0165)', () => {
  it('acima do limite só quando há tabela', () => {
    expect(acimaDoLimite(258010, 250000)).toBe(true);
    expect(acimaDoLimite(250000, 250000)).toBe(false);
    expect(acimaDoLimite(300000, null)).toBe(false);
    expect(acimaDoLimite(null, 250000)).toBe(false);
  });

  it('valor protegido até o limite e até a FIPE', () => {
    expect(erroValorProtegido(null, 258010, 250000)).toMatch(/Informe/);
    expect(erroValorProtegido(255000, 258010, 250000)).toMatch(/limite/);
    expect(erroValorProtegido(250000, 258010, 250000)).toBeNull();
    expect(erroValorProtegido(200000, 258010, 250000)).toBeNull();
  });

  it('base do cálculo', () => {
    expect(baseDoCalculo({ fipe: 80000, limite: 250000, decisao: null, valorProtegido: null }))
      .toEqual({ base: 80000, mercado: null });
    expect(baseDoCalculo({ fipe: 258010, limite: 250000, decisao: null, valorProtegido: null }))
      .toEqual({ base: null, mercado: null });
    expect(baseDoCalculo({ fipe: 258010, limite: 250000, decisao: 'LIMITE', valorProtegido: 250000 }))
      .toEqual({ base: 250000, mercado: 258010 });
    expect(baseDoCalculo({ fipe: 258010, limite: 250000, decisao: 'LIMITE', valorProtegido: 260000 }))
      .toEqual({ base: null, mercado: null });
    expect(baseDoCalculo({ fipe: 258010, limite: 250000, decisao: 'RECUSAR', valorProtegido: 250000 }))
      .toEqual({ base: null, mercado: null });
  });

  it('tipo de rastreamento e textos', () => {
    expect(tipoRastreamentoSemProtecao([{ id: 'a', nome: 'Passeio' }, { id: 'b', nome: 'RASTREAMENTO SEM PROTEÇÃO' }])?.id).toBe('b');
    expect(tipoRastreamentoSemProtecao([{ id: 'a', nome: 'Passeio' }])).toBeNull();
    expect(textoAcimaDoLimite(258010, 250000, 'Passeio')).toContain('R$ 250.000,00');
    expect(textoProtecaoLimitada(250000, 258010)).toContain('R$ 8.010,00');
  });
});
