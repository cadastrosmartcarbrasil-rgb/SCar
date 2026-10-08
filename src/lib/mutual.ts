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

import type {
  StatusVeiculo, TipoPessoa, StatusTitulo,
  EntidadeMutual as EntidadeMutualDoBanco,
} from '@/lib/database.types';
import { parseCategoriaSGA } from '@/lib/participacao';

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
  // 0083: a EQUIPE DE VENDAS e o nivel que corresponde a `regionais` do SCar.
  // O plano original a descartou ("nao existe no SCar") — decisao do usuario em
  // 20/09/2026 inverteu isso: `regionais` = equipe de vendas, e a macrorregiao
  // (REGIONAL) vira so agrupamento de leitura. Repare no singular `sale_team`.
  SALE_TEAM: '/association/sale_team/',
  CONSULTANT: '/association/consultant/',
  // O PLANO mora em `/quotation/plan/` — e isto estava escrito no
  // docs/modulos/integracao-mutual.md desde 09/09/2026 (swagger lido inteiro,
  // secao "As tabelas de dominio estao todas expostas"). A 0085 palpitou
  // `/contract/plan/` sem consultar o proprio repositorio, e o provador mediu
  // 404 nas 8 candidatas em 05/10/2026. LICAO: antes de chutar um caminho do
  // Mutual, `grep` no docs/ — o contrato inteiro ja foi lido uma vez.
  // Nenhum schema depende disto: o de-para funciona sem a captura (0083/0085).
  PLAN: '/quotation/plan/',
  VEHICLE_TYPE: '/vehicle/type/',
  VEHICLE_COLOR: '/vehicle/color/',
  VEHICLE_CATEGORY: '/vehicle/category/',
  VEHICLE_USE_TYPE: '/vehicle/use_type/',
  EVENT_TYPE: '/event/event_type/',
  // 0091: o que cada OBJETO (veiculo) contratou. Esta no swagger desde 09/09
  // (docs/modulos/integracao-mutual.md) e e a UNICA fonte de produto por
  // veiculo — o objeto, o contrato e a fatura nao trazem. E dela que sai o
  // plano da moto: com TERCEIROS -> Ouro, sem -> Essencial (regra do usuario).
  CONTRACT_OBJECT_PRODUCT: '/contract/contract_object_product/',
} as const;

export type EntidadeMutual = keyof typeof ENTIDADES_MUTUAL;

// 🔴 AFIRMACAO DE COMPILACAO: esta lista e a uniao `EntidadeMutual` de
// `database.types.ts` tem de ser a MESMA, nos dois sentidos. Sem isto, abrir
// uma entidade nova aqui e esquecer a uniao de la (ou o contrario) compila e
// so quebra na chamada — foi assim que a 0085 quase perdeu `CONTRACT` do
// `chk_mutual_entidade`. Se o tsc apontar aqui, falta sincronizar as tres
// copias: o CHECK do banco, a uniao de `database.types.ts` e este objeto.
type Igual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _entidadesSincronizadas: Igual<EntidadeMutual, EntidadeMutualDoBanco> = true;
void _entidadesSincronizadas;

/** Quais entidades aceitam `updated_at__gte` (medido no swagger, 09/09/2026). */
export const ENTIDADES_INCREMENTAIS: EntidadeMutual[] = ['CONTRACT_OBJECT', 'CONTRACT', 'INVOICE'];

/** Quais paginam com `page`/`page_size`. PERSON e EVENT nao declaram. */
export const ENTIDADES_PAGINADAS: EntidadeMutual[] = ['CONTRACT_OBJECT', 'CONTRACT', 'INVOICE', 'ADDRESS', 'CONTRACT_OBJECT_PRODUCT'];

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
  return urlMutualCaminho(base, ENTIDADES_MUTUAL[entidade], params);
}

/**
 * A mesma montagem, para um caminho que ainda NAO e uma entidade nossa.
 *
 * Existe por causa do provador de `/plan/` (ver `CANDIDATAS_PLANO`): sondar um
 * caminho candidato nao pode exigir abri-lo antes em `ENTIDADES_MUTUAL`, senao
 * a allow-list do banco (`chk_mutual_entidade`) e as tres copias dela entrariam
 * no caminho de uma simples pergunta. **A barra final continua obrigatoria** —
 * a API e Django com `APPEND_SLASH` e devolve 301 sem ela, e um 301 lido como
 * "nao existe" seria o mesmo palpite outra vez.
 */
export function urlMutualCaminho(
  base: string,
  caminho: string,
  params: Record<string, string | number | undefined | null> = {},
): string {
  const raiz = base.replace(/\/+$/, '');
  const rota = `/${caminho.replace(/^\/+/, '')}`.replace(/\/*$/, '/');
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const query = qs.toString();
  return `${raiz}/public_api/v2${rota}${query ? `?${query}` : ''}`;
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
// `inadimplente` (0072) empata com `suspenso`: os dois sao BLOQUEIO, nao baixa.
// Ele nao faz parte do vocabulario do Mutual — `INADIMPLENTE` de la continua
// virando `ativo` na importacao, porque e a inadimplencia apurada sobre os
// titulos DELES — entao esta linha existe para o mapa ser exaustivo, nao
// porque a disputa contrato x objeto chegue a ve-lo.
const VITALIDADE: Record<StatusVeiculo, number> = {
  ativo: 4, em_evento: 3, vistoria_pendente: 2, suspenso: 1, inadimplente: 1,
  inativo: 0, baixado: 0, excluido: 0,
};

/**
 * O status do VEICULO — e nao o do associado.
 *
 * O contrato do Mutual guarda VARIOS veiculos, entao `contract_status` fala do
 * ASSOCIADO: ele fica ATIVO porque tem OUTRO carro, enquanto AQUELE veiculo
 * esta encerrado. Ate a 0071 lia-se so o contrato, e o veiculo morto entrava
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
/**
 * Produto de TERCEIROS (0091) — e ele que separa o plano Ouro do Essencial da
 * moto. Espelho de `mutual_produto_terceiros`: mexeu num lado, mexa no outro.
 */
export function ehProdutoTerceiros(nome: string | null | undefined): boolean {
  if (!nome) return false;
  return nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().includes('TERCEIRO');
}

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

// ===========================================================================
// A UNIDADE PELO CONSULTOR (0073) — a corrente e o seu gargalo
// ===========================================================================
// `regional` veio vazio em 100%, e o que sobrou foi a corrente
//   objeto.consultant (CODIGO) -> /association/consultant/ -> vendedor -> unidade.
// Ela e boa porque o primeiro salto e um join EXATO (codigo, nao nome). Mas sao
// QUATRO saltos, e a unica leitura util de um funil de quatro degraus e ONDE
// ele quebra — o total final nao diz o que arrumar.

/** Candidatas para o documento do consultor. Existem para NAO chutar UMA. */
export const CHAVES_DOC_CONSULTOR = ['cpf_cnpj', 'cpf', 'document', 'documento', 'doc'];
export const CHAVES_EMAIL_CONSULTOR = ['email', 'e_mail', 'mail'];
export const CHAVES_NOME_CONSULTOR = ['name', 'nome', 'full_name', 'fantasy_name'];

export interface PassoFunil {
  passo: number;
  etapa: string;
  objetos: number;
  perdidos: number;
  detalhe?: string | null;
}

/**
 * O degrau que mais perde — o gargalo. E ele que decide o que fazer, nao o
 * percentual final: "faltam 800" nao e uma tarefa; "800 caem porque o consultor
 * nao tem CPF no cadastro deles" e.
 */
export function gargaloDoFunil(passos: PassoFunil[]): PassoFunil | null {
  const comPerda = passos.filter((p) => p.passo > 1 && p.perdidos > 0);
  if (comPerda.length === 0) return null;
  return comPerda.reduce((pior, p) => (p.perdidos > pior.perdidos ? p : pior));
}

/** Fracao que chega ao fim (0..1). Base = o primeiro degrau, nao o maior. */
export function coberturaDoFunil(passos: PassoFunil[]): number {
  const inicio = passos.find((p) => p.passo === 1)?.objetos ?? 0;
  if (inicio <= 0) return 0;
  const fim = passos.reduce((ult, p) => (p.passo > ult.passo ? p : ult), passos[0]);
  return fim.objetos / inicio;
}

/**
 * A tese so se sustenta se a cobertura for alta. O corte de 95% nao e mistico:
 * abaixo disso o resto vira trabalho manual por associado, e a essa altura o
 * de-para por NOME de equipe (poucas decisoes) custa menos que a corrente.
 */
export function teseDoConsultorSeSustenta(passos: PassoFunil[], minimo = 0.95): boolean {
  return teseSeSustenta(passos, minimo);
}

/**
 * A tese so se sustenta se a cobertura for alta. O corte de 95% nao e mistico:
 * abaixo disso o resto vira trabalho manual por associado.
 */
export function teseSeSustenta(passos: PassoFunil[], minimo = 0.95): boolean {
  return coberturaDoFunil(passos) >= minimo;
}

/**
 * A corrente NAO EXISTE nestes dados — distinto de "ela vaza".
 *
 * Vazamento e perda ao longo dos degraus e se trata enriquecendo cadastro;
 * corrente vazia e o primeiro salto morrer inteiro, e ai nao ha o que
 * enriquecer: o campo simplesmente nao vem. Foi o caso do `consultant`
 * (0 de 17.675 objetos, medido em 20/09/2026) e e o que impede alguem de
 * ler "0%" como "quase la".
 */
export function correnteVazia(passos: PassoFunil[]): boolean {
  const inicio = passos.find((p) => p.passo === 1)?.objetos ?? 0;
  const segundo = passos.find((p) => p.passo === 2);
  return inicio > 0 && segundo !== undefined && segundo.objetos === 0;
}

/** O estado do de-para de uma filial do Mutual. */
export type SituacaoDePara = 'vinculada' | 'palpite' | 'sem_correspondencia';

export interface FilialMutual {
  id_externo: string;
  nome: string | null;
  faturaveis: number;
  regional_id: string | null;
  palpite_id: string | null;
}

/**
 * 🔴 `palpite` NAO e `vinculada`. O casamento por CNPJ/nome acelera a decisao
 * de quem olha e NUNCA carrega carteira: `regional_id` atravessa RLS,
 * `escopo_regional()` e todos os paineis, e uma filial de milhares de
 * associados posta na unidade errada por homonimia e um estrago que ninguem
 * ve acontecer. Mesma postura do preco na 0081.
 */
export function situacaoDePara(f: FilialMutual): SituacaoDePara {
  if (f.regional_id) return 'vinculada';
  return f.palpite_id ? 'palpite' : 'sem_correspondencia';
}

/**
 * A fila do de-para, por VOLUME de carteira viva. Tratar a filial que mais
 * pesa resolve a maior parte da base com o menor numero de decisoes — a
 * mesma ordem que a fila de consultores (0073) e a de cores (0080) usam.
 */
export function filiaisPendentes(filiais: FilialMutual[]): FilialMutual[] {
  return filiais
    .filter((f) => !f.regional_id)
    .sort((a, b) => b.faturaveis - a.faturaveis || (a.nome ?? '').localeCompare(b.nome ?? ''));
}

/** Quantos veiculos faturaveis ainda dependem de uma decisao de de-para. */
export function carteiraSemDePara(filiais: FilialMutual[]): number {
  return filiaisPendentes(filiais).reduce((s, f) => s + f.faturaveis, 0);
}

// ===========================================================================
// 0083 — a EQUIPE DE VENDAS: o nivel do Mutual que vira `regionais` no SCar
// ===========================================================================

export interface EquipeVendas {
  id_externo: string;
  nome: string | null;
  macrorregiao: string | null;
  faturaveis: number;
  consultores: number;
  regional_id: string | null;
  capturada: boolean;
}

/**
 * A fila do agrupamento, por VOLUME de carteira viva — mesma ordem da fila de
 * filiais (0082), de consultores (0073) e de cores (0080): tratar a que mais
 * pesa resolve a maior parte da base com a menor decisao.
 */
export function equipesPendentes(equipes: EquipeVendas[]): EquipeVendas[] {
  return equipes
    .filter((e) => !e.regional_id)
    .sort((a, b) => b.faturaveis - a.faturaveis
      || (a.nome ?? a.id_externo).localeCompare(b.nome ?? b.id_externo));
}

/** Quantos veiculos faturaveis ainda dependem de uma decisao de agrupamento. */
export function carteiraSemAgrupamento(equipes: EquipeVendas[]): number {
  return equipesPendentes(equipes).reduce((s, e) => s + e.faturaveis, 0);
}

/**
 * 🔴 Equipe que aparece no CONTRATO e nao esta no cadastro: tem carteira e nao
 * tem nome. Ela nao pode sumir da tela — e justamente uma das que faltam
 * agrupar, e sem `/association/sale_team/` puxado ninguem sabe qual e.
 */
export function equipesSemNome(equipes: EquipeVendas[]): EquipeVendas[] {
  return equipes.filter((e) => !e.capturada && e.faturaveis > 0);
}

/**
 * As equipes agrupadas pela MACRORREGIAO do Mutual.
 *
 * A macrorregiao nao vira tabela no SCar (decisao do usuario: a rota de tres
 * niveis seria muita escrita). Mas ela e o que torna a duplicacao legivel na
 * tela — "estas sete sao todas do Sudeste" — entao serve como CABECALHO de
 * leitura, nunca como destino de carga.
 */
export function porMacrorregiao(
  equipes: EquipeVendas[],
): { macrorregiao: string; equipes: EquipeVendas[]; faturaveis: number }[] {
  const mapa = new Map<string, EquipeVendas[]>();
  for (const e of equipes) {
    const chave = e.macrorregiao ?? '(sem macrorregiao)';
    mapa.set(chave, [...(mapa.get(chave) ?? []), e]);
  }
  return [...mapa.entries()]
    .map(([macrorregiao, lista]) => ({
      macrorregiao,
      equipes: [...lista].sort((a, b) => b.faturaveis - a.faturaveis),
      faturaveis: lista.reduce((s, e) => s + e.faturaveis, 0),
    }))
    .sort((a, b) => b.faturaveis - a.faturaveis);
}

/**
 * Quantas equipes do Mutual ja foram agrupadas em cada regional do SCar.
 * E a leitura que confirma a consolidacao: "7 equipes viraram 2 unidades".
 */
export function consolidacao(equipes: EquipeVendas[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const e of equipes) {
    if (e.regional_id) mapa.set(e.regional_id, (mapa.get(e.regional_id) ?? 0) + 1);
  }
  return mapa;
}

// ============================================================================
// 0084 — A CARGA
// ============================================================================
// Estes tres saneadores sao ESPELHO EXATO de `mutual_placa`, `mutual_chassi` e
// `mutual_renavam` (0084). Eles vivem aqui para a tela poder dizer, ANTES de
// consultar, o que o banco vai gravar — e por isso: mexeu num lado, mexa no
// outro e nos dois testes (mesma escolha da maquina de estados do rastreador,
// 0050, e do de-para de status do Mutual).

/**
 * A placa como o SCar guarda: alfanumerico em caixa alta, no padrao de 7
 * (ABC1234 antigo ou ABC1D23 Mercosul). Fora do padrao devolve `null`, e a
 * linha e recusada — `veiculos.placa` e `not null unique`, entao inventar
 * placa cria registro que ninguem acha e que colide quando a real chegar.
 */
export function placaMutual(valor?: string | null): string | null {
  const limpo = (valor ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(limpo) ? limpo : null;
}

/** Chassi com 17 alfanumericos ou `null`. Vazio NUNCA vira `''` (unique). */
export function chassiMutual(valor?: string | null): string | null {
  const limpo = (valor ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return /^[A-Z0-9]{17}$/.test(limpo) ? limpo : null;
}

/**
 * Renavam com 9 a 11 digitos, nunca so zeros, ou `null`.
 *
 * O placeholder da base legada ("0", "000000000000", e ate "2012", o ano no
 * campo errado) e o que criava as 4 colisoes de unique medidas na matriz.
 * Placeholder nao e dado: e ausencia escrita com confianca.
 */
export function renavamMutual(valor?: string | null): string | null {
  const so = (valor ?? '').replace(/\D/g, '');
  return /^[0-9]{9,11}$/.test(so) && !/^0+$/.test(so) ? so : null;
}

export interface LinhaCarga {
  acao: 'CRIAR' | 'ATUALIZAR' | 'RECUSADO';
  problema: string | null;
  id_pessoa: string | null;
  valor_mensalidade: number | null;
  dia_vencimento: number | null;
  tipo_veiculo_id: string | null;
  plano_id: string | null;
  ativacao_estimada: boolean;
}

/**
 * Quantas linhas da fila cada chamada grava (0094). Medido em producao: ~13 ms
 * por veiculo (os gatilhos do cadastro). 200 linhas sao ~2,6 s — folga larga
 * para o teto de 8 s do papel `authenticated`, mesmo com o banco ocupado.
 */
export const LOTE_CARGA = 200;

/** O resultado de UMA chamada de `mutual_executar_carga`. */
export type ResultadoBlocoCarga = {
  clientes_criados: number;
  clientes_atualizados: number;
  veiculos_criados: number;
  veiculos_atualizados: number;
  recusados: number;
  restantes: number;
  mensagem: string;
};

/**
 * A carga em blocos (0094) devolve um resultado POR CHAMADA; a tela mostra a
 * soma. `recusados` vem so do preparo (as chamadas seguintes devolvem 0, e
 * somar repetiria nada — mas pegar o MAIOR protege contra quem um dia passar
 * a repetir o numero em toda chamada). `restantes` e `mensagem` sao os do
 * ULTIMO bloco: e o estado em que a fila ficou.
 */
export function somarBlocosCarga(blocos: ResultadoBlocoCarga[]): ResultadoBlocoCarga {
  const vazio: ResultadoBlocoCarga = {
    clientes_criados: 0, clientes_atualizados: 0, veiculos_criados: 0,
    veiculos_atualizados: 0, recusados: 0, restantes: 0, mensagem: '',
  };
  return blocos.reduce<ResultadoBlocoCarga>((acc, b) => ({
    clientes_criados: acc.clientes_criados + Number(b.clientes_criados),
    clientes_atualizados: acc.clientes_atualizados + Number(b.clientes_atualizados),
    veiculos_criados: acc.veiculos_criados + Number(b.veiculos_criados),
    veiculos_atualizados: acc.veiculos_atualizados + Number(b.veiculos_atualizados),
    recusados: Math.max(acc.recusados, Number(b.recusados)),
    restantes: Number(b.restantes),
    mensagem: b.mensagem,
  }), vazio);
}

/**
 * O VENDEDOR DOS MIGRADOS (0095). Os motivos sao os de
 * `mutual_vendedores_dos_veiculos` — mexeu num lado, mexa no outro e nos dois
 * testes. Os tres primeiros nao sao pendencia: o veiculo ja tem (ou vai ter)
 * vendedor. Os demais sao a fila de quem fica sem.
 */
export const ROTULO_MOTIVO_VENDEDOR: Record<string, string> = {
  LIGAR: 'Sera ligado ao vendedor',
  JA_LIGADO: 'Ja ligado ao vendedor certo',
  MANTIDO: 'Ja tem outro vendedor (nao e trocado)',
  SEM_CONSULTOR: 'Contrato sem consultor no Mutual',
  CONSULTOR_NAO_CAPTURADO: 'Consultor nao puxado (puxe Consultores)',
  EMAIL_AMBIGUO: 'Sem CPF que case, e o e-mail e de varios vendedores',
  CONSULTOR_SEM_VENDEDOR: 'Consultor nao esta no cadastro de vendedores',
  UNIDADE_DIFERENTE: 'O vendedor e de outra unidade',
};

const MOTIVOS_RESOLVIDOS = new Set(['LIGAR', 'JA_LIGADO', 'MANTIDO']);

/** O motivo deixa o veiculo SEM vendedor? (espelho do `sem_vendedor` da RPC) */
export function vendedorPendente(motivo: string): boolean {
  return !MOTIVOS_RESOLVIDOS.has(motivo);
}

/** Os totais do quadro, pela mesma conta de `mutual_vincular_vendedores`. */
export function totaisVendedores(linhas: { motivo: string; veiculos: number | string }[]) {
  const soma = (f: (m: string) => boolean) =>
    linhas.filter((l) => f(l.motivo)).reduce((acc, l) => acc + Number(l.veiculos), 0);
  return {
    ligar: soma((m) => m === 'LIGAR'),
    jaLigados: soma((m) => m === 'JA_LIGADO'),
    mantidos: soma((m) => m === 'MANTIDO'),
    semVendedor: soma(vendedorPendente),
    total: soma(() => true),
  };
}

/** O que a carga faria, contado como a tela mostra. */
export function resumoDaCarga(linhas: LinhaCarga[]) {
  const entram = linhas.filter((l) => !l.problema);
  return {
    criar: entram.filter((l) => l.acao === 'CRIAR').length,
    atualizar: entram.filter((l) => l.acao === 'ATUALIZAR').length,
    recusadas: linhas.length - entram.length,
    // O associado se conta por PESSOA, nao por linha: dois veiculos do mesmo
    // associado sao UM cliente. Contar linhas aqui foi um bug real da 0084.
    associados: new Set(entram.map((l) => l.id_pessoa).filter(Boolean)).size,
  };
}

/**
 * As recusas agrupadas pelo MOTIVO, ordenadas por volume.
 *
 * Motivo junto e fila que ninguem trabalha (licao da 0082): "8 sem placa" e
 * "3 com CPF invalido" sao duas tarefas, de duas pessoas diferentes. E tratar
 * a que mais pesa resolve a maior parte do lote com a menor decisao.
 */
export function recusasPorMotivo(
  linhas: LinhaCarga[],
): { motivo: string; quantidade: number }[] {
  const mapa = new Map<string, number>();
  for (const l of linhas) {
    if (!l.problema) continue;
    mapa.set(familiaDaRecusa(l.problema), (mapa.get(familiaDaRecusa(l.problema)) ?? 0) + 1);
  }
  return [...mapa.entries()]
    .map(([motivo, quantidade]) => ({ motivo, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

/**
 * A familia da recusa: o texto do banco nomeia a PLACA e o CHASSI da linha
 * (que e o que a operacao precisa para cobrar o dado), entao agrupar pelo
 * texto cru daria uma "familia" por linha.
 */
export function familiaDaRecusa(problema: string): string {
  if (problema.startsWith('SEM PLACA')) return 'Sem placa (0 km)';
  if (problema.startsWith('CPF/CNPJ invalido')) return 'CPF/CNPJ invalido';
  if (problema.startsWith('Associado sem CPF')) return 'Associado sem CPF/CNPJ';
  if (problema.startsWith('Associado sem nome')) return 'Associado sem nome';
  if (problema.startsWith('Sem data de ativacao')) return 'Sem data de ativacao';
  if (problema.includes('repetid')) return 'Repetido dentro do lote';
  if (problema.includes('ja cadastrad')) return 'Ja cadastrado em outro veiculo';
  return problema;
}

/**
 * 🔴 A FILA QUE BLOQUEIA O CUTOVER — nao a carga.
 *
 * Valor, dia de vencimento e plano NAO impedem o veiculo de entrar: com
 * `cobranca_externa` ligada ele nao e faturado aqui, e ficar de fora da base
 * seria pior (nao apareceria no SAC, no portal nem na 24h). Mas no dia em que
 * a unidade passar a faturar AQUI, `valor_mensalidade` nulo cai no
 * `cotar_plano` e sem plano isso da R$ 0,00 — associado que nunca recebe
 * boleto. Por isso a fila e mostrada como pre-requisito do CUTOVER.
 */
export function filaAntesDoCutover(linhas: LinhaCarga[]) {
  const entram = linhas.filter((l) => !l.problema);
  return {
    semValor: entram.filter((l) => l.valor_mensalidade === null).length,
    semDia: entram.filter((l) => l.dia_vencimento === null).length,
    semPlano: entram.filter((l) => !l.plano_id).length,
    semTipo: entram.filter((l) => !l.tipo_veiculo_id).length,
    ativacaoEstimada: entram.filter((l) => l.ativacao_estimada).length,
  };
}

/** O cutover esta liberado quando nada essencial a cobranca esta faltando. */
export function cutoverLiberado(linhas: LinhaCarga[]): boolean {
  const f = filaAntesDoCutover(linhas);
  return f.semValor === 0 && f.semDia === 0;
}

export interface TipoVeiculoExterno {
  id_externo: string;
  nome: string | null;
  capturado: boolean;
  faturaveis: number;
  /** O `tipos_veiculo.id` escolhido. **Chamava-se `regional_id` na 0084** e
   *  guardava um tipo de veiculo — nome que mente e a familia de erro mais
   *  caro deste projeto (o branch "espelhado", a `schema_migrations` vazia). */
  destino_id: string | null;
}

/**
 * Os tipos do Mutual que ainda nao tem de-para, com carteira, ordenados por
 * peso. Mesma postura de `filiaisPendentes`: a decisao mais pesada primeiro.
 */
export function tiposPendentes(tipos: TipoVeiculoExterno[]): TipoVeiculoExterno[] {
  return tipos
    .filter((t) => !t.destino_id && t.faturaveis > 0)
    .sort((a, b) => b.faturaveis - a.faturaveis);
}

// ---------------------------------------------------------------------------
// De-para por CATEGORIA (0087)
// ---------------------------------------------------------------------------
/** Uma linha do de-para por categoria (o par categoria/tipo do Mutual). */
export interface CategoriaExterna {
  chave: string;
  categoria_nome: string | null;
  tipo_mutual: string | null;
  faturaveis: number;
  veiculos: number;
  destino_id: string | null;
  reserva_id: string | null;
}

/** Espelho de `mutual_chave_categoria`: '<categoria>/<tipo>', tipo vazio = '?'. */
export function chaveCategoria(categoria: string | null | undefined, tipo: string | null | undefined): string | null {
  const c = (categoria ?? '').trim();
  if (!c) return null;
  const t = (tipo ?? '').trim();
  return `${c}/${t || '?'}`;
}

/**
 * O tipo que a CARGA vai gravar, na precedencia de `mutual_tipo_veiculo_do_objeto`:
 * o vinculo da categoria manda, o do tipo e reserva, e sem os dois e nulo.
 */
export function tipoEfetivoDaCategoria(c: Pick<CategoriaExterna, 'destino_id' | 'reserva_id'>): string | null {
  return c.destino_id ?? c.reserva_id ?? null;
}

/**
 * As que ainda ENTRARIAM SEM TIPO: sem vinculo da categoria E sem reserva do
 * tipo, com carteira faturavel. Categoria sem vinculo mas com reserva nao e
 * pendencia — ela entra pelo tipo; so pode ficar mais precisa.
 */
export function categoriasSemTipo<T extends CategoriaExterna>(lista: T[]): T[] {
  return lista
    .filter((c) => c.faturaveis > 0 && !tipoEfetivoDaCategoria(c))
    .sort((a, b) => b.faturaveis - a.faturaveis);
}

/**
 * Agrupa as categorias pelo TIPO do Mutual (CARRO, MOTO, CAMINHAO) — o
 * cabecalho de leitura, como a macrorregiao fez para as equipes (0083). Os
 * grupos e as linhas vem pelo peso, maior primeiro.
 */
export function agruparCategoriasPorTipo<T extends CategoriaExterna>(
  lista: T[],
): { tipo: string; faturaveis: number; veiculos: number; itens: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const c of lista) {
    const k = c.tipo_mutual ?? 'SEM TIPO NO MUTUAL';
    grupos.set(k, [...(grupos.get(k) ?? []), c]);
  }
  return [...grupos.entries()]
    .map(([tipo, itens]) => ({
      tipo,
      faturaveis: itens.reduce((s, i) => s + i.faturaveis, 0),
      veiculos: itens.reduce((s, i) => s + i.veiculos, 0),
      itens: [...itens].sort((a, b) => b.faturaveis - a.faturaveis || b.veiculos - a.veiculos),
    }))
    .sort((a, b) => b.faturaveis - a.faturaveis || b.veiculos - a.veiculos || (a.tipo < b.tipo ? -1 : 1));
}

/**
 * A cota de participacao que o NOME da categoria carrega ("V6 / automovel
 * comum", "Especial v10 pickups"), pelo MESMO parser da 0016. So para a tela
 * mostrar o que vem junto — a carga NAO grava a cota (decisao a parte).
 */
export function cotaDaCategoria(nome: string | null | undefined): { codigo: string; especial: boolean } | null {
  const p = parseCategoriaSGA(nome);
  return p.codigoCota ? { codigo: p.codigoCota, especial: p.especial } : null;
}

// ---------------------------------------------------------------------------
// De-para do PLANO (0085)
// ---------------------------------------------------------------------------
export interface PlanoExterno {
  id_externo: string;
  nome: string | null;
  capturado: boolean;
  veiculos: number;
  faturaveis: number;
  /** Quanto da carteira faturavel esta coberta ATE esta linha, na ordem de
   *  peso. E ela que diz ONDE PARAR. */
  cobertura_acumulada: number | null;
  mensalidade_mediana: number | null;
  fipe_min: number | null;
  fipe_max: number | null;
  tipos: string | null;
  destino_id: string | null;
  plano_nome: string | null;
}

/** Os `plan_id` sem de-para que PESAM, do maior para o menor. */
export function planosPendentes(planos: PlanoExterno[]): PlanoExterno[] {
  return planos
    .filter((p) => !p.destino_id && p.faturaveis > 0)
    .sort((a, b) => b.faturaveis - a.faturaveis);
}

/**
 * Quantos ids, do topo para baixo, bastam para cobrir `alvo`% da carteira
 * faturavel.
 *
 * E o numero que torna este de-para entregavel. **CONFERIDO em producao com a
 * 0085 no ar (01/10/2026): 18 de 42 ids cobrem 90%** dos 481 faturaveis da
 * matriz, e 29 de 91 cobrem 90% dos 3.041 da base viva inteira. Sem ele a tela
 * e uma lista de 42 numeros de peso aparentemente igual, e a resposta natural e
 * "inviavel" — a conclusao errada que esta funcao existe para desfazer.
 *
 * ⚠️ O cabecalho da migration 0085 e o `comment on function` dela dizem 17/26:
 * foi um off-by-one meu, medido com a regra errada antes de a migration subir
 * (a posicao 17 cobre 89,81%, nao 90%). A migration e append-only e NAO foi
 * reescrita; o texto do comentario no banco sai na proxima migration.
 *
 * Conta sobre os FATURAVEIS (nao sobre `cobertura_acumulada`, que o banco
 * calcula na ordem dele) para a tela nao depender da ordenacao da RPC.
 */
export function idsPara90Pct(planos: PlanoExterno[], alvo = 90): number {
  const total = planos.reduce((s, p) => s + Math.max(0, p.faturaveis), 0);
  if (total <= 0) return 0;
  const ordenado = [...planos]
    .filter((p) => p.faturaveis > 0)
    .sort((a, b) => b.faturaveis - a.faturaveis);
  let acum = 0;
  for (let i = 0; i < ordenado.length; i += 1) {
    acum += ordenado[i].faturaveis;
    if ((acum * 100) / total >= alvo) return i + 1;
  }
  return ordenado.length;
}

/**
 * A faixa de FIPE de um `plan_id` e PERFIL, nunca identificacao.
 *
 * Foi medido que dentro do MESMO id a FIPE varia de 6x a 14x (1.111x no id 48),
 * ou seja o id e combo comercial e nao faixa de preco — a hipotese contraria
 * quase virou afirmacao a partir de uma amostra pequena. Esta funcao devolve
 * o quociente para a tela poder DESCONFIAR: faixa larga = plano genérico.
 */
export function amplitudeFipe(plano: PlanoExterno): number | null {
  const { fipe_min: min, fipe_max: max } = plano;
  if (min === null || max === null || min <= 0) return null;
  return max / min;
}

// =====================================================================
// O ERRO DE LEITURA — e por que ele precisa de regua propria
// =====================================================================
/**
 * 🔴 ERRO DE LEITURA NUNCA PODE VIRAR ESTADO VAZIO.
 *
 * Isto nasceu de um defeito real, medido em producao em 02/10/2026: TODAS as
 * leituras de `/integracao/mutual` voltavam **HTTP 500** (estouro do
 * `statement_timeout` de 8s do papel `authenticated`), e a tela:
 *
 *  - dizia *"Nenhuma equipe ainda. Puxe Equipes de vendas acima"* com as
 *    **52 equipes JA capturadas** — mandando repetir o que ja estava feito;
 *  - e, nas seis secoes que so renderizam com `data.length > 0`
 *    (Periodicidade, Status nao reconhecidos, Situacao dos contratos,
 *    **Filiais do Mutual**, Status cruzado, Quarentena), **desaparecia
 *    inteira** — foi isso que, semanas antes, virou o relato
 *    *"nao estao sendo listadas as filiais"*.
 *
 * Estado vazio e uma AFIRMACAO sobre o dado ("nao ha nada"); falha e uma
 * afirmacao sobre a CONSULTA ("nao sei"). Trocar a segunda pela primeira e a
 * familia de erro que este projeto persegue: um registro que mente com
 * confianca. A mensagem do timeout diz o que fazer, porque ela e a unica que o
 * usuario pode resolver sozinho (fechar as outras secoes e tentar de novo).
 */
export function mensagemDeFalhaDeLeitura(erro: unknown): string {
  // ⚠️ O supabase-js NAO devolve `Error`: ele devolve um objeto
  // `{ code, message, details, hint }`. Tratar so `instanceof Error` faz todo
  // erro do PostgREST virar "[object Object]" — o teste pegou isto.
  const bruto = textoDoErro(erro);
  const codigo = erro && typeof erro === 'object' && 'code' in erro
    ? String((erro as { code?: unknown }).code ?? '') : '';
  const texto = `${bruto} ${codigo}`.toLowerCase();

  // 57014: o Postgres cancelou por tempo. E o caso comum nesta tela, porque
  // cada diagnostico varre os ~17,7 mil objetos capturados.
  if (texto.includes('statement timeout') || texto.includes('57014') || texto.includes('canceling statement')) {
    return 'A consulta passou do tempo limite (8s) e o banco a cancelou. '
      + 'Nao e falta de dado: e o tamanho da varredura. Feche as secoes de diagnostico '
      + 'que nao estiver usando e abra uma por vez.';
  }
  if (texto.includes('somente a equipe')) {
    return 'Esta leitura e so para a equipe (admin ou financeiro).';
  }
  if (texto.includes('permission denied')) {
    return 'Sem permissao para esta leitura no banco.';
  }
  if (texto.includes('could not find the function') || texto.includes('schema cache')) {
    return 'A funcao nao existe no banco ainda — falta rodar a migration desta secao.';
  }
  return bruto || 'A leitura falhou e o banco nao disse por que.';
}

/** O texto de um erro, seja ele `Error`, objeto do PostgREST ou string. */
function textoDoErro(erro: unknown): string {
  if (!erro) return '';
  if (erro instanceof Error) return erro.message;
  if (typeof erro === 'string') return erro;
  if (typeof erro === 'object') {
    const o = erro as { message?: unknown; details?: unknown; hint?: unknown };
    const partes = [o.message, o.details, o.hint]
      .filter((x): x is string => typeof x === 'string' && x.length > 0);
    if (partes.length > 0) return partes.join(' — ');
    return '';
  }
  return String(erro);
}

// =====================================================================
// O ENDPOINT DO PLANO — o palpite da 0085 virou 404
// =====================================================================
/**
 * `/contract/plan/` devolveu **HTTP 404** (medido em 02/10/2026), ou seja o
 * palpite da 0085 esta errado. O swagger do Mutual nao e alcancavel do
 * ambiente onde isto foi escrito, entao a resposta nao sai de leitura de
 * documentacao: ela sai de um TESTE.
 *
 * Estas sao as candidatas, na ordem em que o padrao dos endpoints que JA
 * funcionam as sugere (`/association/...` para cadastro, `/contract/...` para
 * o que pende do contrato, `/core/...` para dominio compartilhado — foi assim
 * que `ADDRESS` acabou em `/core/address/`). O provador bate em cada uma e a
 * tela nomeia a que responde 200; `ENTIDADES_MUTUAL.PLAN` passa a ser ESSA, e
 * trocar e uma linha.
 */
export const CANDIDATAS_PLANO: string[] = [
  // O do swagger (docs/modulos/integracao-mutual.md) vem PRIMEIRO; as demais
  // ficam como registro do que ja foi medido 404 em 05/10/2026.
  '/quotation/plan/',
  '/contract/plan/',
  '/plan/',
  '/association/plan/',
  '/core/plan/',
  '/contract/contract_plan/',
  '/association/contract_plan/',
  '/product/plan/',
  '/plan/plan/',
];

/** O veredito de uma rodada do provador, para a tela nao ter de interpretar HTTP. */
export type SondagemCaminho = {
  caminho: string; http: number | null; registros: number | null; erro?: string;
  /** O que o Mutual disse ao recusar (4xx/5xx), resumido. E isto que nomeia o parametro faltante. */
  detalhe?: string;
  /** O que o swagger DECLARA para o caminho (GET). Vem quando a resposta e 400. */
  parametros?: ParametroApi[];
};

/** Um parametro de query/path declarado no swagger para um GET. */
export type ParametroApi = {
  nome: string; em: string; obrigatorio: boolean; tipo: string | null; descricao: string | null;
};

/**
 * O corpo de uma recusa do Mutual, curto e legivel. A API e Django REST: um 400
 * de validacao vem como `{"campo": ["mensagem"]}` — exatamente o que diz QUAL
 * parametro falta. Sem isto a tela so mostrava "HTTP 400", e o proximo passo
 * voltava a ser chute (05/10/2026: `/quotation/plan/` deu 400 e ninguem sabia
 * por que). HTML (pagina de erro) vira texto puro; tudo e truncado.
 */
export function resumoDoCorpo(texto: string, limite = 300): string {
  const bruto = (texto ?? '').trim();
  if (!bruto) return '';
  let saida: string;
  try {
    const json = JSON.parse(bruto) as unknown;
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      saida = Object.entries(json as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.map(String).join(' ') : String(v)}`)
        .join('; ');
    } else {
      saida = Array.isArray(json) ? json.map(String).join('; ') : String(json);
    }
  } catch {
    saida = bruto.replace(/<[^>]*>/g, ' ');
  }
  saida = saida.replace(/\s+/g, ' ').trim();
  return saida.length > limite ? `${saida.slice(0, limite - 1)}…` : saida;
}

/**
 * Os parametros que o swagger (2.0) declara para o GET de um caminho. O caminho
 * pode estar escrito com ou sem o `basePath` (`/public_api/v2`) e com ou sem a
 * barra final — os tres jeitos aparecem em swagger de Django. Os parametros do
 * nivel do caminho somam aos da operacao. Devolve `null` quando o caminho nao
 * esta no contrato (diferente de "esta e nao tem parametro", que e `[]`).
 */
export function parametrosDoSwagger(swagger: unknown, caminho: string): ParametroApi[] | null {
  if (!swagger || typeof swagger !== 'object') return null;
  const sw = swagger as { basePath?: string; paths?: Record<string, Record<string, unknown>> };
  const paths = sw.paths ?? {};
  const norm = (c: string) => `/${c.replace(/^\/+|\/+$/g, '')}/`;
  const alvo = norm(caminho);
  const base = sw.basePath ? norm(sw.basePath).slice(0, -1) : '';
  const chave = Object.keys(paths).find((k) => {
    const n = norm(k);
    return n === alvo || (base && n === norm(`${base}${alvo}`)) || (base && norm(n.replace(base, '')) === alvo);
  });
  if (!chave) return null;
  const item = paths[chave] ?? {};
  const lista = [
    ...((item.parameters as unknown[]) ?? []),
    ...((((item.get as Record<string, unknown>) ?? {}).parameters as unknown[]) ?? []),
  ];
  return lista
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && 'name' in x)
    .map((x) => ({
      nome: String(x.name),
      em: String(x.in ?? ''),
      obrigatorio: x.required === true,
      tipo: x.type != null ? String(x.type) : null,
      descricao: x.description != null ? String(x.description) : null,
    }));
}

/**
 * A primeira candidata que respondeu de verdade.
 *
 * **200 com zero registro CONTA**, e isso e deliberado: entidade de dominio
 * vazia no Mutual e um resultado legitimo ("existe e nao tem nada"), enquanto
 * 404 e "este caminho nao existe". Confundir os dois foi o que fez a 0085
 * nascer com um palpite; aqui a distincao e o produto.
 */
export function caminhoQueRespondeu(sondagens: SondagemCaminho[]): SondagemCaminho | null {
  return sondagens.find((s) => s.http !== null && s.http >= 200 && s.http < 300) ?? null;
}

// ---------------------------------------------------------------------------
// PLANOS pelo /quotation/plan/ — a lista e POR VEICULO, nao um catalogo.
// ---------------------------------------------------------------------------
// O Mutual recusa `/quotation/plan/` sem `vehicle_id` ("O id do veiculo e
// obrigatorio", 400). O endpoint responde "quais planos ESTE veiculo pode
// contratar", entao o catalogo se monta consultando UM veiculo de cada
// `plan_id` que aparece nos contratos e juntando o que voltar (upsert por id).

/** Um par plano x veiculo lido do CONTRACT_OBJECT capturado. */
export type ParPlanoVeiculo = {
  plan_id: string | null;
  vehicle_id: string | null;
  status: string | null;
};

/** O veiculo escolhido para representar um `plan_id` na consulta. */
export type RepresentantePlano = {
  plan_id: string; vehicle_id: string; peso: number;
  /** Ate 2 veiculos de reserva: o Mutual recusa veiculo que ele nao acha mais ("Veiculo nao encontrado"). */
  reservas: string[];
};

/**
 * Um veiculo por `plan_id`, do plano mais pesado para o mais leve.
 *
 * Prefere objeto ATIVO (veiculo encerrado pode ser recusado na cotacao) e,
 * entre os elegiveis, o de MAIOR id (o mais recente). A ordem e ESTAVEL —
 * peso desc, depois o id do plano — porque a captura anda em blocos e cada
 * bloco recalcula a lista: ordem instavel pularia ou repetiria planos.
 */
export function veiculosPorPlano(pares: ParPlanoVeiculo[]): RepresentantePlano[] {
  const grupos = new Map<string, { peso: number; ativos: Set<string>; outros: Set<string> }>();
  for (const p of pares) {
    const plano = (p.plan_id ?? '').trim();
    const veiculo = (p.vehicle_id ?? '').trim();
    if (!plano) continue;
    const g = grupos.get(plano) ?? { peso: 0, ativos: new Set<string>(), outros: new Set<string>() };
    g.peso += 1;
    if (veiculo) {
      if ((p.status ?? '').trim().toUpperCase() === 'ATIVO') g.ativos.add(veiculo);
      else g.outros.add(veiculo);
    }
    grupos.set(plano, g);
  }
  const desc = (x: Set<string>) => Array.from(x).sort((a, b) => compararIds(b, a));
  const out: RepresentantePlano[] = [];
  for (const [plan_id, g] of Array.from(grupos.entries())) {
    const ativos = desc(g.ativos);
    const candidatos = [...ativos, ...desc(g.outros).filter((v) => !g.ativos.has(v))];
    if (candidatos.length === 0) continue;
    out.push({ plan_id, vehicle_id: candidatos[0], peso: g.peso, reservas: candidatos.slice(1, 3) });
  }
  return out.sort((a, b) => b.peso - a.peso || compararIds(a.plan_id, b.plan_id));
}

/** Compara ids que costumam ser numericos ("9" < "10"), com fallback textual. */
function compararIds(a: string, b: string): number {
  const na = Number(a), nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b);
}

/**
 * A lista de planos de uma resposta cujo formato NAO foi confirmado: lista
 * crua, envelope DRF (`results`), envelope com outra chave (`plans`, `data`…)
 * ou um objeto so. Tudo o que nao for nenhum desses vira lista vazia — e a
 * rota relata as CHAVES que vieram, para o formato deixar de ser palpite.
 */
export function listaDePlanos(json: unknown): Registro[] {
  const direta = extrairLista(json);
  if (direta.length > 0) return direta;
  if (!json || typeof json !== 'object' || Array.isArray(json)) return [];
  for (const v of Object.values(json as Record<string, unknown>)) {
    if (Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
      return v as Registro[];
    }
  }
  const o = json as Record<string, unknown>;
  return o.id !== undefined || o.uuid !== undefined ? [o as Registro] : [];
}

/**
 * `/contract/contract_object_product/` so responde COM filtro (400: "E obrigatorio
 * informar UM dos parametros: quotation_token, contract_id, contract_object_id ou
 * quotation_object_id" — medido em 07/10/2026). A captura entao pergunta veiculo
 * por veiculo, e o veiculo da pergunta e grudado em cada linha que nao o trouxer:
 * sem isso a leitura (0091, `mutual_produto_da_linha`) nao saberia de quem e o
 * produto. O que o Mutual mandou NAO e sobrescrito.
 */
export function comObjeto(lista: Registro[], contractObjectId: string): Registro[] {
  return lista.map((r) =>
    r.contract_object_id === undefined || r.contract_object_id === null || r.contract_object_id === ''
      ? { ...r, contract_object_id: contractObjectId }
      : r);
}

/** O que a captura de planos viu — e com isso que o formato deixa de ser palpite. */
export type DiagnosticoPlanos = {
  /** Quantos plan_id distintos os contratos citam (o universo a cobrir). */
  planos_nos_contratos: number;
  /** Quantos desses ja estavam capturados antes deste bloco (pulados). */
  ja_capturados: number;
  /** Veiculos consultados neste bloco. */
  consultados: number;
  /** Planos recebidos (com repeticao entre veiculos). */
  recebidos: number;
  /** Planos recebidos sem `id` — nao casam com o `plan_id` do contrato. */
  sem_id: number;
  /** Chaves do primeiro plano recebido (ou da resposta, quando nao veio lista). */
  chaves: string[];
  /** As primeiras recusas do Mutual, com o motivo. */
  recusas: { vehicle_id: string; http: number | null; detalhe: string }[];
  /** O caminho de detalhe por id que o swagger declara para o plano (null = nao ha). */
  caminho_detalhe?: string | null;
  /** Consultas pelo caminho de detalhe (por id do plano, nao por veiculo). */
  consultados_por_id?: number;
  /** Os caminhos do swagger que falam de plano — para a proxima decisao nao ser palpite. */
  swagger_planos?: { caminho: string; metodos: string[] }[];
};

/**
 * Junta o diagnostico de varios blocos numa rodada. Contadores somam; o
 * universo (`planos_nos_contratos`) e o mesmo em todos; as chaves sao as do
 * primeiro bloco que as viu; e as recusas ficam nas 5 primeiras.
 */
export function somarDiagnosticoPlanos(
  acc: DiagnosticoPlanos | undefined, d: DiagnosticoPlanos,
): DiagnosticoPlanos {
  if (!acc) return { ...d, chaves: [...d.chaves], recusas: [...d.recusas] };
  return {
    planos_nos_contratos: d.planos_nos_contratos || acc.planos_nos_contratos,
    ja_capturados: acc.ja_capturados + d.ja_capturados,
    consultados: acc.consultados + d.consultados,
    recebidos: acc.recebidos + d.recebidos,
    sem_id: acc.sem_id + d.sem_id,
    chaves: acc.chaves.length > 0 ? acc.chaves : [...d.chaves],
    recusas: [...acc.recusas, ...d.recusas].slice(0, 5),
    caminho_detalhe: d.caminho_detalhe !== undefined ? d.caminho_detalhe : acc.caminho_detalhe,
    consultados_por_id: (acc.consultados_por_id ?? 0) + (d.consultados_por_id ?? 0),
    swagger_planos: d.swagger_planos?.length ? d.swagger_planos : acc.swagger_planos,
  };
}

/** Os caminhos do swagger que contem `filtro` (sem o basePath), com os metodos de cada um. */
export function caminhosDoSwagger(swagger: unknown, filtro: string): { caminho: string; metodos: string[] }[] {
  if (!swagger || typeof swagger !== 'object') return [];
  const sw = swagger as { basePath?: string; paths?: Record<string, Record<string, unknown>> };
  const base = (sw.basePath ?? '').replace(/\/+$/, '');
  const f = filtro.toLowerCase();
  return Object.entries(sw.paths ?? {})
    .map(([k, v]) => ({
      caminho: base && k.startsWith(base) ? k.slice(base.length) || '/' : k,
      metodos: Object.keys(v ?? {}).filter((m) => ['get', 'post', 'put', 'patch', 'delete'].includes(m)),
    }))
    .filter((x) => x.caminho.toLowerCase().includes(f))
    .sort((a, b) => (a.caminho < b.caminho ? -1 : a.caminho > b.caminho ? 1 : 0));
}

/**
 * O caminho de DETALHE (GET por id) de uma lista, se o contrato o declara:
 * para `/quotation/plan/` procura `/quotation/plan/{algo}/`. Sem ele, `null` —
 * e a captura nao tenta adivinhar.
 */
export function caminhoDeDetalhe(swagger: unknown, caminhoLista: string): string | null {
  const lista = `/${caminhoLista.replace(/^\/+|\/+$/g, '')}/`;
  const achou = caminhosDoSwagger(swagger, lista).find((x) => {
    const resto = `/${x.caminho.replace(/^\/+|\/+$/g, '')}/`.slice(lista.length);
    return /^\{[^/}]+\}\/?$/.test(resto) && x.metodos.includes('get');
  });
  return achou ? achou.caminho : null;
}

/** Troca o `{parametro}` do caminho de detalhe pelo id. */
export function caminhoComId(modelo: string, id: string): string {
  return modelo.replace(/\{[^/}]+\}/, encodeURIComponent(id));
}
