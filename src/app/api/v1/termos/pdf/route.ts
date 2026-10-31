import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// O PDF de um termo (0123), lido do bucket privado `termos` pelo servidor:
//   ?emitido=<id> -> o termo emitido (equipe da unidade ou o proprio associado,
//                    quando publicado no portal) — pode_ver_termo_emitido
//   ?versao=<id>  -> o PDF da versao GERAL (equipe, ou o associado quando o
//                    documento esta no portal)
//   ?modelo=<id>  -> o PDF original importado no rascunho (0166) — so a equipe
// `&baixar=1` manda como anexo em vez de abrir no navegador.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const emitidoId = params.get('emitido');
  const versaoId = params.get('versao');
  const modeloId = params.get('modelo');
  const baixar = params.get('baixar') === '1';

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const admin = createAdminClient();

  let path: string | null = null;
  let nome = 'termo.pdf';

  if (emitidoId) {
    const { data: pode } = await supabase.rpc('pode_ver_termo_emitido', { p_id: emitidoId });
    if (!pode) return NextResponse.json({ error: 'Termo não encontrado' }, { status: 404 });
    const { data: e } = await admin.from('termos_emitidos').select('pdf_path, protocolo').eq('id', emitidoId).maybeSingle();
    path = e?.pdf_path ?? null;
    nome = `${e?.protocolo ?? 'termo'}.pdf`;
  } else if (versaoId) {
    // equipe le pela sessao (RLS: is_staff); associado so o documento geral do portal
    const { data: daSessao } = await supabase.from('termos_versoes').select('pdf_path, nome').eq('id', versaoId).maybeSingle();
    if (daSessao) {
      path = daSessao.pdf_path;
      nome = `${daSessao.nome}.pdf`;
    } else {
      const { data: docs } = await supabase.rpc('portal_documentos');
      const doc = (docs ?? []).find((d) => d.origem === 'GERAL' && d.id === versaoId);
      if (!doc) return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 });
      const { data: v } = await admin.from('termos_versoes').select('pdf_path, nome').eq('id', versaoId).maybeSingle();
      path = v?.pdf_path ?? null;
      nome = `${v?.nome ?? 'documento'}.pdf`;
    }
  } else if (modeloId) {
    // RLS de termos_modelos: so staff le
    const { data: m } = await supabase.from('termos_modelos')
      .select('arquivo_pdf_path, arquivo_pdf_nome, nome').eq('id', modeloId).maybeSingle();
    if (!m) return NextResponse.json({ error: 'Termo não encontrado' }, { status: 404 });
    path = m.arquivo_pdf_path;
    nome = m.arquivo_pdf_nome ?? `${m.nome}.pdf`;
  } else {
    return NextResponse.json({ error: 'Informe o termo' }, { status: 400 });
  }

  if (!path) return NextResponse.json({ error: 'O PDF deste termo ainda não foi gerado.' }, { status: 404 });
  const { data: arq, error } = await admin.storage.from('termos').download(path);
  if (error || !arq) return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
  const seguro = nome.replace(/[^\w.\- ]+/g, '_');
  return new NextResponse(new Uint8Array(await arq.arrayBuffer()), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${baixar ? 'attachment' : 'inline'}; filename="${seguro}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
