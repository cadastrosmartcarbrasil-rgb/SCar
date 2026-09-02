import { describe, expect, it } from 'vitest';
import {
  bandeiraDoNumero, cvvValido, formatarNumero, formatarValidade, interpretarValidade,
  numeroValido, ultimosDigitos, validadeExpirada, validarCartao,
} from './cartao';

// Numeros de TESTE publicos das bandeiras — nao sao cartoes reais.
const VISA = '4111111111111111';
const MASTER = '5555555555554444';
const AMEX = '378282246310005';

describe('numeroValido (Luhn)', () => {
  it('aceita os numeros de teste das bandeiras', () => {
    expect(numeroValido(VISA)).toBe(true);
    expect(numeroValido(MASTER)).toBe(true);
    expect(numeroValido(AMEX)).toBe(true);
  });

  it('pega o digito trocado — o erro de digitacao mais comum', () => {
    expect(numeroValido('4111111111111112')).toBe(false);
  });

  it('recusa comprimento fora da faixa', () => {
    expect(numeroValido('411111')).toBe(false);
    expect(numeroValido('')).toBe(false);
  });

  it('ignora espacos e pontuacao', () => {
    expect(numeroValido('4111 1111 1111 1111')).toBe(true);
  });
});

describe('bandeira', () => {
  it('reconhece as principais', () => {
    expect(bandeiraDoNumero(VISA)).toBe('VISA');
    expect(bandeiraDoNumero(MASTER)).toBe('MASTERCARD');
    expect(bandeiraDoNumero(AMEX)).toBe('AMEX');
    expect(bandeiraDoNumero('6362970000457013')).toBe('ELO');
  });

  it('nao inventa bandeira quando nao reconhece', () => {
    expect(bandeiraDoNumero('9999999999999999')).toBe('DESCONHECIDA');
  });
});

describe('formatacao', () => {
  it('agrupa de 4 em 4', () => {
    expect(formatarNumero('4111111111111111')).toBe('4111 1111 1111 1111');
  });

  it('AMEX usa 4-6-5', () => {
    expect(formatarNumero(AMEX)).toBe('3782 822463 10005');
  });

  it('guarda so os 4 ultimos digitos para exibir depois', () => {
    expect(ultimosDigitos(VISA)).toBe('1111');
  });

  it('formata a validade enquanto digita', () => {
    expect(formatarValidade('1')).toBe('1');
    expect(formatarValidade('12')).toBe('12');
    expect(formatarValidade('1230')).toBe('12/30');
  });
});

describe('validade', () => {
  const hoje = new Date(2026, 8, 2); // 02/09/2026

  it('interpreta MM/AA e MM/AAAA', () => {
    expect(interpretarValidade('12/30')).toEqual({ mes: 12, ano: 2030 });
    expect(interpretarValidade('12/2030')).toEqual({ mes: 12, ano: 2030 });
  });

  it('nao interpreta mes invalido', () => {
    expect(interpretarValidade('13/30')).toBeNull();
    expect(interpretarValidade('00/30')).toBeNull();
    expect(interpretarValidade('1')).toBeNull();
  });

  it('vale ate o ultimo dia do mes', () => {
    expect(validadeExpirada(9, 2026, hoje)).toBe(false);
    expect(validadeExpirada(8, 2026, hoje)).toBe(true);
    expect(validadeExpirada(1, 2027, hoje)).toBe(false);
  });
});

describe('cvv', () => {
  it('AMEX pede 4 digitos; o resto, 3', () => {
    expect(cvvValido('1234', AMEX)).toBe(true);
    expect(cvvValido('123', AMEX)).toBe(false);
    expect(cvvValido('123', VISA)).toBe(true);
    expect(cvvValido('1234', VISA)).toBe(false);
  });
});

describe('validarCartao', () => {
  const hoje = new Date(2026, 8, 2);
  const ok = { numero: VISA, nome: 'CARLOS A SILVA', validade: '12/30', cvv: '123' };

  it('aceita o cartao completo', () => {
    expect(validarCartao(ok, hoje)).toBeNull();
  });

  it('reclama de um problema por vez, na ordem do formulario', () => {
    expect(validarCartao({ ...ok, numero: '4111111111111112' }, hoje)).toMatch(/numero/i);
    expect(validarCartao({ ...ok, nome: 'CARLOS' }, hoje)).toMatch(/nome/i);
    expect(validarCartao({ ...ok, validade: '1' }, hoje)).toMatch(/validade/i);
    expect(validarCartao({ ...ok, validade: '01/26' }, hoje)).toMatch(/vencido/i);
    expect(validarCartao({ ...ok, cvv: '12' }, hoje)).toMatch(/seguranca/i);
  });
});
