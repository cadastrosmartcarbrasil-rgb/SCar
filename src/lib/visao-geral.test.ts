import { describe, expect, it } from 'vitest';
import {
  COR_OUTROS, PALETA_CATEGORICA, coresPorEntidade, crescimentoLiquido, eventosPorEtapa,
  fatiasComOutros, funilOrdenado, inadimplenciaDoMes, inadimplenciaDoPeriodo, recebidoDoMes, projecaoDoMes, somarPorTipo, rotuloMesCurto, taxaChurn, variacaoRelativa,
} from './visao-geral';

describe('coresPorEntidade', () => {
  it('a cor segue o nome, nao a posicao no ranking', () => {
    const a = coresPorEntidade(['SAO PAULO', 'NATAL', 'MATRIZ']);
    const b = coresPorEntidade(['MATRIZ', 'SAO PAULO', 'NATAL']);
    expect(a).toEqual(b);
    expect(a.MATRIZ).toBe(PALETA_CATEGORICA.claro[0]);
  });
  it('troca de paleta no escuro e a 9a entidade vira cinza', () => {
    const nomes = 'ABCDEFGHI'.split('');
    const m = coresPorEntidade(nomes, true);
    expect(m.A).toBe(PALETA_CATEGORICA.escuro[0]);
    expect(m.I).toBe(COR_OUTROS);
    expect(m.Outros).toBe(COR_OUTROS);
  });
});

describe('fatiasComOutros', () => {
  const itens = [
    { n: 'SP', v: 1989 }, { n: 'MT', v: 448 }, { n: 'RN', v: 421 },
    { n: 'MG', v: 15 }, { n: 'BA', v: 6 }, { n: 'PR', v: 2 }, { n: 'PA', v: 2 }, { n: 'XX', v: 0 },
  ];
  it('ordena, dobra a cauda e soma 100%', () => {
    const f = fatiasComOutros(itens, (i) => i.n, (i) => i.v, 4);
    expect(f.map((x) => x.nome)).toEqual(['SP', 'MT', 'RN', 'Outros']);
    expect(f[3].valor).toBe(25);
    expect(f.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(1);
  });
  it('nao cria "Outros" de uma fatia so quando cabe tudo', () => {
    expect(fatiasComOutros(itens.slice(0, 3), (i) => i.n, (i) => i.v, 3).map((x) => x.nome))
      .toEqual(['SP', 'MT', 'RN']);
  });
  it('sem total devolve vazio', () => {
    expect(fatiasComOutros([{ n: 'A', v: 0 }], (i) => i.n, (i) => i.v)).toEqual([]);
  });
});

describe('meses e comparacoes', () => {
  it('rotulo curto', () => {
    expect(rotuloMesCurto('2026-10')).toBe('out/26');
    expect(rotuloMesCurto('lixo')).toBe('lixo');
  });
  it('variacao sem base nao inventa +100%', () => {
    expect(variacaoRelativa(5, 0)).toBeNull();
    expect(variacaoRelativa(0, 0)).toBe(0);
    expect(variacaoRelativa(150, 100)).toBeCloseTo(0.5);
  });
  it('liquido e churn', () => {
    expect(crescimentoLiquido({ adesoes: 10, saidas: 4 })).toBe(6);
    expect(taxaChurn(3, 0)).toBeNull();
    expect(taxaChurn(30, 3000)).toBeCloseTo(0.01);
  });
  it('projecao do mes pelo ritmo ate hoje', () => {
    expect(projecaoDoMes(13, new Date(2026, 9, 13))).toBe(31); // outubro, 31 dias
    expect(projecaoDoMes(30, new Date(2026, 10, 30))).toBe(30); // ultimo dia = o proprio valor
  });
});

describe('funil e eventos', () => {
  it('funil completo na ordem da esteira, com zero onde nao ha', () => {
    const f = funilOrdenado([{ status: 'EM_NEGOCIACAO', n: 8 }, { status: 'ATIVO', n: 2 }]);
    expect(f.map((x) => x.status)[0]).toBe('NOVO');
    expect(f.find((x) => x.status === 'EM_NEGOCIACAO')?.n).toBe(8);
    expect(f.some((x) => x.status === 'ATIVO')).toBe(false);
    expect(f.find((x) => x.status === 'NOVO')?.n).toBe(0);
  });
  it('eventos na ordem do processo, so os que existem', () => {
    const e = eventosPorEtapa([{ status: 'REPARO', n: 1 }, { status: 'ABERTO', n: 2 }]);
    expect(e.map((x) => x.status)).toEqual(['ABERTO', 'REPARO']);
  });
});

describe('mensalidades (serie da cobranca)', () => {
  const mes = (venceu: number, aberto: number, prazo = 0, atraso = 0) => ({
    mes: '2026-09-01', valor_emitido: venceu, valor_venceram: venceu,
    valor_aberto_vencido: aberto, valor_pago_no_prazo: prazo, valor_pago_em_atraso: atraso,
  });
  it('inadimplencia do mes sobre o que venceu; sem vencimento nao e 0%', () => {
    expect(inadimplenciaDoMes(mes(1000, 100))).toBeCloseTo(0.1);
    expect(inadimplenciaDoMes(mes(0, 0))).toBeNull();
  });
  it('recebido soma no prazo e em atraso (o banco devolve texto)', () => {
    expect(recebidoDoMes({ ...mes(0, 0), valor_pago_no_prazo: '392652.90', valor_pago_em_atraso: '1042.17' }))
      .toBeCloseTo(393695.07);
  });
  it('periodo pondera pelo valor, nao faz media de percentuais', () => {
    // 10% de 100 e 50% de 900 = 460/1000, nao (10+50)/2
    expect(inadimplenciaDoPeriodo([mes(100, 10), mes(900, 450)])).toBeCloseTo(0.46);
    expect(inadimplenciaDoPeriodo([])).toBeNull();
  });
});

describe('somarPorTipo', () => {
  it('casa sem caixa/acento e mantem a grafia de quem pesa mais', () => {
    const r = somarPorTipo(
      [{ tipo: 'Colisao', n: 2 }, { tipo: 'Furto', n: 1 }],
      [{ tipo: 'COLISÃO', n: '30' }, { tipo: 'PARABRISA', n: 5 }],
      null,
    );
    expect(r).toEqual([
      { tipo: 'COLISÃO', n: 32 }, { tipo: 'PARABRISA', n: 5 }, { tipo: 'Furto', n: 1 },
    ]);
  });
});
