import { describe, expect, it } from 'vitest';
import {
  diasEntre, diasParado, ordenarAgenda, paraDatetimeLocal, resumoAgenda, riscoDevolucao,
  rotuloParado, rotuloRetorno, situacaoAgenda, sugestaoRetorno,
} from './agenda';

// Uma quarta-feira as 15h — hora local, que e como a tela conta.
const agora = new Date(2026, 8, 2, 15, 0, 0);
const em = (d: number, h = 15) => new Date(2026, 8, 2 + d, h, 0, 0).toISOString();

describe('diasEntre', () => {
  it('conta dia de calendario, nao 24h', () => {
    // ontem as 23h: para a pessoa faz 1 dia, mesmo com 16h de diferenca
    expect(diasEntre(new Date(2026, 8, 1, 23, 0).toISOString(), agora)).toBe(1);
    expect(diasEntre(new Date(2026, 8, 2, 1, 0).toISOString(), agora)).toBe(0);
  });

  it('devolve negativo no futuro e null sem data', () => {
    expect(diasEntre(em(3), agora)).toBe(-3);
    expect(diasEntre(null, agora)).toBeNull();
    expect(diasEntre('nao e data', agora)).toBeNull();
  });
});

describe('diasParado', () => {
  it('conta da ultima interacao', () => {
    expect(diasParado(em(-11), em(-40), agora)).toBe(11);
  });

  it('cai na criacao quando o lead nunca foi trabalhado', () => {
    expect(diasParado(null, em(-4), agora)).toBe(4);
  });

  it('nunca e negativo', () => {
    expect(diasParado(em(2), em(-1), agora)).toBe(0);
  });
});

describe('rotuloParado', () => {
  it('fala como gente', () => {
    expect(rotuloParado(0)).toBe('trabalhado hoje');
    expect(rotuloParado(1)).toBe('parado ha 1 dia');
    expect(rotuloParado(9)).toBe('parado ha 9 dias');
  });
});

describe('riscoDevolucao', () => {
  it('avisa ao bater o limite da franquia', () => {
    expect(riscoDevolucao(6, 7)).toBe(false);
    expect(riscoDevolucao(7, 7)).toBe(true);
    expect(riscoDevolucao(30, 7)).toBe(true);
  });

  it('limite 0 desliga a regra', () => {
    expect(riscoDevolucao(90, 0)).toBe(false);
  });
});

describe('situacaoAgenda', () => {
  it('separa vencido, hoje e futuro', () => {
    expect(situacaoAgenda(em(-1), agora)).toBe('ATRASADO');
    expect(situacaoAgenda(new Date(2026, 8, 2, 9, 0).toISOString(), agora)).toBe('HOJE');
    expect(situacaoAgenda(new Date(2026, 8, 2, 18, 0).toISOString(), agora)).toBe('HOJE');
    expect(situacaoAgenda(em(1), agora)).toBe('AGENDADO');
    expect(situacaoAgenda(null, agora)).toBe('SEM_AGENDA');
  });
});

describe('rotuloRetorno', () => {
  it('escreve o retorno do jeito que se fala', () => {
    expect(rotuloRetorno(new Date(2026, 8, 2, 16, 30).toISOString(), agora)).toBe('hoje as 16:30');
    expect(rotuloRetorno(new Date(2026, 8, 3, 9, 0).toISOString(), agora)).toBe('amanha as 09:00');
    expect(rotuloRetorno(em(-1), agora)).toBe('atrasado desde ontem');
    expect(rotuloRetorno(em(-4), agora)).toBe('atrasado ha 4 dias');
    expect(rotuloRetorno(em(6), agora)).toBe('08/09');
    expect(rotuloRetorno(null, agora)).toBeNull();
  });
});

describe('ordenarAgenda e resumoAgenda', () => {
  const itens = [
    { id: 'futuro', proximo_contato_em: em(2) },
    { id: 'atrasado', proximo_contato_em: em(-3) },
    { id: 'hoje', proximo_contato_em: new Date(2026, 8, 2, 17, 0).toISOString() },
    { id: 'sem-data', proximo_contato_em: null },
  ];

  it('poe o mais atrasado na frente e o sem data no fim', () => {
    expect(ordenarAgenda(itens).map((i) => i.id)).toEqual(['atrasado', 'hoje', 'futuro', 'sem-data']);
  });

  it('nao altera a lista original', () => {
    const copia = [...itens];
    ordenarAgenda(itens);
    expect(itens).toEqual(copia);
  });

  it('conta o que pesa no dia', () => {
    expect(resumoAgenda(itens, agora)).toEqual({ atrasados: 1, hoje: 1, total: 4 });
  });
});

describe('sugestaoRetorno', () => {
  it('sugere 9h do dia escolhido', () => {
    expect(sugestaoRetorno(1, agora)).toBe('2026-09-03T09:00');
  });

  it('nao sugere hora que ja passou: joga para a proxima hora cheia', () => {
    expect(sugestaoRetorno(0, agora)).toBe('2026-09-02T16:00');
  });
});

describe('paraDatetimeLocal', () => {
  it('formata sem fuso, que e o que o input datetime-local espera', () => {
    expect(paraDatetimeLocal(new Date(2026, 0, 5, 7, 4))).toBe('2026-01-05T07:04');
  });
});
