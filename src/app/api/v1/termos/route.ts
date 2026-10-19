import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logoOficial } from '@/lib/marca-server';
import {
  carregarFontesTermo, gerarPdf, htmlDoPdf, logoComoDataUrl, preencherTermo, sha256,
} from '@/lib/termos-server';
import { MARCA_PROTOCOLO } from '@/lib/termos';
import type { TermoEmitidoRow } from '@/lib/database.types';

// TERMOS (0123) — uma rota, quatro acoes:
//   previa     { modelo_id | versao_id, rascunho_html?, cliente_id?, veiculo_id? } -> HTML preenchido + vazios
//   pdf_previa { mesmo }  -> o PDF sem gravar nada (conferir antes de publicar/emitir)
//   publicar   { modelo_id, observacao? } -> congela a versao (e gera o PDF da versao GERAL)
//   emitir     { versao_id, cliente_id, veiculo_id?, visivel_portal? } -> grava o termo + PDF
// A permissao e a unidade sao conferidas no banco (RPCs da 0123); a leitura
// dos dados e pela sessao, entao a RLS vale aqui tambem.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Corpo = {
  acao?: string;
  modelo_id?: string;
  versao_id?: string;
  rascunho_html?: string;
  cliente_id?: string | null;
  veiculo_id?: string | null;
  visivel_portal?: boolean | null;
  observacao?: string | null;
};

const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

async function textoDoPedido(supabase: ReturnType<typeof createClient>, c: Corpo, podeRascunho: boolean) {
  if (c.versao_id) {
    const { data } = await supabase.from('termos_versoes').select('id, nome, conteudo_html').eq('id', c.versao_id).maybeSingle();
    if (!data) throw new Error('Versão do termo não encontrada.');
    return { titulo: data.nome, html: data.conteudo_html };
  }
  if (!c.modelo_id) throw new Error('Informe o termo.');
  const { data: m } = await supabase.from('termos_modelos')
    .select('nome, rascunho_html, versao_atual_id').eq('id', c.modelo_id).maybeSingle();
  if (!m) throw new Error('Termo não encontrado.');
  if (typeof c.rascunho_html === 'string' || !m.versao_atual_id) {
    if (!podeRascunho) throw new Error('Este termo ainda não foi publicado.');
    return { titulo: m.nome, html: c.rascunho_html ?? m.rascunho_html };
  }
  const { data: v } = await supabase.from('termos_versoes').select('nome, conteudo_html').eq('id', m.versao_atual_id).maybeSingle();
  return { titulo: v?.nome ?? m.nome, html: v?.conteudo_html ?? '' };
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return erro('Não autenticado', 401);
  const { data: perfil } = await supabase.from('usuarios').select('nome, papel, ativo').eq('id', user.id).maybeSingle();
  if (!perfil || perfil.ativo === false) return erro('Só a equipe emite termos.', 403);
  const { data: perms } = await supabase.rpc('minhas_permissoes');
  const pode = (k: string) => (perms ?? []).includes(k);
  const ehAdmin = perfil.papel === 'admin';
  const podeModelos = ehAdmin || pode('termos_modelos.criar') || pode('termos_modelos.editar');

  let c: Corpo;
  try { c = (await request.json()) as Corpo; } catch { return erro('Pedido inválido.'); }

  try {
    if (c.acao === 'previa' || c.acao === 'pdf_previa') {
      if (!podeModelos && !ehAdmin && !pode('termos.criar') && !pode('termos.ver')) {
        return erro('Seu perfil não tem acesso aos termos.', 403);
      }
      const t = await textoDoPedido(supabase, c, podeModelos);
      const fontes = await carregarFontesTermo(supabase, {
        clienteId: c.cliente_id, veiculoId: c.veiculo_id, emitidoPor: perfil.nome,
      });
      const r = preencherTermo(t.html, fontes);
      const corpo = r.html.split(MARCA_PROTOCOLO).join('(gerado na emissão)');
      if (c.acao === 'previa') {
        return NextResponse.json({ titulo: t.titulo, html: corpo, vazios: r.vazios, desconhecidos: r.desconhecidos });
      }
      const logo = await logoComoDataUrl(await logoOficial());
      const pdf = await gerarPdf(htmlDoPdf(corpo, t.titulo, logo, 'PRÉVIA — sem validade, documento não emitido.'));
      return new NextResponse(new Uint8Array(pdf), {
        headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="previa.pdf"' },
      });
    }

    if (c.acao === 'publicar') {
      if (!c.modelo_id) return erro('Informe o termo.');
      const { data: v, error } = await supabase.rpc('publicar_versao_termo', {
        p_modelo_id: c.modelo_id, p_observacao: c.observacao ?? null,
      });
      if (error) return erro(error.message, error.code === '42501' ? 403 : 400);
      const versao = v!;
      // Documento GERAL (Regimento etc.): o PDF da versao sai agora, igual para todos.
      const { data: m } = await supabase.from('termos_modelos').select('escopo').eq('id', c.modelo_id).maybeSingle();
      let avisoPdf: string | null = null;
      if (m?.escopo === 'GERAL') {
        try {
          const fontes = await carregarFontesTermo(supabase, { emitidoPor: perfil.nome });
          const r = preencherTermo(versao.conteudo_html, fontes);
          const logo = await logoComoDataUrl(await logoOficial());
          const pdf = await gerarPdf(htmlDoPdf(r.html, versao.nome, logo,
            `${versao.nome} — versão ${versao.numero} · publicada em ${new Date(versao.publicada_em).toLocaleDateString('pt-BR')}`));
          const path = `versoes/${c.modelo_id}/${versao.id}.pdf`;
          const admin = createAdminClient();
          const up = await admin.storage.from('termos').upload(path, pdf, { contentType: 'application/pdf', upsert: false });
          if (up.error) throw up.error;
          await supabase.rpc('anexar_pdf_versao_termo', { p_versao_id: versao.id, p_path: path, p_sha256: sha256(pdf) });
        } catch (e) {
          avisoPdf = `A versão foi publicada, mas o PDF não foi gerado: ${(e as Error).message}`;
        }
      }
      return NextResponse.json({ versao, aviso: avisoPdf });
    }

    if (c.acao === 'emitir') {
      if (!c.versao_id || !c.cliente_id) return erro('Informe o termo e o associado.');
      const { data: versao } = await supabase.from('termos_versoes')
        .select('id, nome, numero, conteudo_html').eq('id', c.versao_id).maybeSingle();
      if (!versao) return erro('Versão do termo não encontrada.', 404);
      const fontes = await carregarFontesTermo(supabase, {
        clienteId: c.cliente_id, veiculoId: c.veiculo_id ?? null, emitidoPor: perfil.nome,
      });
      const r = preencherTermo(versao.conteudo_html, fontes);
      const { data: emitido, error } = await supabase.rpc('registrar_termo_emitido', {
        p_versao_id: versao.id, p_cliente_id: c.cliente_id, p_veiculo_id: c.veiculo_id ?? null,
        p_html: r.html, p_campos_vazios: r.vazios, p_visivel_portal: c.visivel_portal ?? null,
      });
      if (error) return erro(error.message, error.code === '42501' ? 403 : 400);
      const e = emitido!;

      const avisoPdf = await pdfDoEmitido(supabase, e, `${versao.nome} v${versao.numero}`);
      return NextResponse.json({ emitido: e, vazios: r.vazios, aviso: avisoPdf });
    }

    if (c.acao === 'gerar_pdf') {
      // O PDF que falhou na emissao: gera de novo a partir do HTML congelado.
      const id = (c as { emitido_id?: string }).emitido_id;
      if (!id) return erro('Informe o termo emitido.');
      const { data: e } = await supabase.from('termos_emitidos').select('*').eq('id', id).maybeSingle();
      if (!e) return erro('Termo não encontrado.', 404);
      if (e.pdf_path) return NextResponse.json({ ok: true });
      const { data: v } = await supabase.from('termos_versoes').select('nome, numero').eq('id', e.versao_id).maybeSingle();
      const aviso = await pdfDoEmitido(supabase, e, `${v?.nome ?? e.titulo} v${v?.numero ?? ''}`);
      if (aviso) return erro(aviso);
      return NextResponse.json({ ok: true });
    }

    return erro('Ação desconhecida.');
  } catch (e) {
    return erro((e as Error).message || 'Falha ao processar o termo.');
  }
}

async function pdfDoEmitido(
  supabase: ReturnType<typeof createClient>,
  e: TermoEmitidoRow,
  versao: string,
): Promise<string | null> {
  try {
    const logo = await logoComoDataUrl(await logoOficial());
    const rodape = `Protocolo ${e.protocolo} · ${versao} · `
      + `emitido em ${new Date(e.emitido_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · `
      + `SHA-256 do conteúdo: ${e.html_sha256}`;
    const pdf = await gerarPdf(htmlDoPdf(e.conteudo_html, e.titulo, logo, rodape));
    const path = `emitidos/${e.cliente_id}/${e.id}.pdf`;
    const admin = createAdminClient();
    const up = await admin.storage.from('termos').upload(path, pdf, { contentType: 'application/pdf', upsert: true });
    if (up.error) throw up.error;
    const { error } = await supabase.rpc('anexar_pdf_termo', {
      p_id: e.id, p_path: path, p_sha256: sha256(pdf), p_bytes: pdf.length,
    });
    if (error) throw error;
    return null;
  } catch (err) {
    return `O termo foi emitido (protocolo ${e.protocolo}), mas o PDF não foi gerado: ${(err as Error).message}`;
  }
}
