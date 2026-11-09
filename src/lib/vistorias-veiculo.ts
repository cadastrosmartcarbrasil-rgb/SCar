// ============================================================================
// ABA VISTORIAS da ficha do veiculo — a regua pura da tela.
// A vistoria de ADESAO (nasce no lead e passa ao veiculo na autorizacao, 0034)
// e as REVISTORIAS da 2a via (0137) moram em `vistorias`/`vistoria_anexos`;
// aqui se decide o rotulo, a situacao, o nome de cada pose e a ordem.
// ============================================================================

export interface AnexoVistoria {
  id: string;
  url: string;
  tipo: string | null;
  descricao: string | null;
  created_at: string;
  tamanho_bytes: number | null;
  enviado_pelo_cliente: boolean;
  duracao_segundos: number | null;
}

export interface RevistoriaResumo {
  situacao: string;
  enviado_em: string | null;
  analisado_em: string | null;
  observacao_analise: string | null;
  motivo_reprovacao: string | null;
  dispensa_justificativa: string | null;
  vencimento_referencia: string | null;
  dias_atraso: number | null;
}

export type Tom = 'verde' | 'ambar' | 'vermelho' | 'cinza' | 'azul';

/** Nome da vistoria para quem le a ficha. */
export function rotuloVistoria(tipo: string | null | undefined): string {
  const t = (tipo ?? '').trim().toLowerCase();
  if (t === 'inicial' || t === 'adesao') return 'Vistoria de adesão';
  if (t === 'revistoria_cobranca') return 'Revistoria da 2ª via';
  if (t === 'periodica') return 'Vistoria periódica';
  if (t === 'evento') return 'Vistoria de evento';
  if (t === 'acessorios') return 'Vistoria de acessórios';
  if (!t) return 'Vistoria';
  return 'Vistoria · ' + t.replace(/_/g, ' ');
}

const SITUACAO_REVISTORIA: Record<string, { texto: string; tom: Tom }> = {
  AGUARDANDO: { texto: 'Aguardando o associado', tom: 'ambar' },
  EM_ANALISE: { texto: 'Em análise', tom: 'azul' },
  APROVADA: { texto: 'Aprovada', tom: 'verde' },
  UTILIZADA: { texto: 'Aprovada · usada na 2ª via', tom: 'verde' },
  DISPENSADA: { texto: 'Liberada sem revistoria', tom: 'cinza' },
  CANCELADA: { texto: 'Cancelada', tom: 'cinza' },
  EXPIRADA: { texto: 'Expirada', tom: 'cinza' },
};

const SITUACAO_VISTORIA: Record<string, { texto: string; tom: Tom }> = {
  AGENDADA: { texto: 'Agendada', tom: 'azul' },
  PENDENTE: { texto: 'Pendente', tom: 'ambar' },
  APROVADA: { texto: 'Aprovada', tom: 'verde' },
  REPROVADA: { texto: 'Reprovada', tom: 'vermelho' },
};

/**
 * A situacao que a ficha mostra. Na revistoria vale a situacao do pedido (0137),
 * mais rica que o status da vistoria; reprovada e reenviada aparece como tal.
 */
export function situacaoVistoria(
  status: string | null | undefined,
  revistoria?: RevistoriaResumo | null,
): { texto: string; tom: Tom } {
  if (revistoria) {
    const s = SITUACAO_REVISTORIA[revistoria.situacao];
    if (revistoria.situacao === 'AGUARDANDO' && revistoria.motivo_reprovacao) {
      return { texto: 'Reprovada · aguardando novo envio', tom: 'vermelho' };
    }
    if (s) return s;
    return { texto: revistoria.situacao, tom: 'cinza' };
  }
  const v = SITUACAO_VISTORIA[(status ?? '').toUpperCase()];
  return v ?? { texto: status ?? '—', tom: 'cinza' };
}

/** Video pela pose (REV_VIDEO_*) ou pela extensao do arquivo. */
export function ehVideo(a: Pick<AnexoVistoria, 'tipo' | 'url'>): boolean {
  if ((a.tipo ?? '').toUpperCase().startsWith('REV_VIDEO')) return true;
  return /\.(mp4|webm|mov|m4v|3gp)$/i.test(a.url ?? '');
}

/** Nome da pose pelo catalogo; sem catalogo, o codigo legivel. */
export function nomeDaPose(codigo: string | null | undefined, catalogo: Record<string, string>): string {
  if (!codigo) return 'Arquivo';
  const c = catalogo[codigo] ?? catalogo[codigo.toUpperCase()];
  if (c) return c;
  const t = codigo.replace(/^REV_/i, '').replace(/_/g, ' ').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Uma foto por pose (a mais recente vale, como na venda — 0040) na ordem do
 * catalogo; arquivo sem pose vai ao fim. Devolve tambem quantos envios antigos
 * foram substituidos, para a tela dizer que houve reenvio.
 */
export function anexosVigentes(
  anexos: AnexoVistoria[],
  ordem: Record<string, number>,
): { vigentes: AnexoVistoria[]; substituidos: number } {
  const porPose = new Map<string, AnexoVistoria>();
  let substituidos = 0;
  const recentes = [...anexos].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  for (const a of recentes) {
    const chave = a.tipo ? a.tipo.toUpperCase() : `__${a.id}`;
    if (porPose.has(chave)) { substituidos++; continue; }
    porPose.set(chave, a);
  }
  const pos = (a: AnexoVistoria) => (a.tipo ? ordem[a.tipo] ?? ordem[a.tipo.toUpperCase()] ?? 900 : 999);
  const vigentes = [...porPose.values()].sort((a, b) => pos(a) - pos(b) || a.created_at.localeCompare(b.created_at));
  return { vigentes, substituidos };
}

/** "30 s", "1 min 05 s". */
export function duracaoLegivel(segundos: number | null | undefined): string | null {
  if (segundos == null || !Number.isFinite(Number(segundos))) return null;
  const s = Math.round(Number(segundos));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}
