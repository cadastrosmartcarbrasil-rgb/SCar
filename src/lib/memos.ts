// Regras puras do mural interno (0055) — categorias, prioridade e vigencia.
// Espelham `memos_do_usuario` no banco: mexeu numa ponta, mexa na outra.

export type CategoriaMemo = 'COMUNICADO' | 'SCRIPT' | 'URGENTE';
export type PrioridadeMemo = 'BAIXA' | 'MEDIA' | 'ALTA';

export const CATEGORIAS: { valor: CategoriaMemo; rotulo: string; descricao: string; cor: string }[] = [
  { valor: 'COMUNICADO', rotulo: 'Comunicado', descricao: 'Aviso institucional da gestao', cor: 'bg-cyan-50 text-cyan-700' },
  { valor: 'SCRIPT', rotulo: 'Script / Procedimento', descricao: 'Como atender determinada situacao', cor: 'bg-violet-50 text-violet-700' },
  { valor: 'URGENTE', rotulo: 'Urgente', descricao: 'Precisa ser visto agora', cor: 'bg-rose-50 text-rose-700' },
];

export const PRIORIDADES: { valor: PrioridadeMemo; rotulo: string; cor: string }[] = [
  { valor: 'ALTA', rotulo: 'Alta', cor: 'bg-rose-50 text-rose-700' },
  { valor: 'MEDIA', rotulo: 'Media', cor: 'bg-amber-50 text-amber-700' },
  { valor: 'BAIXA', rotulo: 'Baixa', cor: 'bg-slate-100 text-slate-600' },
];

export const categoriaMeta = (c: string) =>
  CATEGORIAS.find((x) => x.valor === c) ?? CATEGORIAS[0];
export const prioridadeMeta = (p: string) =>
  PRIORIDADES.find((x) => x.valor === p) ?? PRIORIDADES[1];

export interface MemoBase {
  id: string;
  categoria: string;
  prioridade: string;
  exige_leitura: boolean;
  publicado_em: string;
  expira_em?: string | null;
  lido?: boolean;
}

/** Comunicado com prazo some do mural no dia seguinte ao vencimento. */
export function memoVigente(m: { expira_em?: string | null }, hoje: Date = new Date()): boolean {
  if (!m.expira_em) return true;
  return m.expira_em >= hoje.toISOString().slice(0, 10);
}

/** Precisa de ciencia e ainda nao teve: e o que fica em destaque. */
export function pendenteCiencia(m: MemoBase): boolean {
  return m.exige_leitura && !m.lido;
}

/**
 * Ordem do mural: primeiro o que trava a pessoa (ciencia pendente), depois a
 * prioridade, depois o mais recente. Mesma ordem do `order by` da RPC.
 */
export function ordenarMemos<T extends MemoBase>(memos: T[]): T[] {
  const peso = (p: string) => (p === 'ALTA' ? 1 : p === 'MEDIA' ? 2 : 3);
  return [...memos].sort((a, b) => {
    const ca = pendenteCiencia(a) ? 0 : 1;
    const cb = pendenteCiencia(b) ? 0 : 1;
    if (ca !== cb) return ca - cb;
    if (peso(a.prioridade) !== peso(b.prioridade)) return peso(a.prioridade) - peso(b.prioridade);
    return b.publicado_em.localeCompare(a.publicado_em);
  });
}

/** "3 de 12 deram ciencia (25%)" — o que a gestao acompanha. */
export function resumoLeitura(leituras: number, destinatarios: number): string {
  if (destinatarios <= 0) return `${leituras} leitura(s)`;
  const pct = Math.round((leituras / destinatarios) * 100);
  return `${leituras} de ${destinatarios} deram ciencia (${pct}%)`;
}

/**
 * Papeis endereçaveis por um comunicado. Espelha o enum `papel_usuario`.
 * Vive aqui (e nao na tela) porque o rotulo e usado tanto no formulario quanto
 * na frase de destino do mural.
 */
export const PAPEIS_MEMO: { valor: string; rotulo: string }[] = [
  { valor: 'admin', rotulo: 'Administrador' },
  { valor: 'gestor_regional', rotulo: 'Gestor Regional' },
  { valor: 'consultor_vendas', rotulo: 'Consultor de Vendas' },
  { valor: 'financeiro', rotulo: 'Financeiro' },
  { valor: 'sinistro', rotulo: 'Sinistro' },
  { valor: 'auditoria', rotulo: 'Auditoria' },
  { valor: 'assistencia_24h', rotulo: 'Assistencia 24h' },
];

/** Espelha `papeis_diretoria()` no banco (0056). */
export const PAPEIS_DIRETORIA = ['admin', 'financeiro'];

export const papelMemoRotulo = (p: string) =>
  PAPEIS_MEMO.find((x) => x.valor === p)?.rotulo ?? p;

/**
 * Para quem o comunicado foi endereçado, em uma frase — "Cuiaba · Sinistro",
 * "Todas as unidades", "Diretoria / administracao". E o que o autor precisa
 * ler ao lado do proprio comunicado no mural (0057): sem isso, ver o aviso na
 * tela passa a impressao de que ele foi para todo mundo.
 */
export function destinoDoMemo(
  regional: string | null | undefined,
  papeis: string[] | null | undefined,
): string {
  const temPapeis = !!papeis?.length;
  const soDiretoria =
    temPapeis &&
    papeis!.length === PAPEIS_DIRETORIA.length &&
    papeis!.every((p) => PAPEIS_DIRETORIA.includes(p));

  if (!regional && soDiretoria) return 'Diretoria / administracao';
  const onde = regional ?? 'Todas as unidades';
  if (!temPapeis) return onde;
  return `${onde} · ${papeis!.map(papelMemoRotulo).join(', ')}`;
}

// ---------------------------------------------------------------------------
// CONVERSA (0058) — o comunicado deixou de ser mão única. Cada destinatário tem
// o SEU papo com quem publicou; estas funções escrevem o que a tela mostra.
// ---------------------------------------------------------------------------

/** "3 respostas · 1 nova" — o que vai no selo do comunicado no mural. */
export function resumoRespostas(respostas: number, naoLidas: number): string | null {
  if (respostas <= 0) return null;
  const base = respostas === 1 ? '1 resposta' : `${respostas} respostas`;
  return naoLidas > 0 ? `${base} · ${naoLidas} nova${naoLidas > 1 ? 's' : ''}` : base;
}

export interface ConversaBase {
  nao_lidas: number;
  ultima_em: string;
}

/**
 * Ordem das conversas para quem publicou: primeiro quem está esperando resposta
 * (tem mensagem não lida), depois a conversa mais recente. Quem publicou abre a
 * tela para responder — o que já foi lido pode esperar.
 */
export function ordenarConversas<T extends ConversaBase>(conversas: T[]): T[] {
  return [...conversas].sort((a, b) => {
    const pa = a.nao_lidas > 0 ? 0 : 1;
    const pb = b.nao_lidas > 0 ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return b.ultima_em.localeCompare(a.ultima_em);
  });
}
