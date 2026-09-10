// ============================================================================
// Integracao com o MUTUAL (sistema atual) — LOGICA PURA, espelhada dos
// contratos lidos em docs/modulos/integracao-mutual.md.
//
// FASE 1: so leitura e diagnostico. Nada aqui escreve em clientes/veiculos/
// titulos_financeiros — o destino desta fase e a area de captura (0062).
//
// Tudo o que decide (de-para de status, fuso, vazio->NULL, o que e mensalidade)
// mora AQUI e tem teste. A tela nao decide nada.
// ============================================================================

import type { StatusVeiculo, TipoPessoa, StatusTitulo } from '@/lib/database.types';

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------
/** As entidades que a Fase 1 captura. Softruck/Zelo/Apoio/SplitRisk ficaram de
 *  fora por decisao do usuario: a associacao nao tem parceria com elas. */
export const ENTIDADES_MUTUAL = {
  CONTRACT_OBJECT: '/contract/contract_object/nested/',
  // Medido em producao (09/09/2026): no objeto, `due_day` veio vazio em 2.497 de
  // 2.497 e `regional` em 100% — os dois campos existem no contrato TAMBEM, e e
  // de la que eles precisam sair.
  CONTRACT: '/contract/',
  PERSON: '/person/',
  ADDRESS: '/core/address/',
  INVOICE: '/invoice/',
  EVENT: '/event/',
  REGIONAL: '/association/regional/',
  CONSULTANT: '/association/consultant/',
  VEHICLE_TYPE: '/vehicle/type/',
  VEHICLE_COLOR: '/vehicle/color/',
  VEHICLE_CATEGORY: '/vehicle/category/',
  VEHICLE_USE_TYPE: '/vehicle/use_type/',
  EVENT_TYPE: '/event/event_type/',
} as const;

export type EntidadeMutual = keyof typeof ENTIDADES_MUTUAL;

/** Quais entidades aceitam `updated_at__gte` (medido no swagger, 09/09/2026). */
export const ENTIDADES_INCREMENTAIS: EntidadeMutual[] = ['CONTRACT_OBJECT', 'CONTRACT', 'INVOICE'];

/** Quais paginam com `page`/`page_size`. PERSON e EVENT nao declaram. */
export const ENTIDADES_PAGINADAS: EntidadeMutual[] = ['CONTRACT_OBJECT', 'CONTRACT', 'INVOICE', 'ADDRESS'];

/**
 * Monta a URL da API do Mutual.
 *
 * A BARRA FINAL E OBRIGATORIA: a API e Django com APPEND_SLASH e devolve 301
 * sem ela. Em ~13 mil registros paginados, deixar o cliente depender do
 * redirecionamento e uma ida e volta extra por pagina — e um 301 em POST pode
 * virar GET e perder o corpo.
 */
export function urlMutual(
  base: string,
  entidade: EntidadeMutual,
  params: Record<string, string | number | undefined | null> = {},
): string {
  const raiz = base.replace(/\/+$/, '');
  const caminho = ENTIDADES_MUTUAL[entidade];
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const query = qs.toString();
  return `${raiz}/public_api/v2${caminho}${query ? `?${query}` : ''}`;
}

/** O contrato manda literalmente `Authorization: Bearer <TOKEN>`. */
export function cabecalhoMutual(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
}

// ---------------------------------------------------------------------------
// Envelope de resposta
// ---------------------------------------------------------------------------
type Registro = Record<string, unknown>;

/** DRF devolve `{count, next, previous, results}`; alguns endpoints devolvem o
 *  array cru. Aceita os dois sem a tela precisar saber qual e qual. */
export function extrairLista(json: unknown): Registro[] {
  if (Array.isArray(json)) return json as Registro[];
  if (json && typeof json === 'object') {
    const r = (json as { results?: unknown }).results;
    if (Array.isArray(r)) return r as Registro[];
  }
  return [];
}

/** Total declarado pelo servidor (`count`), quando houver. */
export function extrairTotal(json: unknown): number | null {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const c = (json as { count?: unknown }).count;
    if (typeof c === 'number') return c;
  }
  return null;
}

/** Ha proxima pagina? `next` do DRF, ou pagina cheia quando nao ha envelope. */
export function temProximaPagina(json: unknown, tamanhoPagina: number): boolean {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const n = (json as { next?: unknown }).next;
    if (n !== undefined) return Boolean(n);
  }
  return extrairLista(json).length >= tamanhoPagina;
}

// ---------------------------------------------------------------------------
// Normalizacao de valores
// ---------------------------------------------------------------------------
/**
 * Campo vazio vira NULL, nunca ''.
 * `veiculos.chassi` e `veiculos.renavam` sao UNIQUE NULAVEIS: duas linhas com
 * string vazia COLIDEM. Foi exatamente o que mordeu em `fornecedores.documento`
 * (0051) — aqui seria em escala de milhares.
 */
export function textoOuNulo(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** Decimal do Mutual vem como string ("1234.56"). Vazio/invalido -> null. */
export function numeroOuNulo(v: unknown): number | null {
  const s = textoOuNulo(v);
  if (s === null) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * ISO-8601 UTC -> data local (YYYY-MM-DD).
 *
 * O Mutual devolve `2019-08-24T14:15:22Z`; `eventos_sinistro.data_ocorrencia` e
 * `veiculos.data_ativacao` sao `date`. Cortar a string em 10 caracteres joga o
 * evento das 21h para o dia SEGUINTE — erro silencioso e classico de
 * importacao. Aqui a conversao de fuso acontece ANTES do corte.
 */
export function dataLocalDeIso(
  iso: unknown,
  fuso = 'America/Sao_Paulo',
): string | null {
  const s = textoOuNulo(iso);
  if (s === null) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  const ano = get('year'), mes = get('month'), dia = get('day');
  return ano && mes && dia ? `${ano}-${mes}-${dia}` : null;
}

// ---------------------------------------------------------------------------
// De-para de vocabulario
// ---------------------------------------------------------------------------
/** `person_type` vem "1"/"2", nao PF/PJ. */
export function tipoPessoaMutual(v: unknown): TipoPessoa | null {
  const s = textoOuNulo(v);
  if (s === '1') return 'PF';
  if (s === '2') return 'PJ';
  return null;
}

/** Vocabulario do FUNIL DE VENDA: venda nova nasce no SCar, nao se importa. */
const FUNIL_DE_VENDA = new Set([
  'CRIADO', 'GERADO_PENDENCIA', 'AGUARDANDO_ACEITE', 'PENDENTE_ANALISE', 'AUTORIZADO',
  'LINK_PAGAMENTO_ENVIADO', 'PAGAMENTO_GERADO', 'PENDENTE', 'NEGOCIACAO_PERDIDA', 'REATIVACAO',
]);

export function ehFunilDeVenda(status: unknown): boolean {
  return FUNIL_DE_VENDA.has(textoOuNulo(status)?.toUpperCase() ?? '');
}

/** UMA palavra de status do Mutual -> status do SCar. `null` = nao reconhecida. */
export function statusDeTexto(status: unknown): StatusVeiculo | null {
  switch (textoOuNulo(status)?.toUpperCase()) {
    case 'ATIVO':
    // Inadimplencia no SCar e DERIVADA dos titulos em aberto (dias_atraso_cliente),
    // nao um status do cadastro — o veiculo segue ativo e a trava vem do financeiro.
    case 'INADIMPLENTE':
      return 'ativo';
    case 'SUSPENSO':
      return 'suspenso';
    case 'PENDENTE_VISTORIA':
      return 'vistoria_pendente';
    // Sinistro EM ANDAMENTO: o associado segue na casa e segue pagando.
    // `em_evento` entra em `veiculo_faturavel` (0024), e aqui isso e correto.
    case 'SINISTRADO':
      return 'em_evento';
    case 'INATIVO':
    case 'CANCELADO':
    case 'CANCELADO_PENDENCIA':
    case 'CANCELADO_TROCA_TITULARIDADE':
    case 'NEGADO':
    case 'RECUSADO':
    case 'EXPIRADO':
    case 'SUBSTITUIDO':
    case 'REMOVIDO':
    // Visto na base real e AUSENTE do enum do swagger: o contrato esta se
    // encerrando e o equipamento vai ser recolhido. O enum deles NAO e
    // exaustivo — por isso `mutual_status_nao_mapeados()` existe.
    case 'AGUARDADO A RETIRADA DO RASTREADOR':
    case 'INATIVO/PAGO':
    // DECISAO DO USUARIO (09/09/2026): indenizado NAO gera mensalidade. Estes
    // estavam em `em_evento`, que E faturavel — 26 veiculos ja indenizados
    // receberiam boleto todo mes.
    case 'INDENIZADO':
    case 'INDENIZACAO':
    case 'INDENIZAÇAO':
    case 'INDENIZAÇÃO':
      return 'inativo';
    default:
      return null;
  }
}

/** Quao VIVO e um status. Maior = mais vivo. Decide a disputa contrato x objeto. */
const VITALIDADE: Record<StatusVeiculo, number> = {
  ativo: 4, em_evento: 3, vistoria_pendente: 2, suspenso: 1, inativo: 0,
  baixado: 0, excluido: 0,
};

/**
 * O status do VEICULO — e nao o do associado.
 *
 * O contrato do Mutual guarda VARIOS veiculos, entao `contract_status` fala do
 * ASSOCIADO: ele fica ATIVO porque tem OUTRO carro, enquanto AQUELE veiculo
 * esta encerrado. Ate a 0070 lia-se so o contrato, e o veiculo morto entrava
 * como vivo — indo para os bloqueios de faturamento cobrar valor e dia de
 * vencimento que um contrato encerrado nao tem por que ter. Era isso que
 * inflava a quarentena.
 *
 * ⚠️ MAS O OBJETO SO PIORA. Contrato CANCELADO com objeto "ATIVO" e um veiculo
 * sem cobertura, nao um veiculo ativo. A regra nao e "o objeto vence": e
 * **vence o MENOS VIVO dos dois**.
 *
 * A ASSIMETRIA E DE PROPOSITO:
 *  . desconhecido no CONTRATO -> `null` (nao importar). Continua valendo a trava
 *    da 0063: vocabulario novo e DECISAO PENDENTE, e deixar o objeto resgatar a
 *    linha faria o veiculo entrar com classificacao adivinhada, em silencio —
 *    exatamente o que `mutual_status_nao_mapeados()` existe para impedir.
 *  . desconhecido no OBJETO -> sem opiniao, o contrato manda. O status do objeto
 *    e um REFINAMENTO (so estreita); refinamento ilegivel e nenhum.
 *
 * `null` significa NAO IMPORTAR: funil de venda (venda nova nasce no SCar) ou
 * vocabulario que ainda nao conhecemos.
 */
export function statusVeiculoDoContrato(
  contractStatus: unknown,
  objectStatus?: unknown,
): StatusVeiculo | null {
  // O funil e decisao ja tomada no CONTRATO — o objeto nao a reabre.
  if (ehFunilDeVenda(contractStatus)) return null;

  const doContrato = statusDeTexto(contractStatus);
  if (doContrato === null) return null;
  const doObjeto = statusDeTexto(objectStatus);
  if (doObjeto === null) return doContrato;
  return VITALIDADE[doObjeto] < VITALIDADE[doContrato] ? doObjeto : doContrato;
}

/** `invoice_status` (16 valores) -> `status_titulo` (4). */
export function statusTituloMutual(v: unknown): StatusTitulo {
  const s = textoOuNulo(v)?.toUpperCase() ?? '';
  if (s.startsWith('SUCCEEDED') || s === 'DISCOUNTED_REIMBURSEMENT') return 'pago';
  if (s === 'OVERDUE') return 'vencido';
  if (s.startsWith('CANCEL') || s === 'FAILED' || s === 'REFUNDED') return 'cancelado';
  return 'pendente'; // CREATED, PENDING, UPDATED
}

/**
 * `invoice_type` tem 20 valores e so tres sao MENSALIDADE.
 * Sem este filtro, adesao, comissao, repasse e multa de rastreador entrariam
 * como se fossem mensalidade e a inadimplencia mentiria.
 */
const TIPOS_MENSALIDADE = new Set([
  'MONTHLY_PAYMENT', 'PRO_RATA', 'ACCESSION_MONTHLY_PAYMENT',
]);
export function ehMensalidade(invoiceType: unknown): boolean {
  return TIPOS_MENSALIDADE.has(textoOuNulo(invoiceType)?.toUpperCase() ?? '');
}

// ---------------------------------------------------------------------------
// Quarentena — o que impede uma linha de entrar na base
// ---------------------------------------------------------------------------
export interface ObjetoMutual {
  contract_status?: unknown;
  status?: unknown;
  final_total_value?: unknown;
  due_day?: unknown;
  first_activation_date?: unknown;
  vehicle_data?: { vehicle_plate?: unknown; vehicle_chassi?: unknown; vehicle_renavam?: unknown } | null;
  person_data?: { person_cpf_cnpj?: unknown; person_name?: unknown } | null;
}

export type MotivoQuarentena =
  | 'PLACA_PENDENTE_0KM' | 'SEM_PLACA_NEM_CHASSI' | 'SEM_CPF' | 'SEM_NOME'
  | 'SEM_DATA_ATIVACAO' | 'SEM_VALOR_COBRADO' | 'SEM_DIA_VENCIMENTO';

export const ROTULO_QUARENTENA: Record<MotivoQuarentena, string> = {
  PLACA_PENDENTE_0KM: 'Veiculo 0 km — placa ainda nao emplacada',
  SEM_PLACA_NEM_CHASSI: 'Sem placa E sem chassi (nao ha como identificar o veiculo)',
  SEM_CPF: 'Associado sem CPF/CNPJ',
  SEM_NOME: 'Associado sem nome',
  SEM_DATA_ATIVACAO: 'Sem data de ativacao (viraria hoje)',
  SEM_VALOR_COBRADO: 'Sem valor cobrado (pararia de faturar em silencio)',
  SEM_DIA_VENCIMENTO: 'Sem dia de vencimento (cairia no padrao legado)',
};

/**
 * Motivo que e FILA OPERACIONAL, nao correcao de dado.
 *
 * O 0 km nao tem placa porque o carro ainda nao foi emplacado — cobrar isso da
 * origem nao resolve nada. Quem resolve e a operacao: o SAC exige a placa no
 * atendimento, ou um aviso automatico a cobra 30 dias depois da adesao.
 * Misturar com "sem CPF" (dado que a origem perdeu) esconde os dois.
 */
export function ehFilaOperacional(motivo: MotivoQuarentena): boolean {
  return motivo === 'PLACA_PENDENTE_0KM';
}

/**
 * Os impedimentos de uma linha, na ordem de gravidade.
 *
 * Vale so para o que SERIA importado: objeto em funil de venda
 * (`statusVeiculoDoContrato` = null) nao tem o que conferir.
 */
export function problemasDoObjeto(o: ObjetoMutual): MotivoQuarentena[] {
  if (statusVeiculoDoContrato(o.contract_status, o.status) === null) return [];
  const p: MotivoQuarentena[] = [];
  // Sem placa NAO e uma coisa so. Com chassi e 0 km (fila operacional); sem os
  // dois nao ha identidade nenhuma e ai sim nao ha o que importar.
  if (textoOuNulo(o.vehicle_data?.vehicle_plate) === null) {
    p.push(textoOuNulo(o.vehicle_data?.vehicle_chassi) === null
      ? 'SEM_PLACA_NEM_CHASSI'
      : 'PLACA_PENDENTE_0KM');
  }
  if (textoOuNulo(o.person_data?.person_cpf_cnpj) === null) p.push('SEM_CPF');
  if (textoOuNulo(o.person_data?.person_name) === null) p.push('SEM_NOME');
  if (dataLocalDeIso(o.first_activation_date) === null) p.push('SEM_DATA_ATIVACAO');
  // O ZERO tambem e problema: `valor_mensalidade_veiculo` (0024) so respeita o
  // override quando `> 0`, entao um veiculo de CORTESIA importado com 0 cairia
  // no `cotar_plano` e o associado que nunca pagou receberia boleto.
  const valor = numeroOuNulo(o.final_total_value);
  if (valor === null || valor <= 0) p.push('SEM_VALOR_COBRADO');
  if (textoOuNulo(o.due_day) === null) p.push('SEM_DIA_VENCIMENTO');
  return p;
}

/**
 * `contract_period` do Mutual -> meses.
 *
 * POR QUE ISTO IMPORTA: `veiculos.valor_mensalidade` (0024) e MENSAL, e o
 * Mutual cobra em periodos (a tela mostra "Semestral · 6 parcelas · parcela
 * R$ 120,00 · total R$ 720,00"). Se `final_total_value` for o TOTAL e a carga
 * gravar isso como mensalidade, o associado recebe boleto de 6x o que paga.
 * A conversao nao esta escrita aqui de proposito — primeiro os dados dizem se
 * o campo e a parcela ou o total (`mutual_periodicidade()`), depois a Fase 3
 * decide. Aqui so normalizamos o vocabulario.
 *
 * O contrato deles usa 12/6/3/1; a tela mostra o rotulo. Aceita os dois.
 */
export function mesesDoPeriodoMutual(valor: unknown): number | null {
  const t = textoOuNulo(valor == null ? null : String(valor));
  if (!t) return null;
  switch (t.toUpperCase()) {
    case '1': case 'MENSAL': return 1;
    case '3': case 'TRIMESTRAL': return 3;
    case '6': case 'SEMESTRAL': return 6;
    case '12': case 'ANUAL': return 12;
    default: return null;
  }
}

export const ROTULO_PERIODO_MUTUAL: Record<number, string> = {
  1: 'Mensal', 3: 'Trimestral', 6: 'Semestral', 12: 'Anual',
};
