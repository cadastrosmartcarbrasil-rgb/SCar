// Leitura de .xlsx para as importacoes por planilha (vendedores, fornecedores)
// e o modelo de fornecedores. O exceljs entra por import dinamico na tela, para
// nao pesar no bundle; aqui ele chega como parametro.

import type ExcelJSType from 'exceljs';
import { COLUNAS_FORNECEDOR } from './fornecedores-import';

type ExcelJS = typeof ExcelJSType;

/** Primeira aba da planilha como matriz de texto (linhas totalmente vazias saem). */
export async function matrizDeXlsx(ExcelJS: ExcelJS, conteudo: ArrayBuffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(conteudo);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('A planilha não tem nenhuma aba.');

  const linhas: string[][] = [];
  ws.eachRow((row) => {
    const valores = (row.values as unknown[]).slice(1);
    const celulas: string[] = [];
    valores.forEach((v, i) => {
      celulas[i] =
        v == null ? '' :
        typeof v === 'object' && 'result' in (v as object) ? String((v as { result: unknown }).result ?? '') :
        typeof v === 'object' && 'richText' in (v as object)
          ? ((v as { richText: { text: string }[] }).richText ?? []).map((t) => t.text).join('') :
        typeof v === 'object' && 'text' in (v as object) ? String((v as { text: unknown }).text ?? '') :
        v instanceof Date ? v.toLocaleDateString('pt-BR') :
        String(v);
    });
    linhas.push(Array.from({ length: celulas.length }, (_, i) => celulas[i] ?? ''));
  });
  return linhas.filter((l) => l.some((c) => c.trim() !== ''));
}

/**
 * O modelo de importacao de fornecedores: aba "Fornecedores" (cabecalho + uma
 * linha de exemplo, colunas em TEXTO para o Excel nao comer o zero do CNPJ nem
 * do CEP) e aba "Instrucoes" (o que vai em cada coluna e como a duplicidade e
 * evitada).
 */
export async function modeloFornecedoresXlsx(ExcelJS: ExcelJS): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SCar';

  const ws = wb.addWorksheet('Fornecedores', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLUNAS_FORNECEDOR.map((c) => ({ header: c.titulo, key: c.campo, width: c.largura, style: { numFmt: '@' } }));
  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF142445' } };
  cab.alignment = { vertical: 'middle', wrapText: true };
  cab.height = 30;
  COLUNAS_FORNECEDOR.forEach((c, i) => {
    if (c.ajuda) ws.getCell(1, i + 1).note = c.ajuda;
  });
  const obrigatoria = ws.getCell(1, COLUNAS_FORNECEDOR.findIndex((c) => c.campo === 'razao_social') + 1);
  obrigatoria.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0BACE2' } };

  const exemplo = ws.addRow(Object.fromEntries(COLUNAS_FORNECEDOR.map((c) => [c.campo, c.exemplo])));
  exemplo.font = { italic: true, color: { argb: 'FF6B7280' } };

  // SIM/NAO como lista nas colunas de marcacao (ate a linha 2000)
  for (const campo of ['prestador', 'rastreadora', 'ativo']) {
    const col = COLUNAS_FORNECEDOR.findIndex((c) => c.campo === campo) + 1;
    for (let r = 2; r <= 2000; r++) {
      ws.getCell(r, col).dataValidation = {
        type: 'list', allowBlank: true, formulae: ['"SIM,NAO"'],
        showErrorMessage: true, errorTitle: 'Valor inválido', error: 'Use SIM ou NAO (vazio também vale).',
      };
    }
  }

  const ins = wb.addWorksheet('Instrucoes');
  ins.columns = [{ width: 28 }, { width: 90 }];
  const linhas: [string, string][] = [
    ['COMO USAR', ''],
    ['1.', 'Preencha a aba "Fornecedores", um fornecedor por linha. Apague a linha de exemplo (em cinza).'],
    ['2.', 'No sistema: Fornecedores → Importar planilha → escolha este arquivo. Antes de gravar aparece a prévia.'],
    ['3.', 'Só a RAZAO SOCIAL é obrigatória. A ordem das colunas não importa; coluna a mais é ignorada.'],
    ['', ''],
    ['DUPLICIDADE', ''],
    ['CNPJ/CPF', 'É a chave: fornecedor com o mesmo CNPJ/CPF já cadastrado NÃO é criado de novo.'],
    ['Sem CNPJ/CPF', 'O sistema compara pelo nome (razão social ou fantasia, sem acento e sem LTDA/ME/EIRELI).'],
    ['Já cadastrado', 'Nada do cadastro é apagado nem trocado. Se você marcar a opção, só os campos VAZIOS são completados.'],
    ['Repetido na planilha', 'A segunda ocorrência fica de fora, e a prévia diz qual linha é a repetida.'],
    ['', ''],
    ['COLUNAS', ''],
    ...COLUNAS_FORNECEDOR.map((c) => [c.titulo, c.ajuda || '—'] as [string, string]),
  ];
  for (const [a, b] of linhas) {
    const r = ins.addRow([a, b]);
    if (!b && a) r.font = { bold: true, color: { argb: 'FF142445' } };
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    r.getCell(1).alignment = { vertical: 'top' };
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
