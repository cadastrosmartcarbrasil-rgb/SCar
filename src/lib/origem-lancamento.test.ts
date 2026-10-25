import { describe, expect, it } from 'vitest';
import { origemDoLancamento, resumoHistoricoFornecedor } from './origem-lancamento';

const base = { id: 'L1', evento_id: null, evento_terceiro_id: null };

describe('origemDoLancamento', () => {
  it('OS da 24h vence tudo', () => {
    const o = origemDoLancamento({
      ...base, evento_id: 'E1',
      acionamentos_assistencia: [{ id: 'A1', codigo_os: 'OS-20261001-0001', protocolo: 'ASS-1' }],
    });
    expect(o).toMatchObject({ tipo: 'ASSISTENCIA', referencia: 'OS-20261001-0001', href: '/assistencia?acionamento=A1' });
  });

  it('terceiro do evento abre a tela do terceiro na aba financeiro', () => {
    const o = origemDoLancamento({
      ...base, evento_id: 'E1', evento_terceiro_id: 'T1', evento_terceiros: { codigo: 'EVT-1-T01', nome: 'X' },
    });
    expect(o).toMatchObject({ tipo: 'TERCEIRO', referencia: 'EVT-1-T01', href: '/eventos/E1/terceiros/T1?aba=financeiro' });
  });

  it('evento abre a ficha do evento na aba financeiro', () => {
    const o = origemDoLancamento({ ...base, evento_id: 'E1', eventos_sinistro: { numero_protocolo: 'EVT-9' } });
    expect(o).toMatchObject({ tipo: 'EVENTO', referencia: 'EVT-9', href: '/eventos/E1?aba=financeiro' });
  });

  it('sem origem operacional abre o titulo no Financeiro', () => {
    expect(origemDoLancamento({ ...base, acionamentos_assistencia: [] }))
      .toMatchObject({ tipo: 'FINANCEIRO', href: '/financeiro?lancamento=L1' });
  });
});

describe('resumoHistoricoFornecedor', () => {
  it('soma pago, em aberto e vencido; ignora cancelado', () => {
    const r = resumoHistoricoFornecedor([
      { tipo: 'DESPESA', status: 'quitado', valor_original: 100, valor_pago: 100, valor_saldo: 0, data_vencimento: '2026-09-01' },
      { tipo: 'DESPESA', status: 'pago_parcial', valor_original: 300, valor_pago: 100.1, valor_saldo: 199.9, data_vencimento: '2026-10-01' },
      { tipo: 'DESPESA', status: 'pendente', valor_original: 50, valor_pago: 0, valor_saldo: 50, data_vencimento: '2026-11-01' },
      { tipo: 'DESPESA', status: 'cancelado', valor_original: 999, valor_pago: 0, valor_saldo: 999, data_vencimento: '2026-01-01' },
      { tipo: 'RECEITA', status: 'pendente', valor_original: 20, valor_pago: 0, valor_saldo: 20, data_vencimento: '2026-10-10' },
    ], '2026-10-25');
    expect(r).toEqual({ titulos: 4, pago: 200.1, recebido: 0, aPagar: 249.9, aReceber: 20, vencido: 219.9 });
  });
});
