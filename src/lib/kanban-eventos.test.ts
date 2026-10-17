import { describe, expect, it } from 'vitest';
import { agruparPorRegional, filtrarPorExpansao, ROTULO_SEM_UNIDADE } from './kanban-eventos';

const ev = (regional_id: string | null, nome?: string) => ({
  regional_id,
  regionais: nome ? { nome } : null,
});

describe('agruparPorRegional', () => {
  it('conta por unidade, da maior para a menor, desempate pelo nome', () => {
    const g = agruparPorRegional([ev('a', 'NATAL'), ev('b', 'CUIABA'), ev('a', 'NATAL'), ev('c', 'ARACAJU')]);
    expect(g.map((x) => [x.nome, x.quantidade])).toEqual([
      ['NATAL', 2],
      ['ARACAJU', 1],
      ['CUIABA', 1],
    ]);
  });

  it('regional nula e a matriz, num grupo proprio', () => {
    const g = agruparPorRegional([ev(null), ev(null), ev('a', 'NATAL')]);
    expect(g[0]).toEqual({ regionalId: null, nome: ROTULO_SEM_UNIDADE, quantidade: 2 });
  });

  it('coluna vazia nao tem grupo', () => {
    expect(agruparPorRegional([])).toEqual([]);
  });
});

describe('filtrarPorExpansao', () => {
  const lista = [ev('a', 'NATAL'), ev(null), ev('b', 'CUIABA')];
  it('compacta nao desenha card nenhum', () => {
    expect(filtrarPorExpansao(lista, null)).toEqual([]);
  });
  it('"ver todos" traz a coluna inteira', () => {
    expect(filtrarPorExpansao(lista, 'todos')).toHaveLength(3);
  });
  it('por unidade traz so a dela, inclusive a matriz', () => {
    expect(filtrarPorExpansao(lista, { regionalId: 'a' })).toHaveLength(1);
    expect(filtrarPorExpansao(lista, { regionalId: null })).toEqual([ev(null)]);
  });
});
