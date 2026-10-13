import { describe, it, expect } from 'vitest';
import { fornecedorCasaComBusca, rotuloFornecedor, ordenarFornecedores } from './fornecedores';

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
