import { describe, expect, it } from 'vitest';
import {
  categoriasRotuladas, maisContratados, penetracao, pilhaPorTipo, receitaPorVeiculo,
  rotuloCategoria, ROTULO_OUTROS_PRODUTOS, type PainelProdutoItem,
} from './painel-produtos';

const p = (nome: string, contratacoes: number, receita = 0): PainelProdutoItem => ({
  produto_id: nome, nome, categoria: 'RCF', contratacoes, receita, sem_preco: 0,
});

describe('painel de produtos', () => {
  it('rotula a categoria sem mostrar o código', () => {
    expect(rotuloCategoria('RCF')).toBe('Proteção a terceiros');
    expect(rotuloCategoria('vidros')).toBe('Vidros');
    expect(rotuloCategoria(null)).toBe('Outros');
    expect(rotuloCategoria('NOVA')).toBe('Nova');
  });

  it('top 5 pela contratação, desempate pela receita', () => {
    const lista = [p('A', 3, 10), p('B', 5), p('C', 3, 30), p('D', 1), p('E', 2), p('F', 4), p('G', 0)];
    expect(maisContratados(lista).map((x) => x.nome)).toEqual(['B', 'F', 'C', 'A', 'E']);
    expect(maisContratados([p('Z', 0)])).toEqual([]);
  });

  it('penetração não inventa 0% sem base', () => {
    expect(penetracao(25, 100)).toBe(0.25);
    expect(penetracao(5, 0)).toBeNull();
    expect(penetracao(150, 100)).toBe(1);
  });

  it('receita por veículo só conta quem tem opcional', () => {
    expect(receitaPorVeiculo(100, 3)).toBe(33.33);
    expect(receitaPorVeiculo(100, 0)).toBe(0);
  });

  it('pilha por tipo leva o resto para "Outros produtos"', () => {
    const tipos = [
      { tipo: 'Passeio', veiculos: 10, com_opcional: 5, contratacoes: 6, receita: 0 },
      { tipo: 'Moto', veiculos: 4, com_opcional: 2, contratacoes: 2, receita: 0 },
      { tipo: 'Diesel', veiculos: 1, com_opcional: 0, contratacoes: 0, receita: 0 },
    ];
    const matriz = [
      { produto: 'RCF', tipo: 'Passeio', contratacoes: 4, receita: 0 },
      { produto: 'Vidros', tipo: 'Passeio', contratacoes: 2, receita: 0 },
      { produto: 'RCF', tipo: 'Moto', contratacoes: 2, receita: 0 },
    ];
    const pilha = pilhaPorTipo(tipos, matriz, ['RCF']);
    expect(pilha).toEqual([
      { tipo: 'Passeio', RCF: 4, [ROTULO_OUTROS_PRODUTOS]: 2 },
      { tipo: 'Moto', RCF: 2, [ROTULO_OUTROS_PRODUTOS]: 0 },
    ]);
  });

  it('categorias somam pelo rótulo e ordenam pela receita', () => {
    const r = categoriasRotuladas([
      { categoria: 'RCF', contratacoes: 2, receita: 20 },
      { categoria: 'rcf', contratacoes: 1, receita: 10 },
      { categoria: 'VIDROS', contratacoes: 5, receita: 50 },
    ]);
    expect(r).toEqual([
      { nome: 'Vidros', receita: 50, contratacoes: 5 },
      { nome: 'Proteção a terceiros', receita: 30, contratacoes: 3 },
    ]);
  });
});
