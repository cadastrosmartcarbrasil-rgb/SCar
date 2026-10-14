/**
 * Remetente e contato de e-mail do sistema — UM lugar só.
 *
 * O dominio do app e appsmartcar.com.br (desde 14/10/2026); nada pode sair como
 * smartvida/smartvidanet. Para o Resend ENTREGAR, o dominio do remetente tem de
 * estar verificado na conta do Resend (DNS na KingHost).
 *
 * Env vazia conta como ausente: o docker-compose repassa `EMAIL_FROM: ${EMAIL_FROM:-}`,
 * entao sem a variavel no .env ela chega como "" — e `?? padrao` manteria a string
 * vazia, mandando o e-mail sem remetente.
 */
export const DOMINIO_EMAIL = 'appsmartcar.com.br';
export const REMETENTE_PADRAO = `Smart Car Brasil <nao-responda@${DOMINIO_EMAIL}>`;
export const CONTATO_PADRAO = `contato@${DOMINIO_EMAIL}`;

function preenchida(valor: string | undefined | null): string | null {
  const v = (valor ?? '').trim();
  return v ? v : null;
}

/** EMAIL_FROM manda; RESEND_FROM (nome antigo da boas-vindas) e reserva; senao o padrao. */
export function remetenteEmail(env: Record<string, string | undefined> = process.env): string {
  return preenchida(env.EMAIL_FROM) ?? preenchida(env.RESEND_FROM) ?? REMETENTE_PADRAO;
}
