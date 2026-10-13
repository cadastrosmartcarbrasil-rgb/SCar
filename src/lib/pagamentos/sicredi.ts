// Adaptador SICREDI — API Cobranca (boleto hibrido: boleto + PIX no mesmo titulo).
//
// Contrato lido da colecao Postman oficial "API Cobranca - Collection Geral":
//   Auth     POST {base}/auth/openapi/token  (form-urlencoded, grant_type=password)
//            headers: x-api-key, context: COBRANCA
//   Cadastro POST {base}/cobranca/boleto/v1/boletos
//   Consulta GET  {base}/cobranca/boleto/v1/boletos?codigoBeneficiario=&nossoNumero=
//   Baixa    PATCH {base}/cobranca/boleto/v1/boletos/{nossoNumero}/baixa
//   PDF      GET  {base}/cobranca/boleto/v1/boletos/pdf?linhaDigitavel=
//   Pagos    GET  {base}/cobranca/boleto/v1/boletos/liquidados/dia?codigoBeneficiario=&dia=DD/MM/AAAA
// {base} = https://api-parceiro.sicredi.com.br/sb (sandbox) ou sem o /sb (producao).
//
// WEBHOOK (colecao "Webhook" do Sicredi, 13/10/2026): o boleto tem um CONTRATO
// de webhook por beneficiario — POST .../webhook/contrato/ cria, PUT
// .../contrato/{id} altera, GET .../contratos/?cooperativa=&posto=&beneficiario=
// consulta. O caminho MUDA entre ambientes (ver caminhosWebhookSicredi). O
// Sicredi chama a nossa URL a cada LIQUIDACAO; a rota que recebe NAO confia no
// corpo do aviso: confirma o pagamento em `liquidados/dia` antes de dar baixa.
// A consulta diaria (cron) continua como rede de seguranca.
//
// CREDENCIAIS: so no servidor, por variavel de ambiente (SICREDI_*), nunca em
// tabela nem no navegador. A leitura do retorno aceita mais de um nome de campo.
import {
  BasePaymentGateway,
  type CobrancaEmitida,
  type CobrancaInput,
  type EventoPagamento,
  type ProvedorBanco,
} from './types';

export type AmbienteSicredi = 'sandbox' | 'producao';

export interface SicrediConfig {
  ambiente: AmbienteSicredi;
  apiKey: string;
  username: string;
  password: string;
  cooperativa: string;
  posto: string;
  codigoBeneficiario: string;
  /** Opcional: troca o host (ex.: homologacao). Sem barra final. */
  apiBase?: string | null;
}

/** Nomes das variaveis de ambiente (os VALORES vivem no .env do VPS). */
export const ENV_SICREDI = {
  ambiente: 'SICREDI_AMBIENTE',
  apiKey: 'SICREDI_API_KEY',
  username: 'SICREDI_USERNAME',
  password: 'SICREDI_PASSWORD',
  cooperativa: 'SICREDI_COOPERATIVA',
  posto: 'SICREDI_POSTO',
  codigoBeneficiario: 'SICREDI_CODIGO_BENEFICIARIO',
  apiBase: 'SICREDI_API_BASE',
  /** Segredo na URL do webhook (o Sicredi nao assina o aviso). */
  webhookSecret: 'SICREDI_WEBHOOK_SECRET',
} as const;

const OBRIGATORIAS = ['apiKey', 'username', 'password', 'cooperativa', 'posto', 'codigoBeneficiario'] as const;

type Env = Record<string, string | undefined>;

/** Quais variaveis obrigatorias faltam (so os NOMES — nunca devolve valor). */
export function variaveisSicrediFaltando(env: Env): string[] {
  return OBRIGATORIAS.filter((k) => !env[ENV_SICREDI[k]]?.trim()).map((k) => ENV_SICREDI[k]);
}

/** Config a partir do ambiente; null quando falta alguma obrigatoria. */
export function configSicrediDoAmbiente(env: Env): SicrediConfig | null {
  if (variaveisSicrediFaltando(env).length > 0) return null;
  const v = (k: keyof typeof ENV_SICREDI) => (env[ENV_SICREDI[k]] ?? '').trim();
  return {
    // Qualquer coisa diferente de "producao" e sandbox: errar para o lado sem dinheiro.
    ambiente: v('ambiente').toLowerCase() === 'producao' ? 'producao' : 'sandbox',
    apiKey: v('apiKey'),
    username: v('username'),
    password: v('password'),
    cooperativa: v('cooperativa'),
    posto: v('posto'),
    codigoBeneficiario: v('codigoBeneficiario'),
    apiBase: v('apiBase') || null,
  };
}

export function urlBaseSicredi(cfg: Pick<SicrediConfig, 'ambiente' | 'apiBase'>): string {
  if (cfg.apiBase) return cfg.apiBase.replace(/\/+$/, '');
  return cfg.ambiente === 'producao' ? 'https://api-parceiro.sicredi.com.br' : 'https://api-parceiro.sicredi.com.br/sb';
}

const soDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/**
 * `seuNumero` do Sicredi tem no maximo 10 caracteres; o titulo e um UUID.
 * Usamos os 10 primeiros hex (sem hifen, maiusculo). A correlacao forte e o
 * NOSSO NUMERO que o banco devolve e fica em titulos_financeiros.nosso_numero;
 * o seuNumero e so a referencia impressa no boleto.
 */
export function seuNumeroDoTitulo(tituloId: string): string {
  return tituloId.replace(/[^0-9a-fA-F]/g, '').slice(0, 10).toUpperCase();
}

/** 'YYYY-MM-DD' -> 'DD/MM/YYYY' (formato do liquidados/dia). */
export function dataSicredi(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** 'DD/MM/YYYY' ou 'YYYY-MM-DD[...]' -> 'YYYY-MM-DD'; outro formato -> null. */
export function dataIsoDeSicredi(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

const corta = (s: string, n: number) => s.trim().replace(/\s+/g, ' ').slice(0, n);

export interface BoletoSicredi {
  codigoBeneficiario: string;
  dataVencimento: string;
  especieDocumento: 'DUPLICATA_MERCANTIL_INDICACAO';
  tipoCobranca: 'HIBRIDO';
  seuNumero: string;
  valor: number;
  pagador: {
    tipoPessoa: 'PESSOA_FISICA' | 'PESSOA_JURIDICA';
    documento: string;
    nome: string;
    endereco: string;
    cidade: string;
    uf: string;
    cep: string;
    email?: string;
    telefone?: string;
  };
  informativos?: string[];
}

/**
 * Monta o corpo do cadastro. Devolve os ERROS em vez de mandar ao banco algo
 * que ele vai recusar (o Sicredi exige endereco completo do pagador).
 */
export function corpoBoletoSicredi(
  c: CobrancaInput,
  codigoBeneficiario: string,
): { corpo: BoletoSicredi | null; erros: string[] } {
  const erros: string[] = [];
  const doc = soDigitos(c.pagador.cpf_cnpj);
  if (doc.length !== 11 && doc.length !== 14) erros.push('CPF/CNPJ do pagador invalido');
  if (!c.pagador.nome?.trim()) erros.push('Nome do pagador vazio');
  const e = c.pagador.endereco ?? {};
  const cep = soDigitos(e.cep);
  if (cep.length !== 8) erros.push('CEP do pagador ausente ou invalido');
  if (!e.logradouro?.trim()) erros.push('Logradouro do pagador ausente');
  if (!e.cidade?.trim()) erros.push('Cidade do pagador ausente');
  const uf = (e.uf ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf)) erros.push('UF do pagador ausente');
  if (!(c.valor > 0)) erros.push('Valor deve ser maior que zero');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.vencimento)) erros.push('Vencimento invalido');
  if (erros.length) return { corpo: null, erros };

  const endereco = [e.logradouro, e.numero, e.complemento, e.bairro].filter((x) => x && String(x).trim()).join(', ');
  const tel = soDigitos(c.pagador.telefone);
  const corpo: BoletoSicredi = {
    codigoBeneficiario,
    dataVencimento: c.vencimento,
    especieDocumento: 'DUPLICATA_MERCANTIL_INDICACAO',
    tipoCobranca: 'HIBRIDO',
    seuNumero: seuNumeroDoTitulo(c.titulo_id),
    valor: Math.round(c.valor * 100) / 100,
    pagador: {
      tipoPessoa: doc.length === 14 ? 'PESSOA_JURIDICA' : 'PESSOA_FISICA',
      documento: doc,
      nome: corta(c.pagador.nome, 40),
      endereco: corta(endereco, 40),
      cidade: corta(e.cidade!, 25),
      uf,
      cep,
      ...(c.pagador.email ? { email: c.pagador.email.trim() } : {}),
      ...(tel ? { telefone: tel } : {}),
    },
  };
  if (c.descricao?.trim()) corpo.informativos = [corta(c.descricao, 80)];
  return { corpo, erros };
}

/** Primeiro campo string/numero nao vazio entre os nomes candidatos. */
function campo(o: Record<string, unknown>, ...nomes: string[]): string | null {
  for (const n of nomes) {
    const v = o[n];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return null;
}

/** Resposta do cadastro/consulta -> CobrancaEmitida (tolerante ao nome do campo). */
export function emitidaDoRetornoSicredi(tituloId: string, resp: unknown): CobrancaEmitida {
  const o = (resp && typeof resp === 'object' ? resp : {}) as Record<string, unknown>;
  const nossoNumero = campo(o, 'nossoNumero', 'nosso_numero');
  return {
    titulo_id: tituloId,
    // O Sicredi identifica o titulo pelo nosso numero; txid e o do PIX.
    gateway_transacao_id: nossoNumero ?? campo(o, 'txid'),
    nosso_numero: nossoNumero,
    linha_digitavel: campo(o, 'linhaDigitavel', 'linha_digitavel'),
    pix_copia_cola: campo(o, 'qrCode', 'pixCopiaECola', 'emv'),
    retorno: resp,
  };
}

export interface LiquidacaoSicredi {
  nossoNumero: string | null;
  seuNumero: string | null;
  valorPago: number | null;
  dataPagamento: string | null;
  bruto: unknown;
}

/** Resposta de `liquidados/dia` -> lista normalizada (aceita array, {items}, {content}). */
export function liquidacoesDoRetorno(resp: unknown): LiquidacaoSicredi[] {
  const r = resp as Record<string, unknown> | unknown[] | null;
  const lista: unknown[] = Array.isArray(r)
    ? r
    : r && typeof r === 'object'
      ? ((['items', 'content', 'boletos', 'liquidacoes', 'data'] as const)
          .map((k) => (r as Record<string, unknown>)[k])
          .find(Array.isArray) as unknown[] | undefined) ?? []
      : [];
  return lista.map((it) => {
    const o = (it ?? {}) as Record<string, unknown>;
    const valor = campo(o, 'valorLiquidado', 'valorPago', 'valor');
    return {
      nossoNumero: campo(o, 'nossoNumero'),
      seuNumero: campo(o, 'seuNumero'),
      valorPago: valor != null && !Number.isNaN(Number(valor)) ? Number(valor) : null,
      dataPagamento: dataIsoDeSicredi(campo(o, 'dataPagamento', 'dataLiquidacao', 'dataCredito')),
      bruto: it,
    };
  });
}

// ---------------------------------------------------------------------------
// Webhook (contrato + aviso)
// ---------------------------------------------------------------------------

/** O caminho do contrato muda entre sandbox e producao (esta na colecao). */
export function caminhosWebhookSicredi(ambiente: AmbienteSicredi): { contrato: string; contratos: string } {
  return ambiente === 'producao'
    ? { contrato: '/cobranca/boleto/v1/webhook/contrato/', contratos: '/cobranca/boleto/v1/webhook/contratos/' }
    : { contrato: '/cobranca/webhook/v1/api/contrato/', contratos: '/cobranca/webhook/v1/api/contratos/' };
}

export interface DadosContratoWebhook {
  url: string;
  nomeResponsavel: string;
  email: string;
  telefone?: string | null;
}

export interface ContratoWebhookSicredi {
  cooperativa: string;
  posto: string;
  codBeneficiario: string;
  eventos: ['LIQUIDACAO'];
  url: string;
  urlStatus: 'ATIVO';
  contratoStatus: 'ATIVO';
  nomeResponsavel: string;
  email: string;
  telefone: string;
}

/** Corpo do contrato; devolve os ERROS em vez de mandar ao banco algo recusavel. */
export function corpoContratoWebhook(
  cfg: Pick<SicrediConfig, 'cooperativa' | 'posto' | 'codigoBeneficiario'>,
  d: DadosContratoWebhook,
): { corpo: ContratoWebhookSicredi | null; erros: string[] } {
  const erros: string[] = [];
  if (!/^https:\/\/[^\s/]+\/\S+$/.test(d.url ?? '')) erros.push('URL do webhook tem de ser https');
  if (!d.nomeResponsavel?.trim()) erros.push('Informe o nome do responsavel');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email?.trim() ?? '')) erros.push('E-mail do responsavel invalido');
  if (erros.length) return { corpo: null, erros };
  return {
    corpo: {
      cooperativa: cfg.cooperativa,
      posto: cfg.posto,
      codBeneficiario: cfg.codigoBeneficiario,
      eventos: ['LIQUIDACAO'],
      url: d.url,
      urlStatus: 'ATIVO',
      contratoStatus: 'ATIVO',
      nomeResponsavel: corta(d.nomeResponsavel, 60),
      email: d.email.trim(),
      telefone: soDigitos(d.telefone),
    },
    erros,
  };
}

/** Id do contrato na resposta da consulta (lista, {items}, {content} ou objeto). */
export function idContratoWebhook(resp: unknown): string | null {
  const r = resp as Record<string, unknown> | unknown[] | null;
  const lista: unknown[] = Array.isArray(r)
    ? r
    : r && typeof r === 'object'
      ? ((['items', 'content', 'contratos', 'data'] as const)
          .map((k) => (r as Record<string, unknown>)[k])
          .find(Array.isArray) as unknown[] | undefined) ?? [r]
      : [];
  for (const it of lista) {
    const o = (it ?? {}) as Record<string, unknown>;
    const id = campo(o, 'id', 'idContrato', '_id');
    if (id) return id;
  }
  return null;
}

export interface AvisoWebhookSicredi {
  nossoNumero: string;
  movimento: string | null;
  data: string | null;
  estorno: boolean;
}

/**
 * Corpo do aviso -> lista de boletos citados. O formato do aviso nao esta na
 * colecao: le por nomes candidatos, aceita objeto, lista ou {eventos:[...]}.
 * Serve so para saber QUAL boleto olhar — o valor e a data que entram na
 * baixa saem da confirmacao em `liquidados/dia`, nunca daqui.
 */
export function avisosDoWebhook(payload: unknown): AvisoWebhookSicredi[] {
  const r = payload as Record<string, unknown> | unknown[] | null;
  const lista: unknown[] = Array.isArray(r)
    ? r
    : r && typeof r === 'object'
      ? ((['eventos', 'items', 'content', 'data'] as const)
          .map((k) => (r as Record<string, unknown>)[k])
          .find(Array.isArray) as unknown[] | undefined) ?? [r]
      : [];
  const out: AvisoWebhookSicredi[] = [];
  const vistos = new Set<string>();
  for (const it of lista) {
    const o = (it ?? {}) as Record<string, unknown>;
    const nn = campo(o, 'nossoNumero', 'nosso_numero');
    if (!nn || vistos.has(nn)) continue;
    vistos.add(nn);
    const mov = campo(o, 'movimento', 'evento', 'tipoEvento', 'tipo');
    const dataBruta = o.dataEvento ?? o.dataPagamento ?? o.dataLiquidacao;
    const data = dataIsoDeSicredi(Array.isArray(dataBruta) ? null : dataBruta);
    out.push({ nossoNumero: nn, movimento: mov, data, estorno: /ESTORNO/i.test(mov ?? '') });
  }
  return out;
}

/** Tira o segredo de um texto antes de mostrar na tela ou no log. */
export function mascararSegredo(texto: string, segredo: string | null | undefined): string {
  return segredo && segredo.length >= 8 ? texto.split(segredo).join('***') : texto;
}

export const PAGINAS_MAX_LIQUIDADOS = 50;

/** O banco diz que ha mais paginas? (`hasNext`/`hasNextPage`/`proximaPagina`) */
export function temProximaPagina(resp: unknown): boolean {
  if (!resp || typeof resp !== 'object' || Array.isArray(resp)) return false;
  const o = resp as Record<string, unknown>;
  return o.hasNext === true || o.hasNextPage === true || o.proximaPagina === true;
}

/** Mensagem legivel do erro do banco — leva o corpo da recusa, nunca so o HTTP. */
export function mensagemErroSicredi(status: number, corpo: unknown): string {
  const o = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>;
  const msg =
    campo(o, 'message', 'mensagem', 'error_description', 'detail', 'error') ??
    (typeof corpo === 'string' ? corpo.slice(0, 300) : null);
  return `Sicredi HTTP ${status}${msg ? `: ${msg}` : ''}`;
}

// ---------------------------------------------------------------------------
// Token (cache em memoria do processo; o JWT do Sicredi vale ~1h)
// ---------------------------------------------------------------------------
interface TokenCache {
  accessToken: string;
  refreshToken: string | null;
  expiraEm: number;
}
const cacheToken = new Map<string, TokenCache>();

/** Visivel para teste: limpa o cache. */
export function limparCacheTokenSicredi() {
  cacheToken.clear();
}

type Fetch = typeof fetch;

export class SicrediGateway extends BasePaymentGateway {
  readonly provedor: ProvedorBanco = 'SICREDI';
  private readonly cfg: SicrediConfig;
  private readonly http: Fetch;
  private readonly agora: () => number;

  constructor(cfg: SicrediConfig, http: Fetch = fetch, agora: () => number = Date.now) {
    super();
    this.cfg = cfg;
    this.http = http;
    this.agora = agora;
  }

  get ambiente(): AmbienteSicredi {
    return this.cfg.ambiente;
  }

  private get base() {
    return urlBaseSicredi(this.cfg);
  }

  private chaveCache() {
    return `${this.base}|${this.cfg.username}|${this.cfg.cooperativa}`;
  }

  private async pedirToken(form: Record<string, string>): Promise<TokenCache> {
    const res = await this.http(`${this.base}/auth/openapi/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-api-key': this.cfg.apiKey,
        context: 'COBRANCA',
      },
      body: new URLSearchParams(form).toString(),
      cache: 'no-store',
    });
    const corpo = await lerCorpo(res);
    if (!res.ok) throw new Error(mensagemErroSicredi(res.status, corpo));
    const o = (corpo ?? {}) as Record<string, unknown>;
    const access = typeof o.access_token === 'string' ? o.access_token : null;
    if (!access) throw new Error('Sicredi: resposta de autenticacao sem access_token');
    const expiresIn = Number(o.expires_in) > 0 ? Number(o.expires_in) : 300;
    return {
      accessToken: access,
      refreshToken: typeof o.refresh_token === 'string' ? o.refresh_token : null,
      // Renova 60 s antes de vencer.
      expiraEm: this.agora() + Math.max(expiresIn - 60, 30) * 1000,
    };
  }

  /** Token valido (cache -> refresh -> senha). */
  async token(): Promise<string> {
    const chave = this.chaveCache();
    const atual = cacheToken.get(chave);
    if (atual && atual.expiraEm > this.agora()) return atual.accessToken;

    let novo: TokenCache | null = null;
    if (atual?.refreshToken) {
      try {
        novo = await this.pedirToken({ grant_type: 'refresh_token', refresh_token: atual.refreshToken, scope: 'cobranca' });
      } catch {
        novo = null; // refresh vencido: cai na senha
      }
    }
    if (!novo) {
      const form: Record<string, string> = {
        username: this.cfg.username,
        password: this.cfg.password,
        scope: 'cobranca',
        grant_type: 'password',
      };
      // O sandbox pede estes tres no form (esta na colecao); producao ignora.
      if (this.cfg.ambiente === 'sandbox') {
        form.cooperativa = this.cfg.cooperativa;
        form.posto = this.cfg.posto;
        form.codigoBeneficiario = this.cfg.codigoBeneficiario;
      }
      novo = await this.pedirToken(form);
    }
    cacheToken.set(chave, novo);
    return novo.accessToken;
  }

  private async chamar(
    metodo: 'GET' | 'POST' | 'PATCH' | 'PUT',
    caminho: string,
    corpo?: unknown,
    extras: Record<string, string> = {},
  ): Promise<Response> {
    const token = await this.token();
    return this.http(`${this.base}${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        'x-api-key': this.cfg.apiKey,
        cooperativa: this.cfg.cooperativa,
        posto: this.cfg.posto,
        ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...extras,
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      cache: 'no-store',
    });
  }

  private async json(metodo: 'GET' | 'POST' | 'PATCH' | 'PUT', caminho: string, corpo?: unknown, extras?: Record<string, string>) {
    const res = await this.chamar(metodo, caminho, corpo, extras);
    const dado = await lerCorpo(res);
    if (!res.ok) throw new Error(mensagemErroSicredi(res.status, dado));
    return dado;
  }

  async emitir(c: CobrancaInput): Promise<CobrancaEmitida> {
    const { corpo, erros } = corpoBoletoSicredi(c, this.cfg.codigoBeneficiario);
    if (!corpo) return { titulo_id: c.titulo_id, erro: erros.join('; ') };
    const resp = await this.json('POST', '/cobranca/boleto/v1/boletos', corpo);
    return emitidaDoRetornoSicredi(c.titulo_id, resp);
  }

  /** `gatewayTransacaoId` = nosso numero. */
  async consultar(nossoNumero: string): Promise<CobrancaEmitida> {
    const q = new URLSearchParams({ codigoBeneficiario: this.cfg.codigoBeneficiario, nossoNumero });
    const resp = await this.json('GET', `/cobranca/boleto/v1/boletos?${q}`);
    return emitidaDoRetornoSicredi('', resp);
  }

  /** Pedido de BAIXA do titulo no banco. */
  async cancelar(nossoNumero: string): Promise<void> {
    await this.json('PATCH', `/cobranca/boleto/v1/boletos/${encodeURIComponent(nossoNumero)}/baixa`, {}, {
      codigoBeneficiario: this.cfg.codigoBeneficiario,
    });
  }

  /** PDF do boleto (bytes). */
  async pdf(linhaDigitavel: string): Promise<ArrayBuffer> {
    const q = new URLSearchParams({ linhaDigitavel: soDigitos(linhaDigitavel) });
    const res = await this.chamar('GET', `/cobranca/boleto/v1/boletos/pdf?${q}`);
    if (!res.ok) throw new Error(mensagemErroSicredi(res.status, await lerCorpo(res)));
    return res.arrayBuffer();
  }

  /**
   * Boletos pagos num dia ('YYYY-MM-DD'). Base da baixa automatica.
   * Percorre as paginas enquanto o banco disser que ha proxima (`hasNext`),
   * com teto de PAGINAS_MAX para nunca virar laco infinito.
   */
  async liquidadosDoDia(dia: string): Promise<LiquidacaoSicredi[]> {
    const todos: LiquidacaoSicredi[] = [];
    const vistos = new Set<string>();
    for (let pagina = 0; pagina < PAGINAS_MAX_LIQUIDADOS; pagina++) {
      const q = new URLSearchParams({ codigoBeneficiario: this.cfg.codigoBeneficiario, dia: dataSicredi(dia) });
      if (pagina > 0) q.set('pagina', String(pagina));
      const resp = await this.json('GET', `/cobranca/boleto/v1/boletos/liquidados/dia?${q}`);
      let novos = 0;
      for (const l of liquidacoesDoRetorno(resp)) {
        const chave = `${l.nossoNumero}|${l.dataPagamento}|${l.valorPago}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        todos.push(l);
        novos++;
      }
      if (!temProximaPagina(resp) || novos === 0) break;
    }
    return todos;
  }

  /** Contrato(s) de webhook do beneficiario. */
  async consultarContratosWebhook(): Promise<unknown> {
    const q = new URLSearchParams({
      cooperativa: this.cfg.cooperativa,
      posto: this.cfg.posto,
      beneficiario: this.cfg.codigoBeneficiario,
    });
    return this.json('GET', `${caminhosWebhookSicredi(this.cfg.ambiente).contratos}?${q}`);
  }

  /** Cria o contrato; com `id`, altera o existente (PUT). */
  async salvarContratoWebhook(d: DadosContratoWebhook, id?: string | null): Promise<unknown> {
    const { corpo, erros } = corpoContratoWebhook(this.cfg, d);
    if (!corpo) throw new Error(erros.join('; '));
    const base = caminhosWebhookSicredi(this.cfg.ambiente).contrato;
    return id
      ? this.json('PUT', `${base}${encodeURIComponent(id)}`, corpo)
      : this.json('POST', base, corpo);
  }

  // A baixa nao usa o corpo do aviso (ver avisosDoWebhook): confirma em liquidadosDoDia().
  parseWebhook(_payload: unknown): EventoPagamento {
    return { tipo: 'DESCONHECIDO' };
  }
}

async function lerCorpo(res: Response): Promise<unknown> {
  const texto = await res.text();
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}
