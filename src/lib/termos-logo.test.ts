import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { trocarLogoDoModelo } from './termos-server';

const base64 = 'A'.repeat(20000);
const modelo = `<table><tr><td><img src="data:image/png;base64,${base64}" alt="logo"></td><td>ORDEM DE SERVIÇO</td></tr></table><p>texto</p>`;

describe('trocarLogoDoModelo', () => {
  it('troca a logo do Word mesmo com data URL longa, e o cabeçalho não repete', () => {
    const r = trocarLogoDoModelo(modelo, 'data:image/png;base64,OFICIAL');
    expect(r.logoNoCabecalho).toBeNull();
    expect(r.html).toContain('base64,OFICIAL');
    expect(r.html).not.toContain(base64);
    expect(r.html.match(/<img/g)).toHaveLength(1);
    expect(r.html).toContain('ORDEM DE SERVIÇO</td>');
  });
  it('sem imagem no topo, a logo vai para o cabeçalho', () => {
    const r = trocarLogoDoModelo('<p>texto</p>', 'LOGO');
    expect(r).toEqual({ html: '<p>texto</p>', logoNoCabecalho: 'LOGO' });
  });
  it('sem logo oficial, mantém a do Word e não põe cabeçalho', () => {
    const r = trocarLogoDoModelo(modelo, null);
    expect(r.html).toBe(modelo);
    expect(r.logoNoCabecalho).toBeNull();
  });
});
