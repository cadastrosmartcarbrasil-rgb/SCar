// Kanban de eventos — a visao COMPACTA (17/10/2026). A coluna nasce resumida
// (total + contagem por regional) e so desenha os vcards quando alguem pede:
// a lista de cards cresce com a carteira e, aberta inteira, empurra o resto da
// tela para baixo sem dizer quanto tem em cada unidade.

export interface EventoDoKanban {
  regional_id: string | null;
  regionais?: { nome: string } | null;
}

export interface GrupoRegional {
  /** `null` = matriz (sem unidade) — aqui regional_id nulo significa MATRIZ. */
  regionalId: string | null;
  nome: string;
  quantidade: number;
}

export const ROTULO_SEM_UNIDADE = 'Matriz (sem unidade)';

/** Agrupa os eventos de uma coluna por regional, da maior para a menor. */
export function agruparPorRegional(eventos: EventoDoKanban[]): GrupoRegional[] {
  const mapa = new Map<string, GrupoRegional>();
  for (const e of eventos) {
    const chave = e.regional_id ?? '';
    const atual = mapa.get(chave);
    if (atual) atual.quantidade += 1;
    else
      mapa.set(chave, {
        regionalId: e.regional_id ?? null,
        nome: e.regional_id ? e.regionais?.nome ?? 'Unidade sem nome' : ROTULO_SEM_UNIDADE,
        quantidade: 1,
      });
  }
  return [...mapa.values()].sort(
    (a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, 'pt-BR'),
  );
}

/**
 * O que a coluna mostra: `null` = so o resumo; `'todos'` = todos os cards;
 * `{ regionalId }` = os cards de uma unidade.
 */
export type ExpansaoColuna = null | 'todos' | { regionalId: string | null };

export function filtrarPorExpansao<T extends EventoDoKanban>(eventos: T[], expansao: ExpansaoColuna): T[] {
  if (expansao === null) return [];
  if (expansao === 'todos') return eventos;
  return eventos.filter((e) => (e.regional_id ?? null) === expansao.regionalId);
}

/**
 * O evento nasceu do historico do Mutual (0112)? A RPC `transportar_eventos_historico`
 * abre a descricao com esta frase — e ela que o card usa para mostrar o selo.
 */
export const PREFIXO_DO_MUTUAL = 'Trazido do historico do Mutual';
export function veioDoMutual(descricao: string | null | undefined): boolean {
  return (descricao ?? '').startsWith(PREFIXO_DO_MUTUAL);
}

// Busca do Kanban (28/10/2026): achar o evento sem abrir coluna por coluna.
// Os eventos ja estao todos na tela (useEventos), entao a busca e local e
// responde a cada tecla. Casa protocolo, placa, associado, CPF/CNPJ, chassi,
// tipo do evento e unidade — sem acento, sem caixa e sem separador.
export interface EventoBuscavel {
  numero_protocolo?: string | null;
  descricao?: string | null;
  veiculos?: { placa?: string | null; chassi?: string | null; marca?: string | null; modelo?: string | null } | null;
  clientes?: { nome_razao_social?: string | null; cpf_cnpj?: string | null } | null;
  tipos_evento?: { nome?: string | null } | null;
  regionais?: { nome?: string | null } | null;
}

function normalizar(v: string | null | undefined): string {
  return (v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
const soAlfanumerico = (v: string | null | undefined) => normalizar(v).replace(/[^a-z0-9]/g, '');

/** Termo com menos de 2 caracteres nao filtra (devolve true para todos). */
export function eventoCasaComBusca(evento: EventoBuscavel, termo: string): boolean {
  const t = normalizar(termo).trim();
  if (t.length < 2) return true;
  const textos = [
    evento.clientes?.nome_razao_social,
    evento.tipos_evento?.nome,
    evento.regionais?.nome,
    evento.veiculos?.marca,
    evento.veiculos?.modelo,
  ].map(normalizar);
  // cada palavra do termo tem de aparecer em algum lugar ("joao civic" acha)
  const palavras = t.split(/\s+/).filter(Boolean);
  const alfa = soAlfanumerico(termo);
  const digitos = termo.replace(/\D/g, '');
  const chaves = [
    soAlfanumerico(evento.numero_protocolo),
    soAlfanumerico(evento.veiculos?.placa),
    soAlfanumerico(evento.veiculos?.chassi),
  ];
  if (alfa.length >= 2 && chaves.some((c) => c.includes(alfa))) return true;
  if (digitos.length >= 3 && (evento.clientes?.cpf_cnpj ?? '').replace(/\D/g, '').includes(digitos)) return true;
  const tudo = [...textos, ...chaves].join(' ');
  return palavras.every((p) => tudo.includes(p) || tudo.includes(p.replace(/[^a-z0-9]/g, '')));
}
