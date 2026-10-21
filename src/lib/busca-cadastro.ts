/**
 * Busca e paginacao NO BANCO para as listas de associados e veiculos.
 *
 * Ate 15/10/2026 `/veiculos` e `/associados` baixavam a base inteira (6.807
 * veiculos + 5.496 associados, ~13 requisicoes de 1.000 em sequencia) e
 * desenhavam milhares de linhas para filtrar na tela — a "demora extrema".
 * Agora a tela pede UMA pagina e o filtro vai para o PostgREST.
 */
import { seguroParaFiltro } from './crm';

export const TAMANHO_PAGINA_CADASTRO = 50;

/** Situacao do veiculo na lista. "Na base" e o padrao: e o que a operacao procura. */
export type SituacaoLista = 'base' | 'fora' | 'todos' | 'placa_pendente';

export const SITUACOES_LISTA: { valor: SituacaoLista; rotulo: string }[] = [
  { valor: 'base', rotulo: 'Na base' },
  { valor: 'fora', rotulo: 'Fora da base (inativos e baixados)' },
  { valor: 'todos', rotulo: 'Todos' },
  // 0136: o 0 km que ainda nao emplacou — a fila de quem cobra a placa.
  { valor: 'placa_pendente', rotulo: 'Placa pendente (0 km)' },
];

/** Status de cada recorte. `excluido` nunca aparece na lista. */
export function statusDaSituacao(s: SituacaoLista): string[] | null {
  if (s === 'base') return ['ativo', 'inadimplente', 'em_evento', 'vistoria_pendente', 'suspenso'];
  if (s === 'fora') return ['inativo', 'baixado'];
  return null;
}

/** Termo pronto para o filtro: sem os caracteres que quebram o `or` do PostgREST. */
function termoSeguro(bruto: string): string {
  return seguroParaFiltro(bruto ?? '');
}

/**
 * Filtro `or` da lista de veiculos. `clienteIds` = associados cujo NOME casou
 * com o termo (consultados antes, porque o `or` nao alcanca a tabela embutida).
 * `null` = termo curto demais e nenhum associado: sem filtro de busca.
 */
export function filtroBuscaVeiculos(bruto: string, clienteIds: string[] = []): string | null {
  const t = termoSeguro(bruto);
  const partes: string[] = [];
  if (t.length >= 2) {
    const placa = t.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (placa.length >= 2) partes.push(`placa.ilike.*${placa}*`);
    // 0136: o 0 km (placa pendente) so e achado pelo CHASSI — normalmente pelo
    // final dele, que e o que se le no documento e no veiculo.
    if (placa.length >= 4) partes.push(`chassi.ilike.*${placa}*`);
    partes.push(`marca.ilike.*${t}*`, `modelo.ilike.*${t}*`);
  }
  const digitos = (bruto ?? '').replace(/\D/g, '');
  if (digitos.length >= 4) partes.push(`rastreador_imei.ilike.*${digitos}*`, `rastreador_chip.ilike.*${digitos}*`);
  if (clienteIds.length > 0) partes.push(`cliente_id.in.(${clienteIds.join(',')})`);
  return partes.length > 0 ? partes.join(',') : null;
}

/** Filtro `or` da lista de associados: nome, CPF/CNPJ (so digitos) e matricula. */
export function filtroBuscaAssociados(bruto: string): string | null {
  const t = termoSeguro(bruto);
  const digitos = (bruto ?? '').replace(/\D/g, '');
  const partes: string[] = [];
  if (t.length >= 2) partes.push(`nome_razao_social.ilike.*${t}*`);
  if (digitos.length >= 3) partes.push(`cpf_cnpj.ilike.*${digitos}*`, `matricula.ilike.*${digitos}*`);
  else if (t.length >= 2) partes.push(`matricula.ilike.*${t}*`);
  return partes.length > 0 ? partes.join(',') : null;
}

/** "51–100 de 6.807" e quantas paginas existem. */
export function resumoPagina(pagina: number, total: number, tamanho = TAMANHO_PAGINA_CADASTRO) {
  const paginas = Math.max(1, Math.ceil(total / tamanho));
  const atual = Math.min(Math.max(0, pagina), paginas - 1);
  const de = total === 0 ? 0 : atual * tamanho + 1;
  const ate = Math.min(total, (atual + 1) * tamanho);
  return { paginas, atual, de, ate };
}
