import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { validarDocumento } from '@/lib/documento';
import { consumirTentativa, ipDaRequisicao } from '@/lib/rate-limit';
import { remetenteServico } from '@/lib/email';
import { emailValido, normalizarEmail } from '@/lib/comunicacao/cobranca';
import { provedorDeEmail } from '@/lib/comunicacao/provedor';
import { emails } from '@/lib/comunicacao/templates';
import { empresaDoRodape, linksDaOrigem } from '@/lib/comunicacao/render-email';
import { origemPublica, rodapeDaEmpresa } from '@/lib/comunicacao/despacho-server';

/**
 * "Esqueci minha senha" do Portal do Associado.
 *
 * O login e CPF/CNPJ + senha e o usuario de autenticacao tem e-mail INTERNO
 * (`<doc>@portal.smartcarbrasil.com.br`), que nao recebe nada. Por isso o link vai
 * para o e-mail do CADASTRO do associado (`clientes.email`), e e de uso unico:
 * o token de recuperacao do Supabase (validade da configuracao do Auth, 1 h por
 * padrao), conferido na pagina `/portal/nova-senha`.
 *
 * A resposta e SEMPRE a mesma: nao confirmamos a quem pergunta se um CPF e associado.
 * O link nunca e gravado nem logado.
 */
export const dynamic = 'force-dynamic';

function emailInterno(doc: string) {
  return `${doc}@portal.smartcarbrasil.com.br`;
}

const RESPOSTA =
  'Se houver um e-mail no cadastro deste CPF/CNPJ, enviamos para ele um link para criar a nova senha. ' +
  'Confira também o lixo eletrônico. Não recebeu? Fale com o atendimento para atualizar o seu e-mail.';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const doc = String(body?.cpf_cnpj ?? '').replace(/\D/g, '');
  if (!doc || !validarDocumento(doc, doc.length > 11 ? 'PJ' : 'PF')) {
    return NextResponse.json({ error: 'CPF/CNPJ inválido.' }, { status: 400 });
  }

  // 3 pedidos por documento e 10 por IP a cada 30 min: o envio e caro e nao pode virar spam.
  const ip = ipDaRequisicao(request);
  const porDoc = consumirTentativa(`portal-rec:doc:${doc}`, 3, 1800);
  const porIp = consumirTentativa(`portal-rec:ip:${ip}`, 10, 1800);
  if (!porDoc.permitido || !porIp.permitido) {
    const esperar = Math.max(porDoc.esperar, porIp.esperar);
    return NextResponse.json(
      { error: `Muitos pedidos. Tente de novo em ${Math.ceil(esperar / 60)} minuto(s).` },
      { status: 429, headers: { 'Retry-After': String(esperar) } },
    );
  }

  const ok = NextResponse.json({ ok: true, mensagem: RESPOSTA });

  const provedor = provedorDeEmail();
  if (!provedor) {
    console.error('[portal-recuperar] RESEND_API_KEY ausente: e-mail de recuperacao nao enviado');
    return ok;
  }

  const admin = createAdminClient();
  const { data: cliente } = await admin
    .from('clientes')
    .select('id, nome_razao_social, email, status, auth_user_id')
    .eq('cpf_cnpj', doc)
    .maybeSingle();
  if (!cliente || cliente.status === 'cancelado') return ok;

  const destino = normalizarEmail(cliente.email);
  if (!emailValido(destino)) return ok;
  const { data: suprimido } = await admin.rpc('email_suprimido', { p_email: destino });
  if (suprimido) return ok;

  // Associado que nunca entrou ainda nao tem usuario: cria com senha aleatoria
  // (ninguem a conhece) — a senha de verdade e a que ele vai criar pelo link.
  let authUserId = cliente.auth_user_id as string | null;
  if (!authUserId) {
    const { data: criado, error } = await admin.auth.admin.createUser({
      email: emailInterno(doc),
      password: randomBytes(24).toString('base64url'),
      email_confirm: true,
      user_metadata: { cliente_id: cliente.id, origem: 'portal_associado' },
    });
    if (error || !criado.user) {
      console.error('[portal-recuperar] nao criou o usuario:', error?.message);
      return ok;
    }
    authUserId = criado.user.id;
    await admin.from('clientes').update({ auth_user_id: authUserId }).eq('id', cliente.id);
  }
  const { data: authUser } = await admin.auth.admin.getUserById(authUserId);
  const emailAuth = authUser.user?.email;
  if (!emailAuth) return ok;

  const { data: link, error: erroLink } = await admin.auth.admin.generateLink({ type: 'recovery', email: emailAuth });
  const tokenHash = link?.properties?.hashed_token;
  if (erroLink || !tokenHash) {
    console.error('[portal-recuperar] generateLink falhou:', erroLink?.message);
    return ok;
  }

  const origem = origemPublica(request);
  const url = `${origem}/portal/nova-senha?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;
  const rodape = await rodapeDaEmpresa(admin);
  const msg = await emails.recuperarSenha({
    nome: cliente.nome_razao_social ?? '',
    link: url,
    empresa: empresaDoRodape(rodape),
    links: linksDaOrigem(origem),
  });
  const res = await provedor.enviar({
    de: remetenteServico(), para: destino, assunto: msg.assunto, html: msg.html, texto: msg.texto,
    responderPara: rodape.email, tags: { aviso: 'recuperar_senha', fluxo: 'servico' },
  });
  if (!res.ok) console.error('[portal-recuperar] envio falhou:', res.erro);
  return ok;
}
