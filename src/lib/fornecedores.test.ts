import { describe, it, expect } from 'vitest';
import { fornecedorCasaComBusca, rotuloFornecedor, ordenarFornecedores, opcoesPrestadorDoServico } from './fornecedores';

const ze = { razao_social: 'JOSE DA SILVA TRANSPORTES LTDA', nome_fantasia: 'GUINCHO DO ZÉ', documento: '19131243000197', cobertura: 'CUIABA' };
const auto = { razao_social: 'AUTO PECAS BRASIL LTDA', nome_fantasia: null, documento: '11222333000181' };

describe('fornecedorCasaComBusca', () => {
  it('acha pelo nome fantasia, sem acento e sem caixa', () => {
    expect(fornecedorCasaComBusca(ze, 'guincho do ze')).toBe(true);
    expect(fornecedorCasaComBusca(ze, 'Zé')).toBe(true);
  });
  it('acha pela razao social', () => {
    expect(fornecedorCasaComBusca(ze, 'transportes')).toBe(true);
  });
  it('texto sem digito NAO casa com todo mundo (o bug do documento vazio)', () => {
    expect(fornecedorCasaComBusca(auto, 'guincho')).toBe(false);
  });
  it('acha pelo CNPJ com ou sem mascara', () => {
    expect(fornecedorCasaComBusca(ze, '19.131.243')).toBe(true);
    expect(fornecedorCasaComBusca(ze, '19131243000197')).toBe(true);
    expect(fornecedorCasaComBusca(auto, '19.131')).toBe(false);
  });
  it('termo vazio devolve todos', () => {
    expect(fornecedorCasaComBusca(auto, '  ')).toBe(true);
  });
});

describe('rotuloFornecedor', () => {
  it('fantasia primeiro, razao entre parenteses', () => {
    expect(rotuloFornecedor(ze)).toBe('GUINCHO DO ZÉ (JOSE DA SILVA TRANSPORTES LTDA)');
  });
  it('sem fantasia (ou igual) mostra so a razao', () => {
    expect(rotuloFornecedor(auto)).toBe('AUTO PECAS BRASIL LTDA');
    expect(rotuloFornecedor({ razao_social: 'XPTO', nome_fantasia: 'xpto' })).toBe('XPTO');
  });
  it('ordena pelo nome exibido', () => {
    expect(ordenarFornecedores([ze, auto]).map((f) => f.razao_social)).toEqual([auto.razao_social, ze.razao_social]);
  });
});

describe('opcoesPrestadorDoServico', () => {
  const todos = [
    { id: 'a', razao_social: 'TONI LTDA', nome_fantasia: 'TONI GUINCHOS', ativo: true, prestador_assistencia: true },
    { id: 'b', razao_social: ' ALINE SILVA', nome_fantasia: 'ALINE GUINCHO SINOP', ativo: true, prestador_assistencia: true },
    { id: 'c', razao_social: 'PRESTA SERV', nome_fantasia: null, ativo: false, prestador_assistencia: true },
  ];
  const vinculados = [{ fornecedor_id: 'a', razao_social: 'TONI LTDA', cobertura: null, valor_acordado: 200, valor_km: 3, prazo_medio_min: 40 }];

  it('lista o vinculado primeiro e TODO prestador ativo sem vinculo depois', () => {
    const o = opcoesPrestadorDoServico(vinculados, todos);
    expect(o.map((x) => x.fornecedor_id)).toEqual(['a', 'b']);
    expect(o[0]).toMatchObject({ vinculado: true, valor_acordado: 200, rotulo: 'TONI GUINCHOS (TONI LTDA)' });
    expect(o[1]).toMatchObject({ vinculado: false, valor_acordado: null, rotulo: 'ALINE GUINCHO SINOP (ALINE SILVA)' });
  });

  it('sem nenhum vinculo, ainda oferece os prestadores ativos', () => {
    expect(opcoesPrestadorDoServico([], todos).map((x) => x.fornecedor_id)).toEqual(['b', 'a']);
  });
});
