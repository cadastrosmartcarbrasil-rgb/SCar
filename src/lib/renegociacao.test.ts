import { describe, expect, it } from 'vitest';
import {
  baixaJaFeitaNoBanco, baixasPendentes, ehLinhaSicredi, mensagemDoBoleto, motivoNaoNegociavel, parcelasDaNegociacao,
  podeNegociar, totalOriginais, validarNegociacao, valorNegociado,
} from './renegociacao';

const linha748 = '74891160007840200810039027231010100000000017200';

describe('o que pode ser negociado', () => {
  it('aberto/vencido sim; pago e cancelado nao', () => {
    expect(podeNegociar({ id: '1', status: 'vencido', valor: 10, data_vencimento: '2026-09-01', origem: 'SCAR' })).toBe(true);
    expect(motivoNaoNegociavel({ id: '1', status: 'pago', valor: 10, data_vencimento: '2026-09-01' })).toBe('boleto pago');
  });
  it('boleto avulso (0150) nao se negocia', () => {
    expect(motivoNaoNegociavel({ id: '1', status: 'vencido', valor: 10, data_vencimento: '2026-09-01', origem: 'SCAR',
      observacao: 'Boleto avulso — Vistoria' })).toBe('boleto avulso (emita outro avulso)');
    expect(podeNegociar({ id: '1', status: 'vencido', valor: 10, data_vencimento: '2026-09-01', observacao: 'renegociado' })).toBe(true);
  });
  it('Mutual so com linha do Sicredi', () => {
    expect(ehLinhaSicredi(linha748)).toBe(true);
    expect(ehLinhaSicredi('00190000090000000000000000000000000000000009000')).toBe(false);
    expect(podeNegociar({ id: '1', status: 'aberto', valor: 10, data_vencimento: '2026-09-01', origem: 'MUTUAL', linha_digitavel: linha748 })).toBe(true);
    expect(podeNegociar({ id: '1', status: 'aberto', valor: 10, data_vencimento: '2026-09-01', origem: 'MUTUAL', linha_digitavel: null })).toBe(false);
  });
});

describe('valores', () => {
  it('soma sem erro de centavo e aplica acrescimo/desconto', () => {
    expect(totalOriginais([{ valor: 0.1 }, { valor: 0.2 }])).toBe(0.3);
    expect(valorNegociado(250, 12.5, 2.5)).toBe(260);
    expect(valorNegociado(10, 0, 50)).toBe(0);
  });
  it('parcelas mensais com o resto na ultima', () => {
    const p = parcelasDaNegociacao(100, 3, '2026-10-31');
    expect(p.map((x) => x.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(p.map((x) => x.vencimento)).toEqual(['2026-10-31', '2026-11-30', '2026-12-31']);
  });
});

describe('validarNegociacao', () => {
  const hoje = '2026-10-18';
  it('aceita o caso comum', () => {
    expect(validarNegociacao({ origens: 1, parcelas: [{ vencimento: '2026-10-20', valor: 100 }], hoje })).toBeNull();
  });
  it('recusa o que o banco recusaria', () => {
    expect(validarNegociacao({ origens: 0, parcelas: [{ vencimento: '2026-10-20', valor: 1 }], hoje })).toMatch(/ao menos/);
    expect(validarNegociacao({ origens: 1, parcelas: [{ vencimento: '2026-10-17', valor: 1 }], hoje })).toMatch(/passado/);
    expect(validarNegociacao({ origens: 1, parcelas: [{ vencimento: '2027-12-01', valor: 1 }], hoje })).toMatch(/1 ano/);
    expect(validarNegociacao({ origens: 1, parcelas: [{ vencimento: '2026-10-20', valor: 0 }], hoje })).toMatch(/positivo/);
    expect(validarNegociacao({ origens: 1, parcelas: [
      { vencimento: '2026-11-20', valor: 1 }, { vencimento: '2026-11-20', valor: 1 }], hoje })).toMatch(/crescente/);
  });
});

describe('mensagem e baixas', () => {
  it('mensagem de 2a via traz linha e PIX e avisa da substituicao', () => {
    const m = mensagemDoBoleto({ nome: 'MARIA DA SILVA', boletos: [
      { parcela: 1, vencimento: '2026-10-20', valor: 105.5, linha_digitavel: '7489 1', pix_copia_cola: '000201' }] });
    expect(m).toContain('Olá, Maria!');
    expect(m).toContain('Linha digitavel: 7489 1');
    expect(m).toContain('PIX copia e cola: 000201');
    expect(m).toContain('pague somente este');
    expect(m).not.toContain('Parcela 1');
  });
  it('acordo numera as parcelas', () => {
    const m = mensagemDoBoleto({ nome: '', boletos: [
      { parcela: 1, vencimento: '2026-10-20', valor: 50, linha_digitavel: 'a', pix_copia_cola: null },
      { parcela: 2, vencimento: '2026-11-20', valor: 50, linha_digitavel: 'b', pix_copia_cola: null }] });
    expect(m).toContain('Parcela 2');
    expect(m).toContain('os boletos do seu acordo');
  });
  it('2a via do mesmo boleto nao fala em substituicao', () => {
    const m = mensagemDoBoleto({ nome: 'ANA', substitui: false, boletos: [
      { parcela: 1, vencimento: '2026-10-20', valor: 50, linha_digitavel: 'a', pix_copia_cola: null }] });
    expect(m).not.toContain('substituido');
  });
  it('conta baixas pendentes', () => {
    expect(baixasPendentes([{ baixa_status: 'BAIXADO' }, { baixa_status: 'ERRO' }, { baixa_status: 'PENDENTE' }, { baixa_status: 'SEM_REGISTRO' }])).toBe(2);
  });
  it('titulo ja baixado no banco conta como baixado', () => {
    expect(baixaJaFeitaNoBanco('Sicredi HTTP 422: 0078 - Instrução inválida: título já baixado.')).toBe(true);
    expect(baixaJaFeitaNoBanco('titulo ja esta baixado')).toBe(true);
    expect(baixaJaFeitaNoBanco('Sicredi HTTP 422: título já liquidado')).toBe(false);
    expect(baixaJaFeitaNoBanco('Sicredi HTTP 500: erro interno')).toBe(false);
    expect(baixaJaFeitaNoBanco(null)).toBe(false);
  });
});
