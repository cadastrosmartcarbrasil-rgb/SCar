import { describe, it, expect } from 'vitest';
import {
  produtoAtendeTipo, produtosParaTipo, rotuloTiposDoProduto, regraRastreadorCobra, semRastreadorDaRegra, opcionaisOferecidos, coberturasDoVeiculo,
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

describe('opcionaisOferecidos', () => {
  const moto = 't-moto';
  const carro = 't-carro';
  const produtos = [
    { id: 'casco', obrigatorio: true, status: true },
    { id: 'parabrisa', obrigatorio: false, status: true },
    { id: 'reserva', obrigatorio: false, status: true },
    { id: 'rast', obrigatorio: false, status: true, rastreador_avulso: true },
    { id: 'velho', obrigatorio: false, status: false },
    { id: 'vida', obrigatorio: false, status: true },
  ];
  const mapa = { parabrisa: [carro], reserva: [carro] };
  it('moto nao ve parabrisa nem carro reserva; obrigatorio, inativo e o do plano saem', () => {
    const r = opcionaisOferecidos({
      produtos, tipoVeiculoId: moto, tiposPorProduto: mapa, idsDoPlano: ['vida'], contratados: [],
      regraRastreadorCobra: false,
    });
    expect(r.map((p) => p.id)).toEqual(['rast']);
  });
  it('o contratado fica, marcado, mesmo fora do tipo ou inativo', () => {
    const r = opcionaisOferecidos({
      produtos, tipoVeiculoId: moto, tiposPorProduto: mapa, idsDoPlano: [], contratados: ['parabrisa', 'velho'],
      regraRastreadorCobra: true,
    });
    expect(r.map((p) => [p.id, p.foraDoTipo])).toEqual([['parabrisa', true], ['velho', false], ['vida', false]]);
  });
});

describe('coberturasDoVeiculo', () => {
  it('separa plano e opcionais e tira a taxa administrativa', () => {
    const r = coberturasDoVeiculo([
      { nome: 'Taxa', origem: 'PLANO' as const, categoria: 'ADMIN' },
      { nome: 'Casco', origem: 'PLANO' as const, categoria: 'CASCO' },
      { nome: 'Vidros', origem: 'PLANO' as const, categoria: 'VIDROS' },
      { nome: 'Vida', origem: 'AVULSO' as const, categoria: 'BENEFICIO' },
    ]);
    expect(r.plano.map((i) => i.nome)).toEqual(['Casco', 'Vidros']);
    expect(r.opcionais.map((i) => i.nome)).toEqual(['Vida']);
  });
});
