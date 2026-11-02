import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Partes de SERVIDOR do modulo de e-mail (0168): link assinado do boleto e
 * verificacao do webhook do Resend. Usa node:crypto — nao importar no cliente.
 */

// ---------------------------------------------------------------------------
// Link do boleto: /b/<titulo>.<expira>.<assinatura>
// Sem CPF, valor ou linha na URL; o uuid do titulo nao identifica ninguem.
// ---------------------------------------------------------------------------
function assinar(segredo: string, conteudo: string): string {
  return createHmac('sha256', segredo).update(conteudo).digest('base64url').slice(0, 32);
}

/** Expira 30 dias depois do vencimento (fim do dia). */
export function expiracaoDoLink(vencimento: string, dias = 30): number {
  const d = new Date(`${vencimento.slice(0, 10)}T23:59:59-03:00`);
  return Math.floor(d.getTime() / 1000) + dias * 86400;
}

export function tokenDoBoleto(tituloId: string, expira: number, segredo: string): string {
  const conteudo = `${tituloId}.${expira}`;
  return `${conteudo}.${assinar(segredo, conteudo)}`;
}

export function lerTokenDoBoleto(
  token: string,
  segredo: string,
  agora: number = Math.floor(Date.now() / 1000),
): { tituloId: string } | { erro: 'invalido' | 'expirado' } {
  const partes = (token ?? '').split('.');
  if (partes.length !== 3) return { erro: 'invalido' };
  const [id, exp, sig] = partes;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d+$/.test(exp)) return { erro: 'invalido' };
  const esperado = Buffer.from(assinar(segredo, `${id}.${exp}`));
  const recebido = Buffer.from(sig);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return { erro: 'invalido' };
  if (Number(exp) < agora) return { erro: 'expirado' };
  return { tituloId: id };
}

// ---------------------------------------------------------------------------
// Descadastro dos comunicados informativos: /descadastro/<email-base64url>.<assinatura>
// Nao expira (o link fica no e-mail para sempre); so o e-mail que recebeu se descadastra.
// ---------------------------------------------------------------------------
export function tokenDescadastro(email: string, segredo: string): string {
  const e = Buffer.from(email.trim().toLowerCase(), 'utf8').toString('base64url');
  return `${e}.${assinar(segredo, `descadastro:${e}`)}`;
}

export function lerTokenDescadastro(token: string, segredo: string): string | null {
  const [e, sig] = (token ?? '').split('.');
  if (!e || !sig || !segredo) return null;
  const esperado = Buffer.from(assinar(segredo, `descadastro:${e}`));
  const recebido = Buffer.from(sig);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null;
  const email = Buffer.from(e, 'base64url').toString('utf8');
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

// ---------------------------------------------------------------------------
// Webhook do Resend (assinatura no padrao Svix)
// ---------------------------------------------------------------------------
export function assinaturaResendConfere(
  corpo: string,
  headers: { id: string | null; timestamp: string | null; assinatura: string | null },
  segredo: string,
  agora: number = Math.floor(Date.now() / 1000),
  toleranciaSeg = 300,
): boolean {
  const { id, timestamp, assinatura } = headers;
  if (!id || !timestamp || !assinatura || !segredo) return false;
  if (!/^\d+$/.test(timestamp) || Math.abs(agora - Number(timestamp)) > toleranciaSeg) return false;
  const chave = Buffer.from(segredo.replace(/^whsec_/, ''), 'base64');
  const esperado = createHmac('sha256', chave).update(`${id}.${timestamp}.${corpo}`).digest('base64');
  const esperadoBuf = Buffer.from(esperado);
  return assinatura.split(' ').some((parte) => {
    const sig = parte.includes(',') ? parte.split(',')[1] : parte;
    const b = Buffer.from(sig ?? '');
    return b.length === esperadoBuf.length && timingSafeEqual(b, esperadoBuf);
  });
}

export type EventoEmail = {
  tipo: 'entregue' | 'bounce' | 'reclamacao' | 'falhou' | 'atrasado' | 'enviado';
  messageId: string | null;
  destinatario: string | null;
  detalhe: string | null;
  permanente: boolean;
  ocorridoEm: string | null;
};

/** Traduz o evento do Resend. Abertura/clique e o resto: null (nao registrados). */
export function eventoDoResend(payload: unknown): EventoEmail | null {
  const p = payload as {
    type?: string;
    created_at?: string;
    data?: { email_id?: string; to?: string[] | string; bounce?: { type?: string; subType?: string; message?: string }; failed?: { reason?: string } };
  };
  const mapa: Record<string, EventoEmail['tipo']> = {
    'email.delivered': 'entregue',
    'email.bounced': 'bounce',
    'email.complained': 'reclamacao',
    'email.failed': 'falhou',
    'email.delivery_delayed': 'atrasado',
    'email.sent': 'enviado',
  };
  const tipo = mapa[p?.type ?? ''];
  if (!tipo) return null;
  const to = p.data?.to;
  const destinatario = Array.isArray(to) ? to[0] ?? null : to ?? null;
  let detalhe: string | null = null;
  let permanente = true;
  if (tipo === 'bounce') {
    const b = p.data?.bounce;
    detalhe = [b?.type, b?.subType, b?.message].filter(Boolean).join(' · ') || null;
    // so o PERMANENTE suprime; temporario e indeterminado so registram
    permanente = !b?.type || b.type.toLowerCase() === 'permanent';
  } else if (tipo === 'falhou') {
    detalhe = p.data?.failed?.reason ?? null;
  }
  return { tipo, messageId: p.data?.email_id ?? null, destinatario, detalhe, permanente, ocorridoEm: p.created_at ?? null };
}
