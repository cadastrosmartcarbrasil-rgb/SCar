import { describe, expect, it } from 'vitest';
import { identificacaoVeiculo, normalizarPlaca, placaPendente, placaValida, validarIdentidadeVeiculo } from './placa';

describe('placa', () => {
  it('normaliza e valida antiga e Mercosul', () => {
    expect(normalizarPlaca('abc-1d23')).toBe('ABC1D23');
    expect(placaValida('ABC1234')).toBe(true);
    expect(placaValida('ABC1D23')).toBe(true);
    expect(placaValida('UP11F29')).toBe(false);
  });
});

describe('identificacaoVeiculo (0136)', () => {
  it('com placa, mostra a placa', () => {
    expect(identificacaoVeiculo('ABC1D23', '9C6SG5920R0028234')).toBe('ABC1D23');
  });

  it('0 km sem placa e identificado pelo FINAL do chassi', () => {
    expect(identificacaoVeiculo(null, '9c6sg5920r0028234')).toBe('0 KM · CHASSI …028234');
  });

  it('placa em branco conta como sem placa', () => {
    expect(identificacaoVeiculo('  ', '9C6SG5920R0028234')).toBe('0 KM · CHASSI …028234');
  });

  it('sem placa e sem chassi nao inventa nada', () => {
    expect(identificacaoVeiculo(null, null)).toBe('0 KM · SEM PLACA');
  });

  it('placaPendente', () => {
    expect(placaPendente(null)).toBe(true);
    expect(placaPendente('')).toBe(true);
    expect(placaPendente('ABC1D23')).toBe(false);
  });
});

describe('validarIdentidadeVeiculo (0136)', () => {
  it('placa valida passa, invalida nao', () => {
    expect(validarIdentidadeVeiculo({ placa: 'ABC1D23' })).toBeNull();
    expect(validarIdentidadeVeiculo({ placa: 'AB1' })).toBe('Placa inválida');
  });
  it('sem placa e sem marcar 0 km e recusado', () => {
    expect(validarIdentidadeVeiculo({ placa: '', chassi: '9C6SG5920R0028234' })).toMatch(/0 km/);
  });
  it('0 km sem placa exige chassi de 17', () => {
    expect(validarIdentidadeVeiculo({ zero_km: true, chassi: '9C6SG59' })).toMatch(/chassi/);
    expect(validarIdentidadeVeiculo({ zero_km: true, chassi: '9c6sg5920r0028234' })).toBeNull();
  });
  it('0 km que JA ganhou placa segue valido', () => {
    expect(validarIdentidadeVeiculo({ placa: 'ABC1D23', zero_km: true })).toBeNull();
  });
});
