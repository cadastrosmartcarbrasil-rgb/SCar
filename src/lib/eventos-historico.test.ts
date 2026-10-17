import { describe, expect, it } from 'vitest';
import {
  podeLevarAoKanban, resumoTransporte, rotuloEnvolvimento, rotuloTipos, situacaoHistorico,
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

describe('levar ao Kanban (0112)', () => {
  it('so vai quem tem veiculo, data e ainda nao foi', () => {
    expect(podeLevarAoKanban({ veiculo_id: 'v', data_evento: '2026-10-01' }).pode).toBe(true);
    expect(podeLevarAoKanban({ evento_id: 'e', veiculo_id: 'v', data_evento: '2026-10-01' }))
      .toEqual({ pode: false, motivo: 'Ja esta no Kanban' });
    expect(podeLevarAoKanban({ veiculo_id: null, data_evento: '2026-10-01' }).motivo).toBe('Veiculo fora da base');
    expect(podeLevarAoKanban({ veiculo_id: 'v', data_evento: null }).motivo).toBe('Sem data da ocorrencia');
  });

  it('resume o retorno do banco na ordem fixa', () => {
    const r = resumoTransporte([
      { situacao: 'SEM_VEICULO' }, { situacao: 'LEVADO' }, { situacao: 'LEVADO' }, { situacao: 'JA_NO_KANBAN' },
    ]);
    expect(r.levados).toBe(2);
    expect(r.texto).toBe('2 levados ao Kanban · 1 ja estavam no Kanban · 1 sem veiculo na base');
    expect(resumoTransporte([]).texto).toBe('Nada a levar');
  });
});
