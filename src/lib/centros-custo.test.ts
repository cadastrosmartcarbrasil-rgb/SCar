import { describe, it, expect } from 'vitest';
import { validarCentroCusto, podeExcluirCentro, centrosParaEscolher, ehCentroDoSistema } from './centros-custo';

const base = [
  { id: 'a', nome: 'Assistencia 24 Horas', codigo: 'ASSIST24', ativo: true },
  { id: 'b', nome: 'Comercial', codigo: 'COM', ativo: false },
];

describe('centros de custo', () => {
  it('nome obrigatorio e sem repeticao (ignora caixa e espacos)', () => {
    expect(validarCentroCusto({ nome: ' ' }, base)).toMatch(/nome/);
    expect(validarCentroCusto({ nome: 'comercial ' }, base)).toMatch(/nome/);
    expect(validarCentroCusto({ id: 'b', nome: 'Comercial', codigo: 'COM' }, base)).toBeNull();
  });
  it('codigo repetido e recusado', () => {
    expect(validarCentroCusto({ nome: 'Novo', codigo: 'com' }, base)).toMatch(/codigo/);
  });
  it('ASSIST24 nao muda de codigo nem e reaproveitado', () => {
    expect(validarCentroCusto({ id: 'a', nome: 'Assistencia', codigo: 'X' }, base)).toMatch(/ASSIST24/);
    expect(validarCentroCusto({ id: 'a', nome: 'Assistencia 24h', codigo: 'ASSIST24' }, base)).toBeNull();
    expect(validarCentroCusto({ nome: 'Outro', codigo: 'assist24' }, [base[1]])).toMatch(/reservado/);
  });
  it('exclusao so sem lancamento e nunca o da 24h', () => {
    expect(podeExcluirCentro(base[1], 0)).toBe(true);
    expect(podeExcluirCentro(base[1], 3)).toBe(false);
    expect(podeExcluirCentro(base[0], 0)).toBe(false);
    expect(ehCentroDoSistema({ codigo: ' assist24 ' })).toBe(true);
  });
  it('lancamento oferece ativos + o ja escolhido', () => {
    expect(centrosParaEscolher(base).map((c) => c.id)).toEqual(['a']);
    expect(centrosParaEscolher(base, 'b').map((c) => c.id)).toEqual(['a', 'b']);
  });
});
