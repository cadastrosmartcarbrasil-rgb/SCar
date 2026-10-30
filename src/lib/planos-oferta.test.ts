import { describe, expect, it } from 'vitest';
import {
  alternarOpcional, ordenarPorPreferencia, planoAtendeTipo, planoInicial, planosDoTipo, sugestoesDoPlano, valorVisivel,
} from './planos-oferta';

const vidros = { id: 'v', nome: 'Vidros Completo', categoria: 'VIDROS' };
const brisa = { id: 'b', nome: 'Protecao Parabrisas', categoria: 'BENEFICIO' };
const rcf30 = { id: 'r30', nome: 'RCF 30mil', categoria: 'RCF' };
const rcf50 = { id: 'r50', nome: 'RCF 50mil', categoria: 'RCF' };
const reserva = { id: 'cr', nome: 'Carro Reserva 7 dias', categoria: 'BENEFICIO' };
const prods = [vidros, brisa, rcf30, rcf50, reserva];

describe('plano por tipo (0162)', () => {
  const mapa = { moto: ['tMoto'] };
  it('sem tipo marcado = todos; marcado = so ele', () => {
    expect(planoAtendeTipo('livre', 'tCarro', mapa)).toBe(true);
    expect(planoAtendeTipo('moto', 'tMoto', mapa)).toBe(true);
    expect(planoAtendeTipo('moto', 'tCarro', mapa)).toBe(false);
    expect(planoAtendeTipo(null, 'tCarro', mapa)).toBe(true);
    expect(planoAtendeTipo('moto', null, mapa)).toBe(true);
  });
  it('filtra a lista', () => {
    expect(planosDoTipo([{ id: 'moto' }, { id: 'livre' }], 'tCarro', mapa).map((p) => p.id)).toEqual(['livre']);
  });
});

describe('opcionais pre-marcados e troca (0162)', () => {
  it('marcar parabrisa troca o vidros completo', () => {
    expect([...alternarOpcional(['v', 'cr'], 'b', prods)].sort()).toEqual(['b', 'cr']);
  });
  it('faixa de terceiros: uma so', () => {
    expect([...alternarOpcional(['r30'], 'r50', prods)]).toEqual(['r50']);
  });
  it('desmarcar so tira', () => {
    expect([...alternarOpcional(['v', 'cr'], 'v', prods)]).toEqual(['cr']);
  });
  it('grupos diferentes convivem', () => {
    expect([...alternarOpcional(['v'], 'cr', prods)].sort()).toEqual(['cr', 'v']);
  });
  it('sugestoes so do que e oferecido e nao esta no plano', () => {
    expect(sugestoesDoPlano('p', { p: ['v', 'cr', 'x'] }, ['v', 'cr'], ['cr'])).toEqual(['v']);
    expect(sugestoesDoPlano(null, { p: ['v'] }, ['v'])).toEqual([]);
  });
});

describe('plano preferencial (0163)', () => {
  const base = { plano_id: null, preferencial: false };
  const a = { plano_id: 'a', preferencial: false };
  const b = { plano_id: 'b', preferencial: true };
  const c = { plano_id: 'c', preferencial: false };

  it('poe o preferencial no topo e mantem a ordem do resto', () => {
    expect(ordenarPorPreferencia([base, a, b, c]).map((p) => p.plano_id)).toEqual(['b', null, 'a', 'c']);
    expect(ordenarPorPreferencia([base, a, c]).map((p) => p.plano_id)).toEqual([null, 'a', 'c']);
  });

  it('o preferencial ja vem escolhido; sem ele, a reserva', () => {
    expect(planoInicial([base, a, b], a)?.plano_id).toBe('b');
    expect(planoInicial([base, a, c], c)?.plano_id).toBe('c');
    expect(planoInicial([base, a], null)?.plano_id).toBe(null);
    expect(planoInicial([], null)).toBe(null);
  });

  it('esconde o valor dos outros ate o clique', () => {
    const todos = [base, a, b];
    expect(valorVisivel(b, todos, new Set(), 'b')).toBe(true);
    expect(valorVisivel(a, todos, new Set(), 'a')).toBe(false);
    expect(valorVisivel(a, todos, new Set(['a']), 'a')).toBe(true);
    expect(valorVisivel(base, todos, new Set(), 'BASE')).toBe(false);
  });

  it('sem preferencial nada se esconde', () => {
    expect(valorVisivel(a, [base, a, c], new Set(), 'a')).toBe(true);
  });
});
