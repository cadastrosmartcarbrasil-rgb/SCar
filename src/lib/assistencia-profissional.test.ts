import { describe, expect, it } from 'vitest';
import { comissaoDoPagamento, itensParaCliente, totalDoCliente, totaisApMigrados, validarAssistenciaProfissional } from './assistencia-profissional';

const regras = { regional_id: 'r', regional_nome: 'U', paga: true, minimo: 1, maximo: 40 };

describe('validarAssistenciaProfissional', () => {
  it('zero sempre pode, inclusive na unidade que nao paga', () => {
    expect(validarAssistenciaProfissional(0, { ...regras, paga: false })).toBeNull();
    expect(validarAssistenciaProfissional(null, null)).toBeNull();
  });
  it('unidade que nao repassa tambem cobra, dentro do limite (0159)', () => {
    expect(validarAssistenciaProfissional(10, { ...regras, paga: false })).toBeNull();
    expect(validarAssistenciaProfissional(50, { ...regras, paga: false })).toMatch(/entre/);
  });
  it('respeita o limite dos dois lados', () => {
    expect(validarAssistenciaProfissional(41, regras)).toMatch(/entre/);
    expect(validarAssistenciaProfissional(0.5, regras)).toMatch(/entre/);
    expect(validarAssistenciaProfissional(40, regras)).toBeNull();
    expect(validarAssistenciaProfissional(1, regras)).toBeNull();
  });
  it('negativo e invalido', () => {
    expect(validarAssistenciaProfissional(-1, regras)).toBe('Valor inválido');
  });
});

describe('totalDoCliente', () => {
  it('usa o total com desconto (que ja traz a assistencia)', () => {
    expect(totalDoCliente({ total_mensalidade: 150, total_com_desconto: 155, valor_assistencia_profissional: 20 })).toBe(155);
  });
  it('sem total com desconto soma a assistencia', () => {
    expect(totalDoCliente({ total_mensalidade: 150, total_com_desconto: null, valor_assistencia_profissional: 20 })).toBe(170);
  });
});

describe('itensParaCliente', () => {
  const itens = [
    { nome: 'Protecao Casco', valor: 80, obrigatorio: true, categoria: 'CASCO' },
    { nome: 'Taxa Administrativa', valor: 30, obrigatorio: true, categoria: 'ADMIN' },
    { nome: 'Vidros', valor: 10, obrigatorio: false, categoria: 'VIDROS' },
  ];
  it('soma na taxa administrativa e nao cria linha', () => {
    const r = itensParaCliente(itens, 20);
    expect(r).toHaveLength(3);
    expect(r[1].valor).toBe(50);
    expect(r.reduce((s, i) => s + i.valor, 0)).toBe(140);
    expect(r.some((i) => /profission/i.test(i.nome))).toBe(false);
  });
  it('acha a taxa pelo nome quando nao ha categoria', () => {
    const r = itensParaCliente([{ nome: 'Casco', valor: 80, obrigatorio: true }, { nome: 'Taxa Adm', valor: 30, obrigatorio: true }], 5);
    expect(r[1].valor).toBe(35);
  });
  it('sem taxa, vai ao primeiro obrigatorio', () => {
    const r = itensParaCliente([{ nome: 'Vidros', valor: 10, obrigatorio: false }, { nome: 'Casco', valor: 80, obrigatorio: true }], 5);
    expect(r[1].valor).toBe(85);
  });
  it('sem assistencia nada muda', () => {
    expect(itensParaCliente(itens, 0)).toBe(itens);
  });
});

describe('totaisApMigrados', () => {
  it('conta cada situacao', () => {
    expect(totaisApMigrados([
      { situacao: 'APLICAR' }, { situacao: 'APLICAR' }, { situacao: 'SEM_VALOR' },
      { situacao: 'JA_APLICADO' }, { situacao: 'DIFERENTE' },
    ])).toEqual({ total: 5, aplicar: 2, jaAplicado: 1, diferente: 1, semValor: 1 });
  });
});

describe('comissaoDoPagamento (0159)', () => {
  const b = { taxaRecorrente: 0.1, assistencia: 20, mensalidade: 200 };
  it('unidade que repassa: so a assistencia', () => {
    expect(comissaoDoPagamento({ ...b, base: 205, unidadeRepassa: true })).toEqual({ comissao: 20, assistencia: 20 });
  });
  it('unidade que nao repassa: percentual sobre o valor cheio', () => {
    expect(comissaoDoPagamento({ ...b, base: 200, unidadeRepassa: false })).toEqual({ comissao: 20, assistencia: 0 });
  });
  it('sem assistencia no veiculo: comissao normal', () => {
    expect(comissaoDoPagamento({ ...b, assistencia: 0, base: 150, unidadeRepassa: true })).toEqual({ comissao: 15, assistencia: 0 });
  });
  it('pro-rata paga a fracao; renegociacao de 3 meses paga 3x', () => {
    expect(comissaoDoPagamento({ ...b, base: 50, unidadeRepassa: true, renegociacao: true }).comissao).toBe(5);
    expect(comissaoDoPagamento({ ...b, base: 600, unidadeRepassa: true, renegociacao: true }).comissao).toBe(60);
  });
});
