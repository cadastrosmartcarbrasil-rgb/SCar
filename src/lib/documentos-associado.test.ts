import { describe, expect, it } from 'vitest';
import { situacaoCnh, validarEnvioDocumento, mensagemPedirNovaCnh, rotuloTipoDocumento } from './documentos-associado';

describe('situacaoCnh', () => {
  it('sem CNH', () => expect(situacaoCnh(null).nivel).toBe('sem_cnh'));
  it('vencida', () => {
    const s = situacaoCnh('2026-10-30', '2026-11-04');
    expect(s.nivel).toBe('vencida');
    expect(s.dias).toBe(-5);
    expect(s.texto).toContain('30/10/2026');
  });
  it('vence hoje conta como a vencer', () => expect(situacaoCnh('2026-11-04', '2026-11-04').nivel).toBe('a_vencer'));
  it('a vencer em 30 dias', () => expect(situacaoCnh('2026-12-04', '2026-11-04').nivel).toBe('a_vencer'));
  it('valida', () => expect(situacaoCnh('2030-01-01', '2026-11-04').nivel).toBe('valida'));
});

describe('validarEnvioDocumento', () => {
  it('exige tipo', () => expect(validarEnvioDocumento({ tipo: '' })).toMatch(/tipo/));
  it('CNH exige vencimento', () => expect(validarEnvioDocumento({ tipo: 'CNH' })).toMatch(/vencimento/));
  it('CNH com vencimento passa, mesmo vencida', () =>
    expect(validarEnvioDocumento({ tipo: 'CNH', validade: '2020-01-01' }, '2026-11-04')).toBeNull());
  it('CNH com vencimento absurdo', () =>
    expect(validarEnvioDocumento({ tipo: 'CNH', validade: '2090-01-01' }, '2026-11-04')).toMatch(/distante/));
  it('OUTRO exige descricao', () => expect(validarEnvioDocumento({ tipo: 'OUTRO', descricao: ' ' })).toMatch(/Descreva/));
  it('RG passa sem validade', () => expect(validarEnvioDocumento({ tipo: 'RG' })).toBeNull());
});

describe('mensagens', () => {
  it('pede a CNH nova sem cobrar', () => {
    const m = mensagemPedirNovaCnh('JOAO DA SILVA', '2026-10-30');
    expect(m).toContain('Olá, Joao!');
    expect(m).toContain('30/10/2026');
    expect(m.toLowerCase()).not.toMatch(/bloque|multa|cancel/);
  });
  it('rotulo', () => expect(rotuloTipoDocumento('COMPROVANTE_ENDERECO')).toBe('Comprovante de endereço'));
});
