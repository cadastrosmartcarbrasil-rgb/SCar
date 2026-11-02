import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  PALAVRAS_PROIBIDAS, decidirEnvio, diasEntre, emailValido, erroTransitorio, exemploAviso, hojeSp,
  proximaTentativa, somarDias, taxasDoPainel, veiculoDoAviso, type Rodape, type TemplateEmail,
} from './cobranca';
import { renderizarAviso } from './render-email';
import { emails } from './templates';
import { ResendProvider } from './provedor';
import { assinaturaResendConfere, eventoDoResend, expiracaoDoLink, lerTokenDoBoleto, tokenDoBoleto } from './servidor';

const rodape: Rodape = {
  razaoSocial: 'SMART CAR BRASIL PROTEÇÃO PATRIMONIAL MUTUALISTA',
  cnpj: '11222333000181',
  whatsapp: '(65) 99999-0000',
  email: 'contato@appsmartcar.com.br',
  site: null,
};

describe('modelos (templates React Email)', () => {
  const r = (t: TemplateEmail, offset: number, link: string | null = null) => {
    const ex = exemploAviso(t, offset, link);
    return renderizarAviso(t, ex, rodape, { origem: 'https://appsmartcar.com.br', hoje: somarDias(ex.vencimento!, offset) });
  };
  const TODOS = [['aviso_vencimento', -5], ['aviso_vencimento', -1], ['vence_hoje', 0], ['atraso', 2], ['atraso', 7]] as const;

  it('assunto por aviso', async () => {
    expect((await r('aviso_vencimento', -5)).assunto).toBe('Lembrete: sua contribuição vence em 5 dias');
    expect((await r('aviso_vencimento', -1)).assunto).toBe('Lembrete: sua contribuição vence amanhã');
    expect((await r('vence_hoje', 0)).assunto).toContain('vence hoje');
    expect((await r('atraso', 2)).assunto).toBe('Sua contribuição está em aberto — Smart Car Brasil');
  });

  it('corpo traz linha digitavel, PIX, valor, link do boleto, rodape e logo', async () => {
    const e = await r('atraso', 7, 'https://x/b/tok');
    for (const parte of [e.html, e.texto]) {
      expect(parte).toContain('74891.12345');
      expect(parte).toContain('BR.GOV.BCB.PIX');
      expect(parte).toContain('R$');
      expect(parte).toContain('11.222.333/0001-81');
      expect(parte).toContain('https://x/b/tok');
      expect(parte).toContain('7 dias');
    }
    expect(e.html).toContain('https://appsmartcar.com.br/email/logo-smartcar-negativa.png');
    expect(e.html).toContain('https://appsmartcar.com.br/portal/login');
    expect(e.html).toContain('https://wa.me/5565999990000');
    expect(e.html).not.toContain('mutualignit');
  });

  it('html sem lixo de renderizacao e com texto simples', async () => {
    for (const [t, o] of TODOS) {
      const e = await r(t, o);
      for (const lixo of ['undefined', '>null<', '[object']) expect(e.html).not.toContain(lixo);
      expect(e.texto.length).toBeGreaterThan(200);
    }
  });

  it('nenhum aviso usa tom de ameaca nem vocabulario de seguradora', async () => {
    const seguradora = ['seguro', 'segurado', 'apólice', 'prêmio', 'sinistro', 'indenização', 'franquia', 'corretor'];
    for (const [t, o] of TODOS) {
      const e = await r(t, o);
      const tudo = `${e.assunto} ${e.texto}`.toLowerCase();
      for (const p of [...PALAVRAS_PROIBIDAS, ...seguradora]) expect(tudo).not.toContain(p);
    }
  });

  it('a cobranca nao mostra a placa inteira', async () => {
    const ex = { ...exemploAviso('atraso', 2), veiculo: veiculoDoAviso('ARGO DRIVE 1.0', 'ABC1D23') };
    const e = await renderizarAviso('atraso', ex, rodape, { hoje: somarDias(ex.vencimento!, 2) });
    expect(e.html).toContain('placa final 23');
    expect(e.html).not.toContain('ABC1D23');
  });

  it('atraso: rastreador afirmado com IMEI na ficha, condicional sem; lembrete nao fala de rastreador', async () => {
    const ex = exemploAviso('atraso', 7);
    const com = await renderizarAviso('atraso', { ...ex, temRastreador: true }, rodape, { hoje: somarDias(ex.vencimento!, 7) });
    const sem = await renderizarAviso('atraso', ex, rodape, { hoje: somarDias(ex.vencimento!, 7) });
    expect(com.texto).toContain('Como o seu veículo possui rastreador');
    expect(sem.texto).toContain('Caso o seu veículo possua rastreador');
    expect((await r('aviso_vencimento', -5)).texto).not.toContain('rastreador');
  });

  it('sem botoes do app antigo (Android/iPhone)', async () => {
    const e = await r('vence_hoje', 0);
    for (const x of ['Android', 'iPhone', 'play.google.com', 'apps.apple.com', 'aplicativo']) expect(e.html).not.toContain(x);
    expect(e.html).toContain('Acessar o portal');
  });

  it('recuperar senha: link no botao, sem senha nem CPF no corpo', async () => {
    const e = await emails.recuperarSenha({ nome: 'MARIA DA SILVA', link: 'https://appsmartcar.com.br/portal/nova-senha?token_hash=abc&type=recovery' });
    expect(e.html).toContain('token_hash=abc');
    expect(e.texto).toContain('uma vez');
    const tudo = `${e.assunto} ${e.texto}`.toLowerCase();
    for (const p of ['seguro', 'sinistro', 'senha:', '351.693']) expect(tudo).not.toContain(p);
  });

  it('escapa HTML do nome', async () => {
    const ex = { ...exemploAviso('vence_hoje', 0), nome: '<script>x' };
    expect((await renderizarAviso('vence_hoje', ex, rodape, { hoje: ex.vencimento! })).html).not.toContain('<script>');
  });

  it('boas-vindas e aniversario renderizam sem vocabulario de seguradora', async () => {
    const bv = await emails.boasVindas({ nome: 'MARIA DA SILVA', modelo: 'Fiat Argo', placa: 'abc1d23', planos: ['Proteção do casco'] });
    const an = await emails.aniversario({ nome: 'MARIA DA SILVA', linkDescadastro: 'https://x/pref/tok' });
    for (const e of [bv, an]) {
      const tudo = `${e.assunto} ${e.texto}`.toLowerCase();
      for (const p of ['seguro', 'segurado', 'apólice', 'prêmio', 'sinistro', 'indenização', 'franquia', 'corretor', 'senha:']) {
        expect(tudo).not.toContain(p);
      }
    }
    expect(an.html).toContain('https://x/pref/tok');
    expect(bv.html).not.toContain('bit.ly');
    for (const id of ['4b172d0e-82c7-4a75-8c4d-9d987bbc17c5', '1372b1ea-c24b-4bf2-97b4-cd986b663c2e', '9cfd3515-edb8-4e4c-aa56-f6943a6f9a80']) {
      expect(bv.html).toContain(`https://appsmartcar.com.br/documentos/${id}`);
    }
  });
});

describe('dados do aviso', () => {
  it('veiculo: modelo + final da placa', () => {
    expect(veiculoDoAviso('ONIX LT 1.0', 'ABC-1D23')).toBe('Onix Lt 1.0 · placa final 23');
    expect(veiculoDoAviso('NMAX 160', null)).toBe('Nmax 160');
    expect(veiculoDoAviso(null, null)).toBeNull();
  });
  it('dias e hoje em Sao Paulo, inclusive na virada do dia', () => {
    expect(diasEntre('2026-11-16', '2026-11-18')).toBe(2);
    expect(diasEntre('2026-11-16', '2026-11-11')).toBe(-5);
    expect(diasEntre('2026-02-27', '2026-03-01')).toBe(2);
    // 02:30 UTC de 17/11 = 23:30 de 16/11 em Sao Paulo
    expect(hojeSp(new Date('2026-11-17T02:30:00Z'))).toBe('2026-11-16');
    expect(hojeSp(new Date('2026-11-17T03:30:00Z'))).toBe('2026-11-17');
    expect(somarDias('2026-12-30', 3)).toBe('2027-01-02');
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
