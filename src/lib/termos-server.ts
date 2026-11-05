import 'server-only';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { ItemCobertura } from '@/lib/coberturas';
import type { ItemOS } from '@/lib/ordem-servico';
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
    .select('razao_social, nome_fantasia, cnpj, endereco, telefone_fixo, whatsapp_principal, email_principal, site, regulamento_url, email_departamento_eventos')
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

/** O que a tela manda para a OS (0181). Os totais sao recalculados aqui e no banco. */
export type DadosOS = {
  evento_id: string;
  cotacao_id?: string | null;
  evento_terceiro_id?: string | null;
  fornecedor_id: string;
  documento?: 'AUTORIZACAO' | 'RETIFICACAO';
  os_anterior_id?: string | null;
  itens: ItemOS[];
  participacao_associado?: number | null;
  pecas_smartcar?: number | null;
  data_inicio_prevista?: string | null;
  prazo_dias_uteis?: number | null;
  data_limite_entrega?: string | null;
  local_entrega?: string | null;
  garantia_dias?: number | null;
  pagamento_previsto?: string | null;
  observacoes?: string | null;
};

/**
 * As fontes da ORDEM DE SERVICO (0181), lidas pela sessao: o associado e o
 * veiculo do evento (carregarFontesTermo) + prestador, evento, condutor e os
 * dados digitados. Reparo de TERCEIRO: o bloco do veiculo mostra o carro dele.
 */
export async function carregarFontesOS(supabase: Db, d: DadosOS, emitidoPor: string | null): Promise<FontesTermo> {
  const { data: ev, error } = await supabase.from('eventos_sinistro')
    .select('id, numero_protocolo, data_ocorrencia, tipo_evento, valor_participacao, cliente_id, veiculo_id, tipos_evento(nome)')
    .eq('id', d.evento_id).maybeSingle();
  if (error) throw error;
  if (!ev) throw new Error('Evento não encontrado (ou fora do seu acesso).');
  const base = await carregarFontesTermo(supabase, { clienteId: ev.cliente_id, veiculoId: ev.veiculo_id, emitidoPor });
  // A OS cita "Telefone" do associado: quem nao tem fixo, sai o celular.
  if (!base.cliente.telefone && base.cliente.celular) base.cliente = { ...base.cliente, telefone: base.cliente.celular };

  const [forn, ant, terc, decl] = await Promise.all([
    supabase.from('fornecedores')
      .select('razao_social, nome_fantasia, documento, tipo_pessoa, inscricao_estadual, inscricao_municipal, endereco, contato, whatsapp, telefone, email')
      .eq('id', d.fornecedor_id).maybeSingle(),
    d.os_anterior_id ? supabase.from('ordens_servico').select('numero').eq('id', d.os_anterior_id).maybeSingle() : null,
    d.evento_terceiro_id ? supabase.from('evento_terceiros')
      .select('nome, veiculo_placa, veiculo_marca, veiculo_modelo, veiculo_ano, veiculo_cor')
      .eq('id', d.evento_terceiro_id).maybeSingle() : null,
    // o condutor: a declaracao mais recente do associado (ou do condutor dele) na Comunicacao de Evento (0129)
    supabase.from('evento_declaracoes')
      .select('dados, created_at, evento_comunicacoes!inner(papel)')
      .eq('evento_id', ev.id).in('evento_comunicacoes.papel', ['associado', 'condutor_associado'])
      .order('created_at', { ascending: false }).limit(1),
  ]);
  if (!forn.data) throw new Error('Prestador não encontrado.');
  base.prestador = forn.data as FontesTermo['prestador'];

  type Decl = { condutor?: { nome?: string; cpf?: string; e_titular?: boolean }; identificacao?: { telefone?: string } };
  const dd = ((decl.data ?? [])[0]?.dados ?? null) as Decl | null;
  let condutor: { nome?: string | null; cpf?: string | null; telefone?: string | null } | null = null;
  if (dd?.condutor) {
    condutor = dd.condutor.e_titular
      ? { nome: base.cliente.nome_razao_social, cpf: base.cliente.cpf_cnpj, telefone: base.cliente.celular ?? base.cliente.telefone ?? null }
      : { nome: dd.condutor.nome ?? null, cpf: dd.condutor.cpf ?? null, telefone: dd.identificacao?.telefone ?? null };
  }
  const tipoNome = (ev as unknown as { tipos_evento: { nome: string } | null }).tipos_evento?.nome ?? ev.tipo_evento ?? null;
  base.evento = {
    numero_protocolo: ev.numero_protocolo, data_ocorrencia: ev.data_ocorrencia, tipo: tipoNome,
    valor_participacao: ev.valor_participacao != null ? Number(ev.valor_participacao) : null, condutor,
  };

  let reparoDe: string | null = 'Associado';
  const t = terc?.data ?? null;
  if (t) {
    reparoDe = `Terceiro: ${t.nome}`;
    // o carro que vai para a oficina e o do terceiro
    base.veiculo = {
      placa: t.veiculo_placa ?? '', marca: t.veiculo_marca, modelo: t.veiculo_modelo,
      ano_fabricacao: t.veiculo_ano, ano_modelo: null, cor: t.veiculo_cor, chassi: null, renavam: null,
      data_ativacao: base.veiculo?.data_ativacao ?? null,
    };
  }
  base.os = {
    documento: d.documento ?? 'AUTORIZACAO',
    os_anterior: (ant?.data as { numero?: string } | null)?.numero ?? null,
    reparo_de: reparoDe,
    itens: d.itens,
    participacao: d.participacao_associado ?? base.evento.valor_participacao ?? 0,
    pecas_smartcar: d.pecas_smartcar ?? 0,
    inicio: d.data_inicio_prevista ?? null,
    prazo_dias: d.prazo_dias_uteis ?? null,
    limite: d.data_limite_entrega ?? null,
    local: d.local_entrega ?? null,
    garantia: d.garantia_dias ?? null,
    pagamento: d.pagamento_previsto ?? null,
    observacoes: d.observacoes ?? null,
  };
  return base;
}

/** Exemplo para a previa do MODELO em Configuracoes -> Termos (nada real). */
export function exemploDaOS(base: FontesTermo): FontesTermo {
  return {
    ...base,
    prestador: {
      razao_social: 'PRESTADOR DE EXEMPLO LTDA', documento: '11222333000181', inscricao_estadual: '000000000',
      endereco: { logradouro: 'RUA EXEMPLO', numero: '100', bairro: 'CENTRO', cidade: 'CUIABA', uf: 'MT', cep: '78000000' },
      contato: 'RESPONSAVEL', whatsapp: '65999990000', email: 'prestador@exemplo.com',
    },
    evento: { numero_protocolo: 'EVT-AAAAMMDD-0000', data_ocorrencia: new Date().toISOString().slice(0, 10),
      valor_participacao: 1500, condutor: { nome: base.cliente.nome_razao_social || 'CONDUTOR', cpf: base.cliente.cpf_cnpj, telefone: base.cliente.celular ?? null } },
    os: {
      documento: 'AUTORIZACAO', reparo_de: 'Associado', pecas_smartcar: 0, prazo_dias: 10,
      inicio: new Date().toISOString().slice(0, 10), limite: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      local: 'NA OFICINA DO PRESTADOR', garantia: 90, observacoes: 'Exemplo de observação.',
      itens: [
        { tipo: 'MAO_DE_OBRA', descricao: 'FUNILARIA E PINTURA', quantidade: 1, valor_unitario: 1200 },
        { tipo: 'PECA', descricao: 'PARACHOQUE DIANTEIRO', quantidade: 1, valor_unitario: 890.5 },
      ],
    },
  };
}

/**
 * O Word do modelo traz a logo antiga (baixa resolucao) na primeira tabela:
 * no PDF ela vira a logo OFICIAL da empresa, e o cabecalho nao repete a logo.
 */
export function trocarLogoDoModelo(html: string, logo: string | null): { html: string; logoNoCabecalho: string | null } {
  // A imagem do Word vem como data URL (dezenas de KB): procura-se so o INICIO
  // da tag no topo do documento e a tag inteira no texto todo.
  const ini = html.slice(0, 4000).search(/<img\b/i);
  const m = ini < 0 ? null : /^<img\b[^>]*>/i.exec(html.slice(ini));
  if (!m) return { html, logoNoCabecalho: logo };
  m.index = ini;
  if (!logo) return { html, logoNoCabecalho: null };
  const nova = `<img src="${logo}" alt="" style="max-height:70px;max-width:100%">`;
  return { html: html.slice(0, m.index) + nova + html.slice(m.index + m[0].length), logoNoCabecalho: null };
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
export async function gerarPdf(html: string, opcoes: { rodape?: boolean } = {}): Promise<Buffer> {
  // Proposta comercial (30/10/2026): folhas sem o rodape "Pagina x de y" dos termos.
  const rodape = opcoes.rodape !== false;
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
      displayHeaderFooter: rodape,
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
