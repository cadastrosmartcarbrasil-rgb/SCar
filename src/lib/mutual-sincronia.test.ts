import { describe, it, expect } from 'vitest';
import {
  ENTIDADES_DA_SINCRONIA, unidadesParaCarregar, equipesSemUnidade, resumoDaSincronia,
} from './mutual-sincronia';

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
