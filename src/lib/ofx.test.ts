import { describe, expect, it } from 'vitest';
import { contaDoArquivoConfere, dataOfx, decodificarOfx, interpretarOfx, resumoOfx, valorOfx } from './ofx';

const SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
CHARSET:1252

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>748
<BRANCHID>0810
<ACCTID>02723-9
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20261013000000[-3:BRT]
<DTEND>20261015000000[-3:BRT]
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261013120000[-3:BRT]
<TRNAMT>200.00
<FITID>A1
<MEMO>PIX RECEBIDO JOAO
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261015
<TRNAMT>-7,90
<FITID>A2
<CHECKNUM>123
<MEMO>TARIFA &amp; PACOTE
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261015
<TRNAMT>-50.00
<FITID>A2
<MEMO>OUTRO COM O MESMO FITID
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261015
<TRNAMT>-7,90
<FITID>A2
<CHECKNUM>123
<MEMO>TARIFA &amp; PACOTE
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>1042.10
<DTASOF>20261015
</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="211"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>077</BANKID><ACCTID>12345</ACCTID></BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261014</DTPOSTED><TRNAMT>-1.234,56</TRNAMT><NAME>Fornecedor</NAME><MEMO>Pagamento</MEMO></STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>10</BALAMT><DTASOF>20261014</DTASOF></LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe('OFX', () => {
  it('le o SGML 1.x: conta, periodo, saldo e lancamentos', () => {
    const ex = interpretarOfx(SGML);
    expect(ex.banco).toBe('748');
    expect(ex.conta).toBe('02723-9');
    expect(ex.dataInicio).toBe('2026-10-13');
    expect(ex.dataFim).toBe('2026-10-15');
    expect(ex.saldo).toBe(1042.1);
    expect(ex.saldoEm).toBe('2026-10-15');
    expect(ex.itens).toHaveLength(3);
    expect(ex.itens[0]).toEqual({ fitid: 'A1', data: '2026-10-13', valor: 200, tipo: 'CREDIT', historico: 'PIX RECEBIDO JOAO', documento: null });
    expect(ex.itens[1]).toMatchObject({ fitid: 'A2', valor: -7.9, historico: 'TARIFA & PACOTE', documento: '123' });
  });

  it('FITID repetido com conteudo diferente vira #2; o mesmo lancamento repetido sai', () => {
    const ex = interpretarOfx(SGML);
    expect(ex.itens.map((i) => i.fitid)).toEqual(['A1', 'A2', 'A2#2']);
    expect(ex.avisos.some((a) => a.includes('repetiu FITID'))).toBe(true);
  });

  it('le o XML 2.x e monta identidade quando falta FITID', () => {
    const ex = interpretarOfx(XML);
    expect(ex.conta).toBe('12345');
    expect(ex.itens).toHaveLength(1);
    expect(ex.itens[0].valor).toBe(-1234.56);
    expect(ex.itens[0].historico).toBe('Fornecedor - Pagamento');
    expect(ex.itens[0].fitid.startsWith('SEM-FITID-2026-10-14--1234.56')).toBe(true);
    // a identidade e estavel: reimportar o mesmo arquivo gera o mesmo FITID
    expect(interpretarOfx(XML).itens[0].fitid).toBe(ex.itens[0].fitid);
  });

  it('arquivo que nao e OFX avisa em vez de falhar', () => {
    const ex = interpretarOfx('data;valor\n01/10;10');
    expect(ex.itens).toEqual([]);
    expect(ex.avisos[0]).toContain('nao parece um OFX');
  });

  it('valores e datas', () => {
    expect(valorOfx('-7.90')).toBe(-7.9);
    expect(valorOfx('-7,90')).toBe(-7.9);
    expect(valorOfx('1.234,56')).toBe(1234.56);
    expect(valorOfx('1,234.56')).toBe(1234.56);
    expect(valorOfx('')).toBeNull();
    expect(valorOfx('abc')).toBeNull();
    expect(dataOfx('20261013120000[-3:BRT]')).toBe('2026-10-13');
    expect(dataOfx('20261399')).toBeNull();
    expect(dataOfx(null)).toBeNull();
  });

  it('decodifica Windows-1252 pelo cabecalho (acento do historico)', () => {
    const txt = 'CHARSET:1252\n<OFX><MEMO>LIQUIDAÇÃO';
    const bytes = new Uint8Array([...txt].map((c) => c.charCodeAt(0)));
    expect(decodificarOfx(bytes)).toContain('LIQUIDAÇÃO');
  });

  it('resumo e conferencia da conta', () => {
    expect(resumoOfx(interpretarOfx(SGML))).toEqual({ creditos: 200, debitos: 57.9, qtdCreditos: 1, qtdDebitos: 2 });
    expect(contaDoArquivoConfere('02723-9', '027239')).toBe(true);
    expect(contaDoArquivoConfere('000027239', '27239')).toBe(true);
    expect(contaDoArquivoConfere('11111', '22222')).toBe(false);
    expect(contaDoArquivoConfere(null, '1')).toBeNull();
  });
});
