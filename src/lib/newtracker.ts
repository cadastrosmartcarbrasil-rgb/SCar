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

// ---------------------------------------------------------------------------
// IMPORTACAO (02/11/2026) — formato conferido nas amostras reais:
//   equipamentos: { id, imei, numero_serie, modelo, tipo, status, estoque_tipo }
//     -> NAO diz o veiculo;
//   chips:        { id, iccid, numero_linha, operadora, imei (vazio), equipamento_id }
//     -> liga ao equipamento pelo ID interno da New Tracker;
//   veiculos:     { id, placa, chassi, imei (vazio), modelo, status, cliente_id }
//     -> 0 km vem com o comeco do chassi no campo placa ("9BWAG5R1");
//   posicoes:     { veiculo_id, imei, latitude, longitude, speed, ignition,
//                   online, address, device_time }
//     -> a UNICA ponte equipamento <-> veiculo.
// Decisao do usuario: entra no parque so o equipamento INSTALADO em veiculo da
// Smart Car (a chave ve a frota inteira da New Tracker).
// ---------------------------------------------------------------------------

export type Linha = Record<string, unknown>;

function texto(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

/** Placa/chassi como o banco grava: so letras e numeros, caixa alta. */
export function identificadorVeiculo(v: unknown): string | null {
  const t = texto(v);
  if (!t) return null;
  const s = t.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s === '' ? null : s;
}

/** Placa valida (antiga ou Mercosul). "9BWAG5R1" (comeco de chassi) nao e placa. */
export function placaValida(v: unknown): string | null {
  const p = identificadorVeiculo(v);
  return p && /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p) ? p : null;
}

/** Chassi plausivel: 17 caracteres, sem I/O/Q. */
export function chassiValido(v: unknown): string | null {
  const c = identificadorVeiculo(v);
  return c && /^[A-HJ-NPR-Z0-9]{17}$/.test(c) ? c : null;
}

export interface PosicaoNT {
  comunicado_em: string;
  latitude: number | null;
  longitude: number | null;
  velocidade: number | null;
  ignicao: boolean | null;
  online: boolean | null;
  endereco: string | null;
}

export interface ItemNewTracker {
  imei: string;
  modelo: string | null;
  numero_serie: string | null;
  iccid: string | null;
  linha: string | null;
  operadora: string | null;
  /** o veiculo NA NEW TRACKER (pela posicao) */
  veiculo_nt: { id: string; placa: string | null; chassi: string | null; descricao: string | null } | null;
  posicao: PosicaoNT | null;
}

function numero(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function booleano(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

function data(v: unknown): string | null {
  const t = texto(v);
  if (!t) return null;
  return Number.isNaN(Date.parse(t)) ? null : t;
}

/**
 * Junta os quatro recursos num item por IMEI. Equipamento sem posicao fica sem
 * veiculo (a importacao o deixa de fora); IMEI que so aparece na posicao entra
 * tambem (o equipamento pode nao estar na pagina lida, ou ser de outra lista).
 * Se o mesmo IMEI tem varias posicoes, vale a mais recente.
 */
export function montarItensNewTracker(fontes: {
  equipamentos: Linha[];
  chips: Linha[];
  veiculos: Linha[];
  posicoes: Linha[];
}): ItemNewTracker[] {
  const chipPorEquip = new Map<string, Linha>();
  for (const c of fontes.chips) {
    const eid = texto(c.equipamento_id);
    if (eid && !chipPorEquip.has(eid)) chipPorEquip.set(eid, c);
  }
  const veiculoPorId = new Map<string, Linha>();
  for (const v of fontes.veiculos) {
    const id = texto(v.id);
    if (id) veiculoPorId.set(id, v);
  }
  const posPorImei = new Map<string, Linha>();
  for (const p of fontes.posicoes) {
    const imei = imeiNewTracker(p.imei);
    if (!imei) continue;
    const atual = posPorImei.get(imei);
    const t = Date.parse(String(p.device_time ?? '')) || 0;
    const ta = atual ? Date.parse(String(atual.device_time ?? '')) || 0 : -1;
    if (!atual || t > ta) posPorImei.set(imei, p);
  }

  const itens = new Map<string, ItemNewTracker>();
  const montar = (imei: string, eq: Linha | null) => {
    const chip = eq ? chipPorEquip.get(String(eq.id ?? '')) : undefined;
    const pos = posPorImei.get(imei) ?? null;
    const vid = pos ? texto(pos.veiculo_id) : null;
    const ve = vid ? veiculoPorId.get(vid) : undefined;
    const iccid = texto(chip?.iccid)?.replace(/\D/g, '') ?? null;
    const comunicado = pos ? data(pos.device_time) ?? data(pos.updated_at) : null;
    itens.set(imei, {
      imei,
      modelo: texto(eq?.modelo),
      numero_serie: texto(eq?.numero_serie),
      iccid: iccid && /^[0-9]{8,22}$/.test(iccid) ? iccid : null,
      linha: texto(chip?.numero_linha)?.replace(/\D/g, '') || null,
      operadora: texto(chip?.operadora),
      veiculo_nt: vid
        ? {
            id: vid,
            placa: ve ? identificadorVeiculo(ve.placa) : null,
            chassi: ve ? identificadorVeiculo(ve.chassi) : null,
            descricao: ve ? [texto(ve.marca), texto(ve.modelo)].filter(Boolean).join(' ') || null : null,
          }
        : null,
      posicao:
        pos && comunicado
          ? {
              comunicado_em: comunicado,
              latitude: numero(pos.latitude),
              longitude: numero(pos.longitude),
              velocidade: numero(pos.speed),
              ignicao: booleano(pos.ignition),
              online: booleano(pos.online),
              endereco: texto(pos.address),
            }
          : null,
    });
  };

  for (const eq of fontes.equipamentos) {
    const imei = imeiNewTracker(eq.imei);
    if (imei && !itens.has(imei)) montar(imei, eq);
  }
  for (const imei of Array.from(posPorImei.keys())) {
    if (!itens.has(imei)) montar(imei, null);
  }
  return Array.from(itens.values());
}

/** O nosso veiculo, como a importacao precisa dele. */
export interface VeiculoSCar {
  id: string;
  placa: string | null;
  chassi: string | null;
  status: string;
}

export type SituacaoImportacao =
  | 'INSTALAR'            // veiculo da Smart Car achado
  | 'SEM_POSICAO'         // equipamento sem posicao: nao se sabe o veiculo
  | 'VEICULO_SEM_CADASTRO'// posicao aponta veiculo que nao veio em `veiculos`
  | 'FORA_DA_BASE';       // veiculo da New Tracker que nao e da Smart Car

export interface LinhaPrevia {
  item: ItemNewTracker;
  situacao: SituacaoImportacao;
  veiculo: VeiculoSCar | null;
  casou_por: 'CHASSI' | 'PLACA' | null;
}

const VIVO = ['ativo', 'em_evento', 'vistoria_pendente', 'inadimplente', 'suspenso'];

function melhor(a: VeiculoSCar | undefined, b: VeiculoSCar): VeiculoSCar {
  if (!a) return b;
  const va = VIVO.includes(a.status), vb = VIVO.includes(b.status);
  return vb && !va ? b : a;
}

/**
 * Casa cada item com o nosso veiculo: CHASSI primeiro (o 0 km da New Tracker
 * vem com o comeco do chassi no campo placa), depois PLACA valida. Entre dois
 * veiculos com o mesmo identificador, vence o que esta na base.
 */
export function casarComBase(itens: ItemNewTracker[], nossos: VeiculoSCar[]): LinhaPrevia[] {
  const porChassi = new Map<string, VeiculoSCar>();
  const porPlaca = new Map<string, VeiculoSCar>();
  for (const v of nossos) {
    if (v.status === 'excluido') continue;
    const c = identificadorVeiculo(v.chassi);
    const p = identificadorVeiculo(v.placa);
    if (c) porChassi.set(c, melhor(porChassi.get(c), v));
    if (p) porPlaca.set(p, melhor(porPlaca.get(p), v));
  }
  return itens.map((item) => {
    if (!item.veiculo_nt) return { item, situacao: 'SEM_POSICAO', veiculo: null, casou_por: null };
    const { chassi, placa } = item.veiculo_nt;
    if (!chassi && !placa) return { item, situacao: 'VEICULO_SEM_CADASTRO', veiculo: null, casou_por: null };
    const c = chassiValido(chassi);
    const porC = c ? porChassi.get(c) : undefined;
    if (porC) return { item, situacao: 'INSTALAR', veiculo: porC, casou_por: 'CHASSI' };
    const p = placaValida(placa);
    const porP = p ? porPlaca.get(p) : undefined;
    if (porP) return { item, situacao: 'INSTALAR', veiculo: porP, casou_por: 'PLACA' };
    return { item, situacao: 'FORA_DA_BASE', veiculo: null, casou_por: null };
  });
}

export const ROTULO_SITUACAO_IMPORTACAO: Record<SituacaoImportacao, string> = {
  INSTALAR: 'Instalado em veículo da Smart Car',
  SEM_POSICAO: 'Sem posição na New Tracker (não se sabe o veículo)',
  VEICULO_SEM_CADASTRO: 'Posição aponta veículo sem placa/chassi na New Tracker',
  FORA_DA_BASE: 'Veículo não é da Smart Car',
};

export function contarSituacoes(linhas: LinhaPrevia[]): Record<SituacaoImportacao, number> {
  const r: Record<SituacaoImportacao, number> = { INSTALAR: 0, SEM_POSICAO: 0, VEICULO_SEM_CADASTRO: 0, FORA_DA_BASE: 0 };
  for (const l of linhas) r[l.situacao] += 1;
  return r;
}

/** O item no formato de `api_cadastrar_rastreadores` (0165). */
export function itemParaCadastro(l: LinhaPrevia): Record<string, unknown> {
  return {
    imei: l.item.imei,
    modelo: l.item.modelo,
    numero_serie: l.item.numero_serie,
    iccid: l.item.iccid,
    linha: l.item.linha,
    operadora: l.item.operadora,
    veiculo_id: l.veiculo?.id ?? null,
    observacoes: 'Importado da plataforma New Tracker',
  };
}

/** A posicao no formato de `api_registrar_comunicacoes` (0151). */
export function itemParaComunicacao(item: ItemNewTracker): Record<string, unknown> | null {
  if (!item.posicao) return null;
  const p = item.posicao;
  return {
    imei: item.imei,
    comunicado_em: p.comunicado_em,
    latitude: p.latitude,
    longitude: p.longitude,
    velocidade: p.velocidade == null ? null : Math.max(0, p.velocidade),
    ignicao: p.ignicao,
    endereco: p.endereco,
  };
}

/** Divide em blocos (as RPCs aceitam ate 500; usamos menos para caber no tempo). */
export function emBlocos<T>(lista: T[], tamanho: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) r.push(lista.slice(i, i + tamanho));
  return r;
}
