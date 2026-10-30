import { describe, expect, it } from 'vitest';
import { alternarOpcional, planoAtendeTipo, planosDoTipo, sugestoesDoPlano } from './planos-oferta';

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
