import { identificacaoVeiculo } from './placa';
// ---------------------------------------------------------------------------
// CARNE IMPRESSO (31/10/2026) — 3 boletos por folha A4, no padrao dos carnes
// da Smart Car (canhoto a esquerda, ficha de compensacao a direita, codigo de
// barras e QR do PIX). Tudo aqui e puro: a rota so busca os dados e chama
// `htmlDoCarne`, e o Chromium (termos-server) transforma em PDF.
// ---------------------------------------------------------------------------

const soDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/**
 * Linha digitavel (47 digitos) -> codigo de barras (44 digitos), padrao
 * FEBRABAN: banco+moeda (4) · DV geral (1) · fator+valor (14) · campo livre (25).
 * Devolve null se a linha nao tiver 47 digitos.
 */
export function codigoDeBarrasDaLinha(linha: string | null | undefined): string | null {
  const d = soDigitos(linha);
  if (d.length !== 47) return null;
  const campoLivre = d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
  return d.slice(0, 4) + d[32] + d.slice(33, 47) + campoLivre;
}

/** DV geral do codigo de barras (modulo 11, pesos 2..9; 0, 10 e 11 viram 1). */
export function dvCodigoDeBarras(codigo44: string): number {
  const semDv = codigo44.slice(0, 4) + codigo44.slice(5);
  let soma = 0;
  let peso = 2;
  for (let i = semDv.length - 1; i >= 0; i--) {
    soma += Number(semDv[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const r = 11 - (soma % 11);
  return r === 0 || r === 10 || r === 11 ? 1 : r;
}

/** O codigo de barras confere com o proprio DV (protege contra linha digitada errada). */
export function codigoDeBarrasValido(codigo44: string | null): boolean {
  return !!codigo44 && /^\d{44}$/.test(codigo44) && Number(codigo44[4]) === dvCodigoDeBarras(codigo44);
}

/**
 * Campo livre do SICREDI (748): tipo(1) carteira(1) nosso numero(9)
 * cooperativa(4) posto(2) beneficiario(5) indicador(1) livre(1) dv(1).
 */
export function dadosSicrediDoCodigo(codigo44: string | null) {
  if (!codigo44 || codigo44.slice(0, 3) !== '748') return null;
  const cl = codigo44.slice(19);
  return {
    carteira: cl[1],
    nossoNumero: cl.slice(2, 11),
    cooperativa: cl.slice(11, 15),
    posto: cl.slice(15, 17),
    beneficiario: cl.slice(17, 22),
  };
}

/** Linha digitavel no formato impresso: 74891.16009 34488.808105 39027.231008 9 14730000033800 */
export function linhaFormatada(linha: string | null | undefined): string {
  const d = soDigitos(linha);
  if (d.length !== 47) return linha ?? '';
  return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} `
    + `${d.slice(21, 26)}.${d.slice(26, 32)} ${d[32]} ${d.slice(33)}`;
}

// --- Intercalado 2 de 5 (o codigo de barras do boleto) ----------------------
const I25: Record<string, string> = {
  '0': 'nnwwn', '1': 'wnnnw', '2': 'nwnnw', '3': 'wwnnn', '4': 'nnwnw',
  '5': 'wnwnn', '6': 'nwwnn', '7': 'nnnww', '8': 'wnnwn', '9': 'nwnwn',
};

/**
 * Sequencia de modulos (barra/espaco alternados, comecando por barra) em
 * unidades de largura: estreito = 1, largo = 3. Inclui guarda inicial e final.
 */
export function modulosI25(digitos: string): number[] {
  if (!/^\d*$/.test(digitos) || digitos.length % 2 !== 0) throw new Error('I25 exige numero par de digitos');
  const L = 3;
  const out: number[] = [1, 1, 1, 1]; // inicio: barra, espaco, barra, espaco estreitos
  for (let i = 0; i < digitos.length; i += 2) {
    const barras = I25[digitos[i]];
    const espacos = I25[digitos[i + 1]];
    for (let k = 0; k < 5; k++) {
      out.push(barras[k] === 'w' ? L : 1);
      out.push(espacos[k] === 'w' ? L : 1);
    }
  }
  out.push(L, 1, 1); // fim: barra larga, espaco, barra estreita
  return out;
}

/** O codigo de barras em SVG (vetor: imprime nitido em qualquer impressora). */
export function svgCodigoDeBarras(codigo44: string, larguraMm = 103, alturaMm = 13): string {
  const mods = modulosI25(codigo44);
  const total = mods.reduce((s, m) => s + m, 0);
  let x = 0;
  const rects: string[] = [];
  mods.forEach((m, i) => {
    if (i % 2 === 0) rects.push(`<rect x="${x}" y="0" width="${m}" height="1"/>`);
    x += m;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${larguraMm}mm" height="${alturaMm}mm" `
    + `viewBox="0 0 ${total} 1" preserveAspectRatio="none" shape-rendering="crispEdges">`
    + `<g fill="#000">${rects.join('')}</g></svg>`;
}

// --- As fichas ----------------------------------------------------------------
export interface FichaCarne {
  titulo_id: string;
  vencimento: string;          // YYYY-MM-DD
  valor: number;
  linha_digitavel: string;
  nosso_numero: string | null;
  numero_documento: string;    // impresso (o seuNumero do Sicredi)
  data_documento: string;      // YYYY-MM-DD
  referente: string;           // "Mensalidade 05/2026", "Adesão", o tipo do avulso
  referencia: string | null;   // "05/2026" (o mes da mensalidade, no bloco do pagador)
  pix_qr_svg: string | null;   // o QR do PIX ja em SVG
  placa: string | null;         // uma ou mais placas, ja juntas ("ABC1D23, XYZ9K88")
}

export interface CabecalhoCarne {
  beneficiario: string;
  cnpj: string | null;
  logo: string | null;          // data URL
  instrucoes: string[];
  pagador: {
    nome: string;
    documento: string | null;
    endereco: string | null;
    cep_cidade: string | null;
  };
}

/** "2026-06-01" -> "06/2026" (o mes de referencia da mensalidade). */
export function referenciaDoVencimento(competencia: string | null | undefined): string | null {
  if (!competencia || !/^\d{4}-\d{2}/.test(competencia)) return null;
  return `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;
}

/**
 * O que o boleto cobra, como a Smart Car fala (pedido do usuario, 31/10/2026):
 * nao "parcela k/N", e sim "Mensalidade referente ao mes" — ou o que foi
 * escolhido na emissao (o tipo do boleto avulso), adesao, acordo, pro-rata.
 */
export type TipoCobrancaCarne = 'MENSALIDADE' | 'ADESAO' | 'AVULSO' | 'ACORDO' | 'PRO_RATA';
export function referenteDoBoleto(i: { tipo: TipoCobrancaCarne; competencias?: (string | null)[]; nomeAvulso?: string | null }): string {
  const meses = Array.from(new Set((i.competencias ?? []).map(referenciaDoVencimento).filter((m): m is string => !!m)))
    .sort((x, y) => (x.slice(3) + x.slice(0, 2)).localeCompare(y.slice(3) + y.slice(0, 2)));
  const ref = meses.length ? ` ${meses.join(', ')}` : '';
  switch (i.tipo) {
    case 'ADESAO': return 'Adesão';
    case 'AVULSO': return (i.nomeAvulso ?? '').trim() || 'Boleto avulso';
    case 'ACORDO': return `Acordo${ref ? ` — mensalidades${ref}` : ''}`;
    case 'PRO_RATA': return 'Pró-rata';
    default: return `Mensalidade${ref}`;
  }
}

/** Quantas fichas cabem por folha A4. */
export const FICHAS_POR_FOLHA = 3;

const esc = (t: string | null | undefined) =>
  (t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const dataBr = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};
const moeda = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cnpjFmt = (c: string | null) => {
  const d = soDigitos(c);
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : (c ?? '');
};

function campo(rotulo: string, valor: string, extra = '') {
  return `<td class="c" ${extra}><div class="r">${esc(rotulo)}</div><div class="v">${valor}</div></td>`;
}

/** Uma ficha (canhoto + boleto). Ficha sem codigo de barras valido nao e impressa (devolve null). */
export function htmlDaFicha(f: FichaCarne, cab: CabecalhoCarne): string | null {
  const codigo = codigoDeBarrasDaLinha(f.linha_digitavel);
  if (!codigoDeBarrasValido(codigo)) return null;
  const sic = dadosSicrediDoCodigo(codigo);
  const agencia = sic ? `${sic.cooperativa}/${sic.beneficiario}` : '';
  const nosso = sic?.nossoNumero ?? soDigitos(f.nosso_numero);
  const venc = dataBr(f.vencimento);
  const valor = moeda(f.valor);
  const logo = cab.logo ? `<img src="${cab.logo}" alt="">` : `<b>${esc(cab.beneficiario)}</b>`;
  const pag = cab.pagador;
  const docPag = soDigitos(pag.documento);

  const canhoto = `
    <td class="canhoto">
      <div class="logo">${logo}</div>
      <table>
        <tr><td class="c"><div class="r">Referente a</div><div class="v ref">${esc(f.referente)}</div></td></tr>
        <tr>${campo('Vencimento', venc)}</tr>
        <tr>${campo('Agência/Código Cedente', agencia)}</tr>
        <tr>${campo('Número Documento', esc(f.numero_documento))}</tr>
        <tr>${campo('Nosso número', nosso)}</tr>
        <tr>${campo('(=) Valor documento', valor)}</tr>
        <tr>${campo('(-) Desconto / Abatimentos', '&nbsp;')}</tr>
        <tr>${campo('(+) Mora / Multa', '&nbsp;')}</tr>
        <tr>${campo('(=) Valor cobrado', '&nbsp;')}</tr>
        <tr>${campo('Pagador', esc(pag.nome))}</tr>
        <tr><td class="c"><div class="r">${f.placa && f.placa.includes(',') ? 'Veículos' : 'Veículo'}</div><div class="v placas">${esc(f.placa ?? '')}</div></td></tr>
      </table>
    </td>`;

  const corpo = `
    <td class="corpo">
      <table class="cab"><tr>
        <td class="banco">SICREDI</td><td class="cod">748</td>
        <td class="linha">${esc(linhaFormatada(f.linha_digitavel))}</td>
      </tr></table>
      <table class="g">
        <tr>${campo('Local de Pagamento', '<span style="font-size:6.5pt">ATÉ O VENCIMENTO PAGUE EM QUALQUER BANCO OU CORRESPONDENTE NÃO BANCÁRIO</span>', 'colspan="5"')}
            ${campo('Data de vencimento', venc, 'class="c d"')}</tr>
        <tr>${campo('Beneficiário/CPF/CNPJ', `${esc(cab.beneficiario)} - ${esc(cnpjFmt(cab.cnpj))}`, 'colspan="5"')}
            ${campo('Agência/Código Cedente', agencia, 'class="c d"')}</tr>
        <tr>${campo('Data Documento', dataBr(f.data_documento))}${campo('Número Documento', esc(f.numero_documento))}
            ${campo('Espécie documento', 'DM')}${campo('Aceite', 'N')}${campo('Data processamento', dataBr(f.data_documento))}
            ${campo('Nosso número', nosso, 'class="c d"')}</tr>
        <tr>${campo('Uso do banco', '&nbsp;')}${campo('Carteira', esc(sic?.carteira ?? '1'))}${campo('Espécie moeda', 'R$')}
            ${campo('Quantidade moeda', '&nbsp;')}${campo('Valor moeda', '&nbsp;')}
            ${campo('(=) Valor documento', valor, 'class="c d destaque"')}</tr>
        <tr>
          <td colspan="5" class="instr">
            <div class="txt">${cab.instrucoes.map((i) => `<p>${esc(i)}</p>`).join('')}</div>
            ${f.pix_qr_svg ? `<div class="pix"><div>Pague esse boleto com Pix<br>usando o QR code abaixo.</div>${f.pix_qr_svg}</div>` : ''}
          </td>
          <td class="d lado">
            <table>
              <tr>${campo('(-) Desconto / Abatimentos', '&nbsp;')}</tr>
              <tr>${campo('(-) Outras deduções', '&nbsp;')}</tr>
              <tr>${campo('(+) Mora / Multa', '&nbsp;')}</tr>
              <tr>${campo('(+) Outros acréscimos', '&nbsp;')}</tr>
              <tr>${campo('(=) Valor cobrado', '&nbsp;')}</tr>
            </table>
          </td>
        </tr>
        <tr><td colspan="6" class="pagador">
          <span class="r">Pagador</span>
          <div><b>Nome: ${esc(pag.nome)}${docPag ? ` - CPF/CNPJ: ${docPag}` : ''} - Venc.: ${venc}${f.referencia ? ` - Ref.: ${esc(f.referencia)}` : ''}</b></div>
          ${pag.endereco ? `<div><b>${esc(pag.endereco)}</b></div>` : ''}
          ${pag.cep_cidade ? `<div><b>${esc(pag.cep_cidade)}</b></div>` : ''}
          ${f.placa ? `<div><b>${f.placa.includes(',') ? 'Veículos' : 'Veículo'}: ${esc(f.placa)}</b></div>` : ''}
        </td></tr>
      </table>
      <table class="rod"><tr>
        <td class="barras">${svgCodigoDeBarras(codigo!, 103, 12)}</td>
        <td class="aut">Autenticação mecânica</td>
      </tr></table>
    </td>`;

  return `<div class="bloco"><table class="ficha"><tr>${canhoto}${corpo}</tr></table></div>`;
}

const CSS = `
@page { size: A4; margin: 6mm 7mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
.folha { page-break-after: always; }
.folha:last-child { page-break-after: auto; }
.bloco { height: 91mm; overflow: hidden; }
.ficha { width: 100%; border-collapse: collapse; table-layout: fixed; }
.corte { border-top: 1px dashed #777; height: 0; margin: 1.5mm 0; }
.canhoto { width: 47mm; vertical-align: top; border-right: 1px dashed #777; padding-right: 2mm; }
.canhoto table { width: 100%; border-collapse: collapse; }
.canhoto .c { border-bottom: 0.3mm solid #000; }
.logo { height: 12mm; display: flex; align-items: center; }
.logo img { max-height: 11.5mm; max-width: 44mm; }
.placas { white-space: normal; font-size: 6.5pt; }
.ref { white-space: normal; font-size: 7.5pt; }
.corpo { vertical-align: top; padding-left: 2mm; }
.cab { width: 100%; border-collapse: collapse; border-bottom: 0.5mm solid #000; height: 9mm; }
.cab td { font-weight: bold; vertical-align: bottom; padding: 0 2mm 1mm; }
.banco { font-size: 12pt; width: 24mm; border-right: 0.5mm solid #000; }
.cod { font-size: 12pt; width: 13mm; border-right: 0.5mm solid #000; text-align: center; }
.linha { font-size: 10pt; text-align: right; white-space: nowrap; padding-right: 0 !important; }
.g { width: 100%; border-collapse: collapse; table-layout: fixed; }
.g > tbody > tr > td, .g > tr > td { border: 0.3mm solid #000; }
.c { padding: 0.4mm 1mm; vertical-align: top; }
.r { font-size: 6pt; font-style: italic; line-height: 1.1; }
.v { font-size: 7pt; font-weight: bold; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.d { width: 38mm; }
.destaque { background: #ddd; }
.instr { vertical-align: top; padding: 1mm 1.5mm; position: relative; height: 23mm; }
.instr .txt { font-size: 6.5pt; font-weight: bold; padding-right: 30mm; }
.instr .txt p { margin: 0 0 1.4mm; }
.pix { position: absolute; right: 1.5mm; top: 1mm; width: 27mm; text-align: center; font-size: 5.5pt; font-weight: bold; }
.pix svg { width: 18mm; height: 18mm; margin-top: 0.6mm; }
.lado { vertical-align: top; padding: 0; }
.lado table { width: 100%; border-collapse: collapse; }
.lado .c { border-bottom: 0.3mm solid #000; height: 4.6mm; }
.lado tr:last-child .c { border-bottom: 0; }
.pagador { padding: 0.6mm 1.5mm; font-size: 7pt; height: 11mm; }
.pagador div { line-height: 1.25 !important; }
.pagador .r { float: left; width: 16mm; font-style: normal; font-weight: bold; font-size: 7pt; }
.pagador div { margin-left: 17mm; line-height: 1.35; }
.rod { width: 100%; border-collapse: collapse; }
.barras { padding: 1.2mm 0 0 1mm; vertical-align: top; }
.aut { width: 38mm; font-size: 7pt; font-weight: bold; vertical-align: top; padding-top: 1.5mm; }
`;

/** O documento inteiro: fichas em folhas A4 de 3, separadas por linha de corte. */
export function htmlDoCarne(fichas: FichaCarne[], cab: CabecalhoCarne, titulo = 'Carnê'): { html: string; impressas: number } {
  const blocos = fichas.map((f) => htmlDaFicha(f, cab)).filter((b): b is string => !!b);
  const folhas: string[] = [];
  for (let i = 0; i < blocos.length; i += FICHAS_POR_FOLHA) {
    const da = blocos.slice(i, i + FICHAS_POR_FOLHA);
    folhas.push(`<div class="folha">${da.join('<div class="corte"></div>')}</div>`);
  }
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title>`
    + `<style>${CSS}</style></head><body>${folhas.join('')}</body></html>`;
  return { html, impressas: blocos.length };
}

/**
 * Quais boletos do historico entram no carne: do SCar, em aberto (a vencer) e
 * ja registrados no banco. Vencido nao: vira 2a via (boleto novo, 0121).
 * Mutual nao: o PDF dele sai pelo banco, um a um.
 */
export function boletosParaCarne<T extends { id: string; origem?: 'SCAR' | 'MUTUAL'; status: string; linha_digitavel: string | null; data_vencimento: string }>(
  titulos: T[],
): T[] {
  return titulos
    .filter((t) => (t.origem ?? 'SCAR') === 'SCAR' && t.status === 'aberto' && !!t.linha_digitavel)
    .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
}

/** As placas do boleto, sem repetir; 0 km aparece pelo chassi. */
export function placasDoBoleto(veiculos: { placa: string | null; chassi?: string | null }[]): string | null {
  const l = Array.from(new Set(veiculos.map((v) => identificacaoVeiculo(v.placa, v.chassi))));
  return l.length ? l.join(', ') : null;
}

/** O endereco do PDF do carne (a rota aceita ate 24 boletos). */
export function urlDoCarne(tituloIds: string[]): string {
  return `/api/v1/cobrancas/carne?ids=${tituloIds.slice(0, 24).join(',')}`;
}
