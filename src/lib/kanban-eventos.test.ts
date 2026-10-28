import { describe, expect, it } from 'vitest';
import { agruparPorRegional, filtrarPorExpansao, ROTULO_SEM_UNIDADE, veioDoMutual } from './kanban-eventos';

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

describe('veioDoMutual', () => {
  it('reconhece a frase que a RPC da 0112 grava', () => {
    expect(veioDoMutual('Trazido do historico do Mutual em 17/10/2026.\nProtocolo no Mutual: 9001.')).toBe(true);
    expect(veioDoMutual('Colisao na avenida')).toBe(false);
    expect(veioDoMutual(null)).toBe(false);
  });
});

import { eventoCasaComBusca } from './kanban-eventos';

describe('eventoCasaComBusca', () => {
  const e = {
    numero_protocolo: 'EVT-20261015-0042',
    veiculos: { placa: 'QQQ5D49', chassi: '9BWZZZ377VT004251', marca: 'HONDA', modelo: 'CIVIC' },
    clientes: { nome_razao_social: 'JOÃO DA SILVA', cpf_cnpj: '529.982.247-25' },
    tipos_evento: { nome: 'Colisão' },
    regionais: { nome: 'RIBEIRÃO PRETO' },
  };
  it('termo curto nao filtra', () => {
    expect(eventoCasaComBusca(e, '')).toBe(true);
    expect(eventoCasaComBusca(e, 'x')).toBe(true);
  });
  it('acha pelo protocolo, com ou sem separador', () => {
    expect(eventoCasaComBusca(e, 'EVT-20261015-0042')).toBe(true);
    expect(eventoCasaComBusca(e, '0042')).toBe(true);
    expect(eventoCasaComBusca(e, '202610150042')).toBe(true);
  });
  it('acha pela placa com traco e minuscula', () => {
    expect(eventoCasaComBusca(e, 'qqq-5d49')).toBe(true);
  });
  it('acha pelo nome sem acento e por palavras soltas', () => {
    expect(eventoCasaComBusca(e, 'joao silva')).toBe(true);
    expect(eventoCasaComBusca(e, 'joao civic')).toBe(true);
    expect(eventoCasaComBusca(e, 'maria')).toBe(false);
  });
  it('acha pelo CPF e pelo final do chassi', () => {
    expect(eventoCasaComBusca(e, '52998224725')).toBe(true);
    expect(eventoCasaComBusca(e, '004251')).toBe(true);
  });
  it('acha pelo tipo e pela unidade', () => {
    expect(eventoCasaComBusca(e, 'colisao')).toBe(true);
    expect(eventoCasaComBusca(e, 'ribeirao')).toBe(true);
  });
});
