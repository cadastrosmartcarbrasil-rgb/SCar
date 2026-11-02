import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  PALAVRAS_PROIBIDAS, decidirEnvio, emailValido, erroTransitorio, exemploAviso, proximaTentativa,
  renderizarAviso, taxasDoPainel, type Rodape,
} from './cobranca';
import { ResendProvider } from './provedor';
import { assinaturaResendConfere, eventoDoResend, expiracaoDoLink, lerTokenDoBoleto, tokenDoBoleto } from './servidor';

const rodape: Rodape = {
  razaoSocial: 'SMART CAR BRASIL PROTEÇÃO PATRIMONIAL MUTUALISTA',
  cnpj: '11222333000181',
  whatsapp: '(65) 99999-0000',
  email: 'contato@appsmartcar.com.br',
  site: null,
};

describe('modelos', () => {
  it('assunto por aviso', () => {
    expect(renderizarAviso('aviso_vencimento', exemploAviso('aviso_vencimento', -5), rodape).assunto)
      .toBe('Seu boleto Smart Car Brasil vence em 5 dias (16/11)');
    expect(renderizarAviso('aviso_vencimento', exemploAviso('aviso_vencimento', -1), rodape).assunto)
      .toBe('Seu boleto Smart Car Brasil vence amanhã (16/11)');
    expect(renderizarAviso('vence_hoje', exemploAviso('vence_hoje', 0), rodape).assunto).toContain('vence hoje');
    expect(renderizarAviso('atraso', exemploAviso('atraso', 2), rodape).assunto).toBe('Boleto Smart Car Brasil de 16/11 em aberto');
  });

  it('corpo traz linha digitavel, PIX, valor e rodape com CNPJ', () => {
    const r = renderizarAviso('atraso', exemploAviso('atraso', 7, 'https://x/b/tok'), rodape);
    for (const parte of [r.html, r.texto]) {
      expect(parte).toContain('74891.12345');
      expect(parte).toContain('BR.GOV.BCB.PIX');
      expect(parte).toContain('R$');
      expect(parte).toContain('11.222.333/0001-81');
      expect(parte).toContain('e-mail automático');
      expect(parte).toContain('https://x/b/tok');
    }
    expect(r.texto).toMatch(/^Olá, Maria\./);
  });

  it('nenhum aviso usa tom de ameaca', () => {
    for (const [t, o] of [['aviso_vencimento', -5], ['aviso_vencimento', -1], ['vence_hoje', 0], ['atraso', 2], ['atraso', 7]] as const) {
      const r = renderizarAviso(t, exemploAviso(t, o), rodape);
      const tudo = `${r.assunto} ${r.texto}`.toLowerCase();
      for (const p of PALAVRAS_PROIBIDAS) expect(tudo).not.toContain(p);
    }
  });

  it('escapa HTML do nome', () => {
    const d = { ...exemploAviso('vence_hoje', 0), nome: '<script>x' };
    expect(renderizarAviso('vence_hoje', d, rodape).html).not.toContain('<script>');
  });
});

describe('decisao de envio', () => {
  const item = { destinatario: 'a@b.com', titulo_status: 'pendente', linha_digitavel: '748' };
  it('live envia; pago e cancelado nao', () => {
    expect(decidirEnvio(item, { modo: 'live', allowlist: [] })).toEqual({ acao: 'enviar' });
    expect(decidirEnvio({ ...item, titulo_status: 'pago' }, { modo: 'live', allowlist: [] }).acao).toBe('cancelar');
    expect(decidirEnvio({ ...item, titulo_status: 'cancelado' }, { modo: 'live', allowlist: [] }).acao).toBe('cancelar');
    expect(decidirEnvio({ ...item, linha_digitavel: null }, { modo: 'live', allowlist: [] }).acao).toBe('cancelar');
  });
  it('sandbox so para a lista', () => {
    expect(decidirEnvio(item, { modo: 'sandbox', allowlist: [] }).acao).toBe('cancelar');
    expect(decidirEnvio(item, { modo: 'sandbox', allowlist: [' A@B.COM '] })).toEqual({ acao: 'enviar' });
  });
  it('valida e-mail', () => {
    expect(emailValido('Fulano.Silva+x@empresa.com.br')).toBe(true);
    expect(emailValido('sem-arroba')).toBe(false);
    expect(emailValido('a@b')).toBe(false);
  });
});

describe('retry', () => {
  it('backoff exponencial com teto', () => {
    const t0 = new Date('2026-11-11T12:00:00Z');
    expect(proximaTentativa(1, t0).getTime() - t0.getTime()).toBe(60_000);
    expect(proximaTentativa(3, t0).getTime() - t0.getTime()).toBe(4 * 60_000);
    expect(proximaTentativa(10, t0).getTime() - t0.getTime()).toBe(30 * 60_000);
  });
  it('transitorio x permanente', () => {
    expect(erroTransitorio(null)).toBe(true);
    expect(erroTransitorio(429)).toBe(true);
    expect(erroTransitorio(503)).toBe(true);
    expect(erroTransitorio(422)).toBe(false);
    expect(erroTransitorio(403)).toBe(false);
  });
});

describe('painel', () => {
  it('alerta de bounce e reclamacao', () => {
    expect(taxasDoPainel({ enviados: 100, bounces: 3, reclamacoes: 0 }).alertaBounce).toBe(true);
    expect(taxasDoPainel({ enviados: 100, bounces: 2, reclamacoes: 0 }).alertaBounce).toBe(false);
    expect(taxasDoPainel({ enviados: 1000, bounces: 0, reclamacoes: 1 }).alertaReclamacao).toBe(true);
    expect(taxasDoPainel({ enviados: 0, bounces: 0, reclamacoes: 0 }).alertaBounce).toBe(false);
  });
});

describe('Resend', () => {
  it('manda a chave de idempotencia e le o id', async () => {
    let visto: RequestInit | undefined;
    const f = (async (_u: unknown, init?: RequestInit) => {
      visto = init;
      return new Response(JSON.stringify({ id: 'msg-1' }), { status: 200 });
    }) as typeof fetch;
    const r = await new ResendProvider('k', f).enviar({ de: 'x@y.com', para: 'a@b.com', assunto: 's', html: 'h', texto: 't', chave: 'id-1' });
    expect(r).toEqual({ ok: true, messageId: 'msg-1' });
    expect((visto?.headers as Record<string, string>)['Idempotency-Key']).toBe('id-1');
  });
  it('erro devolve o status', async () => {
    const f = (async () => new Response(JSON.stringify({ message: 'invalid' }), { status: 422 })) as unknown as typeof fetch;
    const r = await new ResendProvider('k', f).enviar({ de: 'x', para: 'a', assunto: 's', html: 'h', texto: 't' });
    expect(r).toEqual({ ok: false, status: 422, erro: 'HTTP 422: invalid' });
  });
});

describe('link do boleto', () => {
  const id = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
  it('assina, le e recusa adulterado ou vencido', () => {
    const exp = expiracaoDoLink('2026-11-16');
    const tok = tokenDoBoleto(id, exp, 'segredo');
    expect(lerTokenDoBoleto(tok, 'segredo', exp - 10)).toEqual({ tituloId: id });
    expect(lerTokenDoBoleto(tok, 'outro', exp - 10)).toEqual({ erro: 'invalido' });
    expect(lerTokenDoBoleto(tok.replace(id, id.replace('3', '4')), 'segredo', exp - 10)).toEqual({ erro: 'invalido' });
    expect(lerTokenDoBoleto(tok, 'segredo', exp + 10)).toEqual({ erro: 'expirado' });
    expect(lerTokenDoBoleto('lixo', 'segredo')).toEqual({ erro: 'invalido' });
  });
  it('expira 30 dias depois do vencimento', () => {
    const exp = expiracaoDoLink('2026-11-16');
    expect(new Date(exp * 1000).toISOString().slice(0, 10)).toBe('2026-12-17');
  });
});

describe('webhook do Resend', () => {
  const segredo = 'whsec_' + Buffer.from('chave-secreta-de-teste').toString('base64');
  const corpo = '{"type":"email.delivered"}';
  const assinar = (id: string, ts: string) =>
    'v1,' + createHmac('sha256', Buffer.from('chave-secreta-de-teste')).update(`${id}.${ts}.${corpo}`).digest('base64');

  it('confere a assinatura e recusa adulterada ou velha', () => {
    const ts = '1700000000';
    const h = { id: 'msg_1', timestamp: ts, assinatura: `v1,xxx ${assinar('msg_1', ts)}` };
    expect(assinaturaResendConfere(corpo, h, segredo, 1700000010)).toBe(true);
    expect(assinaturaResendConfere(corpo + ' ', h, segredo, 1700000010)).toBe(false);
    expect(assinaturaResendConfere(corpo, h, segredo, 1700001000)).toBe(false);
    expect(assinaturaResendConfere(corpo, { ...h, assinatura: null }, segredo, 1700000010)).toBe(false);
  });

  it('traduz os eventos', () => {
    expect(eventoDoResend({ type: 'email.delivered', data: { email_id: 'm1', to: ['a@b.com'] } }))
      .toMatchObject({ tipo: 'entregue', messageId: 'm1', destinatario: 'a@b.com' });
    expect(eventoDoResend({ type: 'email.bounced', data: { email_id: 'm1', bounce: { type: 'Permanent', subType: 'General' } } }))
      .toMatchObject({ tipo: 'bounce', permanente: true });
    expect(eventoDoResend({ type: 'email.bounced', data: { email_id: 'm1', bounce: { type: 'Transient' } } }))
      .toMatchObject({ tipo: 'bounce', permanente: false });
    expect(eventoDoResend({ type: 'email.complained', data: { email_id: 'm1' } })).toMatchObject({ tipo: 'reclamacao' });
    expect(eventoDoResend({ type: 'email.opened', data: {} })).toBeNull();
  });
});
