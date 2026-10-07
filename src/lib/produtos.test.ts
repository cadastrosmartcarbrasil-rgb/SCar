import { describe, it, expect } from 'vitest';
import {
  produtoAtendeTipo, produtosParaTipo, rotuloTiposDoProduto, regraRastreadorCobra, semRastreadorDaRegra,
  type TiposPorProduto,
} from './produtos';

const PASSEIO = 'tp-passeio';
const MOTO = 'tp-moto';
const mapa: TiposPorProduto = { vidro: [PASSEIO], reserva: [PASSEIO, 'tp-pickup'] };

describe('produtoAtendeTipo (espelho de produto_atende_tipo, 0089)', () => {
  it('sem tipo marcado vale para todos', () => {
    expect(produtoAtendeTipo('app', MOTO, mapa)).toBe(true);
    expect(produtoAtendeTipo('app', MOTO, undefined)).toBe(true);
  });
  it('lista vazia tambem e "todos"', () => {
    expect(produtoAtendeTipo('x', MOTO, { x: [] })).toBe(true);
  });
  it('restrito: atende so o tipo marcado', () => {
    expect(produtoAtendeTipo('vidro', PASSEIO, mapa)).toBe(true);
    expect(produtoAtendeTipo('vidro', MOTO, mapa)).toBe(false);
  });
  it('tipo ainda nao escolhido nao filtra', () => {
    expect(produtoAtendeTipo('vidro', '', mapa)).toBe(true);
    expect(produtoAtendeTipo('vidro', null, mapa)).toBe(true);
  });
});

describe('produtosParaTipo', () => {
  const produtos = [{ id: 'vidro', nome: 'Parabrisa' }, { id: 'app', nome: 'APP' }, { id: 'reserva', nome: 'Carro reserva' }];

  it('moto nao recebe parabrisa nem carro reserva', () => {
    expect(produtosParaTipo(produtos, MOTO, mapa).map((p) => p.id)).toEqual(['app']);
  });
  it('carro recebe tudo, nada fora do tipo', () => {
    const r = produtosParaTipo(produtos, PASSEIO, mapa);
    expect(r.map((p) => p.id)).toEqual(['vidro', 'app', 'reserva']);
    expect(r.every((p) => !p.foraDoTipo)).toBe(true);
  });
  it('o que ja esta gravado continua, marcado como fora do tipo', () => {
    const r = produtosParaTipo(produtos, MOTO, mapa, ['vidro']);
    expect(r.map((p) => [p.id, p.foraDoTipo])).toEqual([['vidro', true], ['app', false]]);
  });
});

describe('rotuloTiposDoProduto', () => {
  const nome = (id: string) => ({ [PASSEIO]: 'Passeio', 'tp-pickup': 'Pick-up/Van' } as Record<string, string>)[id];
  it('sem restricao', () => expect(rotuloTiposDoProduto('app', mapa, nome)).toBe('Todos os tipos'));
  it('com restricao, em ordem alfabetica', () =>
    expect(rotuloTiposDoProduto('reserva', mapa, nome)).toBe('Passeio, Pick-up/Van'));
});

describe('rastreador opcional x regra do tipo (0090)', () => {
  const moto = { exige_rastreador: true, valor_limite_isencao: 15999.99 };
  it('a regra cobra so ACIMA do limite', () => {
    expect(regraRastreadorCobra(moto, 14225)).toBe(false);
    expect(regraRastreadorCobra(moto, 15999.99)).toBe(false);
    expect(regraRastreadorCobra(moto, 16000)).toBe(true);
  });
  it('tipo que nao exige, ou dado faltando, nunca cobra', () => {
    expect(regraRastreadorCobra({ exige_rastreador: false, valor_limite_isencao: 0 }, 90000)).toBe(false);
    expect(regraRastreadorCobra(undefined, 90000)).toBe(false);
    expect(regraRastreadorCobra(moto, null)).toBe(false);
  });
  const lista = [
    { id: 'rast', rastreador_avulso: true },
    { id: 'rastreamento', rastreador_avulso: false },
    { id: 'app' },
  ];
  it('abaixo do minimo o opcional e oferecido', () => {
    expect(semRastreadorDaRegra(lista, false).map((p) => p.id)).toEqual(['rast', 'rastreamento', 'app']);
  });
  it('acima do minimo some — mas o produto de rastreamento (plano) fica', () => {
    expect(semRastreadorDaRegra(lista, true).map((p) => p.id)).toEqual(['rastreamento', 'app']);
  });
  it('o que ja esta gravado continua na lista', () => {
    expect(semRastreadorDaRegra(lista, true, ['rast']).map((p) => p.id)).toEqual(['rast', 'rastreamento', 'app']);
  });
});
