import { describe, expect, it } from 'vitest';
import {
  codigoDeBarrasDaLinha, codigoDeBarrasValido, dadosSicrediDoCodigo, htmlDoCarne, linhaFormatada,
  modulosI25, referenciaDoVencimento, rotularParcelas, svgCodigoDeBarras, type CabecalhoCarne, type FichaCarne,
} from './carne-impressao';

// Boleto real do carne (LELIS JOSE DE SA, QCW8B48, venc. 10/06/2026, R$ 338,00).
const LINHA = '74891.16009 34488.808105 39027.231008 9 14730000033800';

describe('codigo de barras a partir da linha digitavel', () => {
  it('monta os 44 digitos e confere o DV', () => {
    const c = codigoDeBarrasDaLinha(LINHA)!;
    expect(c).toHaveLength(44);
    expect(c.slice(0, 4)).toBe('7489');
    expect(c[4]).toBe('9');
    expect(c.slice(5, 19)).toBe('14730000033800');
    expect(codigoDeBarrasValido(c)).toBe(true);
  });
  it('recusa linha com digito trocado', () => {
    const errada = LINHA.replace('14730000033800', '14730000033900');
    expect(codigoDeBarrasValido(codigoDeBarrasDaLinha(errada))).toBe(false);
    expect(codigoDeBarrasDaLinha('123')).toBeNull();
  });
  it('le o campo livre do Sicredi: nosso numero e agencia/cedente da imagem', () => {
    const s = dadosSicrediDoCodigo(codigoDeBarrasDaLinha(LINHA))!;
    expect(s.nossoNumero).toBe('600344888');
    expect(`${s.cooperativa}/${s.beneficiario}`).toBe('0810/02723');
    expect(s.posto).toBe('39');
    expect(s.carteira).toBe('1');
  });
  it('formata a linha como no boleto', () => {
    expect(linhaFormatada(LINHA.replace(/\D/g, ''))).toBe(LINHA);
  });
});

describe('intercalado 2 de 5', () => {
  it('tem guarda, 10 modulos por par e fim; largura total 405 unidades para 44 digitos', () => {
    const m = modulosI25(codigoDeBarrasDaLinha(LINHA)!);
    expect(m.length).toBe(4 + 22 * 10 + 3);
    expect(m.reduce((s, x) => s + x, 0)).toBe(405);
    expect(m.slice(0, 4)).toEqual([1, 1, 1, 1]);
    expect(m.slice(-3)).toEqual([3, 1, 1]);
  });
  it('recusa numero impar de digitos', () => {
    expect(() => modulosI25('123')).toThrow();
  });
  it('gera SVG com uma barra por modulo impar', () => {
    const svg = svgCodigoDeBarras(codigoDeBarrasDaLinha(LINHA)!);
    expect((svg.match(/<rect/g) ?? []).length).toBe(Math.ceil(227 / 2));
  });
});

describe('parcelas e referencia', () => {
  it('numera so as mensalidades; adesao primeiro', () => {
    const r = rotularParcelas([
      { vencimento: '2026-08-10', tipo: 'MENSALIDADE' as const },
      { vencimento: '2026-07-10', tipo: 'MENSALIDADE' as const },
      { vencimento: '2026-06-01', tipo: 'ADESAO' as const },
    ]);
    expect(r.map((x) => x.parcela)).toEqual(['Adesão', '1/2', '2/2']);
  });
  it('referencia mes/ano', () => {
    expect(referenciaDoVencimento('2026-05-01')).toBe('5/2026');
    expect(referenciaDoVencimento(null)).toBeNull();
  });
});

describe('documento', () => {
  const cab: CabecalhoCarne = {
    beneficiario: 'SMART CAR BRASIL PROTEÇÃO VEICULAR', cnpj: '23427787000178', logo: null,
    instrucoes: ['Não receber após 1 dia do vencimento'],
    pagador: { nome: 'LELIS JOSE DE SA', documento: '55093833134', endereco: 'AV. GENERAL VALE, 528', cep_cidade: 'CEP: 78015-660, CUIABÁ - MT' },
  };
  const f = (i: number, linha = LINHA): FichaCarne => ({
    titulo_id: `t${i}`, vencimento: '2026-06-10', valor: 338, linha_digitavel: linha, nosso_numero: null,
    numero_documento: 'ABC', data_documento: '2025-11-11', parcela: `${i}/7`, referencia: '5/2026', pix_qr_svg: null, placa: 'QCW8B48',
  });
  it('3 fichas por folha', () => {
    const { html, impressas } = htmlDoCarne([1, 2, 3, 4, 5, 6, 7].map((i) => f(i)), cab);
    expect(impressas).toBe(7);
    expect((html.match(/class="folha"/g) ?? []).length).toBe(3);
    expect(html).toContain('0810/02723');
    expect(html).toContain('600344888');
    expect(html).toContain('23.427.787/0001-78');
  });
  it('ficha com linha invalida fica de fora', () => {
    const { impressas } = htmlDoCarne([f(1), f(2, '123')], cab);
    expect(impressas).toBe(1);
  });
});

describe('boletos que entram no carne', () => {
  it('so SCar, em aberto e registrado, por vencimento', async () => {
    const { boletosParaCarne, urlDoCarne } = await import('./carne-impressao');
    const t = (id: string, o: Partial<{ origem: 'SCAR' | 'MUTUAL'; status: string; linha_digitavel: string | null; data_vencimento: string }>) =>
      ({ id, origem: 'SCAR' as const, status: 'aberto', linha_digitavel: '1', data_vencimento: '2026-12-10', ...o });
    const r = boletosParaCarne([
      t('b', { data_vencimento: '2027-01-10' }), t('a', {}), t('m', { origem: 'MUTUAL' }),
      t('v', { status: 'vencido' }), t('s', { linha_digitavel: null }), t('p', { status: 'pago' }),
    ]);
    expect(r.map((x) => x.id)).toEqual(['a', 'b']);
    expect(urlDoCarne(['a', 'b'])).toBe('/api/v1/cobrancas/carne?ids=a,b');
  });
});
