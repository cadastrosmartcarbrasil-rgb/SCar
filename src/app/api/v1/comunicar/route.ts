import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumirTentativa } from '@/lib/rate-limit';
import { mensagemDeErro } from '@/lib/venda-publica';
import { dadosParaGravar, pendenciasDaComunicacao, type DadosComunicacao, type PapelComunicacao } from '@/lib/comunicacao-evento';
import type { Json } from '@/lib/database.types';

/**
 * Comunicacao de evento pelo link publico (0129). Sem sessao: a capacidade e o
 * token, e todas as RPCs conferem de novo (prazo, revogacao, identidade).
 *
 *   ler        { token }                         -> o que a pagina pode mostrar
 *   verificar  { token, doc, nascimento? }        -> confirma o associado
 *   rascunho   { token, dados }                   -> salva sem enviar
 *   enviar     { token, dados, declarou }         -> versao imutavel
 *   remover    { token, anexo_id }                -> apaga foto antes do envio
 */
const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_SINISTROS ?? 'sinistros-docs';

function ipDe(req: Request) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
}

const erro = (msg: unknown, status = 400) =>
  NextResponse.json({ error: mensagemDeErro(typeof msg === 'string' ? msg : (msg as { message?: string })?.message) }, { status });

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as
    | { acao?: string; token?: string; doc?: string; nascimento?: string; dados?: DadosComunicacao; declarou?: boolean; anexo_id?: string }
    | null;
  const token = String(corpo?.token ?? '').trim();
  if (!corpo || !token) return erro('Envio invalido');

  const ip = ipDe(req) ?? 'sem-ip';
  const limite = consumirTentativa(`comunicar:${ip}`, 300, 600);
  if (!limite.permitido) return erro('Muitas tentativas. Aguarde alguns minutos.', 429);

  const admin = createAdminClient();

  if (corpo.acao === 'ler') {
    const { data, error } = await admin.rpc('comunicacao_publica', { p_token: token });
    if (error) return erro(error);
    const { data: anexos } = await admin.rpc('anexos_comunicacao_publica', { p_token: token });
    return NextResponse.json({ ...(data as Record<string, unknown>), anexos: anexos ?? [] });
  }

  if (corpo.acao === 'verificar') {
    const porToken = consumirTentativa(`comunicar-verificar:${token}`, 8, 900);
    if (!porToken.permitido) return erro('Muitas tentativas. Aguarde alguns minutos.', 429);
    const { data, error } = await admin.rpc('verificar_comunicacao', {
      p_token: token, p_doc_inicio: String(corpo.doc ?? ''), p_nascimento: corpo.nascimento || null,
    });
    if (error) return erro(error);
    return NextResponse.json(data);
  }

  // As escritas precisam saber o papel para limpar o que nao e dele.
  const { data: com } = await admin.rpc('comunicacao_publica_por_token', { p_token: token });
  if (!com?.id) return erro('Link invalido', 403);
  const papel = com.papel as PapelComunicacao;

  if (corpo.acao === 'rascunho') {
    const dados = dadosParaGravar(papel, corpo.dados ?? {});
    const { error } = await admin.rpc('salvar_rascunho_comunicacao', { p_token: token, p_dados: dados as Json });
    if (error) return erro(error);
    return NextResponse.json({ ok: true });
  }

  if (corpo.acao === 'enviar') {
    const dados = dadosParaGravar(papel, corpo.dados ?? {});
    const faltam = pendenciasDaComunicacao(papel, dados);
    if (faltam.length) return erro(`Falta preencher: ${faltam.join(', ')}`);
    const { data, error } = await admin.rpc('enviar_comunicacao', {
      p_token: token, p_dados: dados as Json, p_declarou: corpo.declarou === true,
      p_ip: ipDe(req), p_user_agent: req.headers.get('user-agent')?.slice(0, 400) ?? null,
    });
    if (error) return erro(error);
    return NextResponse.json(data);
  }

  if (corpo.acao === 'remover' && corpo.anexo_id) {
    const { data: url, error } = await admin.rpc('remover_anexo_comunicacao', { p_token: token, p_anexo: corpo.anexo_id });
    if (error) return erro(error);
    if (url) await admin.storage.from(BUCKET).remove([url]);
    return NextResponse.json({ ok: true });
  }

  return erro('Acao desconhecida');
}
