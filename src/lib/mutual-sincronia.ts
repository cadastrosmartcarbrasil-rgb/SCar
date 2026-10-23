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
