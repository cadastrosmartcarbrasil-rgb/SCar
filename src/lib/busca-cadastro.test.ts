import { describe, it, expect } from 'vitest';
import { filtroBuscaVeiculos, filtroBuscaAssociados, resumoPagina, statusDaSituacao } from './busca-cadastro';

describe('busca no banco de veiculos e associados', () => {
  it('placa com separador vira so alfanumerico, em caixa alta', () => {
    expect(filtroBuscaVeiculos('abc-1d23')).toContain('placa.ilike.*ABC1D23*');
  });
  it('termo curto sem associado nao filtra', () => {
    expect(filtroBuscaVeiculos('a')).toBeNull();
  });
  it('associados achados pelo nome entram no or', () => {
    expect(filtroBuscaVeiculos('joao', ['u1', 'u2'])).toContain('cliente_id.in.(u1,u2)');
  });
  it('caracteres que quebram o or sao neutralizados', () => {
    const f = filtroBuscaAssociados('maria, (silva)*')!;
    expect(f).not.toMatch(/[()*,]\s*silva/);
    expect(f.startsWith('nome_razao_social.ilike.*maria silva*')).toBe(true);
  });
  it('CPF digitado com mascara procura por digitos', () => {
    expect(filtroBuscaAssociados('123.456.789-09')).toContain('cpf_cnpj.ilike.*12345678909*');
  });
  it('resumo da pagina', () => {
    expect(resumoPagina(1, 6807)).toEqual({ paginas: 137, atual: 1, de: 51, ate: 100 });
    expect(resumoPagina(0, 0)).toEqual({ paginas: 1, atual: 0, de: 0, ate: 0 });
    expect(resumoPagina(99, 60).atual).toBe(1);
  });
  it('situacao na base nunca traz inativo nem excluido', () => {
    expect(statusDaSituacao('base')).not.toContain('inativo');
    expect(statusDaSituacao('todos')).toBeNull();
  });
});
