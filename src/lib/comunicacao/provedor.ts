/**
 * Provedor de e-mail transacional (0168). Interface unica + adaptador do Resend.
 * Trocar de provedor (ex.: Amazon SES) = um adaptador novo; a fila nao muda.
 */

export type MensagemEmail = {
  de: string;
  para: string;
  assunto: string;
  html: string;
  texto: string;
  responderPara?: string | null;
  /** Chave de idempotencia (o id do item da fila): o provedor nao manda duas vezes. */
  chave?: string;
  tags?: Record<string, string>;
  /** Cabecalhos extras (ex.: List-Unsubscribe do comunicado informativo). */
  cabecalhos?: Record<string, string>;
};

export type ResultadoEnvio =
  | { ok: true; messageId: string }
  | { ok: false; status: number | null; erro: string };

export interface EmailProvider {
  readonly nome: string;
  enviar(m: MensagemEmail): Promise<ResultadoEnvio>;
}

type FetchLike = typeof fetch;

export class ResendProvider implements EmailProvider {
  readonly nome = 'resend';
  constructor(private readonly apiKey: string, private readonly f: FetchLike = fetch) {}

  async enviar(m: MensagemEmail): Promise<ResultadoEnvio> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (m.chave) headers['Idempotency-Key'] = m.chave;
    let res: Response;
    try {
      res = await this.f('https://api.resend.com/emails', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          from: m.de,
          to: [m.para],
          subject: m.assunto,
          html: m.html,
          text: m.texto,
          reply_to: m.responderPara || undefined,
          headers: m.cabecalhos && Object.keys(m.cabecalhos).length ? m.cabecalhos : undefined,
          tags: m.tags
            ? Object.entries(m.tags).map(([name, value]) => ({ name, value: value.replace(/[^A-Za-z0-9_-]/g, '_') }))
            : undefined,
        }),
      });
    } catch (e) {
      return { ok: false, status: null, erro: `Falha de rede: ${(e as Error).message}` };
    }
    const corpo = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (res.ok && corpo.id) return { ok: true, messageId: corpo.id };
    return { ok: false, status: res.status, erro: `HTTP ${res.status}: ${corpo.message ?? corpo.name ?? 'sem detalhe'}` };
  }
}

export function provedorDeEmail(env: Record<string, string | undefined> = process.env): EmailProvider | null {
  const chave = (env.RESEND_API_KEY ?? '').trim();
  if (!chave) return null;
  return new ResendProvider(chave);
}
