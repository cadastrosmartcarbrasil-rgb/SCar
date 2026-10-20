/**
 * Leitura de extrato OFX (0119) — puro, testado em ofx.test.ts.
 *
 * Aceita as duas formas que os bancos mandam:
 *   * OFX 1.x (SGML): tags sem fechamento (`<TRNAMT>-7.90`);
 *   * OFX 2.x (XML): `<TRNAMT>-7.90</TRNAMT>`.
 * O arquivo costuma vir em Windows-1252 (`CHARSET:1252`): `decodificarOfx`
 * escolhe o decodificador pelo cabecalho, senao o acento vira lixo no historico.
 *
 * O FITID e a identidade do lancamento no banco e e por ele que reimportar o
 * mesmo arquivo nao duplica (unique conta + FITID no banco). Banco que repete
 * FITID para lancamentos diferentes no mesmo arquivo ganha um sufixo `#n`; sem
 * FITID, a identidade e montada de data + valor + historico.
 */

export interface ItemOfx {
  fitid: string;
  data: string; // AAAA-MM-DD
  valor: number; // > 0 credito, < 0 debito
  tipo: string | null;
  historico: string | null;
  documento: string | null;
}

export interface ExtratoOfx {
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  dataInicio: string | null;
  dataFim: string | null;
  saldo: number | null;
  saldoEm: string | null;
  itens: ItemOfx[];
  avisos: string[];
}

/** Bytes do arquivo -> texto, respeitando o CHARSET do cabecalho. */
export function decodificarOfx(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const cabecalho = new TextDecoder('latin1').decode(u8.slice(0, 600)).toUpperCase();
  const utf8 = /ENCODING\s*[:=]\s*"?UTF-?8/.test(cabecalho) || /CHARSET\s*[:=]\s*"?UTF-?8/.test(cabecalho);
  const w1252 = /CHARSET\s*[:=]\s*"?(1252|WINDOWS-1252|ISO-8859-1|8859-1)/.test(cabecalho);
  if (utf8 && !w1252) return new TextDecoder('utf-8').decode(u8);
  if (w1252) return new TextDecoder('windows-1252').decode(u8);
  // sem pista: tenta UTF-8 e cai no 1252 se aparecer caractere invalido
  const t = new TextDecoder('utf-8').decode(u8);
  return t.includes('�') ? new TextDecoder('windows-1252').decode(u8) : t;
}

/** `20261013120000[-3:BRT]` -> `2026-10-13`. */
export function dataOfx(s: string | null | undefined): string | null {
  const m = (s ?? '').trim().match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, a, me, d] = m;
  const n = Date.parse(`${a}-${me}-${d}T00:00:00Z`);
  if (Number.isNaN(n) || Number(me) < 1 || Number(me) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  return `${a}-${me}-${d}`;
}

/** `-7.90`, `-7,90`, `1.234,56`, `1,234.56` -> numero. */
export function valorOfx(s: string | null | undefined): number | null {
  let t = (s ?? '').trim().replace(/\s/g, '');
  if (!t) return null;
  const temVirgula = t.includes(',');
  const temPonto = t.includes('.');
  if (temVirgula && temPonto) {
    // o separador decimal e o que vem por ultimo
    t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (temVirgula) {
    t = t.replace(',', '.');
  }
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function tag(bloco: string, nome: string): string | null {
  const re = new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i');
  const m = bloco.match(re);
  const v = m?.[1]?.trim();
  return v ? decodificarEntidades(v) : null;
}

function decodificarEntidades(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function blocos(texto: string, nome: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${nome}>([\\s\\S]*?)(?=</${nome}>|<${nome}>|</BANKTRANLIST>|$)`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) out.push(m[1]);
  return out;
}

export function interpretarOfx(texto: string): ExtratoOfx {
  const avisos: string[] = [];
  if (!/<OFX>/i.test(texto)) {
    return { banco: null, agencia: null, conta: null, dataInicio: null, dataFim: null, saldo: null, saldoEm: null,
      itens: [], avisos: ['O arquivo não parece um OFX (falta a marcação <OFX>).'] };
  }
  const banco = tag(texto, 'BANKID');
  const agencia = tag(texto, 'BRANCHID');
  const conta = tag(texto, 'ACCTID');
  const dataInicio = dataOfx(tag(texto, 'DTSTART'));
  const dataFim = dataOfx(tag(texto, 'DTEND'));
  const ledger = texto.match(/<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|$)/i)?.[1] ?? '';
  const saldo = ledger ? valorOfx(tag(ledger, 'BALAMT')) : null;
  const saldoEm = ledger ? dataOfx(tag(ledger, 'DTASOF')) : null;

  const brutos = blocos(texto, 'STMTTRN');
  const itens: ItemOfx[] = [];
  const vistos = new Map<string, string>(); // fitid -> assinatura do conteudo
  const usados = new Set<string>();
  let semData = 0;
  let semValor = 0;

  brutos.forEach((b, i) => {
    const data = dataOfx(tag(b, 'DTPOSTED') ?? tag(b, 'DTUSER'));
    const valor = valorOfx(tag(b, 'TRNAMT'));
    if (!data) { semData++; return; }
    if (valor === null) { semValor++; return; }
    if (valor === 0) return;
    const historico = [tag(b, 'NAME'), tag(b, 'MEMO')].filter(Boolean).join(' - ') || null;
    const documento = tag(b, 'CHECKNUM') ?? tag(b, 'REFNUM');
    const assinatura = `${data}|${valor}|${historico ?? ''}|${documento ?? ''}`;
    let fitid = tag(b, 'FITID') ?? '';
    if (!fitid) fitid = `SEM-FITID-${data}-${valor.toFixed(2)}-${hashCurto(historico ?? '')}`;
    if (usados.has(fitid) && vistos.get(fitid) !== assinatura) {
      let n = 2;
      while (usados.has(`${fitid}#${n}`)) n++;
      fitid = `${fitid}#${n}`;
      if (!avisos.some((a) => a.startsWith('O banco repetiu FITID'))) {
        avisos.push('O banco repetiu FITID para lancamentos diferentes; eles foram separados por sufixo #n.');
      }
    } else if (usados.has(fitid)) {
      return; // o mesmo lancamento duas vezes no arquivo
    }
    usados.add(fitid);
    vistos.set(fitid, assinatura);
    itens.push({ fitid, data, valor, tipo: tag(b, 'TRNTYPE'), historico, documento });
    void i;
  });

  if (semData) avisos.push(`${semData} lancamento(s) sem data foram ignorados.`);
  if (semValor) avisos.push(`${semValor} lancamento(s) sem valor foram ignorados.`);
  if (!brutos.length) avisos.push('Nenhum lancamento (<STMTTRN>) no arquivo.');

  return { banco, agencia, conta, dataInicio, dataFim, saldo, saldoEm, itens, avisos };
}

function hashCurto(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Totais do arquivo para a previa. */
export function resumoOfx(ex: ExtratoOfx): { creditos: number; debitos: number; qtdCreditos: number; qtdDebitos: number } {
  let c = 0, d = 0, qc = 0, qd = 0;
  for (const it of ex.itens) {
    if (it.valor > 0) { c += Math.round(it.valor * 100); qc++; } else { d += Math.round(-it.valor * 100); qd++; }
  }
  return { creditos: c / 100, debitos: d / 100, qtdCreditos: qc, qtdDebitos: qd };
}

/** A conta do arquivo e a conta escolhida? (compara so os digitos finais) */
export function contaDoArquivoConfere(contaArquivo: string | null, contaCadastro: string | null | undefined): boolean | null {
  const a = (contaArquivo ?? '').replace(/\D/g, '').replace(/^0+/, '');
  const b = (contaCadastro ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (!a || !b) return null;
  return a.endsWith(b) || b.endsWith(a);
}
