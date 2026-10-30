import 'server-only';
import { readFile } from 'fs/promises';
import path from 'path';
import QRCode from 'qrcode';
import { createAdminClient } from '@/lib/supabase/admin';
import { montarProposta, type FontesProposta, type PropostaDados } from '@/lib/proposta';

/**
 * Le a proposta pelo TOKEN (capacidade publica, como a pagina sempre fez) e
 * devolve so o que a tela/PDF mostram. service_role restrito ao token: nada de
 * select * repassado ao navegador.
 */
export async function carregarProposta(token: string, origem: string): Promise<{
  dados: PropostaDados; logoUrl: string | null; cotacaoId: string; leadId: string;
} | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const admin = createAdminClient();
  const { data: cot } = await admin.from('cotacoes')
    .select('id, lead_id, token, created_at, enviada_em, modo_envio, fipe, itens, total_mensalidade, total_com_desconto, '
      + 'valor_assistencia_profissional, taxa_adesao, adesao_com_desconto, participacao, plano_id, cota_participacao_id, tipo_veiculo_id')
    .eq('token', token).maybeSingle();
  if (!cot) return null;
  const c = cot as unknown as FontesProposta['cotacao'] & {
    id: string; lead_id: string; plano_id: string | null; cota_participacao_id: string | null; tipo_veiculo_id: string | null;
  };

  // Duas consultas em vez de embed: ha duas FKs entre cotacoes e leads (0042).
  const [{ data: lead }, { data: ultima }, { data: empresa }, plano, cota, tipo] = await Promise.all([
    admin.from('leads')
      .select('placa, marca, modelo, ano_modelo, aceite_em, aceite_cotacao_id, vendedor_id, consultor_id, tipo_veiculo_id')
      .eq('id', c.lead_id).maybeSingle(),
    admin.from('cotacoes').select('id').eq('lead_id', c.lead_id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('empresa')
      .select('razao_social, nome_fantasia, cnpj, site, telefone_fixo, regulamento_url, validade_proposta_dias, logo_url')
      .limit(1).maybeSingle(),
    c.plano_id ? admin.from('planos_protecao').select('nome').eq('id', c.plano_id).maybeSingle() : null,
    c.cota_participacao_id ? admin.from('cotas_participacao').select('percentual').eq('id', c.cota_participacao_id).maybeSingle() : null,
    c.tipo_veiculo_id
      ? admin.from('tipos_veiculo').select('nome, exige_rastreador, valor_limite_isencao, km_reboque_ida, km_reboque_volta')
        .eq('id', c.tipo_veiculo_id).maybeSingle()
      : null,
  ]);

  const ids = (c.itens ?? []).map((i) => i.produto_id).filter((x): x is string => !!x);
  const { data: produtos } = ids.length
    ? await admin.from('produtos').select('id, categoria, descricao_cobertura').in('id', ids)
    : { data: [] };

  // O consultor: o vendedor do lead e, sem ele, o usuario que atende.
  let consultor: FontesProposta['consultor'] = null;
  if (lead?.vendedor_id) {
    const { data: v } = await admin.from('vendedores').select('nome, telefone, email').eq('id', lead.vendedor_id).maybeSingle();
    if (v?.nome) consultor = { nome: v.nome, telefone: v.telefone ?? null, email: v.email ?? null };
  }
  if (!consultor && lead?.consultor_id) {
    const { data: u } = await admin.from('usuarios').select('nome, telefone, email').eq('id', lead.consultor_id).maybeSingle();
    if (u?.nome) consultor = { nome: u.nome, telefone: u.telefone ?? null, email: u.email ?? null };
  }

  const dados = montarProposta({
    cotacao: c,
    lead: lead ?? null,
    cotacaoId: c.id,
    ultimaCotacaoId: ultima?.id ?? null,
    plano: plano?.data ?? null,
    cotaPercentual: cota?.data?.percentual != null ? Number(cota.data.percentual) : null,
    tipo: tipo?.data ? { ...tipo.data, valor_limite_isencao: Number(tipo.data.valor_limite_isencao) } : null,
    produtos: produtos ?? [],
    consultor,
    empresa: empresa ?? null,
    origem,
  });
  return { dados, logoUrl: empresa?.logo_url ?? null, cotacaoId: c.id, leadId: c.lead_id };
}

/** QR code do link da proposta (data URL, sem rede). */
export function qrDaProposta(link: string): Promise<string> {
  return QRCode.toDataURL(link, { margin: 1, width: 240, color: { dark: '#142445', light: '#FFFFFF' } });
}

const PUBLICO = path.join(process.cwd(), 'public');

async function dataUrl(arquivo: string, tipo: string) {
  const b = await readFile(path.join(PUBLICO, arquivo));
  return `data:${tipo};base64,${b.toString('base64')}`;
}

/** O logo do fallback (SVG do app), embutido. */
export function logoReserva(): Promise<string> {
  return dataUrl('logo-smartcar.svg', 'image/svg+xml');
}

/** As fontes da marca como @font-face em data URL: o Chromium do PDF roda sem rede. */
export async function fontesEmbutidas(): Promise<string> {
  const f = (a: string) => dataUrl(`fontes-proposta/${a}`, 'font/woff2');
  const [mont, b4, b5, b6, b7, m5, m6] = await Promise.all([
    f('montserrat-latin-wght-normal.woff2'), f('barlow-latin-400-normal.woff2'), f('barlow-latin-500-normal.woff2'),
    f('barlow-latin-600-normal.woff2'), f('barlow-latin-700-normal.woff2'),
    f('ibm-plex-mono-latin-500-normal.woff2'), f('ibm-plex-mono-latin-600-normal.woff2'),
  ]);
  const face = (familia: string, src: string, peso: string) =>
    `@font-face{font-family:'${familia}';src:url(${src}) format('woff2');font-weight:${peso};font-style:normal;}`;
  return [
    face('Montserrat Variable', mont, '100 900'),
    face('Barlow', b4, '400'), face('Barlow', b5, '500'), face('Barlow', b6, '600'), face('Barlow', b7, '700'),
    face('IBM Plex Mono', m5, '500'), face('IBM Plex Mono', m6, '600'),
  ].join('\n');
}

/** O documento HTML completo do PDF (3 folhas A4, margem zero). */
export function htmlDaProposta(corpo: string, fontes: string, titulo: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${titulo.replace(/</g, '')}</title>
<style>${fontes}
@page{size:794px 1123px;margin:0}
html,body{margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
section{page-break-after:always;break-after:page}
section:last-child{page-break-after:auto;break-after:auto}
</style></head><body>${corpo}</body></html>`;
}
