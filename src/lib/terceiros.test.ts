import { describe, expect, it } from 'vitest';
import {
  erroFavorecidoEvento, resumoFinanceiroEvento, rotuloVinculo, terceiroPendente,
  tipoFavorecido, validarTerceiro,
} from './terceiros';

describe('validarTerceiro', () => {
  it('exige nome', () => {
    expect(validarTerceiro({})).toContain('Informe o nome do terceiro');
    expect(validarTerceiro({ nome: 'Fulano' })).toEqual([]);
  });
  it('valida CPF/CNPJ conforme o tipo de pessoa (com ou sem mascara)', () => {
    expect(validarTerceiro({ nome: 'A', cpf_cnpj: '529.982.247-25' })).toEqual([]);
    expect(validarTerceiro({ nome: 'A', cpf_cnpj: '123.456.789-00' })).toContain('CPF do terceiro invalido');
    expect(validarTerceiro({ nome: 'A', tipo_pessoa: 'PJ', cpf_cnpj: '11.222.333/0001-81' })).toEqual([]);
    expect(validarTerceiro({ nome: 'A', tipo_pessoa: 'PJ', cpf_cnpj: '52998224725' })).toContain('CNPJ do terceiro invalido');
  });
  it('exige condutor quando ele nao e o proprietario', () => {
    expect(validarTerceiro({ nome: 'A', condutor_e_proprietario: false })).toContain('Informe o nome do condutor');
    expect(validarTerceiro({ nome: 'A', condutor_e_proprietario: false, condutor_nome: 'B', condutor_cpf: '111' }))
      .toContain('CPF do condutor invalido');
  });
  it('valida placa so quando ha veiculo', () => {
    expect(validarTerceiro({ nome: 'A', veiculo_placa: 'abc-1d23' })).toEqual([]);
    expect(validarTerceiro({ nome: 'A', veiculo_placa: 'ZZ' })).toContain('Placa do veiculo do terceiro invalida');
    expect(validarTerceiro({ nome: 'A', possui_veiculo: false, veiculo_placa: 'ZZ' })).toEqual([]);
  });
  it('exige seguradora quando possui seguro', () => {
    expect(validarTerceiro({ nome: 'A', possui_seguro: true })).toContain('Informe a seguradora do terceiro');
  });
});

describe('vinculo e pendencia', () => {
  it('monta o rotulo Terceiro do Evento X do Associado Y', () => {
    expect(rotuloVinculo('EVT-1-T01', 'EVT-1', 'Maria')).toBe('Terceiro EVT-1-T01 · Evento EVT-1 · Associado Maria');
  });
  it('acusa evento com terceiros informados e nenhum cadastrado', () => {
    expect(terceiroPendente(true, 0)).toBe(true);
    expect(terceiroPendente(true, 1)).toBe(false);
    expect(terceiroPendente(false, 0)).toBe(false);
  });
});

describe('favorecido das contas do evento', () => {
  const base = { tipo: 'DESPESA' as const, evento_id: 'e1', fornecedor_id: null, evento_terceiro_id: null };
  it('exige fornecedor ou terceiro em despesa de evento', () => {
    expect(erroFavorecidoEvento(base)).toMatch(/exige favorecido/);
    expect(erroFavorecidoEvento({ ...base, fornecedor_id: 'f1' })).toBeNull();
    expect(erroFavorecidoEvento({ ...base, evento_terceiro_id: 't1' })).toBeNull();
  });
  it('nao exige em receita nem fora de evento', () => {
    expect(erroFavorecidoEvento({ ...base, tipo: 'RECEITA' })).toBeNull();
    expect(erroFavorecidoEvento({ ...base, evento_id: null })).toBeNull();
  });
  it('fornecedor manda; sem fornecedor o favorecido e o terceiro', () => {
    expect(tipoFavorecido({ fornecedor_id: 'f1', evento_terceiro_id: 't1' })).toBe('FORNECEDOR');
    expect(tipoFavorecido({ fornecedor_id: null, evento_terceiro_id: 't1' })).toBe('TERCEIRO');
    expect(tipoFavorecido({ fornecedor_id: null, evento_terceiro_id: null })).toBeNull();
  });
});

describe('resumoFinanceiroEvento', () => {
  it('soma em centavos e ignora cancelados', () => {
    const r = resumoFinanceiroEvento([
      { tipo: 'DESPESA', status: 'pendente', valor_original: 0.1, valor_pago: 0, valor_saldo: 0.1 },
      { tipo: 'DESPESA', status: 'pago_parcial', valor_original: 0.2, valor_pago: 0.1, valor_saldo: 0.1 },
      { tipo: 'DESPESA', status: 'cancelado', valor_original: 999, valor_pago: 0, valor_saldo: 999 },
      { tipo: 'RECEITA', status: 'quitado', valor_original: 0.05, valor_pago: 0.05, valor_saldo: 0 },
    ]);
    expect(r.aPagar).toBe(0.3);
    expect(r.pago).toBe(0.1);
    expect(r.saldoPagar).toBe(0.2);
    expect(r.aReceber).toBe(0.05);
    expect(r.custoLiquido).toBe(0.25);
  });
});
