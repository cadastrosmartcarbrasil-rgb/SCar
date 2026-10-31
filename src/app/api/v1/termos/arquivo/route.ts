import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sha256 } from '@/lib/termos-server';
import { validarPdfTermo } from '@/lib/termos';

// PDF ORIGINAL do documento GERAL (0166) — Regimento etc.
//   POST   multipart { modelo_id, arquivo } -> sobe para o bucket privado `termos`
//          e grava no rascunho (definir_pdf_termo_modelo confere permissao e escopo)
//   DELETE ?modelo_id=  -> tira o PDF do rascunho (volta a valer o texto)
// As versoes ja publicadas guardam a copia delas (versoes/...), entao trocar ou
// tirar o arquivo do rascunho nunca mexe no que foi publicado.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

async function sessao() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, ok: false as const, resp: erro('Não autenticado', 401) };
  const { data: perfil } = await supabase.from('usuarios').select('papel, ativo').eq('id', user.id).maybeSingle();
  const { data: perms } = await supabase.rpc('minhas_permissoes');
  const pode = (k: string) => (perms ?? []).includes(k);
  const permitido = !!perfil && perfil.ativo !== false
    && (perfil.papel === 'admin' || pode('termos_modelos.criar') || pode('termos_modelos.editar'));
  if (!permitido) return { supabase, ok: false as const, resp: erro('Seu perfil não altera termos.', 403) };
  return { supabase, ok: true as const };
}

export async function POST(request: Request) {
  const s = await sessao();
  if (!s.ok) return s.resp;
  let form: FormData;
  try { form = await request.formData(); } catch { return erro('Envie o arquivo.'); }
  const modeloId = String(form.get('modelo_id') ?? '');
  const arquivo = form.get('arquivo');
  if (!modeloId || !(arquivo instanceof File)) return erro('Informe o termo e o arquivo.');

  const { data: m } = await s.supabase.from('termos_modelos')
    .select('id, escopo, arquivo_pdf_path').eq('id', modeloId).maybeSingle();
  if (!m) return erro('Termo não encontrado.', 404);

  const buf = Buffer.from(await arquivo.arrayBuffer());
  const problema = validarPdfTermo({
    nome: arquivo.name, bytes: buf.length, cabecalho: buf.subarray(0, 8).toString('latin1'), escopo: m.escopo,
  });
  if (problema) return erro(problema);

  const hash = sha256(buf);
  const path = `modelos/${modeloId}/${hash}.pdf`;
  const admin = createAdminClient();
  const up = await admin.storage.from('termos').upload(path, buf, { contentType: 'application/pdf', upsert: true });
  if (up.error) return erro(`Não foi possível guardar o arquivo: ${up.error.message}`, 500);

  const { data: modelo, error } = await s.supabase.rpc('definir_pdf_termo_modelo', {
    p_modelo_id: modeloId, p_path: path, p_sha256: hash, p_nome: arquivo.name, p_bytes: buf.length,
  });
  if (error) {
    if (path !== m.arquivo_pdf_path) await admin.storage.from('termos').remove([path]);
    return erro(error.message, error.code === '42501' ? 403 : 400);
  }
  // o arquivo anterior do rascunho sai (as versoes tem a copia propria)
  if (m.arquivo_pdf_path && m.arquivo_pdf_path !== path) {
    await admin.storage.from('termos').remove([m.arquivo_pdf_path]);
  }
  return NextResponse.json({ modelo });
}

export async function DELETE(request: Request) {
  const s = await sessao();
  if (!s.ok) return s.resp;
  const modeloId = new URL(request.url).searchParams.get('modelo_id');
  if (!modeloId) return erro('Informe o termo.');
  const { data: m } = await s.supabase.from('termos_modelos')
    .select('id, arquivo_pdf_path').eq('id', modeloId).maybeSingle();
  if (!m) return erro('Termo não encontrado.', 404);
  const { data: modelo, error } = await s.supabase.rpc('definir_pdf_termo_modelo', {
    p_modelo_id: modeloId, p_path: null,
  });
  if (error) return erro(error.message, error.code === '42501' ? 403 : 400);
  if (m.arquivo_pdf_path) await createAdminClient().storage.from('termos').remove([m.arquivo_pdf_path]);
  return NextResponse.json({ modelo });
}
