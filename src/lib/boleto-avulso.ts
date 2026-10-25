// BOLETO AVULSO do SAC (0150) — as regras que a tela confere antes de chamar o
// banco. Espelho de `criar_boleto_avulso` (o banco e quem vale).

export const VALOR_MAXIMO_AVULSO = 100000;
export const PRAZO_MAXIMO_AVULSO_DIAS = 90;
export const DESCRICAO_MAXIMA_AVULSO = 200;

export interface EntradaBoletoAvulso {
  tipo: { ativo: boolean; exige_veiculo: boolean; nome: string } | null;
  veiculoId: string | null;
  valor: number | null;
  vencimento: string;
  descricao: string;
  hoje: string; // AAAA-MM-DD em Sao Paulo
}

function somaDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Devolve o primeiro problema, ou null quando o boleto pode ser emitido. */
export function validarBoletoAvulso(e: EntradaBoletoAvulso): string | null {
  if (!e.tipo) return 'Escolha o tipo do boleto.';
  if (!e.tipo.ativo) return 'Este tipo de boleto está inativo.';
  if (e.tipo.exige_veiculo && !e.veiculoId) return `O boleto de ${e.tipo.nome} precisa do veículo.`;
  if (e.valor == null || !(e.valor > 0)) return 'Informe o valor.';
  if (e.valor > VALOR_MAXIMO_AVULSO) return 'O valor máximo é R$ 100.000,00.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.vencimento)) return 'Informe o vencimento.';
  if (e.vencimento < e.hoje) return 'O vencimento não pode ser no passado.';
  if (e.vencimento > somaDias(e.hoje, PRAZO_MAXIMO_AVULSO_DIAS)) return 'O vencimento pode ser no máximo daqui a 90 dias.';
  if (e.descricao.trim().length > DESCRICAO_MAXIMA_AVULSO) return 'A descrição tem no máximo 200 caracteres.';
  return null;
}

/** O texto que fica no título (o mesmo que o banco grava). */
export function observacaoDoAvulso(tipo: string, descricao: string): string {
  const d = descricao.trim();
  return `Boleto avulso — ${tipo}${d ? `: ${d}` : ''}`;
}
