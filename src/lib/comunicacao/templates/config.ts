/**
 * Configuração compartilhada dos e-mails do Scar.
 * Tudo que muda por ambiente vem de variáveis de ambiente (nada de segredo aqui).
 */

export const COR = {
  marinho: '#142445', // cor-mãe
  smart: '#0BACE2', // destaque digital
  celeste: '#6AA9DE',
  grafite: '#1A1A1A',
  chumbo: '#545454',
  neutro: '#8A9099',
  fundo: '#EEF2F7',
  cartao: '#FFFFFF',
  caixa: '#F4F7FB',
  borda: '#DDE5F0',
} as const;

export const FONTE = {
  titulo: "Montserrat, 'Segoe UI', Helvetica, Arial, sans-serif",
  texto: "Barlow, 'Segoe UI', Helvetica, Arial, sans-serif",
  mono: "'IBM Plex Mono', 'Courier New', Courier, monospace",
} as const;

export interface Empresa {
  razaoSocial: string;
  cnpj?: string;
  telefone?: string;
  whatsappUrl?: string;
  whatsappTexto?: string;
  emailAtendimento?: string;
  site?: string;
  /** Canais de atendimento exibidos no e-mail de boas-vindas. */
  canais?: CanalAtendimento[];
}

export interface CanalAtendimento {
  rotulo: string;
  /** Texto exibido, ex.: "0800 737 0737" */
  numero: string;
  /** href, ex.: "tel:08007370737" */
  href: string;
  detalhe?: string;
}

export interface Links {
  /** URL PÚBLICA (https) da logo — clientes de e-mail bloqueiam base64. */
  logoUrl: string;
  portalLoginUrl: string;
  portalFaturasUrl: string;
  appAndroidUrl: string;
  appIosUrl: string;
  /** Documentos do associado (e-mail de boas-vindas): /documentos/<id> do proprio sistema. */
  manualAssistenciaUrl: string;
  regimentoUrl: string;
  rastreadoresUrl: string;
}

const env = (k: string) => (typeof process !== 'undefined' ? process.env[k] : undefined);

export const EMPRESA_PADRAO: Empresa = {
  razaoSocial: 'SMART CAR BRASIL PROTEÇÃO PATRIMONIAL MUTUALISTA',
  cnpj: env('EMPRESA_CNPJ'),
  telefone: env('EMPRESA_TELEFONE'),
  whatsappUrl: env('EMPRESA_WHATSAPP_URL'),
  whatsappTexto: env('EMPRESA_WHATSAPP_TEXTO'),
  emailAtendimento: env('EMAIL_REPLY_TO'),
  site: env('EMPRESA_SITE') ?? 'https://smartcarbrasil.com.br',
  canais: [
    {
      rotulo: 'Assistência 24 horas',
      numero: '0800 737 0737',
      href: 'tel:08007370737',
      detalhe: 'Ligação pela operadora; também recebemos chamadas por WhatsApp.',
    },
    {
      rotulo: 'Chatbot Smart Car',
      numero: '0800 591 8920',
      href: 'tel:08005918920',
      detalhe: 'Também recebemos chamadas por WhatsApp.',
    },
    {
      rotulo: 'Assistente virtual (IA)',
      numero: '(65) 4042-9100',
      href: 'tel:+556540429100',
      detalhe: 'Também recebemos chamadas por WhatsApp.',
    },
  ],
};

const appUrl = env('APP_URL_PORTAL') ?? 'https://appsmartcar.com.br';

/** Modelos de termo (escopo GERAL) que os e-mails citam — ids de termos_modelos em producao. */
export const DOCUMENTOS = {
  manualAssistencia: '4b172d0e-82c7-4a75-8c4d-9d987bbc17c5', // MANUAL DA ASSISTENCIA 24 HORAS
  regimento: '1372b1ea-c24b-4bf2-97b4-cd986b663c2e', // PSM - PROGRAMA DE SOCORRO MUTUO
  rastreadores: '9cfd3515-edb8-4e4c-aa56-f6943a6f9a80', // TERMO DE RASTREADORES
} as const;

/**
 * Portal do associado = o do SCar (appsmartcar.com.br). Os apps de loja ainda são os
 * do sistema anterior: troque por variável de ambiente quando o app novo existir.
 */
export const LINKS_PADRAO: Links = {
  logoUrl: env('EMAIL_LOGO_URL') ?? `${appUrl}/email/logo-smartcar-negativa.png`,
  portalLoginUrl: env('PORTAL_LOGIN_URL') ?? `${appUrl}/portal/login`,
  portalFaturasUrl: env('PORTAL_FATURAS_URL') ?? `${appUrl}/portal/financeiro`,
  appAndroidUrl:
    env('APP_ANDROID_URL') ??
    'https://play.google.com/store/apps/details?id=io.smartcarbrasilassociado.associado',
  appIosUrl:
    env('APP_IOS_URL') ??
    'https://apps.apple.com/br/app/smart-car-brasil-associado/id6747453510',
  // Documentos GERAIS publicados em Configuracoes -> Termos, pelo link publico e fixo
  // /documentos/<modelo_id> (sempre a versao publicada atual). Nada de encurtador.
  manualAssistenciaUrl: env('DOC_MANUAL_URL') ?? `${appUrl}/documentos/${DOCUMENTOS.manualAssistencia}`,
  regimentoUrl: env('DOC_REGIMENTO_URL') ?? `${appUrl}/documentos/${DOCUMENTOS.regimento}`,
  rastreadoresUrl: env('DOC_RASTREADORES_URL') ?? `${appUrl}/documentos/${DOCUMENTOS.rastreadores}`,
};
