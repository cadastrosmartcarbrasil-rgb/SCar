// Adaptador ASAAS — ESQUELETO de transicao.
//
// O contrato (PaymentGateway) ja esta fechado e a rotina de remessa ja chama
// este adaptador; falta apenas ligar as chamadas HTTP quando a conta/API key
// existir. Cada metodo abaixo documenta o endpoint e o mapeamento de campos,
// para que a implementacao seja mecanica (e sem tocar nas rotinas de cobranca).
//
// Endpoints (v3): POST /customers, POST /payments, GET /payments/{id},
// DELETE /payments/{id}, GET /payments/{id}/pixQrCode
// Auth: header `access_token: <api_key>` — SOMENTE no servidor.
import {
  BasePaymentGateway,
  GatewayNaoImplementadoError,
  type CobrancaEmitida,
  type CobrancaInput,
  type EventoPagamento,
  type GatewayConfig,
  type ProvedorBanco,
  type CartaoInput,
  type CartaoTokenizado,
} from './types';

export class AsaasGateway extends BasePaymentGateway {
  readonly provedor: ProvedorBanco = 'ASAAS';
  private readonly config: GatewayConfig;

  constructor(config: GatewayConfig) {
    super();
    this.config = config;
  }

  private get baseUrl(): string {
    return (
      this.config.api_url ??
      (this.config.ambiente === 'producao' ? 'https://api.asaas.com/v3' : 'https://sandbox.asaas.com/api/v3')
    );
  }

  /** Cabecalhos da API (a chave nunca sai do servidor). */
  protected headers(): Record<string, string> {
    if (!this.config.api_key) throw new GatewayNaoImplementadoError(this.provedor, 'api_key ausente');
    return { 'Content-Type': 'application/json', access_token: this.config.api_key };
  }

  // POST /customers (upsert do pagador) + POST /payments
  //   { customer, billingType: 'BOLETO' | 'PIX' | 'UNDEFINED', value, dueDate,
  //     description, externalReference: titulo_id }
  // Resposta -> CobrancaEmitida:
  //   id                -> gateway_transacao_id
  //   nossoNumero       -> nosso_numero
  //   identificationField / barCode -> linha_digitavel
  //   bankSlipUrl       -> url_boleto
  //   (GET /payments/{id}/pixQrCode) payload -> pix_copia_cola, encodedImage -> pix_qrcode_url
  async emitir(cobranca: CobrancaInput): Promise<CobrancaEmitida> {
    throw new GatewayNaoImplementadoError(this.provedor, `emitir(${cobranca.titulo_id}) em ${this.baseUrl}`);
  }

  // Webhook do Asaas: { event: 'PAYMENT_RECEIVED' | 'PAYMENT_CONFIRMED' |
  // 'PAYMENT_DELETED' | 'PAYMENT_OVERDUE', payment: { id, externalReference,
  // value, paymentDate } }. A validacao de assinatura usa webhook_secret.
  parseWebhook(payload: unknown): EventoPagamento {
    const p = (payload ?? {}) as { event?: string; payment?: Record<string, unknown> };
    const pg = p.payment ?? {};
    const tipo: EventoPagamento['tipo'] =
      p.event === 'PAYMENT_RECEIVED' || p.event === 'PAYMENT_CONFIRMED'
        ? 'PAGO'
        : p.event === 'PAYMENT_DELETED'
          ? 'CANCELADO'
          : p.event === 'PAYMENT_OVERDUE'
            ? 'VENCIDO'
            : 'DESCONHECIDO';
    return {
      tipo,
      titulo_id: (pg.externalReference as string) ?? null,
      gateway_transacao_id: (pg.id as string) ?? null,
      valor_pago: (pg.value as number) ?? null,
      data_pagamento: (pg.paymentDate as string) ?? null,
    };
  }

  /**
   * Tokenizacao do cartao — POST /creditCard/tokenize
   *
   * Corpo esperado pela Asaas:
   *   { customer, creditCard: { holderName, number, expiryMonth, expiryYear, ccv },
   *     creditCardHolderInfo: { name, email, cpfCnpj, postalCode, addressNumber, phone },
   *     remoteIp }
   * Resposta -> CartaoTokenizado:
   *   creditCardToken  -> token   (e o unico campo que guardamos)
   *   creditCardBrand  -> bandeira
   *   creditCardNumber -> ultimos_digitos (a Asaas ja devolve so os 4 finais)
   *
   * Depois disso, a cobranca recorrente usa `billingType: 'CREDIT_CARD'` com o
   * token, sem nunca reenviar o numero.
   *
   * NAO IMPLEMENTADO: falta contratar a conta e configurar a chave em
   * Configuracoes -> Integracoes bancarias. O esqueleto acima e o contrato.
   */
  async tokenizarCartao(_cartao: CartaoInput): Promise<CartaoTokenizado> {
    throw new GatewayNaoImplementadoError(this.provedor, 'tokenizarCartao');
  }
}
