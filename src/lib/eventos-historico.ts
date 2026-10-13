// ============================================================================
// HISTORICO DE EVENTOS DO MUTUAL (0101) — a regua pura da tela.
// O historico vive em `eventos_historico`, nunca em `eventos_sinistro`: e so
// consulta. O status que o Mutual manda na listagem nao informa ("ANDAMENTO"
// em 2.909 de 2.909), entao a tela NAO o repete como se fosse situacao.
// ============================================================================

export type SituacaoHistorico = 'CONCLUIDO' | 'SEM_ENCERRAMENTO';

/** So a data de conclusao prova encerramento; o status da listagem nao. */
export function situacaoHistorico(e: { data_conclusao: string | null }): SituacaoHistorico {
  return e.data_conclusao ? 'CONCLUIDO' : 'SEM_ENCERRAMENTO';
}

export const ROTULO_SITUACAO_HISTORICO: Record<SituacaoHistorico, string> = {
  CONCLUIDO: 'Concluido no Mutual',
  SEM_ENCERRAMENTO: 'Sem encerramento registrado',
};

/** "COLISÃO + PARABRISA"; lista vazia vira "Nao classificado". */
export function rotuloTipos(tipos: string[] | null | undefined): string {
  const t = (tipos ?? []).map((x) => x.trim()).filter(Boolean);
  return t.length ? t.join(' + ') : 'Nao classificado';
}

/** VITIMA/CAUSADOR/NÃO SE APLICA -> texto de leitura. */
export function rotuloEnvolvimento(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  if (s === 'VITIMA') return 'Vitima';
  if (s === 'CAUSADOR') return 'Causador';
  if (s === 'NAO SE APLICA') return null;
  return v;
}
