// ---------------------------------------------------------------------------
// Regras puras do cadastro da REGIONAL (unidade/franquia) — espelho do que a
// 0067 faz no banco. Mexeu num lado, mexa no outro e nos dois testes.
//
// A regra que da nome ao arquivo: `ativo` decide onde a unidade e OFERECIDA,
// nunca o que ela ja produziu. Unidade inativa some das listas de escolha, do
// hotlink e do rodizio; continua inteira no historico dos relatorios e do DRE.
// Esconder o passado de uma franquia encerrada nao "limpa" o relatorio —
// falsifica o resultado da associacao.
// ---------------------------------------------------------------------------

export interface RegionalSelecionavel {
  id: string;
  nome: string;
  ativo?: boolean | null;
}

/**
 * Lista para ESCOLHER a unidade (novo usuario, novo vendedor, novo associado,
 * lancamento, comunicado, seletor da matriz): so as ativas.
 *
 * A inativa selecionada continua na lista — senao o campo apareceria em branco
 * ao abrir um registro antigo e o primeiro "salvar" trocaria a unidade dele
 * sem ninguem perceber.
 */
export function opcoesParaEscolher<T extends RegionalSelecionavel>(
  regionais: T[] | undefined,
  selecionada?: string | null,
): T[] {
  return (regionais ?? []).filter((r) => r.ativo !== false || r.id === selecionada);
}

/**
 * Lista para FILTRAR relatorio (DRE, cobrancas, assistencia, rastreadores):
 * ativas primeiro, inativas depois e marcadas. Consolidado de periodo passado
 * precisa poder ser aberto por uma unidade ja encerrada.
 */
export function opcoesParaFiltrar<T extends RegionalSelecionavel>(
  regionais: T[] | undefined,
): { ativas: T[]; inativas: T[] } {
  const todas = regionais ?? [];
  return {
    ativas: todas.filter((r) => r.ativo !== false),
    inativas: todas.filter((r) => r.ativo === false),
  };
}

export interface ContagemRegional {
  usuarios?: number | null;
  vendedores?: number | null;
  associados?: number | null;
  veiculos?: number | null;
  leads?: number | null;
  lancamentos?: number | null;
}

/**
 * O que impede a exclusao — mesma conta do trigger `fn_regional_bloqueia_exclusao`.
 * Devolve a lista pronta para a tela dizer POR QUE nao da, em vez de so
 * desabilitar o botao.
 */
export function pendenciasDaUnidade(c: ContagemRegional | null | undefined): string[] {
  if (!c) return [];
  const partes: Array<[number, string, string]> = [
    [Number(c.usuarios ?? 0), 'usuário', 'usuários'],
    [Number(c.vendedores ?? 0), 'vendedor', 'vendedores'],
    [Number(c.associados ?? 0), 'associado', 'associados'],
    [Number(c.veiculos ?? 0), 'veículo', 'veículos'],
    [Number(c.leads ?? 0), 'lead', 'leads'],
    [Number(c.lancamentos ?? 0), 'lançamento financeiro', 'lançamentos financeiros'],
  ];
  return partes
    .filter(([n]) => n > 0)
    .map(([n, sing, plur]) => `${n} ${n === 1 ? sing : plur}`);
}

export function podeExcluirUnidade(c: ContagemRegional | null | undefined): boolean {
  return pendenciasDaUnidade(c).length === 0;
}

/**
 * O aviso que a tela mostra antes de inativar. Inativar e sempre permitido —
 * a mensagem existe para quem clica saber o que vai acontecer com a operacao
 * que ficou para tras, nao para impedir.
 */
export function avisoDeInativacao(
  nome: string,
  c: ContagemRegional | null | undefined,
): string {
  const pend = pendenciasDaUnidade(c);
  if (pend.length === 0) {
    return `Inativar "${nome}"? Ela sai das listas de escolha e dos hotlinks. Não há nenhum registro vinculado.`;
  }
  return (
    `Inativar "${nome}"?\n\n` +
    `Ela sai das listas de escolha, para de captar por hotlink e não entra no rodízio.\n` +
    `O que já existe NÃO é apagado nem some dos relatórios: ${pend.join(', ')}.`
  );
}

/** Rotulo curto da situacao, usado na lista e no selo. */
export function rotuloSituacao(ativo: boolean | null | undefined): 'Ativa' | 'Inativa' {
  return ativo === false ? 'Inativa' : 'Ativa';
}

/**
 * Rotulo da unidade em FILTRO de relatorio. A inativa continua na lista — o
 * consolidado de um periodo passado precisa poder ser aberto por uma franquia
 * ja encerrada — mas tem de aparecer marcada, senao quem filtra nao entende
 * por que aquela unidade parou de crescer.
 */
export function rotuloUnidade(r: { nome: string; ativo?: boolean | null }): string {
  return r.ativo === false ? `${r.nome} (inativa)` : r.nome;
}

// ---------------------------------------------------------------------------
// A EQUIPE DA FRANQUIA (0102) — o que o portal `/regional/equipe` precisa saber
// antes de desenhar a lista.
//
// Por que isto existe: a importacao de vendedores (0069) entra com TODOS
// INATIVOS de proposito, entao a unidade que importou 66 pessoas mostra 2 na
// contagem de ativos e parece ter uma equipe de dois. O numero sozinho mente;
// os dois juntos contam a historia ("66 cadastrados, 2 ativos") e dizem o que
// fazer — ativar.
// ---------------------------------------------------------------------------

export interface VendedorDaEquipe {
  ativo?: boolean | null;
}

export type FiltroEquipe = 'todos' | 'ativos' | 'inativos';

export function resumoDaEquipe<T extends VendedorDaEquipe>(lista: T[] | undefined) {
  const todos = lista ?? [];
  const ativos = todos.filter((v) => v.ativo !== false).length;
  return { cadastrados: todos.length, ativos, inativos: todos.length - ativos };
}

export function filtrarEquipe<T extends VendedorDaEquipe>(
  lista: T[] | undefined,
  filtro: FiltroEquipe,
): T[] {
  const todos = lista ?? [];
  if (filtro === 'ativos') return todos.filter((v) => v.ativo !== false);
  if (filtro === 'inativos') return todos.filter((v) => v.ativo === false);
  return todos;
}

/**
 * O hotlink do vendedor INATIVO nao resolve — `vendedor_por_codigo` (0035) o
 * ignora e `resolver_hotlink` (0067) tambem. Copiar o link dele e distribuir um
 * endereco morto, entao a tela nao oferece: e o mesmo cuidado de `/precificacao`
 * (abrir, deixar editar e recusar o salvar) visto do lado certo.
 */
export function hotlinkResolve(v: VendedorDaEquipe | null | undefined): boolean {
  return !!v && v.ativo !== false;
}

/**
 * O texto da confirmacao. Inativar NAO apaga nada: o vendedor sai do hotlink,
 * do rodizio e das listas de escolha, e a carteira que ele trouxe continua
 * inteira — a mesma regra que `ativo` tem na unidade (0067).
 */
export function avisoDeSituacaoVendedor(nome: string, ativoAgora: boolean): string {
  return ativoAgora
    ? `Inativar "${nome}"?\n\n` +
      `O hotlink dele para de captar e ele sai do rodízio e das listas de escolha.\n` +
      `Os leads, as vendas e as comissões que já existem NÃO são apagados.`
    : `Ativar "${nome}"?\n\n` +
      `O hotlink volta a captar e ele volta a receber lead pelo rodízio da unidade.`;
}

// ---------------------------------------------------------------------------
// A CARTEIRA NO PAINEL (0102)
// ---------------------------------------------------------------------------

export interface CarteiraDaUnidade {
  veiculos_carteira?: number | null;
  veiculos_ativos?: number | null;
  veiculos_inadimplentes?: number | null;
  veiculos_cobranca_externa?: number | null;
  veiculos_sem_valor?: number | null;
}

/** "1.149 ativos · 20 em vistoria · 0 inadimplentes" — o que o numero esconde. */
export function composicaoDaCarteira(c: CarteiraDaUnidade | null | undefined): string {
  const total = Number(c?.veiculos_carteira ?? 0);
  const ativos = Number(c?.veiculos_ativos ?? 0);
  const inad = Number(c?.veiculos_inadimplentes ?? 0);
  const outros = Math.max(0, total - ativos - inad);
  if (total === 0) return 'Nenhum veículo na base desta unidade';
  const partes = [`${ativos} ativo${ativos === 1 ? '' : 's'}`];
  if (outros > 0) partes.push(`${outros} em vistoria/evento`);
  if (inad > 0) partes.push(`${inad} inadimplente${inad === 1 ? '' : 's'}`);
  return partes.join(' · ');
}

/**
 * O aviso da COBRANCA EXTERNA (0082). Veiculo ativo que nao emite boleto aqui
 * e o estado normal da carteira migrada do Mutual — e sem dizer isso na tela o
 * "cade a cobranca?" vira chamado (foi por isso que `/veiculos` ganhou o selo).
 * `null` quando nao ha nenhum: aviso que aparece sempre ninguem le.
 */
export function avisoCobrancaExterna(c: CarteiraDaUnidade | null | undefined): string | null {
  const ext = Number(c?.veiculos_cobranca_externa ?? 0);
  if (ext === 0) return null;
  const total = Number(c?.veiculos_carteira ?? 0);
  const todos = total > 0 && ext >= total;
  return todos
    ? `Toda a carteira desta unidade (${ext}) está em cobrança externa: a mensalidade continua sendo emitida no sistema anterior e nenhum boleto sai por aqui.`
    : `${ext} de ${total} veículos estão em cobrança externa — a mensalidade deles e emitida no sistema anterior, não por aqui.`;
}
