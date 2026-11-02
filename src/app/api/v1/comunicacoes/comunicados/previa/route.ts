import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validarComunicado, type DadosComunicado } from '@/lib/comunicacao/comunicados';
import { renderizarComunicado } from '@/lib/comunicacao/render-email';
import { origemPublica, rodapeDaEmpresa } from '@/lib/comunicacao/despacho-server';
import { emailValido, normalizarEmail } from '@/lib/comunicacao/cobranca';
import { provedorDeEmail } from '@/lib/comunicacao/provedor';
import { remetenteRelacionamento, remetenteServico } from '@/lib/email';

// POST /api/v1/comunicacoes/comunicados/previa — o comunicado da TELA com um associado de
// exemplo. { dados } devolve { assunto, html }; com { email } envia um teste (exige criar),
// pelo mesmo remetente do envio de verdade.
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const s = createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { dados?: DadosComunicado; email?: string };
  const { data: pode } = await s.rpc('pode_comunicados', { p_acao: body.email ? 'criar' : 'ver' });
  if (!pode) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  const d = body.dados;
  if (!d) return NextResponse.json({ error: 'Comunicado vazio' }, { status: 400 });

  const admin = createAdminClient();
  const rodape = await rodapeDaEmpresa(admin);
  const c = {
    finalidade: d.finalidade === 'SERVICO' ? 'SERVICO' as const : 'INFORMATIVO' as const,
    assunto: d.assunto || '(sem assunto)',
    titulo: d.titulo || '(sem título)',
    previa: d.previa || null,
    corpo: d.corpo || '',
    botao_texto: d.botao_texto || null,
    botao_url: d.botao_url || null,
  };
  const r = await renderizarComunicado(c, 'MARIA DA SILVA', rodape, origemPublica(request), '#');
  if (!body.email) return NextResponse.json({ assunto: r.assunto, html: r.html });

  const erros = validarComunicado(d, true);
  if (erros.length) return NextResponse.json({ error: erros.join(' ') }, { status: 400 });
  const email = normalizarEmail(body.email);
  if (!emailValido(email)) return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 });
  const provedor = provedorDeEmail();
  if (!provedor) return NextResponse.json({ error: 'RESEND_API_KEY não configurada no servidor.' }, { status: 400 });
  const res = await provedor.enviar({
    de: c.finalidade === 'INFORMATIVO' ? remetenteRelacionamento() : remetenteServico(),
    para: email, assunto: `[TESTE] ${r.assunto}`, html: r.html, texto: r.texto,
    responderPara: rodape.email, tags: { aviso: 'teste_comunicado', fluxo: c.finalidade === 'INFORMATIVO' ? 'relacionamento' : 'servico' },
  });
  if (!res.ok) {
    const dica = c.finalidade === 'INFORMATIVO' && /domain|verif/i.test(res.erro)
      ? ' Confira se o domínio relacionamento.appsmartcar.com.br está verificado no Resend.' : '';
    return NextResponse.json({ error: res.erro + dica }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
