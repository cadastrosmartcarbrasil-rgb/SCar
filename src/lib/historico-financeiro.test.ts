import { describe, expect, it } from 'vitest';
import { editavelNoScar, resumoHistoricoFinanceiro, unirHistoricoPortal, unirHistoricoSac } from './historico-financeiro';
import { unirEventosCliente } from './eventos-historico';
import type { BoletoMutualCliente, PortalBoletoMutual, PortalTitulo, TituloCliente } from './database.types';

const scar = (id: string, venc: string, status = 'aberto'): TituloCliente => ({
  id, veiculo_id: null, placa: null, competencia: null, data_vencimento: venc, valor: 100,
  valor_original: 100, desconto: 0, acrescimo: 0, valor_pago: null, data_pagamento: null,
  status: status as TituloCliente['status'], dias_atraso: 0, linha_digitavel: null, url_boleto: null,
  pix_copia_cola: null, observacao: null,
});
const mutual = (id: string, venc: string, status = 'vencido'): BoletoMutualCliente => ({
  id, veiculo_id: null, placa: 'ABC1D23', competencia: null, data_vencimento: venc, valor: 90,
  valor_pago: null, data_pagamento: null, status, dias_atraso: 12, em_serasa: true,
  linha_digitavel: '7489', url_boleto: null, url_pagamento: 'https://pagar',
});

describe('unirHistoricoSac', () => {
  it('une as duas fontes, mais recente primeiro, marcando a origem', () => {
    const r = unirHistoricoSac([scar('s1', '2026-10-10')], [mutual('m1', '2026-11-10'), mutual('m2', '2026-09-10')]);
    expect(r.map((x) => x.id)).toEqual(['m1', 's1', 'm2']);
    expect(r[1].origem).toBe('SCAR');
    expect(r[0]).toMatchObject({ origem: 'MUTUAL', url_pagamento: 'https://pagar', em_serasa: true, pix_copia_cola: null });
  });
  it('empate no vencimento: o do SCar primeiro', () => {
    const r = unirHistoricoSac([scar('s1', '2026-10-10')], [mutual('m1', '2026-10-10')]);
    expect(r.map((x) => x.id)).toEqual(['s1', 'm1']);
  });
  it('sem nada, lista vazia', () => expect(unirHistoricoSac([], [])).toEqual([]));
});

describe('unirHistoricoPortal', () => {
  it('converte situacao e origem', () => {
    const t: PortalTitulo = {
      id: 's', veiculo_id: null, placa: null, competencia: null, data_vencimento: '2026-08-01', valor: 1,
      valor_pago: null, data_pagamento: null, status: 'pendente', situacao: 'aberto', dias_atraso: 0,
      linha_digitavel: null, url_boleto: null, pix_copia_cola: null,
    };
    const m: PortalBoletoMutual = {
      id: 'm', veiculo_id: null, placa: null, competencia: null, data_vencimento: '2026-09-01', valor: 2,
      valor_pago: null, data_pagamento: null, situacao: 'vencido', dias_atraso: 5,
      linha_digitavel: 'x', url_boleto: null, url_pagamento: 'u',
    };
    const r = unirHistoricoPortal([t], [m]);
    expect(r[0]).toMatchObject({ id: 'm', origem: 'MUTUAL', situacao: 'vencido', status: 'vencido' });
    expect(r[1].origem).toBe('SCAR');
  });
});

describe('editavelNoScar', () => {
  it('boleto do Mutual nunca e editado aqui', () => {
    expect(editavelNoScar({ origem: 'MUTUAL', status: 'vencido' })).toBe(false);
    expect(editavelNoScar({ origem: 'SCAR', status: 'vencido' })).toBe(true);
    expect(editavelNoScar({ status: 'pago' })).toBe(false);
  });
});


describe('resumoHistoricoFinanceiro', () => {
  it('separa pago, em aberto e vencido e ignora cancelado', () => {
    const r = resumoHistoricoFinanceiro([
      { status: 'pago', data_vencimento: '2026-08-10', valor: 100, valor_pago: 102.5 },
      { status: 'pendente', data_vencimento: '2026-09-10', valor: 100 },
      { status: 'vencido', data_vencimento: '2026-07-10', valor: 100 },
      { status: 'pendente', data_vencimento: '2026-11-10', valor: 120 },
      { status: 'cancelado', data_vencimento: '2026-06-10', valor: 999 },
    ], '2026-10-15');
    expect(r).toEqual({ total: 420, pago: 102.5, aberto: 120, vencido: 200, qtdVencidos: 2, qtd: 4 });
  });
});

describe('unirEventosCliente', () => {
  const scar = [{ id: 's1', veiculo_id: 'v1', numero_protocolo: 'EVT-1', status: 'ABERTO', data_ocorrencia: '2026-09-01', tipos_evento: { nome: 'COLISAO' }, veiculos: { placa: 'AAA1A11' } }];
  const mutual = [{ id: 'm1', veiculo_id: 'v2', placa: 'BBB2B22', protocolo: '123', data_evento: '2025-03-01', data_conclusao: null, tipos: ['PARABRISA'], envolvimento: 'VITIMA' }];
  it('une as duas fontes, mais recente primeiro', () => {
    const r = unirEventosCliente(scar, mutual);
    expect(r.map((e) => [e.origem, e.placa, e.tipo, e.status])).toEqual([
      ['SCAR', 'AAA1A11', 'COLISAO', 'ABERTO'],
      ['MUTUAL', 'BBB2B22', 'PARABRISA', 'SEM_ENCERRAMENTO'],
    ]);
  });
  it('filtra pelo veiculo', () => {
    expect(unirEventosCliente(scar, mutual, 'v2').map((e) => e.id)).toEqual(['m1']);
  });
});
