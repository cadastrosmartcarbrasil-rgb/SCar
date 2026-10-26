// API EXTERNA (0151) — regras puras, compartilhadas pela rota e pela tela.
//
// A chave tem o formato `scar_<prefixo>_<segredo>`: o prefixo (10 caracteres)
// localiza a integracao e aparece na tela; o segredo so existe na hora em que
// a chave e gerada. O banco guarda o SHA-256 da chave inteira.

export const ESCOPOS_API = [
  { chave: 'veiculos:ler', rotulo: 'Ler veículos', detalhe: 'Placa, chassi, situação, unidade e rastreador de cada veículo.' },
  { chave: 'associados:ler', rotulo: 'Ler dados do associado', detalhe: 'Nome, CPF/CNPJ, telefone e e-mail junto do veículo (dado pessoal — LGPD).' },
  { chave: 'rastreadores:ler', rotulo: 'Ler o parque de rastreadores', detalhe: 'Equipamentos por IMEI, status e veículo instalado.' },
  { chave: 'rastreadores:escrever', rotulo: 'Informar comunicação do rastreador', detalhe: 'A plataforma devolve a última comunicação/posição de cada IMEI.' },
] as const;

export type EscopoApi = (typeof ESCOPOS_API)[number]['chave'];

export const ESCOPOS_RASTREADORA: EscopoApi[] = ['veiculos:ler', 'associados:ler', 'rastreadores:ler', 'rastreadores:escrever'];

export function rotuloEscopo(e: string): string {
  return ESCOPOS_API.find((x) => x.chave === e)?.rotulo ?? e;
}

// ------------------------------------------------------------------ a chave
const ALFABETO_PREFIXO = 'abcdefghijkmnpqrstuvwxyz23456789'; // sem 0/o/1/l

/** Monta a chave a partir de bytes aleatorios (o chamador fornece: crypto no servidor). */
export function montarChave(bytesPrefixo: Uint8Array, bytesSegredo: Uint8Array): { chave: string; prefixo: string } {
  const prefixo = Array.from(bytesPrefixo.slice(0, 10), (b) => ALFABETO_PREFIXO[b % ALFABETO_PREFIXO.length]).join('');
  const segredo = base64Url(bytesSegredo);
  return { chave: `scar_${prefixo}_${segredo}`, prefixo };
}

function base64Url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Le a chave do cabecalho: `Authorization: Bearer <chave>` ou `x-api-key: <chave>`. */
export function chaveDaRequisicao(authorization: string | null, xApiKey: string | null): string | null {
  const bruto = (xApiKey ?? '').trim() || (authorization ?? '').replace(/^Bearer\s+/i, '').trim();
  return bruto || null;
}

/** Prefixo da chave, ou null quando o formato nao e o nosso (nao vale nem consultar o banco). */
export function prefixoDaChave(chave: string | null): string | null {
  const m = /^scar_([a-z0-9]{8,16})_([A-Za-z0-9_-]{32,})$/.exec(chave ?? '');
  return m ? m[1] : null;
}

/** Chave para mostrar na tela depois de criada: so o prefixo. */
export function chaveMascarada(prefixo: string): string {
  return `scar_${prefixo}_••••••••`;
}

// ------------------------------------------------------------------ regras
/** Espelho de api_situacao_rastreamento (SQL). Mexeu num, mexa no outro. */
export function situacaoRastreamento(status: string): 'ATIVO' | 'SUSPENSO' | 'ENCERRADO' {
  if (['ativo', 'em_evento', 'vistoria_pendente'].includes(status)) return 'ATIVO';
  if (['inadimplente', 'suspenso'].includes(status)) return 'SUSPENSO';
  return 'ENCERRADO';
}

export const SITUACOES_RASTREAMENTO = {
  ATIVO: 'Manter o rastreamento: veículo na base, com benefícios.',
  SUSPENSO: 'Inadimplente ou suspenso: benefícios bloqueados; o equipamento continua no veículo.',
  ENCERRADO: 'Saiu da base: encerrar o rastreamento e recolher o equipamento.',
} as const;

/** IP permitido? Lista vazia/nula = qualquer IP. */
export function ipPermitido(ip: string, lista: string[] | null | undefined): boolean {
  if (!lista || lista.length === 0) return true;
  return lista.map((x) => x.trim()).includes(ip.trim());
}

/** Situacao da chave como a tela mostra. */
export function situacaoChave(
  i: { ativo: boolean; revogada_em: string | null; expira_em: string | null },
  agora = new Date(),
): 'ATIVA' | 'PAUSADA' | 'VENCIDA' | 'REVOGADA' {
  if (i.revogada_em) return 'REVOGADA';
  if (i.expira_em && new Date(i.expira_em) <= agora) return 'VENCIDA';
  return i.ativo ? 'ATIVA' : 'PAUSADA';
}

/** Lista de IPs digitada (um por linha, virgula ou espaco). */
export function lerListaIps(texto: string): { ips: string[]; invalidos: string[] } {
  const partes = texto.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  const ipv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  const ipv6 = /^[0-9a-f:]+$/i;
  const ips: string[] = [];
  const invalidos: string[] = [];
  for (const p of partes) {
    if (ipv4.test(p) || (p.includes(':') && ipv6.test(p))) { if (!ips.includes(p)) ips.push(p); }
    else invalidos.push(p);
  }
  return { ips, invalidos };
}

// ------------------------------------------------------------------ paginacao
/** Cursor opaco: base64url de "<alterado_em ISO>|<id>". */
export function codificarCursor(alteradoEm: string, id: string): string {
  return base64Url(new TextEncoder().encode(`${alteradoEm}|${id}`));
}

export function decodificarCursor(cursor: string | null): { em: string; id: string } | null {
  if (!cursor) return null;
  try {
    const b64 = cursor.replace(/-/g, '+').replace(/_/g, '/');
    const txt = new TextDecoder().decode(Uint8Array.from(atob(b64 + '==='.slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0)));
    const [em, id] = txt.split('|');
    if (!em || Number.isNaN(Date.parse(em))) return null;
    if (!/^[0-9a-f-]{36}$/i.test(id ?? '')) return null;
    return { em, id };
  } catch {
    return null;
  }
}

/** Limite por pagina: 1..500, padrao 100. */
export function limitePagina(valor: string | null): number {
  const n = Number.parseInt(valor ?? '', 10);
  if (!Number.isFinite(n)) return 100;
  return Math.min(500, Math.max(1, n));
}

/** Data/hora ISO valida (ou null quando ausente; erro quando invalida). */
export function lerDataHora(valor: string | null): { ok: true; valor: string | null } | { ok: false } {
  if (!valor) return { ok: true, valor: null };
  const t = Date.parse(valor);
  return Number.isNaN(t) ? { ok: false } : { ok: true, valor: new Date(t).toISOString() };
}

/** Referencia do veiculo na URL: id (uuid), chassi (17) ou placa. */
export function tipoDaReferencia(ref: string): 'id' | 'chassi' | 'placa' {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) return 'id';
  const limpo = ref.replace(/[^A-Za-z0-9]/g, '');
  return limpo.length === 17 ? 'chassi' : 'placa';
}

// ------------------------------------------------------------------ o JSON que sai
// A RPC devolve colunas planas; o sistema externo recebe objetos agrupados.
type LinhaVeiculo = {
  veiculo_id: string; placa: string | null; chassi: string | null; renavam: string | null; zero_km: boolean;
  marca: string | null; modelo: string | null; ano_fabricacao: number | null; ano_modelo: number | null; cor: string | null;
  tipo_veiculo: string | null; status: string; situacao_rastreamento: string; status_desde: string | null;
  data_ativacao: string | null; data_saida: string | null; unidade_id: string | null; unidade_nome: string | null;
  rastreador_imei: string | null; rastreador_chip: string | null; rastreadora_id: string | null; rastreadora_nome: string | null;
  cliente_id: string; associado_nome: string | null; associado_documento: string | null; associado_tipo_pessoa: string | null;
  associado_telefone: string | null; associado_celular: string | null; associado_email: string | null;
  alterado_em: string;
};

export function veiculoParaApi(v: LinhaVeiculo, comDadosPessoais: boolean) {
  return {
    id: v.veiculo_id,
    placa: v.placa,
    chassi: v.chassi,
    renavam: v.renavam,
    zero_km: v.zero_km,
    marca: v.marca,
    modelo: v.modelo,
    ano_fabricacao: v.ano_fabricacao,
    ano_modelo: v.ano_modelo,
    cor: v.cor,
    tipo: v.tipo_veiculo,
    status: v.status,
    situacao_rastreamento: v.situacao_rastreamento,
    status_desde: v.status_desde,
    data_ativacao: v.data_ativacao,
    data_saida: v.data_saida,
    unidade: v.unidade_id ? { id: v.unidade_id, nome: v.unidade_nome } : null,
    rastreador: v.rastreador_imei
      ? { imei: v.rastreador_imei, chip: v.rastreador_chip,
          rastreadora: v.rastreadora_id ? { id: v.rastreadora_id, nome: v.rastreadora_nome } : null }
      : null,
    associado: comDadosPessoais
      ? { id: v.cliente_id, nome: v.associado_nome, documento: v.associado_documento,
          tipo_pessoa: v.associado_tipo_pessoa, telefone: v.associado_telefone,
          celular: v.associado_celular, email: v.associado_email }
      : { id: v.cliente_id },
    alterado_em: v.alterado_em,
  };
}

/** Proximo cursor: so quando a pagina veio cheia. */
export function proximoCursor<T>(linhas: T[], limite: number, chave: (l: T) => { em: string; id: string }): string | null {
  if (linhas.length < limite || linhas.length === 0) return null;
  const u = chave(linhas[linhas.length - 1]);
  return codificarCursor(u.em, u.id);
}
