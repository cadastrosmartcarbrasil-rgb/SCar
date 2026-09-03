import { describe, expect, it } from 'vitest';
import {
  CHAVE_TEMA,
  SCRIPT_TEMA_INICIAL,
  ehTema,
  proximoTema,
  rotuloAlternancia,
  temaEfetivo,
} from './tema';

describe('temaEfetivo', () => {
  it('respeita a escolha explicita, contrariando o sistema', () => {
    expect(temaEfetivo('claro', true)).toBe('claro');
    expect(temaEfetivo('escuro', false)).toBe('escuro');
  });

  it('sem escolha, segue o sistema operacional', () => {
    expect(temaEfetivo(null, true)).toBe('escuro');
    expect(temaEfetivo(null, false)).toBe('claro');
    expect(temaEfetivo('sistema', true)).toBe('escuro');
  });

  it('o padrao do produto e o CLARO quando nao ha sinal nenhum', () => {
    expect(temaEfetivo(undefined, false)).toBe('claro');
  });
});

describe('proximoTema', () => {
  it('alterna entre os dois estados visiveis', () => {
    expect(proximoTema('claro', false)).toBe('escuro');
    expect(proximoTema('escuro', false)).toBe('claro');
  });

  it('a partir de "sistema", o clique sai do que esta na tela', () => {
    // sistema escuro na tela -> o clique leva ao claro
    expect(proximoTema('sistema', true)).toBe('claro');
    expect(proximoTema(null, true)).toBe('claro');
    expect(proximoTema(null, false)).toBe('escuro');
  });

  it('nunca devolve "sistema" — o botao so oferece claro e escuro', () => {
    for (const atual of ['claro', 'escuro', 'sistema', null] as const) {
      for (const sistema of [true, false]) {
        expect(proximoTema(atual, sistema)).not.toBe('sistema');
      }
    }
  });
});

describe('ehTema', () => {
  it('recusa o que nao e tema (localStorage e editavel pelo usuario)', () => {
    expect(ehTema('claro')).toBe(true);
    expect(ehTema('escuro')).toBe(true);
    expect(ehTema('sistema')).toBe(true);
    expect(ehTema('roxo')).toBe(false);
    expect(ehTema(null)).toBe(false);
    expect(ehTema(7)).toBe(false);
  });
});

describe('rotuloAlternancia', () => {
  it('descreve o DESTINO do clique, nao o estado atual', () => {
    expect(rotuloAlternancia('escuro')).toContain('claro');
    expect(rotuloAlternancia('claro')).toContain('escuro');
  });
});

describe('SCRIPT_TEMA_INICIAL', () => {
  it('usa a mesma chave do resto do modulo', () => {
    expect(SCRIPT_TEMA_INICIAL).toContain(CHAVE_TEMA);
  });

  it('consulta a preferencia do sistema e protege contra storage bloqueado', () => {
    expect(SCRIPT_TEMA_INICIAL).toContain('prefers-color-scheme: dark');
    expect(SCRIPT_TEMA_INICIAL).toContain('try');
    expect(SCRIPT_TEMA_INICIAL).toContain('catch');
  });

  it('decide antes da pintura aplicando a classe no <html>', () => {
    expect(SCRIPT_TEMA_INICIAL).toContain('documentElement');
    expect(SCRIPT_TEMA_INICIAL).toContain("'dark'");
  });
});
