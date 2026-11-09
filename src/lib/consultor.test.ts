import { describe, expect, it } from 'vitest';
import { consultoresAgrupados, rotuloConsultor } from './consultor';
import type { ConsultorDoVeiculo } from './database.types';

const l = (placa: string, vendedor: string | null, nome: string | null, status = 'ativo', ativo: boolean | null = true): ConsultorDoVeiculo => ({
  veiculo_id: placa, placa, chassi: null, status, vendedor_id: vendedor, consultor: nome,
  consultor_telefone: null, consultor_email: null, consultor_ativo: ativo, consultor_regional: 'SP',
});

describe('consultor do veiculo', () => {
  it('agrupa por consultor, sem consultor no fim', () => {
    const g = consultoresAgrupados([
      l('AAA1A11', null, null),
      l('BBB1B11', 'v1', 'CLAUDIA'),
      l('CCC1C11', 'v1', 'CLAUDIA'),
      l('DDD1D11', 'v2', 'RENATO'),
    ]);
    expect(g.map((x) => x.nome)).toEqual(['CLAUDIA', 'RENATO', 'Sem consultor']);
    expect(g[0].placas).toEqual(['BBB1B11', 'CCC1C11']);
  });

  it('so os da base; se todos sairam, usa todos', () => {
    expect(consultoresAgrupados([l('AAA1A11', 'v1', 'A'), l('BBB1B11', 'v2', 'B', 'inativo')]).map((x) => x.nome)).toEqual(['A']);
    expect(consultoresAgrupados([l('BBB1B11', 'v2', 'B', 'inativo')]).map((x) => x.nome)).toEqual(['B']);
  });

  it('rotulo', () => {
    expect(rotuloConsultor(l('A', 'v1', 'CLAUDIA'))).toBe('CLAUDIA · SP');
    expect(rotuloConsultor(l('A', 'v1', 'CLAUDIA', 'ativo', false))).toBe('CLAUDIA (inativo) · SP');
    expect(rotuloConsultor(l('A', null, null))).toBe('Sem consultor');
    expect(rotuloConsultor(null)).toBe('Sem consultor');
  });
});
