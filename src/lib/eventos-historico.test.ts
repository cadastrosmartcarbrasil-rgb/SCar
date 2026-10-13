import { describe, expect, it } from 'vitest';
import {
  rotuloEnvolvimento, rotuloTipos, situacaoHistorico,
} from './eventos-historico';

describe('situacaoHistorico', () => {
  it('so a data de conclusao prova encerramento', () => {
    expect(situacaoHistorico({ data_conclusao: '2024-04-01' })).toBe('CONCLUIDO');
    expect(situacaoHistorico({ data_conclusao: null })).toBe('SEM_ENCERRAMENTO');
  });
});

describe('rotulos', () => {
  it('tipos juntos, vazio vira nao classificado', () => {
    expect(rotuloTipos(['COLISÃO', 'PARABRISA'])).toBe('COLISÃO + PARABRISA');
    expect(rotuloTipos([])).toBe('Nao classificado');
    expect(rotuloTipos(null)).toBe('Nao classificado');
  });
  it('envolvimento com e sem acento', () => {
    expect(rotuloEnvolvimento('VITIMA')).toBe('Vitima');
    expect(rotuloEnvolvimento('CAUSADOR')).toBe('Causador');
    expect(rotuloEnvolvimento('NÃO SE APLICA')).toBeNull();
    expect(rotuloEnvolvimento(null)).toBeNull();
  });
});
