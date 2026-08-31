import { describe, expect, it } from 'vitest';
import {
  MOVIMENTOS_REGIONAIS, movimentoRegional, totaisDaFila, validarLancamentoRegional,
} from './regional-financeiro';

describe('movimentos do financeiro da franquia', () => {
  it('tem exatamente os dois movimentos de comissao', () => {
    expect(MOVIMENTOS_REGIONAIS.map((m) => m.chave))
      .toEqual(['COMISSAO_RECEBER', 'COMISSAO_PAGAR']);
  });

  it('carrega a classificacao contabil pronta (a unidade nao escolhe conta)', () => {
    expect(movimentoRegional('COMISSAO_RECEBER')?.categoria).toBe('1.3.01');
    expect(movimentoRegional('COMISSAO_PAGAR')?.categoria).toBe('3.2.01');
    expect(movimentoRegional('COMISSAO_RECEBER')?.tipo).toBe('RECEITA');
    expect(movimentoRegional('COMISSAO_PAGAR')?.tipo).toBe('DESPESA');
  });

  it('recusa movimento fora da comissao, como o banco', () => {
    expect(movimentoRegional('ALUGUEL')).toBeNull();
    expect(validarLancamentoRegional({ tipo: 'ALUGUEL' })).toMatch(/tipo/i);
  });
});

describe('validarLancamentoRegional', () => {
  const base = {
    tipo: 'COMISSAO_RECEBER', descricao: 'Comissao de agosto',
    valor: 3200.5, vencimento: '2026-09-10',
  };

  it('aceita o lancamento completo', () => {
    expect(validarLancamentoRegional(base)).toBeNull();
  });

  it('cobra descricao, valor e vencimento', () => {
    expect(validarLancamentoRegional({ ...base, descricao: '  ' })).toMatch(/Descreva/);
    expect(validarLancamentoRegional({ ...base, valor: 0 })).toMatch(/valor/i);
    expect(validarLancamentoRegional({ ...base, vencimento: null })).toMatch(/vencimento/i);
  });

  it('so o repasse exige vendedor', () => {
    expect(validarLancamentoRegional({ ...base, vendedorId: null })).toBeNull();
    expect(validarLancamentoRegional({ ...base, tipo: 'COMISSAO_PAGAR', vendedorId: null }))
      .toMatch(/vendedor/i);
    expect(validarLancamentoRegional({ ...base, tipo: 'COMISSAO_PAGAR', vendedorId: 'v1' }))
      .toBeNull();
  });
});

describe('totaisDaFila', () => {
  const fila = [
    { tipo: 'RECEITA', situacao: 'aberto', valor_saldo: 3200.5 },
    { tipo: 'RECEITA', situacao: 'vencido', valor_saldo: 700 },
    { tipo: 'DESPESA', situacao: 'vencido', valor_saldo: 800 },
    { tipo: 'DESPESA', situacao: 'quitado', valor_saldo: 0 },
    { tipo: 'DESPESA', situacao: 'cancelado', valor_saldo: 500 },
  ];

  it('soma so o que esta vivo e separa o vencido', () => {
    const t = totaisDaFila(fila);
    expect(t.receber).toBe(3900.5);
    expect(t.pagar).toBe(800);
    expect(t.vencidoReceber).toBe(700);
    expect(t.vencidoPagar).toBe(800);
    expect(t.saldo).toBe(3100.5);
  });

  it('nao conta titulo cancelado como saldo a pagar', () => {
    expect(totaisDaFila([{ tipo: 'DESPESA', situacao: 'cancelado', valor_saldo: 500 }]).pagar).toBe(0);
  });
});
