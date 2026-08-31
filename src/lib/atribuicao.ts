/**
 * Atribuicao do lead — regras puras.
 *
 * Espelho de `supabase/migrations/0041_atribuicao_lead.sql`. Tres perguntas
 * decidem tudo quando alguem preenche um hotlink:
 *   1. essa pessoa ja e associada?      -> CARTEIRA (nao e venda nova)
 *   2. ja existe lead protegido dela?   -> DUPLICADO (fica com quem captou)
 *   3. o lead antigo perdeu a protecao? -> REATIVACAO (quem trouxe agora leva)
 * Nenhuma delas -> NOVO.
 */

export type TipoCaptura = 'NOVO' | 'DUPLICADO' | 'REATIVACAO' | 'CARTEIRA';

export const ROTULO_CAPTURA: Record<TipoCaptura, { rotulo: string; classe: string; ajuda: string }> = {
  NOVO: {
    rotulo: 'Novo contato',
    classe: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    ajuda: 'Ninguem da casa conhece esta pessoa.',
  },
  DUPLICADO: {
    rotulo: 'Ja em atendimento',
    classe: 'bg-amber-50 text-amber-800 ring-amber-200',
    ajuda: 'Ja existe lead aberto e protegido — segue com quem captou primeiro.',
  },
  REATIVACAO: {
    rotulo: 'Reativacao',
    classe: 'bg-sky-50 text-sky-700 ring-sky-200',
    ajuda: 'Havia um lead antigo sem protecao: quem trouxe agora assume.',
  },
  CARTEIRA: {
    rotulo: 'Ja e associado',
    classe: 'bg-violet-50 text-violet-700 ring-violet-200',
    ajuda: 'Nao e venda nova: o caso vai para o atendimento.',
  },
};

export const MOTIVOS_ATRIBUICAO: Record<string, string> = {
  HOTLINK: 'Captado pelo hotlink',
  HOTLINK_REATIVACAO: 'Retomado pelo hotlink',
  HOTLINK_CARTEIRA: 'Hotlink — ja era associado',
  RECAPTURA_PROTEGIDA: 'Voltou pelo link (lead protegido)',
  RODIZIO: 'Distribuido por rodizio',
  MANUAL: 'Distribuido pelo gestor',
  DEVOLVIDO_SEM_CONTATO: 'Devolvido ao pool por inatividade',
  CONTATO: 'Contato registrado',
};

export function rotuloMotivo(motivo?: string | null): string {
  return MOTIVOS_ATRIBUICAO[motivo ?? ''] ?? motivo ?? '—';
}

export interface ParametrosAtribuicao {
  /** Dias em que o lead e de quem captou. 0 desliga a protecao. */
  diasProtecao: number;
  /** Dias sem interacao ate voltar ao pool. 0 = nunca volta. */
  diasSemContato: number;
  distribuicao: 'MANUAL' | 'RODIZIO';
}

export const PADRAO_ATRIBUICAO: ParametrosAtribuicao = {
  diasProtecao: 30,
  diasSemContato: 7,
  distribuicao: 'MANUAL',
};

export function diasDesde(iso: string | null | undefined, hoje = new Date()): number {
  if (!iso) return Infinity;
  const ms = hoje.getTime() - new Date(iso).getTime();
  return Math.floor(ms / 86_400_000);
}

export interface LeadParaProtecao {
  vendedorId?: string | null;
  status: string;
  ultimaInteracaoEm?: string | null;
  atribuidoEm?: string | null;
  createdAt: string;
}

/**
 * O lead ainda esta protegido? Lead sem dono, perdido ou ja convertido nao
 * protege ninguem; `diasProtecao = 0` desliga a regra.
 */
export function protecaoAtiva(
  lead: LeadParaProtecao,
  diasProtecao: number,
  hoje = new Date(),
): boolean {
  if (!lead.vendedorId) return false;
  if (lead.status === 'PERDIDO' || lead.status === 'ATIVO') return false;
  if (diasProtecao <= 0) return false;
  const ref = lead.ultimaInteracaoEm ?? lead.atribuidoEm ?? lead.createdAt;
  return diasDesde(ref, hoje) < diasProtecao;
}

/** Quantos dias faltam para o lead sair da protecao (0 = ja saiu). */
export function diasDeProtecaoRestantes(
  lead: LeadParaProtecao,
  diasProtecao: number,
  hoje = new Date(),
): number {
  if (!protecaoAtiva(lead, diasProtecao, hoje)) return 0;
  const ref = lead.ultimaInteracaoEm ?? lead.atribuidoEm ?? lead.createdAt;
  return Math.max(0, diasProtecao - diasDesde(ref, hoje));
}

/** O lead ja passou do prazo de inatividade e deve voltar ao pool? */
export function deveVoltarAoPool(
  lead: LeadParaProtecao,
  diasSemContato: number,
  hoje = new Date(),
): boolean {
  if (!lead.vendedorId) return false;
  if (diasSemContato <= 0) return false;
  if (['PERDIDO', 'ATIVO', 'EM_AUDITORIA', 'APROVADO'].includes(lead.status)) return false;
  const ref = lead.ultimaInteracaoEm ?? lead.atribuidoEm ?? lead.createdAt;
  return diasDesde(ref, hoje) > diasSemContato;
}

/** Mensagem honesta para quem preencheu o formulario publico. */
export function mensagemAoVisitante(tipo: TipoCaptura, vendedor?: string | null): string {
  switch (tipo) {
    case 'CARTEIRA':
      return 'Voce ja e nosso associado — vamos falar com voce pelo atendimento.';
    case 'DUPLICADO':
      return `Ja temos o seu contato — ${vendedor ?? 'nossa equipe'} vai falar com voce.`;
    default:
      return 'Recebemos o seu contato! Em breve falamos com voce.';
  }
}
