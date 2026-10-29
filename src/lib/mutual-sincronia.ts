// A ROTINA AUTOMATICA da convivencia com o Mutual (0107) — a parte pura.
// O agendador do VPS chama /api/v1/mutual/sincronizar, que recaptura o que a
// carga le e roda a carga de cada unidade. Sem ela, a venda feita no Mutual
// depois da ultima captura nao existe aqui (foi o caso da LVA7H55: 161
// veiculos ativos vendidos depois de 09/09 fora da base em 14/10/2026).

import type { EntidadeMutual } from './mutual';

/**
 * O que a carga le, na ordem em que precisa. A EQUIPE vem antes (e ela que
 * diz a unidade), o CONTRATO traz a equipe e o dia de vencimento, o ASSOCIADO e
 * o ENDERECO viram o cadastro, e o OBJETO (o veiculo) depois, para pegar o
 * que entrou enquanto o resto era puxado. O EVENTO vem no fim: o historico de
 * eventos (0101) le o evento pelo veiculo do objeto, e sem ele aqui o evento
 * aberto no Mutual depois da ultima captura manual nao chegava ao SAC
 * (23/10/2026: 502 eventos de associados ja carregados fora do historico).
 */
export const ENTIDADES_DA_SINCRONIA: EntidadeMutual[] = [
  'SALE_TEAM', 'CONTRACT', 'PERSON', 'ADDRESS', 'CONTRACT_OBJECT', 'EVENT',
];

/** Teto de paginas por entidade numa rodada (ADDRESS tem ~90 de 500). */
export const PAGINAS_MAXIMAS_SINCRONIA = 400;

/** Bloco da carga no agendador. O service_role herda o teto de 8 s do
 *  `authenticator` (a tela, com 20 s, usa 200): metade e folga. */
export const LOTE_CARGA_AGENDADOR = 100;

/** As unidades a recarregar: as que tem ao menos uma equipe de vendas ligada.
 *  Unidade sem equipe nao tem carteira do Mutual — rodar nela e so leitura gasta. */
export function unidadesParaCarregar(vinculosEquipe: Array<{ registro_id: string | null }>): string[] {
  return Array.from(new Set(
    vinculosEquipe.map((v) => v.registro_id).filter((x): x is string => !!x),
  )).sort();
}

/**
 * Equipes de vendas que aparecem nos CONTRATOS e nao tem unidade escolhida.
 * Veiculo de equipe sem de-para NAO entra na carga (`regional_id` nulo aqui e
 * MATRIZ, entao a carga nao chuta). A rotina nao decide por ninguem: ela
 * nomeia a equipe e quantos contratos pesam nela, e a tela faz o vinculo.
 */
export function equipesSemUnidade(
  contratos: Array<{ sales_team_id: string | null }>,
  equipesLigadas: Set<string>,
): Array<{ equipe: string; contratos: number }> {
  const conta = new Map<string, number>();
  for (const c of contratos) {
    const e = (c.sales_team_id ?? '').trim();
    if (!e || equipesLigadas.has(e)) continue;
    conta.set(e, (conta.get(e) ?? 0) + 1);
  }
  return Array.from(conta, ([equipe, n]) => ({ equipe, contratos: n }))
    .sort((a, b) => b.contratos - a.contratos || a.equipe.localeCompare(b.equipe));
}

export interface PassoSincronia {
  etapa: string;          // ex.: 'captura CONTRACT', 'carga GRANDE NATAL'
  ok: boolean;
  detalhe: string;
}

/** Uma linha para o log do VPS: o que deu certo, o que falhou e o primeiro motivo. */
export function resumoDaSincronia(passos: PassoSincronia[]): string {
  const falhas = passos.filter((p) => !p.ok);
  const base = `${passos.length - falhas.length}/${passos.length} etapas ok`;
  if (falhas.length === 0) return base;
  return `${base}; FALHOU: ${falhas.map((f) => `${f.etapa} (${f.detalhe})`).join('; ')}`;
}

// ---------------------------------------------------------------------------
// BOLETOS (INVOICE) na rotina — 23/10/2026. O historico de boletos (0097/0099)
// so era atualizado a mao (recapturar INVOICE + Importar), entao boleto pago,
// vencido ou emitido no Mutual depois disso nao aparecia no SAC nem no painel.
// INVOICE tem ~207 mil linhas: a captura e INCREMENTAL (`updated_at__gte`),
// com uma passada COMPLETA por semana como rede de seguranca — o filtro e
// declarado no swagger, mas nunca foi provado com o payload (ele nao traz
// `updated_at`), entao a semanal corrige o que ele deixar passar.
// ---------------------------------------------------------------------------

/** Teto de paginas da captura de INVOICE (~420 paginas de 500 em 23/10/2026). */
export const PAGINAS_MAXIMAS_INVOICE = 700;

/** Bloco da importacao dos boletos no agendador. 4.000 levam ~1,3 s sem gravar
 *  (medido em 23/10/2026); 2.000 deixa folga no teto de 8 s do service_role. */
export const LOTE_BOLETOS_AGENDADOR = 2000;

/** Folga do incremental: o que mudou ate N dias antes da ultima captura completa. */
export const MARGEM_INCREMENTAL_DIAS = 3;

export type ModoCapturaInvoice =
  | { completa: true; motivo: string }
  | { completa: false; desde: string };

/**
 * Como capturar os boletos nesta rodada. `ultimaCompleta` e o INICIO da ultima
 * captura de INVOICE feita PELA ROTINA que terminou sem erro e sem parar no teto
 * (captura manual da tela vem em blocos e nao prova que pegou tudo).
 * Completa quando: nao ha marca, e domingo em Sao Paulo, ou a marca tem mais de
 * 8 dias (a rotina ficou parada). Senao, incremental desde a marca menos a folga.
 */
export function modoCapturaInvoice(ultimaCompleta: string | null, agora: Date): ModoCapturaInvoice {
  if (!ultimaCompleta) return { completa: true, motivo: 'primeira captura da rotina' };
  const marca = new Date(ultimaCompleta);
  if (Number.isNaN(marca.getTime())) return { completa: true, motivo: 'marca ilegivel' };
  const domingo = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' })
    .format(agora) === 'Sun';
  if (domingo) return { completa: true, motivo: 'passada semanal (domingo)' };
  const dias = (agora.getTime() - marca.getTime()) / 86_400_000;
  if (dias > 8) return { completa: true, motivo: `ultima captura completa ha ${Math.floor(dias)} dias` };
  const desde = new Date(marca.getTime() - MARGEM_INCREMENTAL_DIAS * 86_400_000);
  // DATA E HORA, em ISO: o Mutual recusa so a data com HTTP 400 ("updated_at__gte:
  // Informe uma data/hora valida") — de 26 a 29/10/2026 a rotina nao trouxe boleto nenhum.
  return { completa: false, desde: `${desde.toISOString().slice(0, 19)}Z` };
}
