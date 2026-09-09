import { describe, it, expect } from 'vitest';
import { mensagemDeLogin, ehSessaoCorrompida, destinoDoLogin } from './auth-mensagens';

describe('mensagemDeLogin', () => {
  it('traduz o erro mais comum sem dizer qual campo errou', () => {
    // De proposito a MESMA resposta para senha errada e e-mail inexistente:
    // nao confirmamos a quem pergunta se um e-mail e da equipe.
    expect(mensagemDeLogin('Invalid login credentials')).toBe('E-mail ou senha incorretos.');
    expect(mensagemDeLogin('User not found')).toBe('E-mail ou senha incorretos.');
  });
  it('separa o que a pessoa resolve sozinha do que precisa do administrador', () => {
    expect(mensagemDeLogin('Email not confirmed')).toMatch(/administrador/);
    expect(mensagemDeLogin('Too many requests')).toMatch(/Espere um minuto/);
    expect(mensagemDeLogin('Failed to fetch')).toMatch(/Sem conexao/);
  });
  it('nunca devolve texto vazio nem repassa o ingles cru', () => {
    expect(mensagemDeLogin(null)).toBe('Nao foi possivel entrar. Tente de novo.');
    expect(mensagemDeLogin('Some brand new gotrue error')).toBe('Nao foi possivel entrar. Tente de novo.');
  });
});

describe('ehSessaoCorrompida', () => {
  it('reconhece a sessao morta que ficou no navegador', () => {
    expect(ehSessaoCorrompida('Invalid Refresh Token: Already Used')).toBe(true);
    expect(ehSessaoCorrompida('JWT expired')).toBe(true);
    expect(ehSessaoCorrompida('invalid claim: missing sub')).toBe(true);
  });
  it('nao confunde senha errada com sessao corrompida', () => {
    expect(ehSessaoCorrompida('Invalid login credentials')).toBe(false);
    expect(ehSessaoCorrompida(null)).toBe(false);
  });
});

describe('destinoDoLogin', () => {
  it('respeita o caminho interno que o middleware gravou', () => {
    expect(destinoDoLogin('/vendas/123', '/dashboard')).toBe('/vendas/123');
    expect(destinoDoLogin(null, '/dashboard')).toBe('/dashboard');
  });
  it('NAO deixa o login jogar a pessoa para fora do dominio', () => {
    // phishing: o link e legitimo ate a senha ser digitada
    expect(destinoDoLogin('https://site-falso.com', '/dashboard')).toBe('/dashboard');
    expect(destinoDoLogin('//site-falso.com', '/dashboard')).toBe('/dashboard');
    expect(destinoDoLogin('/\\site-falso.com', '/dashboard')).toBe('/dashboard');
    expect(destinoDoLogin('javascript:alert(1)', '/dashboard')).toBe('/dashboard');
  });
  it('nao termina o login numa tela de JSON nem de volta no proprio login', () => {
    expect(destinoDoLogin('/api/v1/sac/busca', '/dashboard')).toBe('/dashboard');
    expect(destinoDoLogin('/login', '/dashboard')).toBe('/dashboard');
  });
});
