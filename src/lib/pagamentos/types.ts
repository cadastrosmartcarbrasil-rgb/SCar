// ============================================================================
// Camada de pagamento (service pattern) — contrato UNICO que o sistema conhece.
// O restante do app (rotinas de boletagem, remessas, webhooks) fala apenas com
// `PaymentGateway`; trocar Asaas por PJBank/Inter/Cora nao toca nas rotinas.
//
// Fase atual (transicao): a geracao cria os titulos no banco local com valores,
// vencimentos e status corretos. O envio ao banco usa o gateway MOCK. Quando a
// API real for contratada, basta implementar esta interface e cadastrar a
// integracao em Configuracoes -> Integracoes bancarias.
// ============================================================================

export type ProvedorBanco = 'ASAAS' | 'PJBANK' | 'CORA' | 'INTER' | 'GERENCIANET' | 'OUTRO' | 'MOCK';

/** Credenciais/rota do gateway (espelha `integracoes_bancarias`). */
export interface GatewayConfig {
  id?: string | null;
  nome?: string | null;
  provedor: ProvedorBanco;
  ambiente?: 'sandbox' | 'producao';
  api_url?: string | null;
  api_key?: string | null;
  api_token_extra?: string | null;
  webhook_secret?: string | null;
}

/** Um titulo a ser registrado no banco (dados minimos de qualquer boleto/PIX). */
export interface CobrancaInput {
  titulo_id: string;                 // chave de correlacao (titulos_financeiros.id)
  valor: number;
  vencimento: string;                // 'YYYY-MM-DD'
  descricao?: string | null;
  pagador: {
    nome: string;
    cpf_cnpj: string;
    email?: string | null;
    telefone?: string | null;
  };
}

/** Retorno do banco para um titulo (linha digitavel, PDF, PIX). */
export interface CobrancaEmitida {
  titulo_id: string;
  gateway_transacao_id?: string | null;
  nosso_numero?: string | null;
  linha_digitavel?: string | null;
  url_boleto?: string | null;        // PDF
  pix_copia_cola?: string | null;
  pix_qrcode_url?: string | null;
  erro?: string | null;              // preenchido quando o registro falhou
  retorno?: unknown;                 // resposta bruta (auditoria)
}

/** Evento normalizado de webhook (baixa automatica). */
export interface EventoPagamento {
  tipo: 'PAGO' | 'CANCELADO' | 'VENCIDO' | 'DESCONHECIDO';
  titulo_id?: string | null;
  gateway_transacao_id?: string | null;
  valor_pago?: number | null;
  data_pagamento?: string | null;
}

/**
 * Cartao enviado para TOKENIZACAO. Este objeto so existe em memoria, no
 * servidor, durante a chamada ao gateway — o numero e o CVV nunca sao gravados.
 */
export interface CartaoInput {
  numero: string;
  nome: string;
  validade_mes: number;
  validade_ano: number;
  cvv: string;
  /** O gateway exige os dados do titular para analise antifraude. */
  titular: {
    nome: string;
    cpf_cnpj: string;
    email?: string | null;
    telefone?: string | null;
    cep?: string | null;
    numero_endereco?: string | null;
  };
}

/** O que VOLTA do gateway e o unico que pode ser guardado. */
export interface CartaoTokenizado {
  token: string;
  bandeira?: string | null;
  ultimos_digitos?: string | null;
}

/** Contrato do gateway. Toda integracao bancaria implementa isto. */
export interface PaymentGateway {
  readonly provedor: ProvedorBanco;
  /** Registra UMA cobranca. */
  emitir(cobranca: CobrancaInput): Promise<CobrancaEmitida>;
  /** Registra um LOTE. Implementacoes sem endpoint de lote caem no emitir() item a item. */
  emitirLote(cobrancas: CobrancaInput[]): Promise<CobrancaEmitida[]>;
  /** Consulta o estado de um titulo no banco. */
  consultar(gatewayTransacaoId: string): Promise<CobrancaEmitida>;
  /** Cancela/baixa o registro no banco. */
  cancelar(gatewayTransacaoId: string): Promise<void>;
  /** Traduz o payload do webhook do provedor para um evento do dominio. */
  parseWebhook(payload: unknown): EventoPagamento;
  /**
   * Troca os dados do cartao por um TOKEN. E o unico ponto do sistema que ve o
   * numero do cartao, e ele nao guarda nada: devolve o token e esquece.
   */
  tokenizarCartao(cartao: CartaoInput): Promise<CartaoTokenizado>;
}

/** Gateway configurado mas ainda sem implementacao real (fase de transicao). */
export class GatewayNaoImplementadoError extends Error {
  constructor(provedor: ProvedorBanco, acao: string) {
    super(`Integracao ${provedor} ainda nao implementada (${acao}). Configure o gateway em Configuracoes -> Integracoes bancarias.`);
    this.name = 'GatewayNaoImplementadoError';
  }
}

/** Base com o fallback de lote (sequencial, tolerante a falha por item). */
export abstract class BasePaymentGateway implements PaymentGateway {
  abstract readonly provedor: ProvedorBanco;
  abstract emitir(cobranca: CobrancaInput): Promise<CobrancaEmitida>;

  async emitirLote(cobrancas: CobrancaInput[]): Promise<CobrancaEmitida[]> {
    const saida: CobrancaEmitida[] = [];
    for (const c of cobrancas) {
      try {
        saida.push(await this.emitir(c));
      } catch (e) {
        saida.push({ titulo_id: c.titulo_id, erro: (e as Error).message });
      }
    }
    return saida;
  }

  async consultar(gatewayTransacaoId: string): Promise<CobrancaEmitida> {
    throw new GatewayNaoImplementadoError(this.provedor, `consultar(${gatewayTransacaoId})`);
  }

  async cancelar(gatewayTransacaoId: string): Promise<void> {
    throw new GatewayNaoImplementadoError(this.provedor, `cancelar(${gatewayTransacaoId})`);
  }

  parseWebhook(_payload: unknown): EventoPagamento {
    return { tipo: 'DESCONHECIDO' };
  }

  async tokenizarCartao(_cartao: CartaoInput): Promise<CartaoTokenizado> {
    throw new GatewayNaoImplementadoError(this.provedor, 'tokenizarCartao');
  }
}
