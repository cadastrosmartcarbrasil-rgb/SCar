import { describe, expect, it } from 'vitest';
import { caixaDoLogo, dimensoesPng, tamanhoDoArquivo } from './icone-app';

function png(largura: number, altura: number) {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const v = new DataView(b.buffer);
  v.setUint32(16, largura);
  v.setUint32(20, altura);
  return b;
}

describe('tamanhoDoArquivo', () => {
  it('aceita so os tamanhos servidos', () => {
    expect(tamanhoDoArquivo('192.png')).toBe(192);
    expect(tamanhoDoArquivo('512.png')).toBe(512);
    expect(tamanhoDoArquivo('100.png')).toBeNull();
    expect(tamanhoDoArquivo('192.jpg')).toBeNull();
    expect(tamanhoDoArquivo('../192.png')).toBeNull();
  });
});

describe('dimensoesPng', () => {
  it('le largura e altura do cabecalho', () => {
    expect(dimensoesPng(png(800, 200))).toEqual({ largura: 800, altura: 200 });
  });
  it('recusa o que nao e PNG', () => {
    expect(dimensoesPng(new Uint8Array(30))).toBeNull();
    expect(dimensoesPng(new Uint8Array([0x89, 0x50]))).toBeNull();
  });
});

describe('caixaDoLogo', () => {
  it('logo larga ocupa 70% da largura e mantem a proporcao', () => {
    expect(caixaDoLogo(512, { largura: 800, altura: 200 })).toEqual({ largura: 358, altura: 90 });
  });
  it('logo alta ocupa 70% da altura', () => {
    expect(caixaDoLogo(192, { largura: 100, altura: 200 })).toEqual({ largura: 67, altura: 134 });
  });
  it('sem dimensoes conhecidas vira um quadrado', () => {
    expect(caixaDoLogo(192, null)).toEqual({ largura: 134, altura: 134 });
  });
});
