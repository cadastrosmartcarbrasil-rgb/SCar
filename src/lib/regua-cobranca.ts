/**
 * A REGUA DE COBRANCA (0139): os tres prazos que a associacao configura em
 * Configuracoes -> Empresa. O banco guarda e confere a ordem (CHECK
 * `chk_empresa_regua_ordem`); aqui a tela valida antes de salvar e escreve a
 * regua em linguagem de gente.
 *
 * - bloqueio:   atraso (dias) a partir do qual a 24h e os beneficios param.
 * - revistoria: a 2a via sai SEM revistoria ate este atraso; acima dele, so com
 *               a revistoria aprovada (regra da 0137: "atraso acima de N").
 * - inativacao: atraso a partir do qual o associado sai da fila; quem e cobrado
 *               pelo SCar vira INATIVO, o migrado do Mutual fica "a inativar".
 */
export interface Regua {
  bloqueio: number;
  revistoria: number;
  inativacao: number;
}

export const REGUA_PADRAO: Regua = { bloqueio: 1, revistoria: 5, inativacao: 20 };

const inteiro = (n: number) => Number.isInteger(n);

/** Espelho dos CHECKs do banco. `null` = pode salvar. */
export function validarRegua(r: Regua): string | null {
  if (![r.bloqueio, r.revistoria, r.inativacao].every(inteiro)) return 'Use números inteiros de dias.';
  if (r.bloqueio < 1 || r.bloqueio > 90) return 'O bloqueio vai de 1 a 90 dias de atraso.';
  if (r.revistoria < 0 || r.revistoria > 90) return 'A revistoria vai de 0 a 90 dias de atraso.';
  if (r.inativacao < 0 || r.inativacao > 365) return 'A inativação vai de 0 a 365 dias de atraso.';
  if (r.bloqueio > r.inativacao) return 'O bloqueio tem de vir antes (ou no mesmo dia) da inativação.';
  if (r.revistoria >= r.inativacao) return 'A revistoria tem de começar antes da inativação.';
  return null;
}

export interface EtapaRegua {
  dia: number;
  titulo: string;
  texto: string;
}

/** A regua escrita na ordem do tempo, para a tela de configuracao. */
export function etapasDaRegua(r: Regua): EtapaRegua[] {
  return [
    {
      dia: r.bloqueio,
      titulo: 'Bloqueio parcial',
      texto: 'Sem assistência 24h, evento e carro reserva até pagar.',
    },
    {
      dia: r.revistoria + 1,
      titulo: 'Revistoria obrigatória',
      texto: `Até ${r.revistoria} dia(s) de atraso a 2ª via sai sem vistoria; a partir daqui, só com a revistoria aprovada.`,
    },
    {
      dia: r.inativacao,
      titulo: 'Inativação',
      texto: 'Sai da fila de cobrança. Quem é cobrado pelo SCar vira inativo; o migrado do Mutual fica "a inativar" até o corte.',
    },
  ].sort((a, b) => a.dia - b.dia);
}

/** Ordem da fila (0139): prioridade (padrao) -> menor atraso -> maior atraso. */
export type OrdemFila = 'prioridade' | 'atraso_asc' | 'atraso_desc';

/** O clique no cabecalho "Atraso" alterna entre as tres ordens. */
export function proximaOrdem(o: OrdemFila): OrdemFila {
  if (o === 'prioridade') return 'atraso_asc';
  if (o === 'atraso_asc') return 'atraso_desc';
  return 'prioridade';
}

export const ROTULO_ORDEM: Record<OrdemFila, string> = {
  prioridade: 'prioridade → menor atraso → maior valor',
  atraso_asc: 'menor atraso primeiro',
  atraso_desc: 'maior atraso primeiro',
};
