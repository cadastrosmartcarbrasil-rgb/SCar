// Fabrica do gateway de pagamento. As rotinas de cobranca chamam SEMPRE
// `getPaymentGateway(...)` — nunca um provedor concreto.
//
// Resolucao: usa a integracao bancaria cadastrada (Configuracoes -> Integracoes
// bancarias); sem integracao ativa com credencial, cai no MOCK, que mantem o
// fluxo (remessa -> retorno -> baixa) funcionando na fase de transicao.
import { MockGateway } from './mock';
import { AsaasGateway } from './asaas';
import { SicrediGateway, configSicrediDoAmbiente, variaveisSicrediFaltando } from './sicredi';
import { GatewayNaoImplementadoError, type GatewayConfig, type PaymentGateway } from './types';

export * from './types';
export { MockGateway } from './mock';
export { AsaasGateway } from './asaas';
export { SicrediGateway } from './sicredi';

export function getPaymentGateway(config?: GatewayConfig | null, env: Record<string, string | undefined> = process.env): PaymentGateway {
  // Sicredi: as credenciais NAO ficam na tabela, ficam nas SICREDI_* do servidor.
  if (config?.provedor === 'SICREDI') {
    const cfg = configSicrediDoAmbiente(env);
    if (!cfg) {
      throw new GatewayNaoImplementadoError('SICREDI', `faltam variaveis: ${variaveisSicrediFaltando(env).join(', ')}`);
    }
    // O cadastro diz um ambiente e o servidor esta em outro: emitir assim e
    // achar que testou (boleto real) ou achar que cobrou (boleto de mentira).
    if (config.ambiente && config.ambiente !== cfg.ambiente) {
      throw new Error(
        `Integracao Sicredi cadastrada como ${config.ambiente}, mas o servidor esta em ${cfg.ambiente} ` +
          `(SICREDI_AMBIENTE). Acerte um dos dois antes de emitir.`,
      );
    }
    return new SicrediGateway(cfg);
  }
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

/** Linha minima de `integracoes_bancarias` para escolher o gateway. */
export interface IntegracaoCandidata extends GatewayConfig {
  regional_id?: string | null;
  is_padrao?: boolean | null;
  ativo?: boolean | null;
}

/**
 * Qual integracao a remessa usa: a PADRAO ativa da unidade pedida e, na falta
 * dela, a padrao GLOBAL (regional nula). Antes a rota pedia "a padrao" com
 * maybeSingle(): com uma padrao por unidade + a global ela recebia ERRO, ficava
 * sem integracao e caia no MOCK calada — boleto ficticio achando que era real.
 */
export function escolherIntegracao<T extends IntegracaoCandidata>(
  lista: T[],
  regionalId?: string | null,
): T | null {
  const ativas = lista.filter((i) => i.ativo !== false && i.is_padrao);
  if (regionalId) {
    const daUnidade = ativas.find((i) => i.regional_id === regionalId);
    if (daUnidade) return daUnidade;
  }
  return ativas.find((i) => !i.regional_id) ?? null;
}
