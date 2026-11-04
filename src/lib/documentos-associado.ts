/**
 * Documentos pessoais do associado (0177): tipos, validacao do envio e a
 * leitura da validade da CNH. Espelha as regras do banco
 * (`chk_assoc_doc_*`, `cliente_documentacao`).
 */
import type { TipoDocumentoAssociado, SituacaoDocumentoAssociado } from './database.types';

export const TIPOS_DOCUMENTO: { id: TipoDocumentoAssociado; rotulo: string; dica: string }[] = [
  { id: 'CNH', rotulo: 'CNH', dica: 'Carteira de habilitação. Informe a data de vencimento.' },
  { id: 'RG', rotulo: 'RG (identidade)', dica: 'Frente e verso, legível.' },
  { id: 'CPF', rotulo: 'CPF', dica: 'Quando o número não está no RG.' },
  { id: 'COMPROVANTE_ENDERECO', rotulo: 'Comprovante de endereço', dica: 'Conta de luz, água, telefone ou banco, recente.' },
  { id: 'CONTRATO_SOCIAL', rotulo: 'Contrato social / cartão CNPJ', dica: 'Associado pessoa jurídica.' },
  { id: 'OUTRO', rotulo: 'Outro documento', dica: 'Descreva o que é.' },
];

export function rotuloTipoDocumento(tipo: string): string {
  return TIPOS_DOCUMENTO.find((t) => t.id === tipo)?.rotulo ?? tipo;
}

export const ROTULO_SITUACAO_DOCUMENTO: Record<SituacaoDocumentoAssociado, string> = {
  AGUARDANDO: 'Aguardando conferência',
  CONFERIDO: 'Conferido',
  RECUSADO: 'Recusado',
  SUBSTITUIDO: 'Substituído',
};

/** Data de hoje (YYYY-MM-DD) no fuso de São Paulo. */
export function hojeSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
}

function diasEntre(de: string, ate: string): number {
  const a = Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10));
  const b = Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export type SituacaoCnh = {
  nivel: 'sem_cnh' | 'vencida' | 'a_vencer' | 'valida';
  dias: number | null;   // dias ate o vencimento (negativo = vencida ha N dias)
  texto: string;
};

/** A leitura da validade da CNH. "A vencer" = vence em ate 30 dias. */
export function situacaoCnh(validade: string | null | undefined, hoje: string = hojeSaoPaulo()): SituacaoCnh {
  if (!validade) return { nivel: 'sem_cnh', dias: null, texto: 'Sem CNH em arquivo' };
  const v = validade.slice(0, 10);
  const dias = diasEntre(hoje, v);
  const data = `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`;
  if (dias < 0) {
    return { nivel: 'vencida', dias, texto: `CNH vencida desde ${data} (há ${-dias} dia${dias === -1 ? '' : 's'})` };
  }
  if (dias <= 30) {
    return { nivel: 'a_vencer', dias, texto: dias === 0 ? `CNH vence hoje (${data})` : `CNH vence em ${dias} dia${dias === 1 ? '' : 's'} (${data})` };
  }
  return { nivel: 'valida', dias, texto: `CNH válida até ${data}` };
}

export type EnvioDocumento = {
  tipo: TipoDocumentoAssociado | '';
  validade?: string | null;
  descricao?: string | null;
};

/** O que falta para o envio passar no banco. `null` = pode enviar. */
export function validarEnvioDocumento(e: EnvioDocumento, hoje: string = hojeSaoPaulo()): string | null {
  if (!e.tipo) return 'Escolha o tipo do documento.';
  if (e.tipo === 'CNH') {
    if (!e.validade) return 'Informe a data de vencimento da CNH.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.validade)) return 'Data de vencimento inválida.';
    if (diasEntre(hoje, e.validade) > 365 * 15) return 'Vencimento da CNH muito distante: confira a data.';
  }
  if (e.tipo === 'OUTRO' && !(e.descricao ?? '').trim()) return 'Descreva o documento.';
  return null;
}

/** Mensagem de WhatsApp pedindo a CNH nova. Sem tom de cobrança. */
export function mensagemPedirNovaCnh(nome: string | null | undefined, validade: string | null | undefined): string {
  const primeiro = (nome ?? '').trim().split(/\s+/)[0] ?? '';
  const saud = primeiro ? `Olá, ${primeiro.charAt(0)}${primeiro.slice(1).toLowerCase()}!` : 'Olá!';
  const v = validade ? validade.slice(0, 10) : null;
  const quando = v ? ` A que temos no seu cadastro venceu em ${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}.` : '';
  return `${saud} Aqui é da Smart Car Brasil. Para mantermos o seu cadastro atualizado, pedimos a foto da sua CNH em dia (frente e verso).${quando} Pode responder esta mensagem com a foto. Obrigado!`;
}
