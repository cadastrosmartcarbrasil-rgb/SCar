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
import { formatCurrency } from './utils';

export interface ProdutoColuna {
  id: string;
  nome: string;
  /** Categoria do produto (CASCO, ADMIN...). Deixa casar o cabecalho "Casco"
   *  com "Protecao Casco (RFC)" quando so um produto da tabela e daquela categoria. */
  categoria?: string | null;
}

/** Nomes curtos que a planilha costuma usar para cada categoria. */
const APELIDOS_CATEGORIA: Record<string, string[]> = {
  CASCO: ['CASCO', 'PROTECAO CASCO', 'PROTECAO DE CASCO'],
  ADMIN: ['TAXA ADMINISTRATIVA', 'TAXA ADM', 'ADMINISTRATIVA', 'TAXA ADMIN'],
};

/**
 * Os cabecalhos que valem para cada produto: o nome, o nome sem o que vem entre
 * parenteses e, quando a categoria e UNICA na lista, os apelidos dela.
 */
export function cabecalhosDoProduto(produtos: ProdutoColuna[]): Map<string, ProdutoColuna> {
  const mapa = new Map<string, ProdutoColuna>();
  const porCategoria = new Map<string, number>();
  produtos.forEach((p) => {
    if (p.categoria) porCategoria.set(p.categoria, (porCategoria.get(p.categoria) ?? 0) + 1);
  });
  // O nome exato vence qualquer apelido.
  produtos.forEach((p) => mapa.set(normalizarCabecalho(p.nome), p));
  produtos.forEach((p) => {
    const semParenteses = normalizarCabecalho(p.nome.replace(/\([^)]*\)/g, ''));
    if (semParenteses && !mapa.has(semParenteses)) mapa.set(semParenteses, p);
    if (p.categoria && porCategoria.get(p.categoria) === 1) {
      (APELIDOS_CATEGORIA[p.categoria] ?? []).forEach((a) => { if (!mapa.has(a)) mapa.set(a, p); });
    }
  });
  return mapa;
}

export interface BandaImportada {
  /** Linha na planilha, como o operador ve no Excel (o cabecalho e a 1). */
  linha?: number;
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

/**
 * Celula com erro de formula do Excel (#VALOR!, #N/D, #REF!, #DIV/0! ...).
 * Nunca pode virar "vazio": vazio grava R$ 0,00 e o preco sai errado calado.
 */
const ERRO_EXCEL = /^#\s*(VALOR|VALUE|N\/D|N\/A|REF|DIV\/0|NOME|NAME|NUM|NUM|NULO|NULL)\s*[!?]?$/i;

export function ehErroExcel(valor: string | undefined): boolean {
  const v = (valor ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return ERRO_EXCEL.test(v);
}

function numero(valor: string | undefined): number | null {
  const v = (valor ?? '').trim();
  if (v === '') return null;
  return parseMoedaBR(v);
}

const faixaTexto = (min: number, max: number) => `${formatCurrency(min)} a ${formatCurrency(max)}`;

/**
 * Le a matriz da planilha e devolve as bandas prontas para o editor/RPC.
 * Nunca lanca: os problemas voltam em `erros` (bloqueiam) e `avisos` (passam).
 */
export function interpretarPlanilha(
  matriz: string[][],
  produtos: ProdutoColuna[],
  /** Produtos de faixa que NAO atendem o tipo escolhido (0089): coluna deles bloqueia. */
  foraDoTipo: ProdutoColuna[] = [],
): ResultadoImportacao {
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
  const porNome = cabecalhosDoProduto(produtos);
  const fora = cabecalhosDoProduto(foraDoTipo);
  const fixas = new Set<number>([iMin, iMax, iPart, iPartTipo, iAdesao].filter((i) => i >= 0));
  const colunasProduto: { indice: number; produto: ProdutoColuna }[] = [];

  cabecalho.forEach((titulo, i) => {
    if (fixas.has(i) || titulo === '') return;
    const produto = porNome.get(titulo);
    if (produto) {
      if (colunasProduto.some((c) => c.produto.id === produto.id)) {
        erros.push(`As colunas "${matriz[0][colunasProduto.find((c) => c.produto.id === produto.id)!.indice]}" e "${matriz[0][i]}" sao do mesmo produto (${produto.nome}). Deixe uma so.`);
      } else colunasProduto.push({ indice: i, produto });
      return;
    }
    const outro = fora.get(titulo);
    if (outro) {
      // Ignorar seria gravar a tabela SEM esse componente e cobrar a menos, calado.
      erros.push(
        `A coluna "${matriz[0][i]}" e do produto "${outro.nome}", que nao esta marcado para este tipo de veiculo. ` +
        `Marque o tipo no produto (Configuracoes -> Produtos) e importe de novo, ou tire a coluna da planilha.`,
      );
      return;
    }
    colunasIgnoradas.push(matriz[0][i]);
  });

  const trazidos = new Set(colunasProduto.map((c) => c.produto.id));
  const produtosAusentes = produtos.filter((p) => !trazidos.has(p.id)).map((p) => p.nome);

  const bandas: BandaImportada[] = [];

  for (let l = 1; l < matriz.length; l++) {
    const linha = matriz[l];
    const nLinha = l + 1; // como o operador ve no Excel
    // Erro de formula do Excel nao pode passar como zero.
    const comErro = [
      { i: iMin, nome: COLUNAS_FIXAS.min }, { i: iMax, nome: COLUNAS_FIXAS.max },
      { i: iPart, nome: COLUNAS_FIXAS.participacao }, { i: iAdesao, nome: COLUNAS_FIXAS.adesao },
      ...colunasProduto.map(({ indice, produto }) => ({ i: indice, nome: produto.nome })),
    ].filter(({ i }) => i >= 0 && ehErroExcel(linha[i]));

    if (comErro.length > 0) {
      comErro.forEach(({ i, nome }) =>
        erros.push(`Linha ${nLinha}, coluna "${nome}": a planilha traz "${(linha[i] ?? '').trim()}" (erro de formula do Excel). Corrija a celula — importar assim gravaria R$ 0,00.`),
      );
      continue;
    }

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
      linha: nLinha,
      fipe_minimo: min,
      fipe_maximo: max,
      participacao_tipo,
      participacao_valor,
      adesao: (iAdesao >= 0 ? numero(linha[iAdesao]) : 0) ?? 0,
      valores,
    });
  }

  bandas.sort((a, b) => a.fipe_minimo - b.fipe_minimo || (a.linha ?? 0) - (b.linha ?? 0));

  // Varredura por FIPE minimo guardando o maior fim ja visto: pega tanto a
  // sobreposicao entre vizinhas quanto uma faixa contida dentro de outra.
  // Sobreposicao BLOQUEIA (a cotacao acharia dois precos para o mesmo FIPE);
  // buraco entre faixas so avisa (pode ser intencional).
  let maiorFim = -Infinity;
  let dona: BandaImportada | null = null;

  for (const at of bandas) {
    if (dona && at.fipe_minimo <= maiorFim) {
      const onde = `linha ${at.linha} (${faixaTexto(at.fipe_minimo, at.fipe_maximo)})`;
      const contra = `linha ${dona.linha} (${faixaTexto(dona.fipe_minimo, dona.fipe_maximo)})`;
      if (at.fipe_minimo === dona.fipe_maximo) {
        // Caso classico: a faixa seguinte comeca no MESMO valor em que a
        // anterior termina, entao esse valor fica com dois precos.
        erros.push(
          `A ${onde} comeca em ${formatCurrency(at.fipe_minimo)}, valor que ja pertence a ${contra}. ` +
          `Comece em ${formatCurrency(at.fipe_minimo + 0.01)}.`,
        );
      } else {
        erros.push(`Faixas sobrepostas: ${onde} invade a ${contra}.`);
      }
    } else if (dona && at.fipe_minimo - maiorFim > 1) {
      avisos.push(
        `Buraco entre ${formatCurrency(maiorFim)} e ${formatCurrency(at.fipe_minimo)} ` +
        `(linhas ${dona.linha} e ${at.linha}): veiculo nessa faixa fica sem preco.`,
      );
    }
    if (at.fipe_maximo > maiorFim) { maiorFim = at.fipe_maximo; dona = at; }
  }

  // Componente que fica MAIS BARATO numa faixa de FIPE maior costuma ser erro de digitacao.
  colunasProduto.forEach(({ produto }) => {
    let anterior: BandaImportada | null = null;
    for (const b of bandas) {
      const v = b.valores[produto.id];
      if (v === undefined) continue;
      const va = anterior?.valores[produto.id];
      if (anterior && va !== undefined && v < va) {
        avisos.push(
          `"${produto.nome}" cai de ${formatCurrency(va)} (linha ${anterior.linha}) para ${formatCurrency(v)} ` +
          `(linha ${b.linha}) numa faixa de FIPE maior — confira se nao e erro de digitacao.`,
        );
      }
      anterior = b;
    }
  });

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
