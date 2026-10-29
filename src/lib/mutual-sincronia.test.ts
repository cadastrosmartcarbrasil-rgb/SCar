import { describe, it, expect } from 'vitest';
import {
  ENTIDADES_DA_SINCRONIA, unidadesParaCarregar, equipesSemUnidade, resumoDaSincronia,
  modoCapturaInvoice,
} from './mutual-sincronia';

describe('modoCapturaInvoice', () => {
  // 23/10/2026 e sexta; 25/10/2026 e domingo (Sao Paulo)
  const sexta = new Date('2026-10-23T06:20:00Z');
  it('sem marca da rotina, captura tudo', () => {
    expect(modoCapturaInvoice(null, sexta).completa).toBe(true);
  });
  it('com marca recente, incremental desde a marca menos 3 dias', () => {
    expect(modoCapturaInvoice('2026-10-22T06:20:00Z', sexta))
      .toEqual({ completa: false, desde: '2026-10-19T06:20:00Z' });
  });
  it('o filtro leva data E hora (o Mutual recusa so a data com HTTP 400)', () => {
    const m = modoCapturaInvoice('2026-10-25T06:20:46.668Z', new Date('2026-10-28T06:20:00Z'));
    expect(m.completa).toBe(false);
    if (!m.completa) expect(m.desde).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
  it('no domingo, passada completa', () => {
    expect(modoCapturaInvoice('2026-10-24T06:20:00Z', new Date('2026-10-25T06:20:00Z')).completa).toBe(true);
  });
  it('marca velha (rotina parada) ou ilegivel, completa', () => {
    expect(modoCapturaInvoice('2026-10-10T06:20:00Z', sexta).completa).toBe(true);
    expect(modoCapturaInvoice('xx', sexta).completa).toBe(true);
  });
});

describe('ENTIDADES_DA_SINCRONIA', () => {
  it('a equipe vem antes e o veiculo por ultimo', () => {
    expect(ENTIDADES_DA_SINCRONIA[0]).toBe('SALE_TEAM');
    // o evento depois do objeto: o historico le o evento pelo veiculo do objeto
    expect(ENTIDADES_DA_SINCRONIA.at(-1)).toBe('EVENT');
    expect(ENTIDADES_DA_SINCRONIA.indexOf('CONTRACT_OBJECT'))
      .toBeLessThan(ENTIDADES_DA_SINCRONIA.indexOf('EVENT'));
    expect(ENTIDADES_DA_SINCRONIA).toContain('CONTRACT');
    expect(ENTIDADES_DA_SINCRONIA).toContain('PERSON');
  });
});

describe('unidadesParaCarregar', () => {
  it('uma vez por unidade, sem nulos, em ordem estavel', () => {
    expect(unidadesParaCarregar([
      { registro_id: 'b' }, { registro_id: 'a' }, { registro_id: 'b' }, { registro_id: null },
    ])).toEqual(['a', 'b']);
  });
  it('sem equipe ligada, nada a carregar', () => {
    expect(unidadesParaCarregar([])).toEqual([]);
  });
});

describe('equipesSemUnidade', () => {
  it('conta so as equipes sem de-para, a que mais pesa primeiro', () => {
    const r = equipesSemUnidade([
      { sales_team_id: '5' }, { sales_team_id: '60' }, { sales_team_id: '60' },
      { sales_team_id: '61' }, { sales_team_id: null }, { sales_team_id: ' ' },
    ], new Set(['5']));
    expect(r).toEqual([{ equipe: '60', contratos: 2 }, { equipe: '61', contratos: 1 }]);
  });
});

describe('resumoDaSincronia', () => {
  it('tudo certo', () => {
    expect(resumoDaSincronia([{ etapa: 'x', ok: true, detalhe: '' }])).toBe('1/1 etapas ok');
  });
  it('nomeia a falha e o motivo', () => {
    expect(resumoDaSincronia([
      { etapa: 'captura CONTRACT', ok: false, detalhe: 'HTTP 502' },
      { etapa: 'carga X', ok: true, detalhe: '' },
    ])).toBe('1/2 etapas ok; FALHOU: captura CONTRACT (HTTP 502)');
  });
});
