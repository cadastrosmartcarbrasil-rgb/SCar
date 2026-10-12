import { describe, expect, it } from 'vitest';
import {
  faixaDeAtraso, mensagemCobranca, ORDEM_SITUACOES, parcelasIguais, situacaoFila,
  situacaoParcela, somarDias, statusAcordo, taxaCumprimento, validarAcordo,
} from './cobranca-fila';

const HOJE = '2026-10-12';

describe('faixaDeAtraso (espelho de cobranca_faixa_atraso)', () => {
  it('limites das faixas', () => {
    expect(faixaDeAtraso(0)).toBeNull();
    expect(faixaDeAtraso(null)).toBeNull();
    expect(faixaDeAtraso(5)).toBe('D01_05');
    expect(faixaDeAtraso(6)).toBe('D06_10');
    expect(faixaDeAtraso(15)).toBe('D11_15');
    expect(faixaDeAtraso(30)).toBe('D16_30');
    expect(faixaDeAtraso(31)).toBe('D31_60');
    expect(faixaDeAtraso(90)).toBe('D61_90');
    expect(faixaDeAtraso(91)).toBe('D90_MAIS');
  });
});

describe('situacaoParcela', () => {
  const base = { vencimento: '2026-10-05', acumulado: 100, pagoAte: 0, quitado: false, hoje: HOJE };
  it('pago cobre o acumulado = cumprida', () => {
    expect(situacaoParcela({ ...base, pagoAte: 100 })).toBe('cumprida');
    expect(situacaoParcela({ ...base, pagoAte: 99.995 })).toBe('cumprida');
  });
  it('venceu ha mais de 3 dias sem pagar = quebrada', () => {
    expect(situacaoParcela(base)).toBe('quebrada');
  });
  it('dentro do prazo de baixa = aguardando', () => {
    expect(situacaoParcela({ ...base, vencimento: '2026-10-09' })).toBe('aguardando_baixa');
    expect(situacaoParcela({ ...base, vencimento: '2026-10-08' })).toBe('quebrada');
  });
  it('ainda nao venceu', () => {
    expect(situacaoParcela({ ...base, vencimento: HOJE })).toBe('a_vencer');
  });
  it('quitou a divida inteira: cumpre o que ainda nao tinha quebrado', () => {
    expect(situacaoParcela({ ...base, vencimento: '2026-10-20', quitado: true })).toBe('cumprida');
    expect(situacaoParcela({ ...base, quitado: true })).toBe('quebrada');
  });
});

describe('statusAcordo', () => {
  it('cancelado vence tudo', () => expect(statusAcordo(true, ['cumprida'])).toBe('CANCELADO'));
  it('todas cumpridas', () => expect(statusAcordo(false, ['cumprida', 'cumprida'])).toBe('CUMPRIDO'));
  it('uma quebrada quebra o acordo', () => expect(statusAcordo(false, ['cumprida', 'quebrada', 'a_vencer'])).toBe('QUEBRADO'));
  it('em andamento', () => expect(statusAcordo(false, ['cumprida', 'a_vencer'])).toBe('EM_ANDAMENTO'));
});

describe('situacaoFila (espelho de cobranca_fila_base)', () => {
  const l = {
    hoje: HOJE, vencidoDesde: '2026-09-01', contatoEm: null as string | null, retornoEm: null as string | null,
    acordoStatus: null as null | 'QUEBRADO' | 'EM_ANDAMENTO', quebraEm: null as string | null,
  };
  it('sem contato', () => expect(situacaoFila(l)).toBe('sem_contato'));
  it('contato antes da divida atual nao conta', () => {
    expect(situacaoFila({ ...l, contatoEm: '2026-08-20T10:00:00Z', retornoEm: '2026-08-22' })).toBe('sem_contato');
  });
  it('retorno hoje / atrasado / aguardando', () => {
    expect(situacaoFila({ ...l, contatoEm: '2026-10-10', retornoEm: HOJE })).toBe('retorno_hoje');
    expect(situacaoFila({ ...l, contatoEm: '2026-10-01', retornoEm: '2026-10-05' })).toBe('retorno_atrasado');
    expect(situacaoFila({ ...l, contatoEm: HOJE, retornoEm: '2026-10-14' })).toBe('aguardando');
  });
  it('sem data de retorno: volta em 2 dias', () => {
    expect(situacaoFila({ ...l, contatoEm: '2026-10-10' })).toBe('retorno_hoje');
  });
  it('promessa quebrada fica no topo ate alguem falar com o associado', () => {
    const q = { ...l, acordoStatus: 'QUEBRADO' as const, quebraEm: '2026-10-09', contatoEm: '2026-10-01' };
    expect(situacaoFila(q)).toBe('promessa_quebrada');
    expect(situacaoFila({ ...q, contatoEm: '2026-10-10', retornoEm: '2026-10-15' })).toBe('aguardando');
  });
  it('promessa em dia', () => expect(situacaoFila({ ...l, acordoStatus: 'EM_ANDAMENTO' })).toBe('promessa_em_dia'));
  it('a ordem da fila e a prioridade', () => {
    expect(ORDEM_SITUACOES[0]).toBe('promessa_quebrada');
    expect(ORDEM_SITUACOES[ORDEM_SITUACOES.length - 1]).toBe('promessa_em_dia');
  });
});

describe('validarAcordo', () => {
  it('promessa valida', () => {
    expect(validarAcordo('PROMESSA', [{ vencimento: HOJE, valor: 100 }], HOJE)).toEqual([]);
  });
  it('promessa com 2 parcelas e acordo com 1 sao recusados', () => {
    expect(validarAcordo('PROMESSA', [{ vencimento: HOJE, valor: 1 }, { vencimento: '2026-11-12', valor: 1 }], HOJE)).toHaveLength(1);
    expect(validarAcordo('ACORDO', [{ vencimento: HOJE, valor: 1 }], HOJE)).toHaveLength(1);
  });
  it('data no passado, depois de 1 ano, fora de ordem e valor zero', () => {
    expect(validarAcordo('PROMESSA', [{ vencimento: '2026-10-11', valor: 10 }], HOJE)[0]).toMatch(/hoje/);
    expect(validarAcordo('PROMESSA', [{ vencimento: '2027-10-13', valor: 10 }], HOJE)[0]).toMatch(/1 ano/);
    expect(validarAcordo('ACORDO', [{ vencimento: '2026-11-12', valor: 10 }, { vencimento: '2026-11-12', valor: 10 }], HOJE)[0])
      .toMatch(/crescente/);
    expect(validarAcordo('PROMESSA', [{ vencimento: HOJE, valor: 0 }], HOJE)[0]).toMatch(/positivo/);
  });
});

describe('parcelasIguais', () => {
  it('centavos na ultima e mes a mes', () => {
    const p = parcelasIguais(100, 3, '2026-10-31');
    expect(p.map((x) => x.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(p.map((x) => x.vencimento)).toEqual(['2026-10-31', '2026-11-30', '2026-12-31']);
  });
  it('nada para total zero', () => expect(parcelasIguais(0, 3, HOJE)).toEqual([]));
});

describe('taxaCumprimento', () => {
  it('em andamento fica fora do denominador', () => {
    expect(taxaCumprimento(3, 1)).toBe(0.75);
    expect(taxaCumprimento(0, 0)).toBeNull();
  });
});

describe('somarDias e mensagem', () => {
  it('soma dias sem fuso', () => expect(somarDias('2026-10-31', 1)).toBe('2026-11-01'));
  it('mensagem cita o primeiro nome e o total', () => {
    const m = mensagemCobranca({ associado: 'JOÃO DA SILVA', boletos: 2, valor: 250, placas: 'ABC1D23' });
    expect(m).toMatch(/^Olá, João!/);
    expect(m).toContain('2 mensalidades em aberto do veículo ABC1D23');
    expect(m).toContain('R$');
  });
});
