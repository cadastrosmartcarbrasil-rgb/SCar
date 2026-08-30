// ============================================================================
// Importacao da matriz de precos por PLANILHA (uma por tipo de veiculo).
//
// O banco ja e organizado por tipo de veiculo: `tabela_precos_faixa`,
// `participacao_faixa` e `adesao_faixa` tem `tipo_veiculo_id`, e o RPC
// `substituir_tabela_precos(tipo, faixas, participacoes, adesoes)` troca de uma
// vez SO o tipo escolhido. Uma planilha por tipo e, portanto, o desenho natural.
//
// Layout esperado (a 1a linha e o cabecalho; a ordem das colunas nao importa):
//
//   FIPE_MINIMO | FIPE_MAXIMO | PARTICIPACAO | PARTICIPACAO_TIPO | ADESAO | <Produto A> | <Produto B>
//        0      |    35000    |     1500     |       VALOR       |  250   |    89,90    |    35,00
//    35000,01   |    40000    |     1800     |       VALOR       |  250   |    99,90    |    35,00
//    40000,01   |    60000    |       4      |     PERCENTUAL    |  350   |   129,90    |    35,00
//
// As colunas de produto sao casadas pelo NOME do produto cadastrado. Como a
// importacao SUBSTITUI a tabela do tipo, a tela sempre mostra a previa do que
// muda antes de gravar.
// ============================================================================

import { parseMoedaBR } from './money';

export interface ProdutoColuna {
  id: string;
  nome: string;
}

export interface BandaImportada {
  fipe_minimo: number;
  fipe_maximo: number;
  participacao_tipo: 'VALOR' | 'PERCENTUAL';
  /** Em R$ quando VALOR; em % (ex.: 4 = 4%) quando PERCENTUAL. */
  participacao_valor: number;
  adesao: number;
  /** produtoId -> R$ */
  valores: Record<string, number>;
}

export interface ResultadoImportacao {
  bandas: BandaImportada[];
  erros: string[];
  avisos: string[];
  /** Colunas do arquivo que nao casaram com nenhum produto cadastrado. */
  colunasIgnoradas: string[];
  /** Produtos cadastrados que a planilha nao trouxe (entram como 0). */
  produtosAusentes: string[];
}

export const COLUNAS_FIXAS = {
  min: 'FIPE_MINIMO',
  max: 'FIPE_MAXIMO',
  participacao: 'PARTICIPACAO',
  participacaoTipo: 'PARTICIPACAO_TIPO',
  adesao: 'ADESAO',
} as const;

/** Normaliza cabecalho: sem acento, sem espaco duplo, maiusculo. */
export function normalizarCabecalho(texto: string): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/** Quebra um CSV em matriz. Detecta ";" (padrao do Excel BR) ou ",". */
export function matrizDeCsv(texto: string): string[][] {
  const limpo = (texto ?? '').replace(/^﻿/, '');
  const primeiraLinha = limpo.split(/\r?\n/, 1)[0] ?? '';
  const sep = (primeiraLinha.match(/;/g) ?? []).length >= (primeiraLinha.match(/,/g) ?? []).length ? ';' : ',';

  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let aspas = false;

  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"') {
        if (limpo[i + 1] === '"') { campo += '"'; i++; } else { aspas = false; }
      } else campo += c;
      continue;
    }
    if (c === '"') { aspas = true; continue; }
    if (c === sep) { linha.push(campo); campo = ''; continue; }
    if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; continue; }
    if (c === '\r') continue;
    campo += c;
  }
  linha.push(campo);
  linhas.push(linha);

  return linhas.filter((l) => l.some((cel) => (cel ?? '').trim() !== ''));
}

function numero(valor: string | undefined): number | null {
  const v = (valor ?? '').trim();
  if (v === '') return null;
  return parseMoedaBR(v);
}

/**
 * Le a matriz da planilha e devolve as bandas prontas para o editor/RPC.
 * Nunca lanca: os problemas voltam em `erros` (bloqueiam) e `avisos` (passam).
 */
export function interpretarPlanilha(matriz: string[][], produtos: ProdutoColuna[]): ResultadoImportacao {
  const erros: string[] = [];
  const avisos: string[] = [];
  const colunasIgnoradas: string[] = [];

  if (matriz.length < 2) {
    return {
      bandas: [], erros: ['A planilha precisa de um cabecalho e ao menos uma faixa.'],
      avisos: [], colunasIgnoradas: [], produtosAusentes: [],
    };
  }

  const cabecalho = matriz[0].map(normalizarCabecalho);
  const indice = (nome: string) => cabecalho.indexOf(nome);

  const iMin = indice(COLUNAS_FIXAS.min);
  const iMax = indice(COLUNAS_FIXAS.max);
  const iPart = indice(COLUNAS_FIXAS.participacao);
  const iPartTipo = indice(COLUNAS_FIXAS.participacaoTipo);
  const iAdesao = indice(COLUNAS_FIXAS.adesao);

  if (iMin < 0) erros.push(`Coluna "${COLUNAS_FIXAS.min}" nao encontrada.`);
  if (iMax < 0) erros.push(`Coluna "${COLUNAS_FIXAS.max}" nao encontrada.`);
  if (erros.length > 0) return { bandas: [], erros, avisos, colunasIgnoradas: [], produtosAusentes: [] };

  // Casa cada coluna restante com um produto cadastrado (pelo nome).
  const porNome = new Map(produtos.map((p) => [normalizarCabecalho(p.nome), p]));
  const fixas = new Set<number>([iMin, iMax, iPart, iPartTipo, iAdesao].filter((i) => i >= 0));
  const colunasProduto: { indice: number; produto: ProdutoColuna }[] = [];

  cabecalho.forEach((titulo, i) => {
    if (fixas.has(i) || titulo === '') return;
    const produto = porNome.get(titulo);
    if (produto) colunasProduto.push({ indice: i, produto });
    else colunasIgnoradas.push(matriz[0][i]);
  });

  const trazidos = new Set(colunasProduto.map((c) => c.produto.id));
  const produtosAusentes = produtos.filter((p) => !trazidos.has(p.id)).map((p) => p.nome);

  const bandas: BandaImportada[] = [];

  for (let l = 1; l < matriz.length; l++) {
    const linha = matriz[l];
    const nLinha = l + 1; // como o operador ve no Excel
    const min = numero(linha[iMin]);
    const max = numero(linha[iMax]);

    if (min === null || max === null) {
      erros.push(`Linha ${nLinha}: faixa FIPE incompleta (minimo e maximo sao obrigatorios).`);
      continue;
    }
    if (max < min) {
      erros.push(`Linha ${nLinha}: FIPE maximo (${max}) menor que o minimo (${min}).`);
      continue;
    }

    const tipoBruto = normalizarCabecalho(iPartTipo >= 0 ? linha[iPartTipo] ?? '' : '');
    const participacao_tipo: 'VALOR' | 'PERCENTUAL' = tipoBruto.startsWith('PERC') ? 'PERCENTUAL' : 'VALOR';
    if (tipoBruto !== '' && !tipoBruto.startsWith('PERC') && !tipoBruto.startsWith('VALOR')) {
      avisos.push(`Linha ${nLinha}: "${linha[iPartTipo]}" nao e VALOR nem PERCENTUAL — assumido VALOR.`);
    }

    const participacao_valor = (iPart >= 0 ? numero(linha[iPart]) : 0) ?? 0;
    if (participacao_tipo === 'PERCENTUAL' && participacao_valor > 100) {
      avisos.push(`Linha ${nLinha}: participacao de ${participacao_valor}% parece alta — confira.`);
    }

    const valores: Record<string, number> = {};
    colunasProduto.forEach(({ indice: i, produto }) => {
      const v = numero(linha[i]);
      if (v === null) return;
      if (v < 0) avisos.push(`Linha ${nLinha}: "${produto.nome}" com valor negativo (${v}).`);
      valores[produto.id] = v;
    });

    bandas.push({
      fipe_minimo: min,
      fipe_maximo: max,
      participacao_tipo,
      participacao_valor,
      adesao: (iAdesao >= 0 ? numero(linha[iAdesao]) : 0) ?? 0,
      valores,
    });
  }

  bandas.sort((a, b) => a.fipe_minimo - b.fipe_minimo);

  // Sobreposicao BLOQUEIA (a cotacao acharia duas faixas para o mesmo FIPE);
  // buraco entre faixas so avisa (pode ser intencional).
  for (let i = 1; i < bandas.length; i++) {
    const ant = bandas[i - 1];
    const at = bandas[i];
    if (at.fipe_minimo <= ant.fipe_maximo) {
      erros.push(
        `Faixas sobrepostas: ${ant.fipe_minimo}–${ant.fipe_maximo} e ${at.fipe_minimo}–${at.fipe_maximo}.`,
      );
    } else if (at.fipe_minimo - ant.fipe_maximo > 1) {
      avisos.push(
        `Buraco entre ${ant.fipe_maximo} e ${at.fipe_minimo}: veiculo nessa faixa fica sem preco.`,
      );
    }
  }

  if (bandas.length === 0 && erros.length === 0) erros.push('Nenhuma faixa valida encontrada.');
  if (colunasIgnoradas.length > 0) {
    avisos.push(`Colunas ignoradas (nenhum produto com esse nome): ${colunasIgnoradas.join(', ')}.`);
  }
  if (produtosAusentes.length > 0) {
    avisos.push(`Produtos sem coluna na planilha entram como R$ 0,00: ${produtosAusentes.join(', ')}.`);
  }

  return { bandas, erros, avisos, colunasIgnoradas, produtosAusentes };
}

/** Cabecalho do modelo, na ordem em que o operador espera ler. */
export function cabecalhoModelo(produtos: ProdutoColuna[]): string[] {
  return [
    COLUNAS_FIXAS.min, COLUNAS_FIXAS.max, COLUNAS_FIXAS.participacao,
    COLUNAS_FIXAS.participacaoTipo, COLUNAS_FIXAS.adesao,
    ...produtos.map((p) => p.nome),
  ];
}

/**
 * Modelo em CSV (separador ";", que o Excel BR abre direto). Quando o tipo ja
 * tem tabela, o modelo vem PREENCHIDO — o operador edita e devolve.
 */
export function gerarModeloCsv(produtos: ProdutoColuna[], bandas: BandaImportada[] = []): string {
  const num = (v: number) => String(v).replace('.', ',');
  const linhas = [cabecalhoModelo(produtos)];

  const corpo = bandas.length > 0 ? bandas : [
    { fipe_minimo: 0, fipe_maximo: 35000, participacao_tipo: 'VALOR' as const, participacao_valor: 1500, adesao: 250, valores: {} },
    { fipe_minimo: 35000.01, fipe_maximo: 40000, participacao_tipo: 'VALOR' as const, participacao_valor: 1800, adesao: 250, valores: {} },
  ];

  corpo.forEach((b) => {
    linhas.push([
      num(b.fipe_minimo), num(b.fipe_maximo), num(b.participacao_valor),
      b.participacao_tipo, num(b.adesao),
      ...produtos.map((p) => num(b.valores[p.id] ?? 0)),
    ]);
  });

  return linhas.map((l) => l.join(';')).join('\r\n');
}

export interface DiffTabela {
  adicionadas: BandaImportada[];
  removidas: BandaImportada[];
  alteradas: { antes: BandaImportada; depois: BandaImportada }[];
  inalteradas: number;
}

const chave = (b: BandaImportada) => `${b.fipe_minimo}_${b.fipe_maximo}`;

function igual(a: BandaImportada, b: BandaImportada, produtos: ProdutoColuna[]): boolean {
  if (a.participacao_tipo !== b.participacao_tipo) return false;
  if (a.participacao_valor !== b.participacao_valor) return false;
  if (a.adesao !== b.adesao) return false;
  return produtos.every((p) => (a.valores[p.id] ?? 0) === (b.valores[p.id] ?? 0));
}

/**
 * Compara a tabela em vigor com a que sera gravada. Como o RPC SUBSTITUI tudo
 * do tipo, o operador precisa ver o que sai antes de confirmar.
 */
export function compararTabelas(
  atual: BandaImportada[],
  nova: BandaImportada[],
  produtos: ProdutoColuna[],
): DiffTabela {
  const mapaAtual = new Map(atual.map((b) => [chave(b), b]));
  const mapaNova = new Map(nova.map((b) => [chave(b), b]));

  const adicionadas = nova.filter((b) => !mapaAtual.has(chave(b)));
  const removidas = atual.filter((b) => !mapaNova.has(chave(b)));
  const alteradas: { antes: BandaImportada; depois: BandaImportada }[] = [];
  let inalteradas = 0;

  nova.forEach((b) => {
    const antes = mapaAtual.get(chave(b));
    if (!antes) return;
    if (igual(antes, b, produtos)) inalteradas += 1;
    else alteradas.push({ antes, depois: b });
  });

  return { adicionadas, removidas, alteradas, inalteradas };
}
