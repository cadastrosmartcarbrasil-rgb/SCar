import { describe, expect, it } from 'vitest';
import {
  ALVO_BYTES, LADO_MAXIMO, LIMITE_BYTES, dimensoesAlvo, ehImagem, ehPdf, nomeComprimido,
  precisaComprimir, tamanhoLegivel, validarArquivo,
} from './imagem';

const arquivo = (over?: Partial<{ type: string; size: number; name: string }>) => ({
  type: 'image/jpeg', size: 3_000_000, name: 'foto.jpg', ...over,
});

describe('dimensoesAlvo', () => {
  it('reduz mantendo a proporcao pelo maior lado', () => {
    expect(dimensoesAlvo(4000, 3000)).toEqual({ largura: LADO_MAXIMO, altura: 1200 });
    expect(dimensoesAlvo(3000, 4000)).toEqual({ largura: 1200, altura: LADO_MAXIMO });
  });

  it('nao amplia imagem menor que o limite', () => {
    expect(dimensoesAlvo(800, 600)).toEqual({ largura: 800, altura: 600 });
  });

  it('aguenta medida esquisita sem quebrar', () => {
    expect(dimensoesAlvo(0, 0)).toEqual({ largura: 0, altura: 0 });
    expect(dimensoesAlvo(20000, 10).largura).toBe(LADO_MAXIMO);
    expect(dimensoesAlvo(20000, 10).altura).toBe(1);   // nunca zera o outro lado
  });
});

describe('tamanhoLegivel', () => {
  it('fala em B, KB e MB', () => {
    expect(tamanhoLegivel(900)).toBe('900 B');
    expect(tamanhoLegivel(480 * 1024)).toBe('480 KB');
    expect(tamanhoLegivel(1_468_006)).toBe('1,4 MB');
  });

  it('anexo antigo sem peso registrado nao vira "NaN"', () => {
    expect(tamanhoLegivel(null)).toBe('—');
    expect(tamanhoLegivel(undefined)).toBe('—');
  });
});

describe('nomeComprimido', () => {
  it('troca a extensao, porque o que sai do canvas e JPEG', () => {
    expect(nomeComprimido('IMG_0042.HEIC')).toBe('IMG_0042.jpg');
    expect(nomeComprimido('frente.png')).toBe('frente.jpg');
    expect(nomeComprimido('sem-extensao')).toBe('sem-extensao.jpg');
    expect(nomeComprimido('')).toBe('foto.jpg');
  });
});

describe('ehImagem / ehPdf', () => {
  it('reconhece pelo mime e, no PDF, tambem pelo nome', () => {
    expect(ehImagem(arquivo())).toBe(true);
    expect(ehImagem(arquivo({ type: 'application/pdf' }))).toBe(false);
    expect(ehPdf(arquivo({ type: 'application/pdf', name: 'crlv.pdf' }))).toBe(true);
    expect(ehPdf(arquivo({ type: '', name: 'crlv.PDF' }))).toBe(true);
  });
});

describe('precisaComprimir', () => {
  it('so mexe na imagem que esta acima do alvo', () => {
    expect(precisaComprimir(arquivo({ size: ALVO_BYTES + 1 }))).toBe(true);
    expect(precisaComprimir(arquivo({ size: 200_000 }))).toBe(false);
    expect(precisaComprimir(arquivo({ type: 'application/pdf', size: 9_000_000 }))).toBe(false);
  });
});

describe('validarArquivo', () => {
  it('imagem pesada passa — ela vai ser reduzida antes de subir', () => {
    expect(validarArquivo(arquivo({ size: 9_000_000 }))).toBeNull();
  });

  it('recusa o que nao e imagem quando so imagem serve', () => {
    expect(validarArquivo(arquivo({ type: 'application/pdf', name: 'x.pdf' })))
      .toMatch(/imagem/i);
  });

  it('aceita PDF quando a tela aceita, mas com teto', () => {
    const pdf = arquivo({ type: 'application/pdf', name: 'crlv.pdf', size: 1_000_000 });
    expect(validarArquivo(pdf, { aceitaPdf: true })).toBeNull();
    expect(validarArquivo({ ...pdf, size: LIMITE_BYTES + 1 }, { aceitaPdf: true }))
      .toMatch(/limite/i);
  });

  it('recusa imagem absurda, que nem vale a pena tentar reduzir', () => {
    expect(validarArquivo(arquivo({ size: 50 * 1024 * 1024 }))).toMatch(/grande demais/i);
  });
});

describe('validarArquivo com outros formatos', () => {
  const xml = { type: 'application/xml', size: 20_000, name: 'nfe.xml' };

  it('aceita o que a tela declarar (XML da nota, por exemplo)', () => {
    expect(validarArquivo(xml, { aceitaPdf: true, aceitaOutros: /\.xml$/i })).toBeNull();
  });

  it('sem a permissao, o mesmo arquivo e recusado', () => {
    expect(validarArquivo(xml, { aceitaPdf: true })).toMatch(/imagem/i);
  });

  it('o teto tambem vale para o formato extra', () => {
    expect(validarArquivo({ ...xml, size: LIMITE_BYTES + 1 }, { aceitaOutros: /\.xml$/i }))
      .toMatch(/limite/i);
  });
});
