import { describe, expect, it } from 'vitest';
import { editavelNoScar, unirHistoricoPortal, unirHistoricoSac } from './historico-financeiro';
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
