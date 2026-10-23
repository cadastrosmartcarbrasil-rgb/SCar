import { describe, expect, it } from 'vitest';
import {
  boletosFuturosDoVeiculo, calcularProRata, cicloDaData, cicloJaPago, diasEntre,
  textoDoProRata, validarCancelamento,
} from './pro-rata';

// Os mesmos casos da suite supabase/tests/0144_cancelamento_pro_rata.test.sql.
describe('cicloDaData (pos-pago)', () => {
  it('antes do vencimento: ciclo comeca no vencimento do mes anterior', () => {
    expect(cicloDaData(20, '2026-10-05')).toEqual({
      inicio: '2026-09-20', fim: '2026-10-19', vencimento: '2026-10-20', dias: 30,
    });
  });
  it('no dia do vencimento abre o ciclo novo', () => {
    expect(cicloDaData(20, '2026-10-20')).toEqual({
      inicio: '2026-10-20', fim: '2026-11-19', vencimento: '2026-11-20', dias: 31,
    });
  });
  it('dia 31 cai no ultimo dia de fevereiro', () => {
    const c = cicloDaData(31, '2026-02-15');
    expect(c.inicio).toBe('2026-01-31');
    expect(c.vencimento).toBe('2026-02-28');
    expect(c.dias).toBe(28);
  });
  it('virada de ano', () => {
    expect(cicloDaData(10, '2027-01-05')).toMatchObject({ inicio: '2026-12-10', vencimento: '2027-01-10' });
  });
  it('sem dia de vencimento usa o dia 10', () => {
    expect(cicloDaData(null, '2026-10-05').inicio).toBe('2026-09-10');
  });
});

describe('calcularProRata', () => {
  const base = { valorMensal: 150, diaVencimento: 20 };
  it('16 de 30 dias = 80,00', () => {
    const p = calcularProRata({ ...base, ate: '2026-10-05' })!;
    expect(p.diasUsados).toBe(16);
    expect(p.valor).toBe(80);
  });
  it('um dia de 31', () => {
    expect(calcularProRata({ ...base, ate: '2026-10-20' })!.valor).toBe(4.84);
  });
  it('ultimo dia do ciclo = mensalidade inteira', () => {
    expect(calcularProRata({ ...base, ate: '2026-10-19' })!.valor).toBe(150);
  });
  it('com inicio informado', () => {
    const p = calcularProRata({ ...base, ate: '2026-10-15', desde: '2026-10-01' })!;
    expect(p.diasUsados).toBe(15);
    expect(p.valor).toBe(75);
  });
  it('inicio fora do ciclo = null (o banco recusa)', () => {
    expect(calcularProRata({ ...base, ate: '2026-10-15', desde: '2026-09-10' })).toBeNull();
    expect(calcularProRata({ ...base, ate: '2026-10-15', desde: '2026-10-16' })).toBeNull();
  });
  it('texto da conta', () => {
    const t = textoDoProRata(calcularProRata({ ...base, ate: '2026-10-05' })!);
    expect(t).toContain('30 dias');
    expect(t).toContain('16 dia(s)');
    expect(t).toContain('80,00');
  });
});

describe('boletosFuturosDoVeiculo', () => {
  const linha = '74891160007840500810039027231010100000000015000';
  const boletos = [
    { id: 'fut', veiculo_id: 'v1', origem: 'MUTUAL' as const, status: 'aberto', valor: 150, data_vencimento: '2026-11-20', linha_digitavel: linha },
    { id: 'semlinha', veiculo_id: 'v1', origem: 'MUTUAL' as const, status: 'aberto', valor: 150, data_vencimento: '2026-12-20', linha_digitavel: null },
    { id: 'scar', veiculo_id: 'v1', origem: 'SCAR' as const, status: 'pendente', valor: 150, data_vencimento: '2026-10-30' },
    { id: 'passado', veiculo_id: 'v1', origem: 'MUTUAL' as const, status: 'vencido', valor: 150, data_vencimento: '2026-10-01', linha_digitavel: linha },
    { id: 'pago', veiculo_id: 'v1', origem: 'SCAR' as const, status: 'pago', valor: 150, data_vencimento: '2026-11-01' },
    { id: 'outro', veiculo_id: 'v2', origem: 'MUTUAL' as const, status: 'aberto', valor: 90, data_vencimento: '2026-11-20', linha_digitavel: linha },
    { id: 'semveic', veiculo_id: null, origem: 'MUTUAL' as const, status: 'aberto', valor: 240, data_vencimento: '2026-11-20', linha_digitavel: linha },
  ];
  const r = boletosFuturosDoVeiculo(boletos, 'v1', '2026-10-23');
  it('so os em aberto deste veiculo, depois do pedido, por vencimento', () => {
    expect(r.map((x) => x.boleto.id)).toEqual(['scar', 'fut', 'semlinha']);
  });
  it('do Mutual sem linha do Sicredi nao e baixavel', () => {
    expect(r.find((x) => x.boleto.id === 'semlinha')!.baixavel).toBe(false);
    expect(r.find((x) => x.boleto.id === 'fut')!.baixavel).toBe(true);
  });
});

describe('cicloJaPago', () => {
  const ciclo = cicloDaData(20, '2026-10-05');
  it('o boleto que vence no fim do ciclo pago', () => {
    expect(cicloJaPago([{ veiculo_id: 'v1', data_vencimento: '2026-10-20', status: 'pago' }], 'v1', ciclo)).toBe(true);
    expect(cicloJaPago([{ veiculo_id: 'v1', data_vencimento: '2026-10-20', status: 'aberto' }], 'v1', ciclo)).toBe(false);
    expect(cicloJaPago([{ veiculo_id: 'v2', data_vencimento: '2026-10-20', status: 'pago' }], 'v1', ciclo)).toBe(false);
  });
});

describe('validarCancelamento', () => {
  const ok = { motivo: 'Vendeu o carro', data: '2026-10-23', hoje: '2026-10-23', previsaoRetorno: false, cobrar: false };
  it('valido', () => expect(validarCancelamento(ok)).toBeNull());
  it('motivo', () => expect(validarCancelamento({ ...ok, motivo: 'x' })).toMatch(/motivo/));
  it('data futura', () => expect(validarCancelamento({ ...ok, data: '2026-10-24' })).toMatch(/futura/));
  it('60 dias', () => {
    expect(diasEntre('2026-08-23', '2026-10-23')).toBe(61);
    expect(validarCancelamento({ ...ok, data: '2026-08-23' })).toMatch(/60 dias/);
  });
  it('retorno exige data posterior', () => {
    expect(validarCancelamento({ ...ok, previsaoRetorno: true })).toMatch(/retorno/);
    expect(validarCancelamento({ ...ok, previsaoRetorno: true, dataRetorno: '2026-11-23' })).toBeNull();
  });
  it('cobrar exige vencimento ate 60 dias', () => {
    expect(validarCancelamento({ ...ok, cobrar: true })).toMatch(/vencimento/);
    expect(validarCancelamento({ ...ok, cobrar: true, vencimento: '2026-10-28' })).toBeNull();
    expect(validarCancelamento({ ...ok, cobrar: true, vencimento: '2027-01-28' })).toMatch(/60 dias/);
  });
});
