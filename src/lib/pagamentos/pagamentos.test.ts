import { describe, it, expect } from 'vitest';
import { getPaymentGateway } from './index';
import { MockGateway } from './mock';
import { AsaasGateway } from './asaas';
import {
  BasePaymentGateway,
  GatewayNaoImplementadoError,
  type CobrancaEmitida,
  type CobrancaInput,
  type ProvedorBanco,
} from './types';

const cobranca = (id: string, valor = 150): CobrancaInput => ({
  titulo_id: id,
  valor,
  vencimento: '2026-09-10',
  pagador: { nome: 'Joao da Silva', cpf_cnpj: '11144477735' },
});

describe('getPaymentGateway — fabrica do service pattern', () => {
  it('sem integracao/credencial cai no MOCK (fase de transicao)', () => {
    expect(getPaymentGateway(null)).toBeInstanceOf(MockGateway);
    expect(getPaymentGateway({ provedor: 'ASAAS' })).toBeInstanceOf(MockGateway);
  });
  it('com credencial devolve o adaptador do provedor', () => {
    expect(getPaymentGateway({ provedor: 'ASAAS', api_key: 'k' })).toBeInstanceOf(AsaasGateway);
  });
  it('provedor sem adaptador registrado falha explicitamente', () => {
    expect(() => getPaymentGateway({ provedor: 'CORA', api_key: 'k' })).toThrow(GatewayNaoImplementadoError);
  });
});

describe('MockGateway', () => {
  it('emite linha digitavel, PDF e PIX de forma deterministica', async () => {
    const gw = new MockGateway();
    const a = await gw.emitir(cobranca('11111111-2222-3333-4444-555555555555'));
    const b = await gw.emitir(cobranca('11111111-2222-3333-4444-555555555555'));
    expect(a.linha_digitavel).toBe(b.linha_digitavel);
    expect(a.nosso_numero).toBe(b.nosso_numero);
    expect(a.url_boleto).toContain('.pdf');
    expect(a.pix_copia_cola).toBeTruthy();
    expect(a.pix_qrcode_url).toBeTruthy();
    expect(a.erro).toBeUndefined();
  });

  it('titulos diferentes geram nosso numero diferente', async () => {
    const gw = new MockGateway();
    const a = await gw.emitir(cobranca('aaaa1111-0000-0000-0000-000000000001'));
    const b = await gw.emitir(cobranca('bbbb2222-0000-0000-0000-000000000002'));
    expect(a.nosso_numero).not.toBe(b.nosso_numero);
  });

  it('webhook de pagamento vira evento PAGO', () => {
    const ev = new MockGateway().parseWebhook({
      evento: 'PAGAMENTO_CONFIRMADO', titulo_id: 't1', valor_pago: 150, data_pagamento: '2026-09-11',
    });
    expect(ev.tipo).toBe('PAGO');
    expect(ev.titulo_id).toBe('t1');
    expect(ev.valor_pago).toBe(150);
  });
});

describe('emitirLote — tolerante a falha por item', () => {
  class GatewayInstavel extends BasePaymentGateway {
    readonly provedor: ProvedorBanco = 'OUTRO';
    async emitir(c: CobrancaInput): Promise<CobrancaEmitida> {
      if (c.titulo_id === 'ruim') throw new Error('CPF invalido no gateway');
      return { titulo_id: c.titulo_id, linha_digitavel: 'ok' };
    }
  }

  it('um item com erro nao derruba o lote', async () => {
    const r = await new GatewayInstavel().emitirLote([cobranca('bom1'), cobranca('ruim'), cobranca('bom2')]);
    expect(r).toHaveLength(3);
    expect(r[0].linha_digitavel).toBe('ok');
    expect(r[1].erro).toBe('CPF invalido no gateway');
    expect(r[2].linha_digitavel).toBe('ok');
  });
});

describe('AsaasGateway — esqueleto de transicao', () => {
  const gw = new AsaasGateway({ provedor: 'ASAAS', api_key: 'k', ambiente: 'sandbox' });

  it('emitir ainda nao implementado (erro explicito, nao silencioso)', async () => {
    await expect(gw.emitir(cobranca('t1'))).rejects.toBeInstanceOf(GatewayNaoImplementadoError);
  });

  it('no lote, o erro vira o campo `erro` de cada item', async () => {
    const r = await gw.emitirLote([cobranca('t1'), cobranca('t2')]);
    expect(r).toHaveLength(2);
    expect(r.every((x) => x.erro?.includes('ASAAS'))).toBe(true);
  });

  it('traduz o webhook do provedor para o dominio', () => {
    const pago = gw.parseWebhook({
      event: 'PAYMENT_RECEIVED',
      payment: { id: 'pay_1', externalReference: 't1', value: 150, paymentDate: '2026-09-11' },
    });
    expect(pago).toEqual({
      tipo: 'PAGO', titulo_id: 't1', gateway_transacao_id: 'pay_1', valor_pago: 150, data_pagamento: '2026-09-11',
    });
    expect(gw.parseWebhook({ event: 'PAYMENT_OVERDUE', payment: {} }).tipo).toBe('VENCIDO');
    expect(gw.parseWebhook({ event: 'PAYMENT_DELETED', payment: {} }).tipo).toBe('CANCELADO');
    expect(gw.parseWebhook({ event: 'OUTRO_EVENTO', payment: {} }).tipo).toBe('DESCONHECIDO');
  });
});
