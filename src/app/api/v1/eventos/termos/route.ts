import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logoOficial } from '@/lib/marca-server';
import {
  carregarFontesEntrega, gerarPdf, htmlDoPdf, logoComoDataUrl, preencherTermo, sha256, trocarLogoDoModelo,
  type DadosEntrega,
} from '@/lib/termos-server';
import { MARCA_PROTOCOLO } from '@/lib/termos';
import { problemasDaEntrega } from '@/lib/termo-entrega';
import type { Json, TermoEntregaRow } from '@/lib/database.types';

// TERMO DE ENTREGA DE VEICULO (0182) — aba Termos do evento:
//   previa    { dados }      -> HTML preenchido + vazios (nada grava)
//   emitir    { dados }      -> emitir_termo_entrega + PDF (bucket termos) + anexo do evento
//   gerar_pdf { termo_id }   -> o PDF que falhou na emissao
// A via ASSINADA sobe pela tela (bucket do evento) e e registrada por
// registrar_termo_entrega_assinado. Permissao e unidade: no banco.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });
type Corpo = { acao?: string; dados?: DadosEntrega; termo_id?: string };
type Sb = ReturnType<typeof createClient>;

async function versaoDoModelo(supabase: Sb) {
  const { data } = await supabase.from('termos_modelos')
    .select('id, nome, versao_atual_id, updated_at')
    .eq('tipo', 'ENTREGA_VEICULO').eq('ativo', true).not('versao_atual_id', 'is', null)
    .order('updated_at', { ascending: false }).limit(1);
  const m = (data ?? [])[0];
  if (!m?.versao_atual_id) {
    throw new Error('Não há modelo de Termo de Entrega publicado. Em Configurações → Termos, crie um termo do tipo "Termo de entrega de veículo (evento)", importe o Word e publique.');
  }
  const { data: v } = await supabase.from('termos_versoes')
    .select('id, nome, numero, conteudo_html').eq('id', m.versao_atual_id).maybeSingle();
  if (!v) throw new Error('Versão do modelo de Termo de Entrega não encontrada.');
  return v;
}

async function pdfDoTermo(supabase: Sb, t: TermoEntregaRow): Promise<string | null> {
  try {
    const { data: e } = await supabase.from('termos_emitidos')
      .select('id, cliente_id, protocolo, titulo, conteudo_html, html_sha256, emitido_em, pdf_path')
      .eq('id', t.termo_emitido_id).maybeSingle();
    if (!e) throw new Error('termo não encontrado');
    if (e.pdf_path) return null;
    const logo = await logoComoDataUrl(await logoOficial());
    const l = trocarLogoDoModelo(e.conteudo_html, logo);
    const rodape = `Termo de entrega ${e.protocolo} · emitido em `
      + `${new Date(e.emitido_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · `
      + `SHA-256 do conteúdo: ${e.html_sha256}`;
    const pdf = await gerarPdf(htmlDoPdf(l.html, e.titulo, l.logoNoCabecalho, rodape));
    const path = `emitidos/${e.cliente_id}/${e.id}.pdf`;
    const admin = createAdminClient();
    const up = await admin.storage.from('termos').upload(path, pdf, { contentType: 'application/pdf', upsert: true });
    if (up.error) throw up.error;
    const { error } = await supabase.rpc('anexar_pdf_termo_entrega', {
      p_id: t.id, p_path: path, p_sha256: sha256(pdf), p_bytes: pdf.length,
    });
    if (error) throw error;
    return null;
  } catch (err) {
    return `O termo foi emitido, mas o PDF não foi gerado: ${(err as Error).message}. Use "Gerar PDF".`;
  }
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return erro('Não autenticado', 401);
  const { data: perfil } = await supabase.from('usuarios').select('nome, ativo').eq('id', user.id).maybeSingle();
  if (!perfil || perfil.ativo === false) return erro('Só a equipe emite termo de entrega.', 403);

  let c: Corpo;
  try { c = (await request.json()) as Corpo; } catch { return erro('Pedido inválido.'); }

  try {
    if (c.acao === 'previa' || c.acao === 'emitir') {
      const d = c.dados;
      if (!d?.evento_id) return erro('Informe o evento.');
      const dados: DadosEntrega = {
        evento_id: d.evento_id,
        recebedor_tipo: d.recebedor_tipo === 'TERCEIRO' ? 'TERCEIRO' : 'ASSOCIADO',
        evento_terceiro_id: d.recebedor_tipo === 'TERCEIRO' ? d.evento_terceiro_id ?? null : null,
        ordem_servico_id: d.ordem_servico_id || null,
        abrangencia: d.abrangencia === 'PARCIAL' ? 'PARCIAL' : 'TOTAL',
        descricao: d.descricao?.trim() ? d.descricao.trim().toUpperCase() : null,
        data_entrega: d.data_entrega,
      };
      const problemas = problemasDaEntrega(dados);
      if (c.acao === 'emitir' && problemas.length) return erro(problemas.join(' '));
      const versao = await versaoDoModelo(supabase);
      const fontes = await carregarFontesEntrega(supabase, dados, perfil.nome);
      const r = preencherTermo(versao.conteudo_html, fontes);

      if (c.acao === 'previa') {
        const html = r.html.split(MARCA_PROTOCOLO).join('(gerado na emissão)');
        return NextResponse.json({ html, vazios: r.vazios, modelo: `${versao.nome} v${versao.numero}` });
      }
      const { data: t, error } = await supabase.rpc('emitir_termo_entrega', {
        p_versao_id: versao.id, p_dados: dados as unknown as Json, p_html: r.html, p_campos_vazios: r.vazios,
      });
      if (error) return erro(error.message, error.code === '42501' ? 403 : 400);
      const aviso = await pdfDoTermo(supabase, t!);
      return NextResponse.json({ termo: t, vazios: r.vazios, aviso });
    }

    if (c.acao === 'gerar_pdf') {
      if (!c.termo_id) return erro('Informe o termo.');
      const { data: t } = await supabase.from('termos_entrega').select('*').eq('id', c.termo_id).maybeSingle();
      if (!t) return erro('Termo não encontrado.', 404);
      const aviso = await pdfDoTermo(supabase, t);
      if (aviso) return erro(aviso);
      return NextResponse.json({ ok: true });
    }

    return erro('Ação desconhecida.');
  } catch (e) {
    return erro((e as Error).message || 'Falha ao processar o termo de entrega.');
  }
}
