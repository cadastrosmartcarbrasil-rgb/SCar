import { describe, expect, it } from 'vitest';
import { arredondarMoeda, digitarMoeda, formatarMoedaBR, parseMoedaBR, somarMoeda } from './money';

describe('formatarMoedaBR', () => {
  it('usa padrao BR com 2 casas', () => {
    expect(formatarMoedaBR(1500)).toBe('1.500,00');
    expect(formatarMoedaBR(0)).toBe('0,00');
    expect(formatarMoedaBR(22159.5)).toBe('22.159,50');
  });
  it('devolve vazio para nulo', () => {
    expect(formatarMoedaBR(null)).toBe('');
    expect(formatarMoedaBR(undefined)).toBe('');
  });
});

describe('parseMoedaBR', () => {
  it('le formato BR', () => {
    expect(parseMoedaBR('1.234,56')).toBe(1234.56);
    expect(parseMoedaBR('R$ 1.234,56')).toBe(1234.56);
    expect(parseMoedaBR('1234,5')).toBe(1234.5);
  });
  it('le formato com ponto decimal (CSV/FIPE)', () => {
    expect(parseMoedaBR('22159.00')).toBe(22159);
    expect(parseMoedaBR('1234.56')).toBe(1234.56);
  });
  it('trata ponto como milhar quando nao ha 2 decimais', () => {
    expect(parseMoedaBR('1.234')).toBe(1234);
    expect(parseMoedaBR('1.234.567')).toBe(1234567);
  });
  it('devolve null sem digitos', () => {
    expect(parseMoedaBR('')).toBeNull();
    expect(parseMoedaBR('abc')).toBeNull();
  });
});

describe('digitarMoeda (digitacao livre)', () => {
  it('mostra exatamente o que foi digitado, sem mascara empurrando o cursor', () => {
    expect(digitarMoeda('3')).toEqual({ valor: 3, texto: '3' });
    expect(digitarMoeda('352')).toEqual({ valor: 352, texto: '352' });
    expect(digitarMoeda('352,00')).toEqual({ valor: 352, texto: '352,00' });
  });

  it('REGRESSAO: digitar "352,00" tecla a tecla nunca vira "0,0352,00"', () => {
    let texto = '';
    const passos: string[] = [];
    for (const tecla of ['3', '5', '2', ',', '0', '0']) {
      const r = digitarMoeda(texto + tecla);
      texto = r.texto;
      passos.push(r.texto);
    }
    expect(passos).toEqual(['3', '35', '352', '352,', '352,0', '352,00']);
    expect(digitarMoeda(texto).valor).toBe(352);
  });

  it('aceita o separador decimal no meio da digitacao', () => {
    expect(digitarMoeda('1500,')).toEqual({ valor: 1500, texto: '1500,' });
    expect(digitarMoeda('1500,5')).toEqual({ valor: 1500.5, texto: '1500,5' });
  });

  it('aceita valor colado de boleto (BR) e de CSV/FIPE (ponto decimal)', () => {
    expect(digitarMoeda('1.234,56')).toEqual({ valor: 1234.56, texto: '1.234,56' });
    expect(digitarMoeda('1234.56')).toEqual({ valor: 1234.56, texto: '1234.56' });
  });

  it('campo vazio devolve null (nao 0) para o placeholder 0,00 aparecer', () => {
    expect(digitarMoeda('')).toEqual({ valor: null, texto: '' });
  });

  it('descarta letras e simbolos colados junto', () => {
    expect(digitarMoeda('R$ 250')).toEqual({ valor: 250, texto: '250' });
    expect(digitarMoeda('abc')).toEqual({ valor: null, texto: '' });
  });

  it('separador sozinho nao vira valor', () => {
    expect(digitarMoeda(',')).toEqual({ valor: null, texto: '' });
  });
});

describe('aritmetica de centavos', () => {
  it('soma sem erro de ponto flutuante', () => {
    expect(somarMoeda(0.1, 0.2)).toBe(0.3);
    expect(somarMoeda(1234.56, 0.44, null, undefined)).toBe(1235);
  });
  it('arredonda para 2 casas', () => {
    expect(arredondarMoeda(1.005)).toBe(1.01);
    expect(arredondarMoeda(1234.5678)).toBe(1234.57);
  });
});

// O <PercentInput> usa a MESMA regra de digitacao do <MoneyInput>. Estes casos
// travam o comportamento para o campo de comissao (vendedores/regionais), onde
// o "0" preso na frente era o mesmo incomodo do financeiro.
describe('digitacao de percentual (mesma regra do dinheiro)', () => {
  it('digitar "15" da 15, nao 0,15', () => {
    expect(digitarMoeda('15').valor).toBe(15);
  });
  it('digitar "15,5" preserva a meia casa (nao arredonda para 16)', () => {
    expect(digitarMoeda('15,5').valor).toBe(15.5);
  });
  it('campo limpo volta a null para o placeholder 0,00 aparecer', () => {
    expect(digitarMoeda('').valor).toBeNull();
  });
  it('digitar "100" tecla a tecla nunca produz texto quebrado', () => {
    let texto = '';
    for (const t of ['1', '0', '0']) texto = digitarMoeda(texto + t).texto;
    expect(texto).toBe('100');
    expect(digitarMoeda(texto).valor).toBe(100);
  });
});
