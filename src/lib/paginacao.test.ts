import { describe, expect, it } from 'vitest';
import { lerTodas } from './paginacao';

function fonte(total: number) {
  const linhas = Array.from({ length: total }, (_, i) => i);
  const pedidos: [number, number][] = [];
  const pagina = async (de: number, ate: number) => {
    pedidos.push([de, ate]);
    return { data: linhas.slice(de, ate + 1), error: null };
  };
  return { pagina, pedidos };
}

describe('lerTodas', () => {
  it('passa do teto de 1.000 do PostgREST (o caso dos 2.898 veiculos)', async () => {
    const { pagina, pedidos } = fonte(2898);
    const r = await lerTodas(pagina);
    expect(r).toHaveLength(2898);
    expect(r[2193]).toBe(2193);
    expect(pedidos).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('total multiplo exato da pagina pede uma pagina vazia e para', async () => {
    const { pagina, pedidos } = fonte(2000);
    expect(await lerTodas(pagina)).toHaveLength(2000);
    expect(pedidos).toHaveLength(3);
  });

  it('tabela pequena faz uma consulta so', async () => {
    const { pagina, pedidos } = fonte(9);
    expect(await lerTodas(pagina)).toHaveLength(9);
    expect(pedidos).toHaveLength(1);
  });

  it('erro do banco sobe, nao vira lista parcial', async () => {
    const erro = { code: '57014', message: 'timeout' };
    await expect(lerTodas(async () => ({ data: null, error: erro }))).rejects.toBe(erro);
  });

  it('para se a fonte nunca termina', async () => {
    const sempreCheia = async () => ({ data: [1, 2], error: null });
    await expect(lerTodas(sempreCheia, 2, 5)).rejects.toThrow(/limite/);
  });
});
