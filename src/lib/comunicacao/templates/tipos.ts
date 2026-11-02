import type { Empresa, Links } from './config';
import type { Pagamento } from './components/Blocos';
import type { TextosModelo } from '../modelos';

/** Campos comuns a todos os e-mails de cobrança. */
export interface CobrancaBase {
  /** Nome completo do associado (será usado só o primeiro nome). */
  nome: string;
  /** Texto livre do veículo, ex.: "Fiat Argo · placa final 23". Evite dados em excesso. */
  veiculo?: string;
  /** Valor da contribuição em reais (number). */
  valor: number;
  /** Data de vencimento 'YYYY-MM-DD'. */
  vencimento: string;
  pagamento: Pagamento;
  /** Textos editados na tela (0170); o que faltar cai no original. */
  textos?: TextosModelo;
  empresa?: Partial<Empresa>;
  links?: Partial<Links>;
}

export interface LembreteVencimentoProps extends CobrancaBase {
  /** Dias que faltam (5, 1...). */
  diasParaVencer: number;
}

export type VenceHojeProps = CobrancaBase;

export interface AtrasoProps extends CobrancaBase {
  diasAtraso: number;
  /**
   * true  = veículo tem rastreador -> afirma o bloqueio do sinal;
   * false = não menciona;
   * undefined = menciona de forma condicional ("caso o seu veículo tenha rastreador...").
   */
  temRastreador?: boolean;
  /**
   * Trecho do contrato de adesão a citar (texto aprovado pelo jurídico).
   * Se vazio, nada é citado.
   */
  textoContratual?: string;
}

export interface AniversarioProps {
  nome: string;
  /** Link de descadastro de mensagens de relacionamento (obrigatório). */
  linkDescadastro: string;
  textos?: TextosModelo;
  empresa?: Partial<Empresa>;
  links?: Partial<Links>;
}

export interface BoasVindasProps {
  nome: string;
  modelo: string;
  placa: string;
  /** Planos/produtos contratados, um por item. */
  planos: string[];
  /**
   * Link seguro e com prazo para o associado CRIAR a própria senha (ex.: link de convite/recuperação
   * do Supabase Auth). Se ausente, o e-mail orienta a usar "Esqueci minha senha".
   */
  linkDefinirSenha?: string;
  /** Mostra o aviso "verifique o lixo eletrônico" sobre os documentos da adesão. Padrão: true. */
  documentosEnviados?: boolean;
  textos?: TextosModelo;
  empresa?: Partial<Empresa>;
  links?: Partial<Links>;
}

export interface RecuperarSenhaProps {
  nome: string;
  /** Link de uso unico para criar a nova senha (nunca gravado em log). */
  link: string;
  validadeMinutos?: number;
  textos?: TextosModelo;
  empresa?: Partial<Empresa>;
  links?: Partial<Links>;
}
