import { describe, it, expect } from 'vitest';
import {
  normalizarDigitos, imeiFormatoValido, imeiLuhnValido, chipFormatoValido,
  formatarChip, temRastreador, situacaoRastreamento, validarRastreador,
  type DadosRastreador,
} from './rastreador';

const base: DadosRastreador = { rastreador_imei: null, rastreador_chip: null, empresa_rastreamento_id: null };

describe('normalizacao', () => {
  it('mantem so digitos', () => {
    expect(normalizarDigitos(' 86.012-345 678 9012 ')).toBe('860123456789012');
    expect(normalizarDigitos(null)).toBe('');
  });
});

describe('IMEI', () => {
  it('aceita 14 a 17 digitos (mesmo check do banco)', () => {
    expect(imeiFormatoValido('86012345678901')).toBe(true);     // 14
    expect(imeiFormatoValido('860123456789012')).toBe(true);    // 15
    expect(imeiFormatoValido('86012345678901234')).toBe(true);  // 17
    expect(imeiFormatoValido('8601234567890')).toBe(false);     // 13
    expect(imeiFormatoValido('860123456789012345')).toBe(false);// 18
    expect(imeiFormatoValido('')).toBe(false);
  });
  it('Luhn: valida o digito verificador do IMEI de 15 posicoes', () => {
    expect(imeiLuhnValido('490154203237518')).toBe(true);  // IMEI de exemplo (3GPP)
    expect(imeiLuhnValido('490154203237519')).toBe(false); // DV trocado
    expect(imeiLuhnValido('86012345678901')).toBe(false);  // 14 digitos: nao se aplica
  });
});

describe('chip', () => {
  it('aceita 8 a 22 digitos', () => {
    expect(chipFormatoValido('5511998877665')).toBe(true);
    expect(chipFormatoValido('8955170000000000000')).toBe(true); // ICCID
    expect(chipFormatoValido('1234567')).toBe(false);
  });
  it('formata telefone BR e ICCID', () => {
    expect(formatarChip('11998877665')).toBe('(11) 99887-7665');
    expect(formatarChip('1133224455')).toBe('(11) 3322-4455');
    expect(formatarChip('8955170000000000000')).toBe('8955 1700 0000 0000 000');
    expect(formatarChip(null)).toBe('');
  });
});

describe('situacao do rastreamento', () => {
  const completo: DadosRastreador = { rastreador_imei: '860123456789012', rastreador_chip: '5511998877665', empresa_rastreamento_id: 'er-1' };
  it('completo com IMEI + chip + prestador', () => {
    expect(situacaoRastreamento(completo)).toBe('COMPLETO');
    expect(temRastreador(completo)).toBe(true);
  });
  it('incompleto quando falta o chip', () => {
    expect(situacaoRastreamento({ ...completo, rastreador_chip: null })).toBe('INCOMPLETO');
  });
  it('pendente quando a regra exige e nada foi preenchido', () => {
    expect(situacaoRastreamento(base, true)).toBe('PENDENTE');
    expect(situacaoRastreamento(base, false)).toBe('NAO_EXIGE');
    expect(temRastreador(base)).toBe(false);
  });
});

describe('validacao do formulario', () => {
  it('vazio e valido (nem todo veiculo tem rastreador)', () => {
    expect(validarRastreador(base)).toBeNull();
  });
  it('cobra prestador quando ha IMEI ou chip', () => {
    expect(validarRastreador({ ...base, rastreador_imei: '860123456789012' }))
      .toBe('Informe a empresa de rastreamento ("Rastreador por")');
  });
  it('reclama de tamanho invalido', () => {
    expect(validarRastreador({ ...base, rastreador_imei: '123', empresa_rastreamento_id: 'er-1' }))
      .toBe('IMEI deve ter de 14 a 17 digitos');
    expect(validarRastreador({ ...base, rastreador_chip: '123', empresa_rastreamento_id: 'er-1' }))
      .toBe('Numero do chip deve ter de 8 a 22 digitos');
  });
  it('completo passa', () => {
    expect(validarRastreador({ rastreador_imei: '860123456789012', rastreador_chip: '5511998877665', empresa_rastreamento_id: 'er-1' })).toBeNull();
  });
});
