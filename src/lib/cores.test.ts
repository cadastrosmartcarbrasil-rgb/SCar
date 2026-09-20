import { describe, it, expect } from 'vitest';
import {
  corNormalizada,
  corDoTexto,
  corComoSeraGravada,
  opcoesDeCor,
  type Cor,
} from './cores';

const CAT: Cor[] = [
  { id: 'p', nome: 'PRATA',  hex: '#C0C5CE', ativo: true, apelidos: ['PRATEADO', 'SILVER'] },
  { id: 'c', nome: 'CINZA',  hex: '#6B7280', ativo: true, apelidos: ['GRAFITE', 'CHUMBO'] },
  { id: 'b', nome: 'BRANCO', hex: '#F5F7FA', ativo: true, apelidos: ['BRANCA', 'PEROLA'] },
  { id: 'g', nome: 'GRENA',  hex: '#6E1423', ativo: true, apelidos: ['BORDO', 'VINHO'] },
  { id: 'r', nome: 'ROSA',   hex: '#EC4899', ativo: false, apelidos: [] },
];

describe('corNormalizada', () => {
  it('tira acento, sobe a caixa e colapsa o espaco', () => {
    expect(corNormalizada('  prata   metálico ')).toBe('PRATA METALICO');
  });

  it('pontuacao vira espaco', () => {
    expect(corNormalizada('Cinza-Escuro')).toBe('CINZA ESCURO');
  });

  it('vazio vira null, nunca string vazia', () => {
    expect(corNormalizada('   ')).toBeNull();
    expect(corNormalizada(null)).toBeNull();
    expect(corNormalizada(undefined)).toBeNull();
  });
});

describe('corDoTexto — os quatro degraus', () => {
  it('1) nome exato, ignorando caixa e acento', () => {
    expect(corDoTexto('prata', CAT)?.id).toBe('p');
    expect(corDoTexto('PRATA', CAT)?.id).toBe('p');
  });

  it('2) apelido', () => {
    expect(corDoTexto('Grafite', CAT)?.id).toBe('c');
    expect(corDoTexto('bordô', CAT)?.id).toBe('g');
  });

  it('3) primeira palavra que e um nome do catalogo', () => {
    expect(corDoTexto('PRATA METALICO', CAT)?.id).toBe('p');
    expect(corDoTexto('Branco Pérola', CAT)?.id).toBe('b');
  });

  it('4) primeira palavra que e um apelido', () => {
    expect(corDoTexto('PRATEADO FOSCO', CAT)?.id).toBe('p');
  });

  it('nao casa por aproximacao — desconhecida e desconhecida', () => {
    expect(corDoTexto('XPTO', CAT)).toBeNull();
    expect(corDoTexto('NAO INFORMADA', CAT)).toBeNull();
    expect(corDoTexto('', CAT)).toBeNull();
    expect(corDoTexto(null, CAT)).toBeNull();
  });

  it('cor inativa sai do de-para', () => {
    expect(corDoTexto('ROSA', CAT)).toBeNull();
  });
});

describe('corComoSeraGravada — o espelho do trigger', () => {
  it('reconhecida vira o nome canonico', () => {
    expect(corComoSeraGravada('  prata   metálico ', CAT)).toEqual({
      cor: 'PRATA',
      cor_id: 'p',
      reconhecida: true,
    });
  });

  it('desconhecida ENTRA, em caixa alta e COM acento', () => {
    expect(corComoSeraGravada('Xpto  Metálico', CAT)).toEqual({
      cor: 'XPTO METÁLICO',
      cor_id: null,
      reconhecida: false,
    });
  });

  it('vazia vira null, nunca string vazia', () => {
    expect(corComoSeraGravada('   ', CAT).cor).toBeNull();
    expect(corComoSeraGravada(null, CAT).cor_id).toBeNull();
  });
});

describe('opcoesDeCor', () => {
  it('lista so as ativas, na ordem do catalogo', () => {
    expect(opcoesDeCor(CAT, null)).toEqual(['PRATA', 'CINZA', 'BRANCO', 'GRENA']);
  });

  it('a cor JA GRAVADA que sumiu do catalogo continua na lista', () => {
    // Senao abrir uma ficha antiga mostraria o campo em branco e o primeiro
    // "salvar" apagaria a cor em silencio (regra do 0067).
    expect(opcoesDeCor(CAT, 'VERDE MUSGO')[0]).toBe('VERDE MUSGO');
    expect(opcoesDeCor(CAT, 'ROSA')[0]).toBe('ROSA');
  });

  it('nao duplica quando a cor gravada ja e do catalogo', () => {
    expect(opcoesDeCor(CAT, 'prata')).toEqual(['PRATA', 'CINZA', 'BRANCO', 'GRENA']);
  });
});
