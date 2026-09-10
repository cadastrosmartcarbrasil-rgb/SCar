import { describe, expect, it } from 'vitest';
import {
  avulsosDoVeiculo, compararTrocaDePlano, mensalidadeCongelada,
  podeSincronizarMensalidade, sentidoDaTroca,
} from './planos';

describe('sentidoDaTroca', () => {
  it('sobe, desce e anda de lado pelo nivel do plano', () => {
    expect(sentidoDaTroca(0, 2)).toBe('UPGRADE');
    expect(sentidoDaTroca(2, 0)).toBe('DOWNGRADE');
    expect(sentidoDaTroca(1, 1)).toBe('LATERAL');
  });

  it('sem plano de um dos lados e entrada ou saida, nao subida', () => {
    expect(sentidoDaTroca(null, 1)).toBe('ENTRADA');
    expect(sentidoDaTroca(1, null)).toBe('SAIDA');
    expect(sentidoDaTroca(null, null)).toBe('LATERAL');
  });

  it('nivel zero nao e confundido com ausencia de plano', () => {
    expect(sentidoDaTroca(0, null)).toBe('SAIDA');
    expect(sentidoDaTroca(null, 0)).toBe('ENTRADA');
  });
});

describe('compararTrocaDePlano', () => {
  it('avulso que o novo plano inclui deixa de ser cobrado a parte', () => {
    const r = compararTrocaDePlano({
      avulsos: ['vidros', 'reserva'],
      idsPlanoAnterior: ['rcf30'],
      idsPlanoNovo: ['rcf30', 'vidros'],
    });
    expect(r.avulsos).toEqual(['reserva']);
    expect(r.incorporados).toEqual(['vidros']);
    expect(r.ganhos).toEqual(['vidros']);
    expect(r.perdidos).toEqual([]);
  });

  it('downgrade anuncia a cobertura perdida sem recolocar nada sozinho', () => {
    const r = compararTrocaDePlano({
      avulsos: [],
      idsPlanoAnterior: ['rcf100', 'vidros', 'reserva30'],
      idsPlanoNovo: ['rcf30'],
    });
    expect(r.perdidos).toEqual(['rcf100', 'vidros', 'reserva30']);
    expect(r.ganhos).toEqual(['rcf30']);
    // nada volta como avulso: mexer no preco e decisao de quem atende
    expect(r.avulsos).toEqual([]);
  });

  it('tirar o plano transforma tudo em perda e mantem os avulsos', () => {
    const r = compararTrocaDePlano({
      avulsos: ['reserva'],
      idsPlanoAnterior: ['vidros'],
      idsPlanoNovo: [],
    });
    expect(r.perdidos).toEqual(['vidros']);
    expect(r.avulsos).toEqual(['reserva']);
  });

  it('nao repete id na saida', () => {
    const r = compararTrocaDePlano({
      avulsos: ['reserva', 'reserva'],
      idsPlanoAnterior: ['vidros', 'vidros'],
      idsPlanoNovo: [],
    });
    expect(r.avulsos).toEqual(['reserva']);
    expect(r.perdidos).toEqual(['vidros']);
  });
});

describe('avulsosDoVeiculo', () => {
  it('grava so o que foi vendido a parte', () => {
    expect(avulsosDoVeiculo(['vidros', 'reserva'], ['vidros'])).toEqual(['reserva']);
  });

  it('limpa ficha antiga que guardou o item do combo como avulso', () => {
    expect(avulsosDoVeiculo(['vidros'], ['vidros'])).toEqual([]);
  });

  it('sem plano, tudo continua avulso', () => {
    expect(avulsosDoVeiculo(['vidros', 'reserva'], [])).toEqual(['vidros', 'reserva']);
  });
});

describe('mensalidadeCongelada', () => {
  it('acusa o override que ficou para tras depois do upgrade', () => {
    expect(mensalidadeCongelada(225.5, 289.9)).toBe(true);
  });

  it('nao acusa diferenca de ponto flutuante', () => {
    expect(mensalidadeCongelada(0.1 + 0.2, 0.3)).toBe(false);
  });

  it('sem override ou sem cotacao nao ha o que comparar', () => {
    expect(mensalidadeCongelada(null, 289.9)).toBe(false);
    expect(mensalidadeCongelada(225.5, null)).toBe(false);
  });
});

describe('podeSincronizarMensalidade', () => {
  it('ficha sem valor: a tela preenche sozinha', () => {
    expect(podeSincronizarMensalidade(null, null)).toBe(true);
    expect(podeSincronizarMensalidade(null, 289.9)).toBe(true);
  });

  it('valor que veio da nossa cotacao continua acompanhando o plano', () => {
    expect(podeSincronizarMensalidade(289.9, 289.9)).toBe(true);
  });

  it('valor negociado nunca e sobrescrito em silencio', () => {
    expect(podeSincronizarMensalidade(225.5, 289.9)).toBe(false);
  });

  it('ficha recem-aberta (sem cotacao para comparar) nao e tocada', () => {
    expect(podeSincronizarMensalidade(225.5, null)).toBe(false);
  });
});
