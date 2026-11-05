/**
 * TERMO DE ENTREGA DE VEICULO (0182) — regras puras.
 * Um evento pode ter varios termos (entrega parcial ou total). O termo sai
 * impresso, e assinado pelo recebedor na oficina e a via assinada volta como
 * imagem/PDF para o evento. O banco confere tudo de novo (emitir_termo_entrega).
 */

export type SituacaoEntrega = 'AGUARDANDO_ASSINATURA' | 'ASSINADO' | 'CANCELADO';

export const SITUACAO_ENTREGA: Record<SituacaoEntrega, { rotulo: string; cor: string }> = {
  AGUARDANDO_ASSINATURA: { rotulo: 'Aguardando a via assinada', cor: 'bg-amber-50 text-amber-800' },
  ASSINADO: { rotulo: 'Assinado', cor: 'bg-emerald-50 text-emerald-700' },
  CANCELADO: { rotulo: 'Cancelado', cor: 'bg-slate-100 text-slate-500' },
};

/** O que a tela manda para o termo de entrega. */
export type DadosEntrega = {
  evento_id: string;
  recebedor_tipo: 'ASSOCIADO' | 'TERCEIRO';
  evento_terceiro_id?: string | null;
  ordem_servico_id?: string | null;
  abrangencia: 'TOTAL' | 'PARCIAL';
  descricao?: string | null;
  data_entrega: string;
};

export interface DadosEntregaTela {
  recebedor_tipo: 'ASSOCIADO' | 'TERCEIRO';
  evento_terceiro_id?: string | null;
  abrangencia: 'TOTAL' | 'PARCIAL';
  descricao?: string | null;
  data_entrega?: string | null;
}

/** O que impede emitir (a tela mostra; o banco confere de novo). */
export function problemasDaEntrega(d: DadosEntregaTela, dataOcorrencia?: string | null): string[] {
  const p: string[] = [];
  if (d.recebedor_tipo === 'TERCEIRO' && !d.evento_terceiro_id) p.push('Escolha o terceiro que recebe o veículo.');
  if (!d.data_entrega) p.push('Informe a data da entrega.');
  else if (dataOcorrencia && d.data_entrega < dataOcorrencia.slice(0, 10)) p.push('A entrega não pode ser antes da ocorrência do evento.');
  if (d.abrangencia === 'PARCIAL' && !d.descricao?.trim()) p.push('Entrega parcial: descreva o que foi entregue (e o que fica pendente).');
  return p;
}

/** Resumo da aba: quantos termos vivos, quantos esperam a via assinada. */
export function resumoTermosEntrega(lista: { situacao: string; abrangencia: string }[]) {
  const vivos = lista.filter((t) => t.situacao !== 'CANCELADO');
  return {
    total: vivos.length,
    aguardando: vivos.filter((t) => t.situacao === 'AGUARDANDO_ASSINATURA').length,
    assinados: vivos.filter((t) => t.situacao === 'ASSINADO').length,
    temTotal: vivos.some((t) => t.abrangencia === 'TOTAL'),
  };
}
