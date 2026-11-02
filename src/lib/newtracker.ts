// Integracao com a plataforma da NEW TRACKER (Fleet Hub 360).
// Documentacao: https://newtrackernatal.com/api-docs.html (lida em 02/11/2026).
//
// API Externa com chave: GET {base}/api-externa?recurso=<recurso>, chave
// fh_live_... no cabecalho x-api-key. SO LEITURA. A chave identifica a empresa
// dona dela: tudo o que volta e dessa empresa.
//
// FASE 1 (esta): testar a conexao e ver uma AMOSTRA do retorno real. A
// documentacao nomeia os campos mas nao mostra o JSON completo de cada recurso;
// a gravacao no parque so e escrita depois de ver o payload de verdade (licao
// do Mutual: chutar nome de campo custou rodadas inteiras).

export const BASE_NEWTRACKER = 'https://bgixdmhmaheznzqjljhk.supabase.co/functions/v1';

/** Recursos que a integracao do SCar usa (ocorrencias ficam para depois). */
export const RECURSOS_NEWTRACKER = {
  status: 'Conexão e permissões da chave',
  equipamentos: 'Equipamentos (estoque)',
  chips: 'Chips e linhas',
  veiculos: 'Veículos',
  posicoes: 'Posições em tempo real',
} as const;

export type RecursoNewTracker = keyof typeof RECURSOS_NEWTRACKER;

export function ehRecursoNewTracker(v: unknown): v is RecursoNewTracker {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(RECURSOS_NEWTRACKER, v);
}

/** Aviso de "sem sinal" (decisao do usuario, 02/11/2026). */
export const DIAS_SEM_SINAL = 3;

/** Limite maximo por pagina na API deles. */
export const LIMITE_MAXIMO = 500;

export interface ConsultaNewTracker {
  pagina?: number;
  limite?: number;
  id?: string;
  placa?: string;
  atualizado_desde?: string;
}

export function urlNewTracker(base: string, recurso: RecursoNewTracker, q: ConsultaNewTracker = {}): string {
  const raiz = (base || BASE_NEWTRACKER).replace(/\/+$/, '');
  const p = new URLSearchParams({ recurso });
  if (recurso !== 'status') {
    if (q.pagina && q.pagina > 1) p.set('pagina', String(Math.floor(q.pagina)));
    if (q.limite) p.set('limite', String(Math.min(LIMITE_MAXIMO, Math.max(1, Math.floor(q.limite)))));
    if (q.id) p.set('id', q.id);
    if (q.placa && recurso === 'veiculos') p.set('placa', q.placa.toUpperCase().replace(/[^A-Z0-9]/g, ''));
    if (q.atualizado_desde) p.set('atualizado_desde', q.atualizado_desde);
  }
  return `${raiz}/api-externa?${p.toString()}`;
}

export function cabecalhoNewTracker(chave: string): Record<string, string> {
  return { 'x-api-key': chave, Accept: 'application/json' };
}

/** O envelope de listagem: { success, recurso, pagina, limite, total, dados: [...] }. */
export interface PaginaNewTracker {
  ok: boolean;
  total: number | null;
  pagina: number | null;
  limite: number | null;
  dados: Record<string, unknown>[];
  /** O objeto todo, quando nao e listagem (recurso=status). */
  corpo: Record<string, unknown> | null;
}

function numeroOuNulo(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function lerPaginaNewTracker(corpo: unknown): PaginaNewTracker {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    const dados = Array.isArray(corpo) ? (corpo as unknown[]).filter(ehObjeto) : [];
    return { ok: Array.isArray(corpo), total: dados.length || null, pagina: null, limite: null, dados, corpo: null };
  }
  const c = corpo as Record<string, unknown>;
  const dados = Array.isArray(c.dados) ? c.dados.filter(ehObjeto) : [];
  return {
    ok: c.success === true,
    total: numeroOuNulo(c.total),
    pagina: numeroOuNulo(c.pagina),
    limite: numeroOuNulo(c.limite),
    dados,
    corpo: c,
  };
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Ha mais paginas? Pelo total quando vem; senao, pagina cheia = talvez. */
export function temMaisPaginas(p: PaginaNewTracker, limitePedido: number): boolean {
  const pagina = p.pagina ?? 1;
  const limite = p.limite ?? limitePedido;
  if (p.total != null) return pagina * limite < p.total;
  return p.dados.length >= limite;
}

const ERROS: Record<string, string> = {
  INVALID_API_KEY: 'A chave da New Tracker é inválida, foi revogada ou não foi enviada.',
  FORBIDDEN_SCOPE: 'A chave não tem permissão para este recurso. Marque a permissão na chave, no Fleet Hub 360.',
  TENANT_SUSPENSO: 'A empresa dona da chave está suspensa ou inativa no Fleet Hub 360.',
  VALIDATION_ERROR: 'Parâmetro inválido na consulta.',
};

/** Texto para a tela a partir da resposta de erro deles ({ error, code }). */
export function mensagemErroNewTracker(http: number, corpo: unknown): string {
  const c = ehObjeto(corpo) ? corpo : {};
  const code = typeof c.code === 'string' ? c.code : '';
  if (code && ERROS[code]) return ERROS[code];
  if (http === 401) return ERROS.INVALID_API_KEY;
  if (http === 403) return ERROS.FORBIDDEN_SCOPE;
  const msg = typeof c.error === 'string' ? c.error : typeof c.message === 'string' ? c.message : '';
  return `A New Tracker respondeu HTTP ${http}${msg ? `: ${msg}` : ''}.`;
}

/** Um campo visto na amostra: quantos vieram preenchidos e um exemplo. */
export interface CampoAmostra {
  campo: string;
  preenchidos: number;
  total: number;
  exemplo: string | null;
}

function vazio(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

function exemploDe(v: unknown): string {
  const t = typeof v === 'string' ? v : JSON.stringify(v);
  return t.length > 80 ? `${t.slice(0, 77)}...` : t;
}

/**
 * As chaves que REALMENTE vem no payload (objetos aninhados por ponto, um nivel),
 * quantas vieram preenchidas e um exemplo — o instrumento contra o chute.
 */
export function camposDaAmostra(dados: Record<string, unknown>[]): CampoAmostra[] {
  const mapa = new Map<string, CampoAmostra>();
  const ver = (campo: string, v: unknown) => {
    const a = mapa.get(campo) ?? { campo, preenchidos: 0, total: dados.length, exemplo: null };
    if (!vazio(v)) {
      a.preenchidos += 1;
      if (a.exemplo == null) a.exemplo = exemploDe(v);
    }
    mapa.set(campo, a);
  };
  for (const linha of dados) {
    for (const [k, v] of Object.entries(linha)) {
      if (ehObjeto(v)) {
        ver(k, v);
        for (const [k2, v2] of Object.entries(v)) ver(`${k}.${k2}`, v2);
      } else ver(k, v);
    }
  }
  return Array.from(mapa.values()).sort((a, b) => a.campo.localeCompare(b.campo));
}

/** IMEI como o banco guarda (0049/0050): so digitos, 14 a 17. */
export function imeiNewTracker(v: unknown): string | null {
  if (v == null) return null;
  const d = String(v).replace(/\D/g, '');
  return /^[0-9]{14,17}$/.test(d) ? d : null;
}

/** A comunicacao esta parada ha mais que o prazo? (null = nunca comunicou). */
export function semSinal(ultima: string | Date | null | undefined, agora: Date = new Date(), dias = DIAS_SEM_SINAL): boolean {
  if (!ultima) return true;
  const t = ultima instanceof Date ? ultima.getTime() : Date.parse(ultima);
  if (Number.isNaN(t)) return true;
  return agora.getTime() - t > dias * 86_400_000;
}
