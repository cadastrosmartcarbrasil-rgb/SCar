import { describe, expect, it } from 'vitest';
import {
  competenciaComissionavel,
  fimMes,
  janelaMeses,
  rankingConsultores,
  resumoRegionais,
  serieMensal,
  somarMeses,
  taxaRecebimento,
  variacao,
  vencimentoSugerido,
  type DesempenhoLinha,
} from './comissoes';

const L = (p: Partial<DesempenhoLinha>): DesempenhoLinha => ({
  competencia: '2026-11-01',
  regional_id: 'A',
  regional_nome: 'Regional A',
  vendedor_id: 'v1',
  vendedor_nome: 'Ana',
  boletos_emitidos: 0,
  valor_emitido: 0,
  boletos_recebidos: 0,
  valor_recebido: 0,
  comissao_vendedor: 0,
  comissao_regional: 0,
  ...p,
});

// Mesmo cenario do teste SQL de 0025 (Ana, Bruno na A; Carla na B)
const linhas: DesempenhoLinha[] = [
  L({ competencia: '2026-10-01', boletos_emitidos: 1, valor_emitido: 200, boletos_recebidos: 1, valor_recebido: 200 }),
  L({ boletos_emitidos: 2, valor_emitido: 400, boletos_recebidos: 2, valor_recebido: 400, comissao_vendedor: 40, comissao_regional: 8 }),
  L({ vendedor_id: 'v2', vendedor_nome: 'Bruno', boletos_emitidos: 2, valor_emitido: 200, boletos_recebidos: 1, valor_recebido: 100, comissao_vendedor: 5, comissao_regional: 2 }),
  L({ regional_id: 'B', regional_nome: 'Regional B', vendedor_id: 'v3', vendedor_nome: 'Carla', boletos_emitidos: 1, valor_emitido: 150, boletos_recebidos: 1, valor_recebido: 150 }),
  L({ vendedor_id: null, vendedor_nome: 'Sem consultor', boletos_emitidos: 1, valor_emitido: 50.1, boletos_recebidos: 1, valor_recebido: 50.2 }),
];

describe('datas de competencia', () => {
  it('soma meses atravessando o ano', () => {
    expect(somarMeses('2026-11-01', 2)).toBe('2027-01-01');
    expect(somarMeses('2027-01-01', -2)).toBe('2026-11-01');
  });
  it('janela dos ultimos 3 meses em ordem cronologica', () => {
    expect(janelaMeses('2026-11-15', 3)).toEqual(['2026-09-01', '2026-10-01', '2026-11-01']);
  });
  it('fim do mes, inclusive fevereiro bissexto', () => {
    expect(fimMes('2026-11-01')).toBe('2026-11-30');
    expect(fimMes('2028-02-01')).toBe('2028-02-29');
  });
  it('so comissiona a partir de novembro/2026', () => {
    expect(competenciaComissionavel('2026-10-01')).toBe(false);
    expect(competenciaComissionavel('2026-11-20')).toBe(true);
  });
  it('vencimento sugerido no mes seguinte', () => {
    expect(vencimentoSugerido('2026-11-01')).toBe('2026-12-10');
    expect(vencimentoSugerido('2026-12-01', 5)).toBe('2027-01-05');
  });
});

describe('indicadores', () => {
  it('variacao e taxa tratam base zero', () => {
    expect(variacao(150, 100)).toBeCloseTo(0.5);
    expect(variacao(10, 0)).toBeNull();
    expect(taxaRecebimento(50, 0)).toBeNull();
    expect(taxaRecebimento(75, 100)).toBe(0.75);
  });

  it('serie mensal soma emitidos x recebidos sem erro de centavos', () => {
    const [set, out, nov] = serieMensal(linhas, janelaMeses('2026-11-01'));
    expect(set.valorEmitido).toBe(0);
    expect(out.valorRecebido).toBe(200);
    expect(nov.valorEmitido).toBe(800.1);
    expect(nov.valorRecebido).toBe(700.2);
    expect(nov.boletosEmitidos).toBe(6);
    expect(nov.comissaoTotal).toBe(55);
  });

  it('resumo por regional com crescimento vs mes anterior', () => {
    const r = resumoRegionais(linhas, '2026-11-01');
    expect(r.map((x) => x.regionalNome)).toEqual(['Regional A', 'Regional B']);
    expect(r[0].valorRecebido).toBe(550.2);
    expect(r[0].crescimentoRecebido).toBeCloseTo(550.2 / 200 - 1);
    expect(r[1].crescimentoRecebido).toBeNull(); // sem base em outubro
  });
});

describe('ranking de consultores', () => {
  const rk = rankingConsultores(linhas, janelaMeses('2026-11-01'));

  it('ordena por melhor recebimento e ignora "Sem consultor"', () => {
    expect(rk.map((c) => c.nome)).toEqual(['Ana', 'Carla', 'Bruno']);
    expect(rk.map((c) => c.posicao)).toEqual([1, 2, 3]);
  });

  it('traz a trilha dos 3 meses e o crescimento', () => {
    const ana = rk[0];
    expect(ana.recebidoPorMes).toEqual([0, 200, 400]);
    expect(ana.crescimentoMes).toBeCloseTo(1);
    expect(ana.crescimentoJanela).toBeNull(); // setembro = 0
    expect(ana.comissao).toBe(40);
  });

  it('taxa de recebimento por consultor', () => {
    const bruno = rk.find((c) => c.nome === 'Bruno')!;
    expect(bruno.taxaRecebimento).toBe(0.5);
  });

  it('desempata pela taxa quando o recebido e igual', () => {
    const r = rankingConsultores(
      [
        L({ vendedor_id: 'x', vendedor_nome: 'X', valor_emitido: 200, valor_recebido: 100 }),
        L({ vendedor_id: 'y', vendedor_nome: 'Y', valor_emitido: 100, valor_recebido: 100 }),
      ],
      ['2026-11-01'],
    );
    expect(r.map((c) => c.nome)).toEqual(['Y', 'X']);
  });
});
