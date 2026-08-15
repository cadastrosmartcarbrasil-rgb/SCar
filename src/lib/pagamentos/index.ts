// Fabrica do gateway de pagamento. As rotinas de cobranca chamam SEMPRE
// `getPaymentGateway(...)` — nunca um provedor concreto.
//
// Resolucao: usa a integracao bancaria cadastrada (Configuracoes -> Integracoes
// bancarias); sem integracao ativa com credencial, cai no MOCK, que mantem o
// fluxo (remessa -> retorno -> baixa) funcionando na fase de transicao.
import { MockGateway } from './mock';
import { AsaasGateway } from './asaas';
import { GatewayNaoImplementadoError, type GatewayConfig, type PaymentGateway } from './types';

export * from './types';
export { MockGateway } from './mock';
export { AsaasGateway } from './asaas';

export function getPaymentGateway(config?: GatewayConfig | null): PaymentGateway {
  if (!config || !config.api_key) return new MockGateway();

  switch (config.provedor) {
    case 'ASAAS':
      return new AsaasGateway(config);
    case 'MOCK':
      return new MockGateway();
    // Novos provedores entram aqui — o resto do sistema nao muda.
    case 'PJBANK':
    case 'CORA':
    case 'INTER':
    case 'GERENCIANET':
    case 'OUTRO':
    default:
      throw new GatewayNaoImplementadoError(config.provedor, 'adaptador nao registrado');
  }
}
