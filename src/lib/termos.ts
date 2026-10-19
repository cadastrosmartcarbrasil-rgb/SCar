/**
 * TERMOS (0123) — os campos que o modelo pode citar e o preenchimento do texto.
 *
 * O modelo e HTML (editor da tela) com cada campo marcado como
 * `<span data-campo="associado.nome">«...»</span>` (ou `<div data-campo>` para
 * os blocos, como a tabela de coberturas). Emitir = trocar cada marca pelo
 * valor do cadastro. Campo sem dado sai como linha em branco e entra na lista
 * de `vazios`, que a tela mostra ANTES de emitir.
 *
 * O protocolo nao existe antes da emissao: o campo `emissao.protocolo` vira a
 * marca {{PROTOCOLO_DO_TERMO}}, que o banco troca (registrar_termo_emitido)
 * antes de calcular o hash.
 */

import { agruparCoberturas, grupoDaCobertura, textoDoLimite, type GrupoCobertura, type ItemCobertura } from './coberturas';
import { formatarCEP, formatarDocumento, formatarTelefone } from './documento';

export const MARCA_PROTOCOLO = '{{PROTOCOLO_DO_TERMO}}';

export const TIPOS_TERMO = [
  { valor: 'CONTRATO', rotulo: 'Contrato / Termo de adesão' },
  { valor: 'REGULAMENTO', rotulo: 'Regimento / Regulamento' },
  { valor: 'RASTREADOR', rotulo: 'Termo do rastreador' },
  { valor: 'ADITIVO', rotulo: 'Aditivo' },
  { valor: 'CANCELAMENTO', rotulo: 'Cancelamento' },
  { valor: 'DECLARACAO', rotulo: 'Declaração' },
  { valor: 'OUTRO', rotulo: 'Outro' },
] as const;
export type TipoTermo = (typeof TIPOS_TERMO)[number]['valor'];

export const rotuloTipoTermo = (t: string) => TIPOS_TERMO.find((x) => x.valor === t)?.rotulo ?? t;

export const USOS_VEICULO = [
  { valor: 'passeio', rotulo: 'Particular (passeio)' },
  { valor: 'app', rotulo: 'Aplicativo' },
  { valor: 'comercial', rotulo: 'Comercial / trabalho' },
] as const;

export type GrupoCampo = 'Associado' | 'Veículo' | 'Plano e contrato' | 'Coberturas' | 'Empresa' | 'Emissão';

export interface CampoTermo {
  chave: string;
  grupo: GrupoCampo;
  rotulo: string;
  /** texto (padrao) · marca (☒/☐) · bloco (vira um bloco inteiro, ex.: tabela) */
  tipo?: 'texto' | 'marca' | 'bloco';
  /** Nao entra na lista de "vazios" (ex.: complemento, que muita gente nao tem). */
  opcional?: boolean;
}

const C = (grupo: GrupoCampo, chave: string, rotulo: string, extra: Partial<CampoTermo> = {}): CampoTermo =>
  ({ chave, grupo, rotulo, ...extra });

export const CAMPOS_TERMO: CampoTermo[] = [
  C('Associado', 'associado.nome', 'Nome / Razão social'),
  C('Associado', 'associado.cpf_cnpj', 'CPF/CNPJ'),
  C('Associado', 'associado.tipo_pessoa', 'Tipo de pessoa'),
  C('Associado', 'associado.rg', 'RG / IE'),
  C('Associado', 'associado.data_nascimento', 'Data de nascimento / constituição'),
  C('Associado', 'associado.sexo', 'Sexo', { opcional: true }),
  C('Associado', 'associado.nome_mae', 'Nome da mãe', { opcional: true }),
  C('Associado', 'associado.email', 'E-mail'),
  C('Associado', 'associado.celular', 'Celular'),
  C('Associado', 'associado.telefone', 'Telefone', { opcional: true }),
  C('Associado', 'associado.matricula', 'Matrícula', { opcional: true }),
  C('Associado', 'associado.endereco', 'Endereço completo'),
  C('Associado', 'associado.logradouro', 'Logradouro e número'),
  C('Associado', 'associado.complemento', 'Complemento', { opcional: true }),
  C('Associado', 'associado.bairro', 'Bairro'),
  C('Associado', 'associado.cidade', 'Cidade'),
  C('Associado', 'associado.uf', 'UF'),
  C('Associado', 'associado.cep', 'CEP'),
  C('Associado', 'associado.pj_razao', 'Razão social (se PJ)', { opcional: true }),
  C('Associado', 'associado.pj_cnpj', 'CNPJ (se PJ)', { opcional: true }),

  C('Veículo', 'veiculo.placa', 'Placa'),
  C('Veículo', 'veiculo.marca', 'Marca / montadora'),
  C('Veículo', 'veiculo.modelo', 'Modelo'),
  C('Veículo', 'veiculo.marca_modelo', 'Marca e modelo'),
  C('Veículo', 'veiculo.ano_fabricacao', 'Ano de fabricação'),
  C('Veículo', 'veiculo.ano_modelo', 'Ano modelo'),
  C('Veículo', 'veiculo.ano_fab_modelo', 'Ano fabricação/modelo'),
  C('Veículo', 'veiculo.cor', 'Cor'),
  C('Veículo', 'veiculo.chassi', 'Chassi'),
  C('Veículo', 'veiculo.renavam', 'Renavam'),
  C('Veículo', 'veiculo.numero_motor', 'Nº do motor', { opcional: true }),
  C('Veículo', 'veiculo.codigo_fipe', 'Código FIPE'),
  C('Veículo', 'veiculo.valor_fipe', 'Valor da FIPE'),
  C('Veículo', 'veiculo.combustivel', 'Combustível', { opcional: true }),
  C('Veículo', 'veiculo.tipo', 'Tipo de veículo'),
  C('Veículo', 'veiculo.uso', 'Uso do veículo'),
  C('Veículo', 'veiculo.alienado', 'Alienado (Sim/Não)'),
  C('Veículo', 'veiculo.financeira', 'Instituição financeira', { opcional: true }),
  C('Veículo', 'veiculo.rastreador_imei', 'IMEI do rastreador', { opcional: true }),
  C('Veículo', 'veiculo.marca_uso_particular', '☒ se uso particular', { tipo: 'marca' }),
  C('Veículo', 'veiculo.marca_uso_trabalho', '☒ se uso de trabalho/aplicativo', { tipo: 'marca' }),
  C('Veículo', 'veiculo.marca_moto', '☒ se for moto', { tipo: 'marca' }),
  C('Veículo', 'veiculo.marca_alienado', '☒ se alienado', { tipo: 'marca' }),

  C('Plano e contrato', 'plano.nome', 'Plano'),
  C('Plano e contrato', 'plano.descricao', 'Descrição do plano', { opcional: true }),
  C('Plano e contrato', 'plano.mensalidade', 'Valor mensal'),
  C('Plano e contrato', 'plano.adesao', 'Taxa de adesão / inspeção'),
  C('Plano e contrato', 'plano.participacao', 'Participação em caso de evento'),
  C('Plano e contrato', 'plano.cota', 'Cota de participação (V5..V15)', { opcional: true }),
  C('Plano e contrato', 'plano.dia_vencimento', 'Dia de vencimento'),
  C('Plano e contrato', 'plano.data_ativacao', 'Data de ativação / adesão', { opcional: true }),
  C('Plano e contrato', 'plano.situacao', 'Situação do veículo', { opcional: true }),
  C('Plano e contrato', 'plano.unidade', 'Unidade (regional)'),
  C('Plano e contrato', 'plano.vendedor', 'Vendedor / consultor', { opcional: true }),

  C('Coberturas', 'coberturas.tabela', 'Tabela das coberturas contratadas', { tipo: 'bloco' }),
  C('Coberturas', 'coberturas.lista', 'Coberturas (lista em texto)'),
  C('Coberturas', 'coberturas.marca_casco', '☒ se tem casco (roubo, furto, colisão)', { tipo: 'marca' }),
  C('Coberturas', 'coberturas.marca_terceiros', '☒ se tem terceiros', { tipo: 'marca' }),
  C('Coberturas', 'coberturas.marca_vidros', '☒ se tem vidros', { tipo: 'marca' }),
  C('Coberturas', 'coberturas.marca_assistencia', '☒ se tem assistência 24h', { tipo: 'marca' }),
  C('Coberturas', 'coberturas.marca_carro_reserva', '☒ se tem carro reserva', { tipo: 'marca' }),
  C('Coberturas', 'coberturas.marca_rastreamento', '☒ se tem rastreador', { tipo: 'marca' }),

  C('Empresa', 'empresa.nome', 'Nome da associação'),
  C('Empresa', 'empresa.razao_social', 'Razão social'),
  C('Empresa', 'empresa.cnpj', 'CNPJ'),
  C('Empresa', 'empresa.endereco', 'Endereço'),
  C('Empresa', 'empresa.cidade', 'Cidade'),
  C('Empresa', 'empresa.telefone', 'Telefone', { opcional: true }),
  C('Empresa', 'empresa.whatsapp', 'WhatsApp', { opcional: true }),
  C('Empresa', 'empresa.email', 'E-mail', { opcional: true }),
  C('Empresa', 'empresa.site', 'Site', { opcional: true }),
  C('Empresa', 'empresa.regulamento_url', 'Link do regulamento'),

  C('Emissão', 'emissao.data', 'Data da emissão'),
  C('Emissão', 'emissao.data_extenso', 'Data por extenso'),
  C('Emissão', 'emissao.cidade_data', 'Cidade e data ("Cuiabá, 19 de outubro de 2026")'),
  C('Emissão', 'emissao.protocolo', 'Protocolo do termo'),
  C('Emissão', 'emissao.emitido_por', 'Emitido por', { opcional: true }),
];

export const GRUPOS_CAMPO: GrupoCampo[] = ['Associado', 'Veículo', 'Plano e contrato', 'Coberturas', 'Empresa', 'Emissão'];

const POR_CHAVE = new Map(CAMPOS_TERMO.map((c) => [c.chave, c]));
export const campoPorChave = (k: string) => POR_CHAVE.get(k);
export const rotuloCampo = (k: string) => {
  const c = POR_CHAVE.get(k);
  return c ? `${c.grupo}: ${c.rotulo}` : k;
};

// ---------------------------------------------------------------------------
// Os dados de onde os campos saem
// ---------------------------------------------------------------------------

type Endereco = { cep?: string; logradouro?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; uf?: string } | null | undefined;

export interface FontesTermo {
  cliente: {
    nome_razao_social: string; cpf_cnpj: string; tipo_pessoa: string; rg_ie?: string | null;
    data_nascimento?: string | null; sexo?: string | null; nome_mae?: string | null; email?: string | null;
    celular?: string | null; telefone?: string | null; matricula?: string | null; endereco?: Endereco;
  };
  veiculo?: {
    placa: string; marca?: string | null; modelo?: string | null; ano_fabricacao?: number | null;
    ano_modelo?: number | null; cor?: string | null; chassi?: string | null; renavam?: string | null;
    numero_motor?: string | null; codigo_fipe?: string | null; valor_fipe?: number | null;
    combustivel?: string | null; uso?: string | null; alienado?: boolean | null; alienado_financeira?: string | null;
    rastreador_imei?: string | null; dia_vencimento?: number | null; data_ativacao?: string | null;
    status?: string | null;
  } | null;
  tipoVeiculo?: string | null;
  plano?: { nome: string; descricao_comercial?: string | null } | null;
  cota?: { codigo: string; percentual?: number | null } | null;
  mensalidade?: number | null;
  adesao?: number | null;
  participacao?: number | null;
  unidade?: string | null;
  vendedor?: string | null;
  coberturas?: ItemCobertura[];
  empresa?: {
    razao_social: string; nome_fantasia?: string | null; cnpj?: string | null; endereco?: Endereco;
    telefone_fixo?: string | null; whatsapp_principal?: string | null; email_principal?: string | null;
    site?: string | null; regulamento_url?: string | null;
  } | null;
  emissao: { em: Date; por?: string | null; cidade?: string | null };
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moeda = (v: number | null | undefined) => (v == null || !Number.isFinite(Number(v)) ? '' : BRL.format(Number(v)));
const txt = (v: unknown) => (v == null ? '' : String(v).trim());

/** 'AAAA-MM-DD' -> 'DD/MM/AAAA' sem passar por fuso. */
export function dataCurta(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro'];

/** Data em Sao Paulo: { curta: '19/10/2026', extenso: '19 de outubro de 2026' }. */
export function dataDaEmissao(em: Date): { curta: string; extenso: string } {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(em); // AAAA-MM-DD
  const [a, m, d] = p.split('-');
  return { curta: `${d}/${m}/${a}`, extenso: `${Number(d)} de ${MESES[Number(m) - 1]} de ${a}` };
}

function enderecoCompleto(e: Endereco): string {
  if (!e) return '';
  const rua = [txt(e.logradouro), txt(e.numero)].filter(Boolean).join(', ');
  const partes = [rua, txt(e.complemento), txt(e.bairro),
    [txt(e.cidade), txt(e.uf)].filter(Boolean).join('/'), e.cep ? `CEP ${formatarCEP(e.cep)}` : ''];
  return partes.filter(Boolean).join(' - ');
}

const ROTULO_USO: Record<string, string> = { passeio: 'Particular', app: 'Aplicativo', comercial: 'Comercial' };
const marca = (sim: boolean) => (sim ? '☒' : '☐');

function gruposContratados(itens: ItemCobertura[]): Set<GrupoCobertura> {
  return new Set(itens.map(grupoDaCobertura).filter((g): g is GrupoCobertura => !!g));
}

/** Os valores de TEXTO de todos os campos (blocos ficam em `blocosDoTermo`). */
export function valoresDoTermo(f: FontesTermo): Record<string, string> {
  const c = f.cliente;
  const v = f.veiculo ?? null;
  const e = c.endereco ?? null;
  const pj = c.tipo_pessoa === 'PJ';
  const itens = f.coberturas ?? [];
  const grupos = gruposContratados(itens);
  const emp = f.empresa ?? null;
  const data = dataDaEmissao(f.emissao.em);
  const cidadeEmissao = txt(f.emissao.cidade) || txt(emp?.endereco?.cidade);
  const anos = [v?.ano_fabricacao, v?.ano_modelo].filter((x) => x != null).join('/');
  const uso = txt(v?.uso);

  return {
    'associado.nome': txt(c.nome_razao_social),
    'associado.cpf_cnpj': c.cpf_cnpj ? formatarDocumento(c.cpf_cnpj, pj ? 'PJ' : 'PF') : '',
    'associado.tipo_pessoa': pj ? 'Pessoa jurídica' : 'Pessoa física',
    'associado.rg': txt(c.rg_ie),
    'associado.data_nascimento': dataCurta(c.data_nascimento),
    'associado.sexo': txt(c.sexo),
    'associado.nome_mae': txt(c.nome_mae),
    'associado.email': txt(c.email),
    'associado.celular': c.celular ? formatarTelefone(c.celular) : '',
    'associado.telefone': c.telefone ? formatarTelefone(c.telefone) : '',
    'associado.matricula': txt(c.matricula),
    'associado.endereco': enderecoCompleto(e),
    'associado.logradouro': [txt(e?.logradouro), txt(e?.numero)].filter(Boolean).join(', '),
    'associado.complemento': txt(e?.complemento),
    'associado.bairro': txt(e?.bairro),
    'associado.cidade': txt(e?.cidade),
    'associado.uf': txt(e?.uf),
    'associado.cep': e?.cep ? formatarCEP(e.cep) : '',
    'associado.pj_razao': pj ? txt(c.nome_razao_social) : '',
    'associado.pj_cnpj': pj && c.cpf_cnpj ? formatarDocumento(c.cpf_cnpj, 'PJ') : '',

    'veiculo.placa': txt(v?.placa),
    'veiculo.marca': txt(v?.marca),
    'veiculo.modelo': txt(v?.modelo),
    'veiculo.marca_modelo': [txt(v?.marca), txt(v?.modelo)].filter(Boolean).join(' '),
    'veiculo.ano_fabricacao': txt(v?.ano_fabricacao),
    'veiculo.ano_modelo': txt(v?.ano_modelo),
    'veiculo.ano_fab_modelo': anos,
    'veiculo.cor': txt(v?.cor),
    'veiculo.chassi': txt(v?.chassi),
    'veiculo.renavam': txt(v?.renavam),
    'veiculo.numero_motor': txt(v?.numero_motor),
    'veiculo.codigo_fipe': txt(v?.codigo_fipe),
    'veiculo.valor_fipe': moeda(v?.valor_fipe),
    'veiculo.combustivel': txt(v?.combustivel),
    'veiculo.tipo': txt(f.tipoVeiculo),
    'veiculo.uso': ROTULO_USO[uso] ?? uso,
    'veiculo.alienado': v ? (v.alienado ? 'Sim' : 'Não') : '',
    'veiculo.financeira': v?.alienado ? txt(v.alienado_financeira) : '',
    'veiculo.rastreador_imei': txt(v?.rastreador_imei),
    'veiculo.marca_uso_particular': marca(uso === 'passeio'),
    'veiculo.marca_uso_trabalho': marca(uso === 'app' || uso === 'comercial'),
    'veiculo.marca_moto': marca(/moto/i.test(txt(f.tipoVeiculo))),
    'veiculo.marca_alienado': marca(!!v?.alienado),

    'plano.nome': txt(f.plano?.nome),
    'plano.descricao': txt(f.plano?.descricao_comercial),
    'plano.mensalidade': moeda(f.mensalidade),
    'plano.adesao': moeda(f.adesao),
    'plano.participacao': moeda(f.participacao),
    'plano.cota': f.cota ? `${f.cota.codigo}${f.cota.percentual != null ? ` (${f.cota.percentual}% da FIPE)` : ''}` : '',
    'plano.dia_vencimento': v?.dia_vencimento ? `Dia ${v.dia_vencimento}` : '',
    'plano.data_ativacao': dataCurta(v?.data_ativacao),
    'plano.situacao': txt(v?.status),
    'plano.unidade': txt(f.unidade),
    'plano.vendedor': txt(f.vendedor),

    'coberturas.lista': agruparCoberturas(itens).flatMap((s) => s.itens.map((i) => i.nome)).join(', '),
    'coberturas.marca_casco': marca(grupos.has('CASCO')),
    'coberturas.marca_terceiros': marca(grupos.has('TERCEIROS')),
    'coberturas.marca_vidros': marca(grupos.has('VIDROS')),
    'coberturas.marca_assistencia': marca(grupos.has('ASSISTENCIA')),
    'coberturas.marca_carro_reserva': marca(grupos.has('CARRO_RESERVA')),
    'coberturas.marca_rastreamento': marca(grupos.has('RASTREAMENTO')),

    'empresa.nome': txt(emp?.nome_fantasia) || txt(emp?.razao_social),
    'empresa.razao_social': txt(emp?.razao_social),
    'empresa.cnpj': emp?.cnpj ? formatarDocumento(emp.cnpj, 'PJ') : '',
    'empresa.endereco': enderecoCompleto(emp?.endereco),
    'empresa.cidade': txt(emp?.endereco?.cidade),
    'empresa.telefone': emp?.telefone_fixo ? formatarTelefone(emp.telefone_fixo) : '',
    'empresa.whatsapp': emp?.whatsapp_principal ? formatarTelefone(emp.whatsapp_principal) : '',
    'empresa.email': txt(emp?.email_principal),
    'empresa.site': txt(emp?.site),
    'empresa.regulamento_url': txt(emp?.regulamento_url),

    'emissao.data': data.curta,
    'emissao.data_extenso': data.extenso,
    'emissao.cidade_data': cidadeEmissao ? `${cidadeEmissao}, ${data.extenso}` : data.extenso,
    'emissao.protocolo': MARCA_PROTOCOLO,
    'emissao.emitido_por': txt(f.emissao.por),
  };
}

export function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Os campos que viram BLOCO inteiro (HTML pronto). */
export function blocosDoTermo(f: FontesTermo): Record<string, string> {
  const secoes = agruparCoberturas(f.coberturas ?? []);
  const linhas = secoes.flatMap((s) => s.itens.map((i) => {
    const limite = textoDoLimite({ ...i, usados: 0 }).replace(/ · 0 usados$/, '');
    return `<tr><td>${escaparHtml(s.rotulo)}</td><td>${escaparHtml(i.nome)}</td>`
      + `<td>${i.origem === 'PLANO' ? 'No plano' : 'Opcional'}</td><td>${escaparHtml(limite)}</td></tr>`;
  }));
  const tabela = linhas.length
    ? '<table class="termo-tabela"><thead><tr><th>Grupo</th><th>Cobertura</th><th>Origem</th><th>Limite</th></tr></thead>'
      + `<tbody>${linhas.join('')}</tbody></table>`
    : '';
  return { 'coberturas.tabela': tabela };
}

// ---------------------------------------------------------------------------
// O preenchimento
// ---------------------------------------------------------------------------

/** Linha em branco no lugar do campo que nao tem dado (como no papel). */
export const EM_BRANCO = '<span class="termo-em-branco">______________________</span>';

const RE_CAMPO = /<(span|div)\b[^>]*\bdata-campo="([^"]+)"[^>]*>[\s\S]*?<\/\1>/g;

/** As chaves citadas num texto (na ordem, sem repetir). */
export function camposDoTexto(html: string): string[] {
  const out: string[] = [];
  for (const m of (html ?? '').matchAll(RE_CAMPO)) if (!out.includes(m[2])) out.push(m[2]);
  return out;
}

/**
 * Troca cada campo pelo valor. Devolve o HTML pronto e os campos que ficaram
 * em branco (so os que nao sao opcionais) e os desconhecidos (marca de um
 * campo que saiu do catalogo — o texto mostra a linha em branco).
 */
export function renderizarTermo(
  html: string,
  valores: Record<string, string>,
  blocos: Record<string, string> = {},
): { html: string; vazios: string[]; desconhecidos: string[] } {
  const vazios: string[] = [];
  const desconhecidos: string[] = [];
  const saida = (html ?? '').replace(RE_CAMPO, (_m, tag: string, chave: string) => {
    const campo = POR_CHAVE.get(chave);
    if (!campo) {
      if (!desconhecidos.includes(chave)) desconhecidos.push(chave);
      return EM_BRANCO;
    }
    if (campo.tipo === 'bloco') {
      const b = blocos[chave] ?? '';
      if (!b) {
        if (!campo.opcional && !vazios.includes(chave)) vazios.push(chave);
        return tag === 'div' ? `<div>${EM_BRANCO}</div>` : EM_BRANCO;
      }
      return b;
    }
    const v = valores[chave] ?? '';
    if (!v) {
      if (!campo.opcional && !vazios.includes(chave)) vazios.push(chave);
      return EM_BRANCO;
    }
    return v === MARCA_PROTOCOLO ? v : escaparHtml(v);
  });
  return { html: saida, vazios, desconhecidos };
}

/** O termo serve para este veiculo? Lista vazia = vale para todos. */
export function termoServeParaVeiculo(
  modelo: { plano_ids?: string[] | null; tipo_veiculo_ids?: string[] | null; usos?: string[] | null; regional_ids?: string[] | null },
  v: { plano_protecao_id?: string | null; tipo_veiculo_id?: string | null; uso?: string | null; regional_id?: string | null } | null,
): boolean {
  const casa = (lista: string[] | null | undefined, valor: string | null | undefined) =>
    !lista || lista.length === 0 || (!!valor && lista.includes(valor));
  if (!v) return !modelo.plano_ids?.length && !modelo.tipo_veiculo_ids?.length && !modelo.usos?.length
    && !modelo.regional_ids?.length;
  return casa(modelo.plano_ids, v.plano_protecao_id) && casa(modelo.tipo_veiculo_ids, v.tipo_veiculo_id)
    && casa(modelo.usos, v.uso) && casa(modelo.regional_ids, v.regional_id);
}

/** Documento completo para o PDF (cabecalho com a logo + o texto + rodape). */
export function documentoDoTermo(args: { corpo: string; titulo: string; logoDataUrl?: string | null; rodape?: string }): string {
  const logo = args.logoDataUrl ? `<img class="termo-logo" src="${args.logoDataUrl}" alt="">` : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escaparHtml(args.titulo)}</title>
<style>
@page { size: A4; margin: 18mm 16mm 20mm; }
body { font-family: 'Noto Sans', 'DejaVu Sans', Arial, sans-serif; font-size: 10.5pt; color: #142445; line-height: 1.45; }
.termo-cabecalho { text-align: center; margin-bottom: 10px; }
.termo-logo { max-height: 60px; }
h1, h2, h3 { color: #142445; margin: 10px 0 6px; }
h1 { font-size: 14pt; } h2 { font-size: 12pt; } h3 { font-size: 11pt; }
p { margin: 4px 0; text-align: justify; }
td p, th p { text-align: left; margin: 0; }
table { border-collapse: collapse; width: 100%; margin: 6px 0; }
td, th { border: 1px solid #b8c2d6; padding: 3px 6px; vertical-align: top; font-size: 9.5pt; }
th { background: #eef2f8; text-align: left; }
.termo-em-branco { color: #8a93a6; }
img { max-width: 100%; }
.termo-rodape { margin-top: 18px; border-top: 1px solid #b8c2d6; padding-top: 6px; font-size: 8.5pt; color: #4b5873; }
</style></head><body>
<div class="termo-cabecalho">${logo}</div>
${args.corpo}
${args.rodape ? `<div class="termo-rodape">${args.rodape}</div>` : ''}
</body></html>`;
}
