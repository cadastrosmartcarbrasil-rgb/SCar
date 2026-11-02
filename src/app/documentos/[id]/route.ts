import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /documentos/<modelo_id> — link PUBLICO e fixo de um documento GERAL da associacao
// (manual da 24h, regimento, termo de rastreadores) para e-mails e mensagens.
// Entrega o PDF da VERSAO PUBLICADA ATUAL, entao publicar uma versao nova ja troca o
// arquivo sem mudar o link. So vale para documento GERAL, ativo e visivel no portal:
// e o mesmo conteudo que todo associado ve, sem dado pessoal (termo por associado
// segue em /api/v1/termos/pdf, com sessao).
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const naoAchou = NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 });
  if (!UUID.test(params.id)) return naoAchou;

  const admin = createAdminClient();
  const { data: m } = await admin.from('termos_modelos')
    .select('nome, escopo, ativo, visivel_portal, versao_atual_id').eq('id', params.id).maybeSingle();
  if (!m || m.escopo !== 'GERAL' || !m.ativo || !m.visivel_portal || !m.versao_atual_id) return naoAchou;

  const { data: v } = await admin.from('termos_versoes').select('pdf_path').eq('id', m.versao_atual_id).maybeSingle();
  if (!v?.pdf_path) return naoAchou;
  const { data: arq, error } = await admin.storage.from('termos').download(v.pdf_path);
  if (error || !arq) return naoAchou;

  const nome = `${m.nome}.pdf`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\- ]+/g, '_');
  return new NextResponse(new Uint8Array(await arq.arrayBuffer()), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${nome}"`,
      'Cache-Control': 'public, max-age=300',
    },
  });
}
