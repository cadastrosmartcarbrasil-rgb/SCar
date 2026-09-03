import { describe, expect, it } from 'vitest';
import { paraCaixaAlta, preservaCaixa, valorComCaixaPadrao } from './texto';

describe('paraCaixaAlta', () => {
  it('mantem a acentuacao do portugues', () => {
    expect(paraCaixaAlta('joao da silva')).toBe('JOAO DA SILVA');
    expect(paraCaixaAlta('proteção veicular')).toBe('PROTEÇÃO VEICULAR');
    expect(paraCaixaAlta('São Paulo')).toBe('SÃO PAULO');
  });

  it('nao altera o comprimento — e o que permite devolver o cursor ao lugar', () => {
    const texto = 'rua das acácias, 120 — apto 3';
    expect(paraCaixaAlta(texto)).toHaveLength(texto.length);
  });

  it('nao mexe em numero, pontuacao nem string vazia', () => {
    expect(paraCaixaAlta('01310-100')).toBe('01310-100');
    expect(paraCaixaAlta('')).toBe('');
  });
});

describe('preservaCaixa', () => {
  it('preserva o que a caixa alta quebraria', () => {
    expect(preservaCaixa('email')).toBe(true);
    expect(preservaCaixa('password')).toBe(true);
    expect(preservaCaixa('url')).toBe(true);
  });

  it('preserva pelo NOME do campo, mesmo em type=text', () => {
    // a chave aleatoria do PIX e um UUID e a de e-mail e um e-mail: virar
    // maiuscula faz o pagamento deixar de casar com o cadastro do banco
    expect(preservaCaixa('text', 'chave_pix')).toBe(true);
    expect(preservaCaixa('text', 'chavePix')).toBe(true);
    expect(preservaCaixa('text', 'logo_url')).toBe(true);
    expect(preservaCaixa('text', 'emailContato')).toBe(true);
    expect(preservaCaixa('text', 'webhook_token')).toBe(true);
  });

  it('ignora acento e caixa no nome do campo', () => {
    expect(preservaCaixa('text', 'E-MAIL')).toBe(true);
  });

  it('nao mexe em campo que nao e texto livre', () => {
    for (const t of ['number', 'date', 'checkbox', 'radio', 'file', 'color']) {
      expect(preservaCaixa(t)).toBe(true);
    }
  });

  it('deixa passar o campo comum de cadastro', () => {
    expect(preservaCaixa('text', 'nome')).toBe(false);
    expect(preservaCaixa('text', 'logradouro')).toBe(false);
    expect(preservaCaixa('text', 'cidade')).toBe(false);
    expect(preservaCaixa(undefined, undefined)).toBe(false);
    expect(preservaCaixa('tel', 'telefone')).toBe(false);
  });
});

describe('valorComCaixaPadrao', () => {
  it('padroniza o cadastro', () => {
    expect(valorComCaixaPadrao('rua das flores', 'text', 'logradouro'))
      .toBe('RUA DAS FLORES');
  });

  it('deixa o e-mail em paz', () => {
    expect(valorComCaixaPadrao('Marcio@SmartCarBrasil.com.br', 'email', 'email'))
      .toBe('Marcio@SmartCarBrasil.com.br');
  });

  it('deixa a chave PIX em paz mesmo sendo type=text', () => {
    const chave = 'a3f1c2de-9b44-4f8e-8c21-5d0e7b6a1234';
    expect(valorComCaixaPadrao(chave, 'text', 'chave_pix')).toBe(chave);
  });
});
