// Prazo regulatorio do evento — Resolucao CNSP 491/2026, Art. 22 (0113).
// 90 dias corridos contados do AVISO em conjunto com a DOCUMENTACAO COMPLETA;
// estourado o prazo, a associacao perde o direito de recusa.
//
// ESPELHO de `prazo_regulatorio_nivel` e de `eventos_prazos` (SQL): mexeu num
// lado, mexa no outro e nos dois testes. As datas sao ISO 'AAAA-MM-DD' no dia de
// Sao Paulo (o banco ja devolve assim).

export const PRAZO_REGULATORIO_DIAS = 90;

/**
 * Os 4 marcos de alerta (0114): configurados em Configuracoes -> Prazos e
 * Documentos do Evento (`empresa`). O vencido nao e marco: e "passou de 90".
 */
export interface MarcosPrazo {
  aviso: number;
  atencao: number;
  urgencia: number;
  critico: number;
}

export const MARCOS_PADRAO: MarcosPrazo = { aviso: 30, atencao: 60, urgencia: 75, critico: 85 };

/** O banco recusa o mesmo (chk_empresa_prazo_evento_marcos); aqui a tela explica antes. */
export function validarMarcos(m: MarcosPrazo): string | null {
  const v = [m.aviso, m.atencao, m.urgencia, m.critico];
  if (v.some((x) => !Number.isInteger(x))) return 'Informe os quatro marcos em dias inteiros.';
  if (m.aviso < 1) return 'O aviso precisa ser de pelo menos 1 dia.';
  if (!(m.aviso < m.atencao && m.atencao < m.urgencia && m.urgencia < m.critico)) {
    return 'Os marcos precisam ser crescentes: aviso < atencao < urgencia < critico.';
  }
  if (m.critico > PRAZO_REGULATORIO_DIAS) return `O critico nao pode passar de ${PRAZO_REGULATORIO_DIAS} dias (prazo legal).`;
  return null;
}

export type NivelPrazo =
  | 'DOCUMENTACAO_PENDENTE'
  | 'NO_PRAZO'
  | 'AVISO'
  | 'ATENCAO'
  | 'URGENCIA'
  | 'CRITICO'
  | 'VENCIDO'
  | 'ENCERRADO_NO_PRAZO'
  | 'ENCERRADO_FORA_DO_PRAZO'
  | 'ENCERRADO_SEM_PRAZO';

export function nivelDoPrazo(
  dias: number | null,
  iniciado: boolean,
  encerrado: boolean,
  marcos: MarcosPrazo = MARCOS_PADRAO,
): NivelPrazo {
  if (!iniciado || dias == null) return encerrado ? 'ENCERRADO_SEM_PRAZO' : 'DOCUMENTACAO_PENDENTE';
  if (encerrado) return dias > PRAZO_REGULATORIO_DIAS ? 'ENCERRADO_FORA_DO_PRAZO' : 'ENCERRADO_NO_PRAZO';
  if (dias > PRAZO_REGULATORIO_DIAS) return 'VENCIDO';
  if (dias >= marcos.critico) return 'CRITICO';
  if (dias >= marcos.urgencia) return 'URGENCIA';
  if (dias >= marcos.atencao) return 'ATENCAO';
  if (dias >= marcos.aviso) return 'AVISO';
  return 'NO_PRAZO';
}

/** Mesma ordem do `order by` da RPC: o mais grave primeiro. */
export const ORDEM_NIVEL: NivelPrazo[] = [
  'VENCIDO', 'CRITICO', 'URGENCIA', 'ATENCAO', 'AVISO', 'NO_PRAZO',
  'DOCUMENTACAO_PENDENTE', 'ENCERRADO_FORA_DO_PRAZO', 'ENCERRADO_NO_PRAZO', 'ENCERRADO_SEM_PRAZO',
];

function paraDia(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(a, m - 1, d) / 86_400_000;
}

/** b - a, em dias corridos. */
export function diasEntre(a: string, b: string): number {
  return Math.round(paraDia(b) - paraDia(a));
}

export function somarDias(iso: string, n: number): string {
  return new Date((paraDia(iso) + n) * 86_400_000).toISOString().slice(0, 10);
}

export interface EntradaPrazo {
  aviso: string;
  documentacaoCompleta: string | null;
  encerradoEm?: string | null;
  hoje: string;
  marcos?: MarcosPrazo;
}

export interface CalculoPrazo {
  inicio: string | null;
  limite: string | null;
  dias: number | null;
  restantes: number | null;
  diasDesdeAviso: number;
  nivel: NivelPrazo;
}

/** O relogio: inicio = o MAIS TARDE entre aviso e documentacao completa. */
export function calcularPrazo(e: EntradaPrazo): CalculoPrazo {
  const ref = e.encerradoEm ?? e.hoje;
  const inicio = e.documentacaoCompleta
    ? (diasEntre(e.aviso, e.documentacaoCompleta) > 0 ? e.documentacaoCompleta : e.aviso)
    : null;
  const dias = inicio ? diasEntre(inicio, ref) : null;
  const limite = inicio ? somarDias(inicio, PRAZO_REGULATORIO_DIAS) : null;
  return {
    inicio,
    limite,
    dias,
    restantes: limite && !e.encerradoEm ? diasEntre(e.hoje, limite) : null,
    diasDesdeAviso: diasEntre(e.aviso, ref),
    nivel: nivelDoPrazo(dias, inicio != null, !!e.encerradoEm, e.marcos),
  };
}

/** Quanto da barra esta preenchida (0..1). Passou de 90, fica cheia. */
export function fracaoDoPrazo(dias: number | null): number {
  if (dias == null || dias <= 0) return 0;
  return Math.min(dias / PRAZO_REGULATORIO_DIAS, 1);
}

export interface EstiloNivel {
  rotulo: string;
  /** classe do selo */
  selo: string;
  /** classe de fundo do preenchimento da barra */
  barra: string;
  descricao: string;
}

// Verde ate 59 (o marco de 30 e aviso preventivo, ainda verde), amarelo 60-74,
// laranja 75-84, vermelho 85-90 e vencido em vermelho cheio.
export const ESTILO_NIVEL: Record<NivelPrazo, EstiloNivel> = {
  DOCUMENTACAO_PENDENTE: {
    rotulo: 'Documentacao pendente',
    selo: 'border-slate-300 bg-slate-100 text-slate-700',
    barra: 'bg-slate-400',
    descricao: 'O prazo de 90 dias ainda nao corre: falta documentacao obrigatoria.',
  },
  NO_PRAZO: {
    rotulo: 'No prazo',
    selo: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    barra: 'bg-emerald-500',
    descricao: 'Antes do primeiro marco de alerta.',
  },
  AVISO: {
    rotulo: 'Aviso preventivo',
    selo: 'border-emerald-300 bg-emerald-100 text-emerald-900',
    barra: 'bg-emerald-500',
    descricao: 'Aviso preventivo: passou do primeiro marco.',
  },
  ATENCAO: {
    rotulo: 'Atencao',
    selo: 'border-amber-300 bg-amber-100 text-amber-900',
    barra: 'bg-amber-500',
    descricao: 'Meio do caminho: passou do marco de atencao.',
  },
  URGENCIA: {
    rotulo: 'Urgencia',
    selo: 'border-orange-300 bg-orange-100 text-orange-900',
    barra: 'bg-orange-500',
    descricao: 'Risco operacional: passou do marco de urgencia.',
  },
  CRITICO: {
    rotulo: 'Critico',
    selo: 'border-rose-300 bg-rose-100 text-rose-900',
    barra: 'bg-rose-600',
    descricao: 'Alerta vermelho para a diretoria: passou do marco critico.',
  },
  VENCIDO: {
    rotulo: 'Prazo vencido',
    selo: 'border-rose-700 bg-rose-700 text-white',
    barra: 'bg-rose-700',
    descricao: 'Passou de 90 dias: a associacao perdeu o direito de recusa (Art. 22).',
  },
  ENCERRADO_NO_PRAZO: {
    rotulo: 'Encerrado no prazo',
    selo: 'border-slate-200 bg-superficie text-slate-600',
    barra: 'bg-slate-400',
    descricao: 'Regulacao encerrada dentro dos 90 dias.',
  },
  ENCERRADO_FORA_DO_PRAZO: {
    rotulo: 'Encerrado fora do prazo',
    selo: 'border-rose-300 bg-superficie text-rose-700',
    barra: 'bg-rose-400',
    descricao: 'Regulacao encerrada depois dos 90 dias.',
  },
  ENCERRADO_SEM_PRAZO: {
    rotulo: 'Encerrado',
    selo: 'border-slate-200 bg-superficie text-slate-600',
    barra: 'bg-slate-300',
    descricao: 'Encerrado sem documentacao completa registrada.',
  },
};

export function estiloDoNivel(nivel: string): EstiloNivel {
  return ESTILO_NIVEL[nivel as NivelPrazo] ?? {
    rotulo: nivel, selo: 'border-slate-200 bg-slate-100 text-slate-700', barra: 'bg-slate-400', descricao: nivel,
  };
}

/** A descricao com os numeros em vigor ("passou de 60 dias"). */
export function descricaoDoNivel(nivel: string, marcos: MarcosPrazo = MARCOS_PADRAO): string {
  switch (nivel) {
    case 'NO_PRAZO': return `Menos de ${marcos.aviso} dias desde a documentacao completa.`;
    case 'AVISO': return `Aviso preventivo: passou de ${marcos.aviso} dias.`;
    case 'ATENCAO': return `Meio do caminho: passou de ${marcos.atencao} dias.`;
    case 'URGENCIA': return `Risco operacional: passou de ${marcos.urgencia} dias.`;
    case 'CRITICO': return `Alerta vermelho para a diretoria: passou de ${marcos.critico} dias.`;
    default: return estiloDoNivel(nivel).descricao;
  }
}

export function rotuloMarco(marco: number): string {
  return marco >= 91 ? 'Vencido' : `${marco} dias`;
}

/** Em aberto e dentro dos 90 dias, com 85 ou mais: o que a diretoria precisa ver. */
export function nivelGrave(nivel: string): boolean {
  return nivel === 'CRITICO' || nivel === 'VENCIDO';
}

/** "40 de 90 dias · faltam 50" / "vencido ha 10 dias" / "aguardando documentacao (12 dias desde o aviso)". */
export function textoDoPrazo(p: {
  nivel: string;
  dias_transcorridos: number | null;
  dias_restantes: number | null;
  dias_desde_aviso: number | null;
}): string {
  if (p.nivel === 'DOCUMENTACAO_PENDENTE') {
    return `Aguardando documentacao · ${p.dias_desde_aviso ?? 0} dia(s) desde o aviso`;
  }
  if (p.dias_transcorridos == null) return estiloDoNivel(p.nivel).rotulo;
  if (p.nivel.startsWith('ENCERRADO')) return `Encerrado com ${p.dias_transcorridos} de 90 dias`;
  if (p.dias_restantes != null && p.dias_restantes < 0) {
    return `${p.dias_transcorridos} dias · vencido ha ${-p.dias_restantes} dia(s)`;
  }
  if (p.dias_restantes === 0) return `${p.dias_transcorridos} de 90 dias · vence HOJE`;
  return `${p.dias_transcorridos} de 90 dias · faltam ${p.dias_restantes}`;
}

/** Contagem por nivel, para os cartoes do painel. */
export function contarPorNivel<T extends { nivel: string }>(lista: T[]): Record<NivelPrazo, number> {
  const base = Object.fromEntries(ORDEM_NIVEL.map((n) => [n, 0])) as Record<NivelPrazo, number>;
  for (const l of lista) if (l.nivel in base) base[l.nivel as NivelPrazo] += 1;
  return base;
}

// ---------------------------------------------------------------------------
// Rotina diaria (/api/v1/eventos/prazos): quem recebe e-mail
// ---------------------------------------------------------------------------
export interface AlertaNovo {
  alerta_id: string;
  evento_id: string;
  numero_protocolo: string | null;
  marco: number;
  nivel: string;
  dias: number;
  limite_prazo: string;
  regional_id: string | null;
  regional_nome: string | null;
  placa: string | null;
  cliente_nome: string | null;
}

/** So o CRITICO e o VENCIDO viram e-mail para a diretoria; os demais ficam na tela. */
export const NIVEIS_COM_EMAIL = ['CRITICO', 'VENCIDO'];

/** Um aviso por evento (o maior marco novo): a rotina que pegou o atraso nao manda cinco e-mails do mesmo evento. */
export function alertasParaEmail(alertas: AlertaNovo[]): AlertaNovo[] {
  const porEvento = new Map<string, AlertaNovo>();
  for (const a of alertas) {
    if (!NIVEIS_COM_EMAIL.includes(a.nivel)) continue;
    const atual = porEvento.get(a.evento_id);
    if (!atual || a.marco > atual.marco) porEvento.set(a.evento_id, a);
  }
  return Array.from(porEvento.values()).sort((x, y) => y.marco - x.marco || x.limite_prazo.localeCompare(y.limite_prazo));
}

function dataBr(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function linhaDoAlerta(a: AlertaNovo): string {
  const situacao = a.nivel === 'VENCIDO' ? 'VENCIDO' : `${a.dias} dias (critico)`;
  return `${a.numero_protocolo ?? '-'} · ${a.placa ?? '-'} · ${a.cliente_nome ?? '-'} · ${a.regional_nome ?? 'Matriz'} · ${situacao} · limite ${dataBr(a.limite_prazo)}`;
}

export function assuntoEmailPrazos(alertas: AlertaNovo[]): string {
  const vencidos = alertas.filter((a) => a.nivel === 'VENCIDO').length;
  const criticos = alertas.length - vencidos;
  const partes = [vencidos > 0 && `${vencidos} vencido(s)`, criticos > 0 && `${criticos} critico(s)`].filter(Boolean);
  return `Prazo regulatorio de eventos (Art. 22): ${partes.join(' e ')}`;
}
