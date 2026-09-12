import { describe, it, expect } from 'vitest';
import { destinoAposLogin } from './acesso';

describe('destinoAposLogin', () => {
  it('manda a equipe da matriz para o painel de gestao', () => {
    expect(destinoAposLogin({ papel: 'admin', regional_id: null }, false)).toBe('/dashboard');
    expect(destinoAposLogin({ papel: 'financeiro', regional_id: null }, false)).toBe('/dashboard');
  });

  // O bug que originou o arquivo: admin com ficha de vendedor caia no portal
  // do vendedor e ficava sem saida.
  it('acesso global vence o cadastro de vendedor', () => {
    expect(destinoAposLogin({ papel: 'admin', regional_id: null }, true)).toBe('/dashboard');
    expect(destinoAposLogin({ papel: 'financeiro', regional_id: 'r1' }, true)).toBe('/dashboard');
  });

  it('gestor com unidade entra no portal da franquia, mesmo vendendo', () => {
    expect(destinoAposLogin({ papel: 'gestor_regional', regional_id: 'r1' }, false)).toBe('/regional');
    expect(destinoAposLogin({ papel: 'gestor_regional', regional_id: 'r1' }, true)).toBe('/regional');
  });

  it('gestor SEM unidade nao vai para o portal da franquia', () => {
    expect(destinoAposLogin({ papel: 'gestor_regional', regional_id: null }, false)).toBe('/dashboard');
    expect(destinoAposLogin({ papel: 'gestor_regional', regional_id: null }, true)).toBe('/vendedor');
  });

  it('vendedor sem acesso global vai para o portal dele', () => {
    expect(destinoAposLogin({ papel: 'consultor_vendas', regional_id: 'r1' }, true)).toBe('/vendedor');
    expect(destinoAposLogin(null, true)).toBe('/vendedor');
  });

  it('staff sem portal proprio cai no painel de gestao', () => {
    expect(destinoAposLogin({ papel: 'consultor_vendas', regional_id: 'r1' }, false)).toBe('/dashboard');
    expect(destinoAposLogin({ papel: 'auditoria', regional_id: null }, false)).toBe('/dashboard');
    expect(destinoAposLogin(null, false)).toBe('/dashboard');
  });
});
