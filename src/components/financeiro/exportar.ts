'use client';

/**
 * Exportacao dos relatorios do financeiro: Excel (.xlsx, exceljs em import
 * dinamico — nao pesa no bundle) e PDF (janela de impressao com a tabela limpa,
 * "Salvar como PDF" no navegador). O CSV continua em `baixarCsv` (ui-financeiro).
 */

export type Celula = string | number | null | undefined;

export interface TabelaExportavel {
  titulo: string;
  subtitulo?: string;
  cabecalho: string[];
  linhas: Celula[][];
  rodape?: Celula[];
  /** Indices das colunas de dinheiro (formato R$ e alinhadas a direita). */
  colunasMoeda?: number[];
}

export async function baixarExcel(nomeArquivo: string, t: TabelaExportavel) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(t.titulo.slice(0, 31) || 'Relatorio');
  ws.addRow([t.titulo]).font = { bold: true, size: 13 };
  if (t.subtitulo) ws.addRow([t.subtitulo]).font = { italic: true, color: { argb: 'FF555555' } };
  ws.addRow([]);
  const cab = ws.addRow(t.cabecalho);
  cab.font = { bold: true };
  cab.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF6' } };
  });
  for (const l of t.linhas) ws.addRow(l.map((v) => (v === undefined ? null : v)));
  if (t.rodape) ws.addRow(t.rodape.map((v) => (v === undefined ? null : v))).font = { bold: true };
  const moeda = new Set(t.colunasMoeda ?? []);
  t.cabecalho.forEach((h, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.min(48, Math.max(12, h.length + 4));
    if (moeda.has(i)) col.numFmt = '#,##0.00;[Red]-#,##0.00';
  });
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo.endsWith('.xlsx') ? nomeArquivo : `${nomeArquivo}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

const esc = (s: Celula) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const fmt = (v: Celula, moeda: boolean) =>
  moeda && typeof v === 'number'
    ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : esc(v);

/** Abre a tabela numa janela propria e chama a impressao (PDF pelo navegador). */
export function imprimirRelatorio(t: TabelaExportavel) {
  const moeda = new Set(t.colunasMoeda ?? []);
  const linha = (l: Celula[], tag: 'td' | 'th') =>
    `<tr>${l.map((v, i) => `<${tag} class="${moeda.has(i) ? 'n' : ''}">${fmt(v, moeda.has(i))}</${tag}>`).join('')}</tr>`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(t.titulo)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:11px}
  h1{font-size:16px;margin:0 0 4px} p{margin:0 0 12px;color:#555}
  table{border-collapse:collapse;width:100%} th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}
  th{background:#eef2f8;font-weight:bold} td.n,th.n{text-align:right;white-space:nowrap}
  tfoot td{font-weight:bold;border-top:2px solid #333}
  @page{size:A4 landscape;margin:12mm}
</style></head><body>
<h1>${esc(t.titulo)}</h1>${t.subtitulo ? `<p>${esc(t.subtitulo)}</p>` : ''}
<table><thead>${linha(t.cabecalho, 'th')}</thead><tbody>${t.linhas.map((l) => linha(l, 'td')).join('')}</tbody>
${t.rodape ? `<tfoot>${linha(t.rodape, 'td')}</tfoot>` : ''}</table>
<p style="margin-top:12px">Emitido em ${new Date().toLocaleString('pt-BR')}</p>
<script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) {
    alert('O navegador bloqueou a janela de impressao. Libere pop-ups para este site.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
