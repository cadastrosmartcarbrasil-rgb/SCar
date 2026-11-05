/**
 * Importar o termo do Word (.docx) para o editor (0123).
 *
 * O Word usa uma IMAGEM minuscula para cada caixinha de marcar (no Termo de
 * Adesao da Smart Car e um PNG de ~1 KB repetido). Imagem tao pequena vira o
 * caractere ☐ — no editor ela pode depois ser trocada por um campo de marca
 * (☒/☐ conforme o cadastro). Imagem de verdade (logo, assinatura) fica.
 * Caractere de fonte simbolo (Wingdings, area de uso privado) tambem vira ☐.
 */

/** Base64 abaixo disto (~3 KB de arquivo) e caixinha, nao figura. */
const LIMITE_CAIXINHA_BASE64 = 4000;

import { CAMPOS_TERMO, alinharColunasDasTabelas, campoPorChave, escaparHtml } from './termos';

export function limparHtmlDoWord(html: string): string {
  return alinharColunasDasTabelas(html ?? '')
    .replace(/<img\b[^>]*\bsrc="data:[^";]+;base64,([^"]*)"[^>]*\/?>/g, (m, b64: string) =>
      b64.length < LIMITE_CAIXINHA_BASE64 ? '☐' : m)
    .replace(/[\uF000-\uF0FF]/g, '☐')
    // paragrafos vazios em sequencia viram um so
    .replace(/(<p>\s*<\/p>\s*){2,}/g, '<p></p>');
}

/** .docx -> HTML limpo, no navegador (o mammoth so carrega quando usado). */
export async function htmlDoWord(arquivo: ArrayBuffer): Promise<{
  html: string; avisos: string[]; reconhecidos: number; desconhecidos: string[];
}> {
  const mod = await import('mammoth');
  const mammoth = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const r = await mammoth.convertToHtml({ arrayBuffer: arquivo });
  const c = camposDosMarcadores(limparHtmlDoWord(r.value));
  return {
    html: c.html,
    reconhecidos: c.reconhecidos,
    desconhecidos: c.desconhecidos,
    avisos: (r.messages ?? []).filter((m) => m.type === 'warning' && !m.message.startsWith('Unrecognised'))
      .map((m) => m.message),
  };
}

// ---------------------------------------------------------------------------
// Marcadores «Grupo: Campo» do Word (0181)
// ---------------------------------------------------------------------------
// O modelo feito no Word escreve o campo como texto: «Prestador: CNPJ/CPF».
// Na importacao, cada marcador reconhecido vira o campo do editor; o que nao
// for reconhecido fica como texto e e listado (a tela avisa).

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9☒]+/g, '');

const decodificar = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Outras grafias do mesmo campo (rotulos que o modelo do Cowork usou). */
const APELIDOS: Record<string, string> = {
  'Empresa: Endereço completo': 'empresa.endereco',
  'Empresa: Endereço da sede': 'empresa.endereco',
  'Emissão: Emitida por': 'emissao.emitido_por',
  'Emissão: Cidade e data': 'emissao.cidade_data',
  'Emissão: Protocolo': 'emissao.protocolo',
  'Veículo: Ano fab./mod.': 'veiculo.ano_fab_modelo',
  'Veículo: Marca': 'veiculo.marca',
  'Associado: Nome': 'associado.nome',
  'OS: Prazo combinado': 'os.prazo_dias',
  'OS: Participação do associado': 'evento.participacao',
  'Evento: Participação do associado': 'evento.participacao',
};

let mapa: Map<string, string> | null = null;
function mapaDeRotulos(): Map<string, string> {
  if (mapa) return mapa;
  mapa = new Map();
  for (const c of CAMPOS_TERMO) mapa.set(normalizar(`${c.grupo}: ${c.rotulo}`), c.chave);
  for (const [r, k] of Object.entries(APELIDOS)) if (!mapa.has(normalizar(r))) mapa.set(normalizar(r), k);
  return mapa;
}

/** A chave do campo para o texto de um marcador ("Prestador: CNPJ/CPF"), ou null. */
export function campoDoMarcador(texto: string): string | null {
  const m = mapaDeRotulos();
  const n = normalizar(decodificar(texto));
  if (m.has(n)) return m.get(n)!;
  // "Cidade e data ("Cuiabá, 19 de outubro de 2026")": o exemplo entre parenteses nao decide
  const semExemplo = normalizar(decodificar(texto).replace(/\s*\([^)]*\)\s*$/, ''));
  return m.get(semExemplo) ?? null;
}

/**
 * Troca os marcadores «...» reconhecidos pelos campos do editor. Campo de BLOCO
 * (a tabela de itens) sozinho no paragrafo vira o bloco inteiro.
 */
export function camposDosMarcadores(html: string): { html: string; reconhecidos: number; desconhecidos: string[] } {
  let reconhecidos = 0;
  const desconhecidos: string[] = [];
  const span = (k: string) => {
    const c = campoPorChave(k)!;
    return `<span data-campo="${k}">«${escaparHtml(`${c.grupo}: ${c.rotulo}`)}»</span>`;
  };
  // bloco sozinho no paragrafo
  let out = (html ?? '').replace(/<p>\s*(?:<strong>)?\s*«([^«»<>]{2,160})»\s*(?:<\/strong>)?\s*<\/p>/g, (m, t: string) => {
    const k = campoDoMarcador(t);
    if (!k || campoPorChave(k)?.tipo !== 'bloco') return m;
    reconhecidos += 1;
    return `<div data-campo="${k}"></div>`;
  });
  out = out.replace(/«([^«»<>]{2,160})»/g, (m, t: string) => {
    const k = campoDoMarcador(t);
    if (!k) {
      const d = decodificar(t).trim();
      if (!desconhecidos.includes(d)) desconhecidos.push(d);
      return m;
    }
    reconhecidos += 1;
    return span(k);
  });
  return { html: out, reconhecidos, desconhecidos };
}
