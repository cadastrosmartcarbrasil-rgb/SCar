// Gateway MOCK — usado enquanto a API bancaria real nao esta contratada.
// Gera linha digitavel/nosso numero/PIX ficticios e DETERMINISTICOS por titulo,
// para que a rotina de remessa (envio -> retorno -> baixa) possa ser exercitada
// fim a fim. Nenhuma chamada de rede e feita.
import { bandeiraDoNumero } from '@/lib/cartao';
import {
  BasePaymentGateway,
  type CartaoInput,
  type CartaoTokenizado,
  type CobrancaEmitida,
  type CobrancaInput,
  type EventoPagamento,
  type ProvedorBanco,
} from './types';

// Hash simples e estavel (mesmo titulo -> mesmo "nosso numero").
function hash(texto: string): number {
  let h = 0;
  for (let i = 0; i < texto.length; i += 1) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
  return h;
}

export class MockGateway extends BasePaymentGateway {
  readonly provedor: ProvedorBanco = 'MOCK';

  async emitir(c: CobrancaInput): Promise<CobrancaEmitida> {
    const seed = hash(c.titulo_id);
    const nossoNumero = String(seed).padStart(10, '0').slice(0, 10);
    const centavos = Math.round(c.valor * 100);
    return {
      titulo_id: c.titulo_id,
      gateway_transacao_id: `mock_${c.titulo_id.slice(0, 8)}`,
      nosso_numero: nossoNumero,
      linha_digitavel: `34191.79001 01043.510047 91020.150008 8 ${String(centavos).padStart(10, '0')}`,
      url_boleto: `https://sandbox.gateway.exemplo/boletos/${nossoNumero}.pdf`,
      pix_copia_cola: `00020126BR.GOV.BCB.PIX${nossoNumero}5204000053039865802BR6009SAO PAULO62070503***6304`,
      pix_qrcode_url: `https://sandbox.gateway.exemplo/pix/${nossoNumero}.png`,
      retorno: { mock: true, vencimento: c.vencimento, valor: c.valor },
    };
  }

  parseWebhook(payload: unknown): EventoPagamento {
    const p = (payload ?? {}) as Record<string, unknown>;
    return {
      tipo: p.evento === 'PAGAMENTO_CONFIRMADO' ? 'PAGO' : 'DESCONHECIDO',
      titulo_id: (p.titulo_id as string) ?? null,
      gateway_transacao_id: (p.gateway_transacao_id as string) ?? null,
      valor_pago: (p.valor_pago as number) ?? null,
      data_pagamento: (p.data_pagamento as string) ?? null,
    };
  }

  /**
   * Tokenizacao de mentira, para a tela poder ser testada antes do Asaas entrar.
   * Devolve um token deterministico e **nao guarda o numero em lugar nenhum** —
   * o mock existe justamente para nao haver a tentacao de gravar o cartao.
   */
  async tokenizarCartao(c: CartaoInput): Promise<CartaoTokenizado> {
    const n = (c.numero ?? '').replace(/\D/g, '');
    return {
      token: `mock_card_${hash(n.slice(-8) + c.titular.cpf_cnpj)}`,
      bandeira: bandeiraDoNumero(n),
      ultimos_digitos: n.slice(-4),
    };
  }
}
