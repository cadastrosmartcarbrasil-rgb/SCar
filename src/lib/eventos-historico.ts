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

// ----------------------------------------------------------------------------
// Uma lista so de eventos do associado (ou do veiculo): os do SCar
// (`eventos_sinistro`) e o historico do Mutual (`eventos_historico`). Usada pelo
// SAC, pela ficha do associado e pela ficha do veiculo — a mesma leitura nas tres.
// ----------------------------------------------------------------------------
export type EventoUnificado = {
  id: string;
  origem: 'SCAR' | 'MUTUAL';
  veiculo_id: string | null;
  placa: string | null;
  numero_protocolo: string | null;
  tipo: string | null;
  /** SCAR: o status do evento. MUTUAL: SituacaoHistorico. */
  status: string;
  data_ocorrencia: string | null;
  data_conclusao: string | null;
  envolvimento: string | null;
};

export type EventoScarLeitura = {
  id: string;
  veiculo_id: string | null;
  numero_protocolo: string | null;
  status: string;
  data_ocorrencia: string | null;
  tipos_evento?: { nome: string } | null;
  veiculos?: { placa: string } | null;
};

export type EventoMutualLeitura = {
  id: string;
  veiculo_id: string | null;
  placa: string | null;
  protocolo: string | null;
  data_evento: string | null;
  data_conclusao: string | null;
  tipos: string[] | null;
  envolvimento: string | null;
};

/** Mais recente primeiro; sem data vai para o fim. Com `veiculoId`, so os dele. */
export function unirEventosCliente(
  scar: EventoScarLeitura[],
  mutual: EventoMutualLeitura[],
  veiculoId?: string | null,
): EventoUnificado[] {
  const todos: EventoUnificado[] = [
    ...scar.map((e) => ({
      id: e.id,
      origem: 'SCAR' as const,
      veiculo_id: e.veiculo_id,
      placa: e.veiculos?.placa ?? null,
      numero_protocolo: e.numero_protocolo,
      tipo: e.tipos_evento?.nome ?? null,
      status: e.status,
      data_ocorrencia: e.data_ocorrencia,
      data_conclusao: null,
      envolvimento: null,
    })),
    ...mutual.map((e) => ({
      id: e.id,
      origem: 'MUTUAL' as const,
      veiculo_id: e.veiculo_id,
      placa: e.placa,
      numero_protocolo: e.protocolo,
      tipo: rotuloTipos(e.tipos),
      status: situacaoHistorico(e),
      data_ocorrencia: e.data_evento,
      data_conclusao: e.data_conclusao,
      envolvimento: rotuloEnvolvimento(e.envolvimento),
    })),
  ];
  return todos
    .filter((e) => !veiculoId || e.veiculo_id === veiculoId)
    .sort((a, b) => (b.data_ocorrencia ?? '').localeCompare(a.data_ocorrencia ?? ''));
}

// ----------------------------------------------------------------------------
// LEVAR AO KANBAN (0112) — o evento do historico ESCOLHIDO vira evento do SCar,
// sempre em ABERTO. Nada vai sozinho: o Mutual nao diz quem ainda esta em
// tratamento. A regra que vale e a do banco (`transportar_eventos_historico`);
// aqui e o espelho para a tela nao oferecer o que o banco recusa.
// ----------------------------------------------------------------------------
export type SituacaoTransporte =
  | 'LEVADO' | 'JA_NO_KANBAN' | 'SEM_VEICULO' | 'SEM_DATA' | 'FORA_DA_UNIDADE' | 'NAO_ENCONTRADO';

export const ROTULO_TRANSPORTE: Record<SituacaoTransporte, string> = {
  LEVADO: 'levados ao Kanban',
  JA_NO_KANBAN: 'ja estavam no Kanban',
  SEM_VEICULO: 'sem veiculo na base',
  SEM_DATA: 'sem data da ocorrencia',
  FORA_DA_UNIDADE: 'de outra unidade',
  NAO_ENCONTRADO: 'nao encontrados',
};

/** Pode ir ao Kanban? Ja levado, sem veiculo ou sem data nao vao. */
export function podeLevarAoKanban(e: {
  evento_id?: string | null; veiculo_id: string | null; data_evento: string | null;
}): { pode: boolean; motivo: string | null } {
  if (e.evento_id) return { pode: false, motivo: 'Ja esta no Kanban' };
  if (!e.veiculo_id) return { pode: false, motivo: 'Veiculo fora da base' };
  if (!e.data_evento) return { pode: false, motivo: 'Sem data da ocorrencia' };
  return { pode: true, motivo: null };
}

/** "3 levados ao Kanban · 1 sem veiculo na base" — a ordem de ROTULO_TRANSPORTE. */
export function resumoTransporte(linhas: { situacao: string }[]): {
  levados: number; texto: string;
} {
  const cont = new Map<string, number>();
  for (const l of linhas) cont.set(l.situacao, (cont.get(l.situacao) ?? 0) + 1);
  const partes = (Object.keys(ROTULO_TRANSPORTE) as SituacaoTransporte[])
    .filter((s) => cont.get(s))
    .map((s) => `${cont.get(s)} ${ROTULO_TRANSPORTE[s]}`);
  return { levados: cont.get('LEVADO') ?? 0, texto: partes.join(' · ') || 'Nada a levar' };
}
