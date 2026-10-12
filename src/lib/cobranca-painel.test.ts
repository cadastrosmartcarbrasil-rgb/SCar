import { describe, expect, it } from 'vitest';
import {
  cicloDoDia, compararTaxa, deslocarMes, diasDesde, ehMesCheio, fracao, leituraAutomatica,
  mediaTaxas, periodoCobranca, presetCobrancaAtivo, rotuloMes, semaforo, taxas, taxasDoCiclo,
  textoPp, type NumerosCobranca,
} from './cobranca-painel';

const base: NumerosCobranca = {
  boletos: 6, valor_emitido: 740, valor_venceram: 620, valor_aberto_vencido: 280,
  valor_pago_no_prazo: 190, valor_pago_em_atraso: 150, valor_a_vencer: 120, valor_vence_hoje: 0,
  clientes_venceram: 3, clientes_inadimplentes: 2, primeiros_venceram: 2, primeiros_nao_pagos: 1,
  primeiros_pagos_atraso: 0, reincidentes: 1, regularizados: 1,
};

describe('ciclos de vencimento (espelho de ciclo_vencimento)', () => {
  it('cada dia cai no ciclo mais proximo', () => {
    expect(cicloDoDia(5)).toBe(5);
    expect(cicloDoDia(11)).toBe(10);
    expect(cicloDoDia(26)).toBe(25);
    expect(cicloDoDia(28)).toBe(30);
    expect(cicloDoDia(1)).toBe(30);
  });
});

describe('formulas do documento', () => {
  it('o denominador e o que JA venceu, nunca o emitido', () => {
    const t = taxas(base);
    expect(t.inadFinanceira).toBeCloseTo(280 / 620);   // nao 280/740
    expect(t.inadClientes).toBeCloseTo(2 / 3);
    expect(t.recuperacao).toBeCloseTo(150 / (150 + 280));
    expect(t.pontualidade).toBeCloseTo(190 / 620);
    expect(t.inadInicial).toBeCloseTo(1 / 2);
  });

  it('sem base e null, nunca 0%', () => {
    expect(fracao(0, 0)).toBeNull();
    expect(taxas({ ...base, valor_venceram: 0 }).inadFinanceira).toBeNull();
    expect(taxas(null).inadFinanceira).toBeNull();
  });

  it('a media ignora o recorte sem base', () => {
    const m = mediaTaxas([taxas(base), taxas({ ...base, valor_venceram: 0, valor_aberto_vencido: 0 })]);
    expect(m.inadFinanceira).toBeCloseTo(280 / 620);
  });
});

describe('pontos percentuais x variacao relativa', () => {
  it('agosto 6% e setembro 8%: +2 p.p. e +33,33%', () => {
    const c = compararTaxa(0.08, 0.06);
    expect(c.pp).toBe(2);
    expect(c.relativa).toBeCloseTo(1 / 3);
    expect(textoPp(c.pp)).toBe('+2,0 p.p.');
    expect(textoPp(-0.5)).toBe('-0,5 p.p.');
  });
  it('sem referencia nao inventa variacao', () => {
    expect(compararTaxa(0.08, null)).toEqual({ pp: null, relativa: null });
    expect(compararTaxa(0.05, 0).relativa).toBeNull();
    expect(compararTaxa(0, 0).relativa).toBe(0);
  });
});

describe('semaforo', () => {
  it('meta e limite em percentual', () => {
    expect(semaforo(0.04, 5, 10)).toBe('verde');
    expect(semaforo(0.05, 5, 10)).toBe('verde');
    expect(semaforo(0.07, 5, 10)).toBe('ambar');
    expect(semaforo(0.11, 5, 10)).toBe('vermelho');
    expect(semaforo(null, 5, 10)).toBe('sem_dados');
  });
});

describe('ciclo', () => {
  it('recebimento sobre o emitido e inadimplencia sobre o vencido', () => {
    const t = taxasDoCiclo({
      ciclo: 10, valor_emitido: 1000, valor_venceram: 800, valor_aberto_vencido: 80,
      valor_pago_no_prazo: 600, valor_pago_em_atraso: 120, valor_a_vencer: 200, valor_vence_hoje: 0,
    });
    expect(t.inadimplencia).toBeCloseTo(0.1);
    expect(t.recebimento).toBeCloseTo(0.72);
    expect(t.recuperacao).toBeCloseTo(120 / 200);
  });
});

describe('leitura automatica', () => {
  it('diz para onde a inadimplencia foi, com p.p. e relativo', () => {
    const anterior = { ...base, valor_aberto_vencido: 200 };
    const f = leituraAutomatica(base, anterior, 'o mes anterior');
    expect(f[0].tom).toBe('negativo');
    expect(f[0].texto).toContain('subiu');
    expect(f[0].texto).toContain('p.p.');
    expect(f.some((x) => x.texto.includes('reincidentes'))).toBe(true);
  });
  it('carteira cresce e inadimplencia cai = positivo', () => {
    const anterior = { ...base, valor_emitido: 500, valor_aberto_vencido: 400 };
    const f = leituraAutomatica(base, anterior);
    expect(f.some((x) => x.tom === 'positivo' && x.texto.includes('cresceu e a inadimplencia caiu'))).toBe(true);
  });
  it('sem dado nao fala', () => {
    expect(leituraAutomatica(null, null)).toEqual([]);
  });
});

describe('idade do dado', () => {
  it('conta dias desde a captura', () => {
    expect(diasDesde('2026-10-02T12:00:00Z', new Date('2026-10-12T12:00:00Z'))).toBe(10);
    expect(diasDesde(null)).toBeNull();
  });
});

describe('periodo do painel', () => {
  const hoje = new Date(2026, 9, 12); // 12/10/2026
  it('presets sao meses cheios', () => {
    expect(periodoCobranca('mes_atual', hoje)).toEqual({ inicio: '2026-10-01', fim: '2026-10-31' });
    expect(periodoCobranca('mes_anterior', hoje)).toEqual({ inicio: '2026-09-01', fim: '2026-09-30' });
    expect(periodoCobranca('tres_meses', hoje)).toEqual({ inicio: '2026-07-01', fim: '2026-09-30' });
    expect(periodoCobranca('ano', hoje)).toEqual({ inicio: '2026-01-01', fim: '2026-12-31' });
  });
  it('reconhece o preset e o mes cheio', () => {
    expect(presetCobrancaAtivo({ inicio: '2026-09-01', fim: '2026-09-30' }, hoje)).toBe('mes_anterior');
    expect(ehMesCheio({ inicio: '2026-02-01', fim: '2026-02-28' })).toBe(true);
    expect(ehMesCheio({ inicio: '2026-02-01', fim: '2026-02-27' })).toBe(false);
  });
  it('navega mes a mes', () => {
    expect(deslocarMes('2026-01-01', -1)).toBe('2025-12-01');
    expect(rotuloMes('2026-10-01')).toBe('outubro de 2026');
  });
});
