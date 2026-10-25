import { describe, expect, it } from 'vitest';
import { observacaoDoAvulso, validarBoletoAvulso, type EntradaBoletoAvulso } from './boleto-avulso';

const base: EntradaBoletoAvulso = {
  tipo: { ativo: true, exige_veiculo: false, nome: 'Avulso' },
  veiculoId: null, valor: 50, vencimento: '2026-10-30', descricao: '', hoje: '2026-10-25',
};

describe('validarBoletoAvulso', () => {
  it('aceita o caso comum', () => expect(validarBoletoAvulso(base)).toBeNull());
  it('exige o tipo e que esteja ativo', () => {
    expect(validarBoletoAvulso({ ...base, tipo: null })).toMatch(/tipo/);
    expect(validarBoletoAvulso({ ...base, tipo: { ...base.tipo!, ativo: false } })).toMatch(/inativo/);
  });
  it('tipo que exige veiculo recusa sem veiculo', () => {
    const tipo = { ativo: true, exige_veiculo: true, nome: 'Vistoria' };
    expect(validarBoletoAvulso({ ...base, tipo })).toMatch(/Vistoria precisa do veículo/);
    expect(validarBoletoAvulso({ ...base, tipo, veiculoId: 'v1' })).toBeNull();
  });
  it('valor positivo e ate o teto', () => {
    expect(validarBoletoAvulso({ ...base, valor: 0 })).toMatch(/valor/);
    expect(validarBoletoAvulso({ ...base, valor: null })).toMatch(/valor/);
    expect(validarBoletoAvulso({ ...base, valor: 100000.01 })).toMatch(/máximo/);
  });
  it('vencimento de hoje ate 90 dias', () => {
    expect(validarBoletoAvulso({ ...base, vencimento: '2026-10-25' })).toBeNull();
    expect(validarBoletoAvulso({ ...base, vencimento: '2026-10-24' })).toMatch(/passado/);
    expect(validarBoletoAvulso({ ...base, vencimento: '2027-01-23' })).toBeNull();
    expect(validarBoletoAvulso({ ...base, vencimento: '2027-01-24' })).toMatch(/90 dias/);
    expect(validarBoletoAvulso({ ...base, vencimento: '' })).toMatch(/vencimento/);
  });
  it('descricao ate 200', () => {
    expect(validarBoletoAvulso({ ...base, descricao: 'x'.repeat(201) })).toMatch(/200/);
  });
});

describe('observacaoDoAvulso', () => {
  it('igual a do banco', () => {
    expect(observacaoDoAvulso('Vistoria', ' de retorno ')).toBe('Boleto avulso — Vistoria: de retorno');
    expect(observacaoDoAvulso('Avulso', '')).toBe('Boleto avulso — Avulso');
  });
});
