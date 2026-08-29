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

describe('digitarMoeda (mascara por centavos)', () => {
  it('preenche da direita para a esquerda, sem zero preso na frente', () => {
    expect(digitarMoeda('1')).toEqual({ valor: 0.01, texto: '0,01' });
    expect(digitarMoeda('15')).toEqual({ valor: 0.15, texto: '0,15' });
    expect(digitarMoeda('150')).toEqual({ valor: 1.5, texto: '1,50' });
    expect(digitarMoeda('150000')).toEqual({ valor: 1500, texto: '1.500,00' });
  });
  it('ignora zeros a esquerda digitados por engano', () => {
    expect(digitarMoeda('00150')).toEqual({ valor: 1.5, texto: '1,50' });
  });
  it('campo vazio devolve null (nao 0) para o placeholder aparecer', () => {
    expect(digitarMoeda('')).toEqual({ valor: null, texto: '' });
  });
  it('respeita a virgula quando o operador digita ou cola o separador', () => {
    expect(digitarMoeda('1234,56')).toEqual({ valor: 1234.56, texto: '1234,56' });
    expect(digitarMoeda('1.234,56')).toEqual({ valor: 1234.56, texto: '1.234,56' });
  });
  it('mantem o texto intermediario enquanto a casa decimal e digitada', () => {
    expect(digitarMoeda('1234,')).toEqual({ valor: 1234, texto: '1234,' });
  });
  it('descarta letras e simbolos colados junto', () => {
    expect(digitarMoeda('R$ 250')).toEqual({ valor: 2.5, texto: '2,50' });
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
