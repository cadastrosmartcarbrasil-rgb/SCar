import 'server-only';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { ItemCobertura } from '@/lib/coberturas';
import {
  blocosDoTermo, documentoDoTermo, renderizarTermo, valoresDoTermo, type FontesTermo,
} from '@/lib/termos';

type Db = SupabaseClient<Database>;

/**
 * Os dados do termo, lidos PELA SESSAO de quem emite (a RLS decide o que ele
 * ve). Sem associado (documento geral) so empresa e emissao entram.
 */
export async function carregarFontesTermo(
  supabase: Db,
  args: { clienteId?: string | null; veiculoId?: string | null; emitidoPor?: string | null },
): Promise<FontesTermo> {
  const { data: empresa } = await supabase.from('empresa')
    .select('razao_social, nome_fantasia, cnpj, endereco, telefone_fixo, whatsapp_principal, email_principal, site, regulamento_url')
    .limit(1).maybeSingle();
  const base: FontesTermo = {
    cliente: { nome_razao_social: '', cpf_cnpj: '', tipo_pessoa: 'PF' },
    empresa: (empresa as FontesTermo['empresa']) ?? null,
    emissao: { em: new Date(), por: args.emitidoPor ?? null },
  };
  if (!args.clienteId) return base;

  const { data: cliente, error: eCli } = await supabase.from('clientes')
    .select('nome_razao_social, cpf_cnpj, tipo_pessoa, rg_ie, data_nascimento, sexo, nome_mae, email, celular, telefone, matricula, endereco, regional_id')
    .eq('id', args.clienteId).maybeSingle();
  if (eCli) throw eCli;
  if (!cliente) throw new Error('Associado não encontrado (ou fora do seu acesso).');
  base.cliente = cliente as FontesTermo['cliente'];

  let regionalId = cliente.regional_id as string | null;
  if (args.veiculoId) {
    const { data: v, error: eVei } = await supabase.from('veiculos')
      .select('*').eq('id', args.veiculoId).eq('cliente_id', args.clienteId).maybeSingle();
    if (eVei) throw eVei;
    if (!v) throw new Error('Veículo não encontrado para este associado.');
    base.veiculo = v as unknown as FontesTermo['veiculo'];
    regionalId = v.regional_id ?? regionalId;

    const [tipo, plano, cota, vend, opc, prods, part, adesao, mens, rast] = await Promise.all([
      v.tipo_veiculo_id ? supabase.from('tipos_veiculo').select('nome').eq('id', v.tipo_veiculo_id).maybeSingle() : null,
      v.plano_protecao_id ? supabase.from('planos_protecao').select('nome, descricao_comercial').eq('id', v.plano_protecao_id).maybeSingle() : null,
      v.cota_participacao_id ? supabase.from('cotas_participacao').select('codigo, percentual').eq('id', v.cota_participacao_id).maybeSingle() : null,
      v.vendedor_id ? supabase.from('vendedores').select('nome').eq('id', v.vendedor_id).maybeSingle() : null,
      supabase.rpc('opcionais_veiculo', { p_veiculo_id: v.id }),
      supabase.from('produtos').select('id, categoria, descricao_cobertura'),
      v.valor_fipe ? supabase.rpc('calcular_participacao_veiculo', { p_veiculo_id: v.id, p_fipe: v.valor_fipe }) : null,
      v.valor_fipe && v.tipo_veiculo_id
        ? supabase.rpc('calcular_adesao', { p_fipe: v.valor_fipe, p_tipo_veiculo_id: v.tipo_veiculo_id }) : null,
      v.valor_mensalidade ? null : supabase.rpc('valor_mensalidade_veiculo', { p_veiculo_id: v.id }),
      // O equipamento do veiculo: o ativo vence; sem ativo, o mais recente.
      supabase.from('rastreadores').select('imei, status, updated_at, regionais(nome)')
        .eq('veiculo_id', v.id).order('updated_at', { ascending: false }).limit(10),
    ]);
    const lista = (rast.data ?? []) as { imei: string; status: string; regionais: { nome: string } | null }[];
    const eq = lista.find((r) => r.status === 'ATIVO') ?? lista[0];
    base.rastreador = eq ? { imei: eq.imei, status: eq.status, unidade: eq.regionais?.nome ?? null } : null;
    base.tipoVeiculo = tipo?.data?.nome ?? null;
    base.plano = plano?.data ?? null;
    base.cota = cota?.data ? { codigo: cota.data.codigo, percentual: cota.data.percentual } : null;
    base.vendedor = (vend?.data as { nome?: string | null } | null)?.nome ?? null;
    base.participacao = part?.data != null ? Number(part.data) : null;
    base.adesao = adesao?.data != null ? Number(adesao.data) : null;
    base.mensalidade = v.valor_mensalidade != null ? Number(v.valor_mensalidade)
      : mens?.data != null ? Number(mens.data) : null;
    const porId = new Map((prods.data ?? []).map((p) => [p.id, p]));
    base.coberturas = ((opc.data ?? []) as ItemCobertura[]).map((o) => ({
      ...o,
      categoria: porId.get(o.produto_id)?.categoria ?? null,
      descricao: porId.get(o.produto_id)?.descricao_cobertura ?? null,
    }));
  }
  if (regionalId) {
    const { data: reg } = await supabase.from('regionais').select('nome, endereco').eq('id', regionalId).maybeSingle();
    base.unidade = reg?.nome ?? null;
    const cidade = (reg?.endereco as { cidade?: string } | null)?.cidade;
    if (cidade) base.emissao.cidade = cidade;
  }
  return base;
}

/** Preenche o texto do modelo com as fontes. */
export function preencherTermo(html: string, fontes: FontesTermo) {
  return renderizarTermo(html, valoresDoTermo(fontes), blocosDoTermo(fontes));
}

export const sha256 = (buf: Buffer | string) => createHash('sha256').update(buf).digest('hex');

/** A logo oficial embutida (data URL): o PDF nao depende de rede na hora de abrir. */
export async function logoComoDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const tipo = r.headers.get('content-type') || 'image/png';
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length > 1_500_000) return null;
    return `data:${tipo};base64,${b.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Caminho do Chromium: env, o da imagem (alpine) ou o do ambiente de teste. */
function caminhoChromium(): string {
  const candidatos = [process.env.CHROMIUM_PATH, '/usr/bin/chromium-browser', '/usr/bin/chromium',
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter((c): c is string => !!c);
  return candidatos.find((c) => existsSync(c)) ?? candidatos[0];
}

/**
 * HTML -> PDF no servidor (decisao do usuario, 19/10/2026: o arquivo e o hash
 * saem sempre iguais). Uma instancia por chamada: emissao e rara, e o
 * navegador nao fica ocupando memoria no conteiner entre uma e outra.
 */
export async function gerarPdf(html: string): Promise<Buffer> {
  const puppeteer = await import('puppeteer-core');
  const browser = await puppeteer.launch({
    executablePath: caminhoChromium(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none'],
  });
  try {
    const page = await browser.newPage();
    // Sem rede: tudo o que o termo usa ja vem embutido (logo em data URL).
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.url().startsWith('data:') || req.url() === 'about:blank') req.continue();
      else req.abort();
    });
    await page.setContent(html, { waitUntil: 'load', timeout: 20000 });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="font-size:7pt;color:#4b5873;width:100%;text-align:center;">'
        + 'Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>',
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/** Documento completo pronto para o PDF. */
export function htmlDoPdf(corpo: string, titulo: string, logo: string | null, rodape?: string) {
  return documentoDoTermo({ corpo, titulo, logoDataUrl: logo, rodape });
}
