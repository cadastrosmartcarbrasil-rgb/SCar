import { describe, expect, it } from 'vitest';
import {
  addMeses, calcularIndicadores, diasAtraso, diasParaVencer, estruturarDre, faixaAging,
  gerarParcelas, periodoAnterior, saldoTitulo, situacaoTitulo, variacaoPercentual,
  type LinhaDre,
} from './financeiro';

const HOJE = new Date(2026, 7, 20); // 20/08/2026

describe('vencimentos', () => {
  it('conta dias de atraso e dias a vencer', () => {
    expect(diasAtraso('2026-08-10', HOJE)).toBe(10);
    expect(diasAtraso('2026-08-25', HOJE)).toBe(0);
    expect(diasParaVencer('2026-08-25', HOJE)).toBe(5);
    expect(diasParaVencer('2026-08-10', HOJE)).toBe(-10);
  });
  it('classifica a faixa de aging', () => {
    expect(faixaAging(0)).toBe('a_vencer');
    expect(faixaAging(30)).toBe('d1_30');
    expect(faixaAging(45)).toBe('d31_60');
    expect(faixaAging(91)).toBe('d90_mais');
  });
});

describe('situacaoTitulo', () => {
  const base = { tipo: 'DESPESA', valor_original: 100 } as const;
  it('quitado e cancelado vencem qualquer data', () => {
    expect(situacaoTitulo({ ...base, status: 'quitado', data_vencimento: '2020-01-01' }, HOJE)).toBe('quitado');
    expect(situacaoTitulo({ ...base, status: 'cancelado', data_vencimento: '2020-01-01' }, HOJE)).toBe('cancelado');
  });
  it('pendente vencido aparece como atrasado mesmo sem a rotina do banco rodar', () => {
    expect(situacaoTitulo({ ...base, status: 'pendente', data_vencimento: '2026-08-19' }, HOJE)).toBe('atrasado');
  });
  it('destaca o vencimento do dia', () => {
    expect(situacaoTitulo({ ...base, status: 'pendente', data_vencimento: '2026-08-20' }, HOJE)).toBe('vence_hoje');
    expect(situacaoTitulo({ ...base, status: 'pendente', data_vencimento: '2026-09-01' }, HOJE)).toBe('a_vencer');
    expect(situacaoTitulo({ ...base, status: 'pago_parcial', data_vencimento: '2026-09-01' }, HOJE)).toBe('pago_parcial');
  });
});

describe('saldoTitulo', () => {
  it('prefere o saldo calculado pelo banco', () => {
    expect(saldoTitulo({ tipo: 'RECEITA', status: 'pago_parcial', data_vencimento: '2026-08-01', valor_original: 1000, valor_saldo: 700 })).toBe(700);
  });
  it('cai para original - pago quando o banco nao mandou o saldo', () => {
    expect(saldoTitulo({ tipo: 'RECEITA', status: 'pago_parcial', data_vencimento: '2026-08-01', valor_original: 1000, valor_pago: 250.5 })).toBe(749.5);
  });
});

describe('parcelamento', () => {
  it('divide sem perder centavos (sobra vai para a ultima)', () => {
    const p = gerarParcelas({ valorTotal: 1000, quantidade: 3, primeiroVencimento: '2026-01-10' });
    expect(p.map((x) => x.valor)).toEqual([333.33, 333.33, 333.34]);
    expect(p.reduce((s, x) => s + x.valor, 0)).toBeCloseTo(1000, 2);
  });
  it('avanca o vencimento mes a mes preservando fim de mes', () => {
    const p = gerarParcelas({ valorTotal: 300, quantidade: 3, primeiroVencimento: '2026-01-31' });
    expect(p.map((x) => x.data_vencimento)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });
  it('repete o mesmo valor quando e uma despesa recorrente', () => {
    const p = gerarParcelas({ valorTotal: 250, quantidade: 4, primeiroVencimento: '2026-01-05', repetirValor: true });
    expect(p.map((x) => x.valor)).toEqual([250, 250, 250, 250]);
    expect(p[3].parcela_numero).toBe(4);
    expect(p[3].parcela_total).toBe(4);
  });
  it('suporta periodicidade semanal e quinzenal', () => {
    expect(gerarParcelas({ valorTotal: 100, quantidade: 2, primeiroVencimento: '2026-01-01', periodicidade: 'SEMANAL' })[1].data_vencimento).toBe('2026-01-08');
    expect(gerarParcelas({ valorTotal: 100, quantidade: 2, primeiroVencimento: '2026-01-01', periodicidade: 'QUINZENAL' })[1].data_vencimento).toBe('2026-01-16');
  });
  it('addMeses respeita meses curtos', () => {
    expect(addMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMeses('2026-03-15', -1)).toBe('2026-02-15');
  });
});

describe('DRE', () => {
  const linhas: LinhaDre[] = [
    { grupo: 'RECEITA', categoria_codigo: '1.1.00', categoria_nome: 'Mensalidades', total: 80000 },
    { grupo: 'RECEITA', categoria_codigo: '1.1.01', categoria_nome: 'Adesao', total: 20000 },
    { grupo: 'CUSTO_VARIAVEL', categoria_codigo: '3.1.00', categoria_nome: 'Sinistros', total: -30000 },
    { grupo: 'DESPESA_FIXA', categoria_codigo: '4.1.01', categoria_nome: 'Folha', total: -25000 },
  ];

  it('agrupa, soma subtotais e calcula analise vertical sobre a receita', () => {
    const g = estruturarDre(linhas);
    expect(g.map((x) => x.grupo)).toEqual(['RECEITA', 'CUSTO_VARIAVEL', 'DESPESA_FIXA']);
    expect(g[0].subtotal).toBe(100000);
    expect(g[1].analiseVertical).toBe(30);
    expect(g[2].analiseVertical).toBe(25);
    expect(g[0].linhas[0].categoria_codigo).toBe('1.1.00'); // maior valor primeiro
    expect(g[0].linhas[1].analiseVertical).toBe(20);
  });

  it('omite grupos sem movimento', () => {
    const g = estruturarDre(linhas.filter((l) => l.grupo === 'RECEITA'));
    expect(g).toHaveLength(1);
  });

  it('compara com o periodo anterior', () => {
    const anteriores: LinhaDre[] = [
      { grupo: 'RECEITA', categoria_codigo: '1.1.00', categoria_nome: 'Mensalidades', total: 64000 },
    ];
    const g = estruturarDre(linhas, anteriores);
    expect(g[0].linhas[0].variacao).toBe(25);
    expect(g[0].subtotalAnterior).toBe(64000);
  });

  it('variacao percentual usa modulo (despesa que sobe e positiva)', () => {
    expect(variacaoPercentual(-1200, -1000)).toBe(20);
    expect(variacaoPercentual(100, 0)).toBeNull();
  });

  it('indicadores: margem de contribuicao, resultado e ponto de equilibrio', () => {
    const i = calcularIndicadores({ receita_bruta: 100000, custo_variavel: -30000, despesa_fixa: -25000 });
    expect(i.margemContribuicao).toBe(70000);
    expect(i.margemContribuicaoPercentual).toBe(70);
    expect(i.resultadoLiquido).toBe(45000);
    expect(i.margemLiquidaPercentual).toBe(45);
    expect(i.pontoEquilibrio).toBeCloseTo(35714.29, 2);
  });

  it('indicadores nao quebram sem receita', () => {
    const i = calcularIndicadores({ receita_bruta: 0, custo_variavel: 0, despesa_fixa: -1000 });
    expect(i.resultadoLiquido).toBe(-1000);
    expect(i.margemLiquidaPercentual).toBe(0);
    expect(i.pontoEquilibrio).toBe(0);
  });
});

describe('periodoAnterior', () => {
  it('mes fechado compara com o mes anterior inteiro', () => {
    expect(periodoAnterior('2026-08-01', '2026-08-31')).toEqual({ inicio: '2026-07-01', fim: '2026-07-31' });
    expect(periodoAnterior('2026-03-01', '2026-03-31')).toEqual({ inicio: '2026-02-01', fim: '2026-02-28' });
  });
  it('periodo livre compara com janela de mesmo tamanho', () => {
    expect(periodoAnterior('2026-08-10', '2026-08-19')).toEqual({ inicio: '2026-07-31', fim: '2026-08-09' });
  });
});
