import { describe, expect, it } from 'vitest';
import { diaAnterior, diaValido, diasDaBaixa, diasParaConfirmar, hojeEmSaoPaulo, resumoDaBaixa, segredoConfere } from './baixa-banco';

describe('baixa-banco', () => {
  it('hoje em Sao Paulo, nao em UTC', () => {
    // 02:30 UTC de 14/10 ainda e 13/10 no Brasil
    expect(hojeEmSaoPaulo(new Date('2026-10-14T02:30:00Z'))).toBe('2026-10-13');
  });
  it('dia anterior atravessa mes e ano', () => {
    expect(diaAnterior('2026-11-01')).toBe('2026-10-31');
    expect(diaAnterior('2027-01-01')).toBe('2026-12-31');
  });
  it('sem dia: ontem e hoje; com dia: so ele', () => {
    expect(diasDaBaixa('2026-10-13')).toEqual(['2026-10-12', '2026-10-13']);
    expect(diasDaBaixa('2026-10-13', '2026-10-01')).toEqual(['2026-10-01']);
  });
  it('dia valido', () => {
    expect(diaValido('2026-10-13')).toBe(true);
    expect(diaValido('13/10/2026')).toBe(false);
    expect(diaValido(null)).toBe(false);
  });
  it('resumo soma em centavos e conta cada desfecho', () => {
    const r = resumoDaBaixa([
      { nosso_numero: '1', situacao: 'BAIXADO', valor_pago: 0.1, valor_divergente: true },
      { nosso_numero: '2', situacao: 'BAIXADO', valor_pago: 0.2 },
      { nosso_numero: '3', situacao: 'JA_PAGO', valor_pago: 5 },
      { nosso_numero: '4', situacao: 'NAO_ENCONTRADO', valor_pago: 5 },
      { nosso_numero: '5', situacao: 'TITULO_CANCELADO', valor_pago: 5 },
      { nosso_numero: null, situacao: 'ERRO', valor_pago: null, erro: 'x' },
    ]);
    expect(r).toEqual({
      lidos: 6, baixados: 2, ja_pagos: 1, nao_encontrados: 1, cancelados: 1, erros: 1, divergentes: 1, valor_baixado: 0.3,
    });
  });
  it('segredo: exige igualdade exata e tamanho minimo', () => {
    const s = 'a'.repeat(32);
    expect(segredoConfere(s, s)).toBe(true);
    expect(segredoConfere('b'.repeat(32), s)).toBe(false);
    expect(segredoConfere(s.slice(1), s)).toBe(false);
    expect(segredoConfere('curto', 'curto')).toBe(false);
    expect(segredoConfere(null, s)).toBe(false);
    expect(segredoConfere('', '')).toBe(false);
  });
});

describe('diasParaConfirmar (webhook)', () => {
  it('data do aviso + ontem + hoje, sem repetir', () => {
    expect(diasParaConfirmar('2026-10-13', '2026-10-10')).toEqual(['2026-10-10', '2026-10-12', '2026-10-13']);
    expect(diasParaConfirmar('2026-10-13', '2026-10-13')).toEqual(['2026-10-13', '2026-10-12']);
  });
  it('sem data ou data invalida: ontem e hoje', () => {
    expect(diasParaConfirmar('2026-10-13')).toEqual(['2026-10-12', '2026-10-13']);
    expect(diasParaConfirmar('2026-10-13', '13/10/2026')).toEqual(['2026-10-12', '2026-10-13']);
  });
});
