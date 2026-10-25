import { describe, expect, it } from 'vitest';
import { agruparExtrato, diaAnteriorIso, primeiroDiaNegativo, projetarFluxo, resumoConciliacao, textosDeMensalidade, totaisFluxo, type DiaFluxo } from './tesouraria';

const dia = (d: string, o: Partial<DiaFluxo> = {}): DiaFluxo => ({
  dia: d, realizado_entrada: 0, realizado_saida: 0, previsto_entrada: 0, previsto_saida: 0,
  previsto_boletos: 0, vencido_entrada: 0, vencido_saida: 0, qtd_previsto_saida: 0, ...o,
});

describe('projetarFluxo', () => {
  const dias = [
    dia('2026-10-17', { realizado_entrada: 500, realizado_saida: 100, previsto_saida: 999 }),
    dia('2026-10-18', { realizado_entrada: 50, previsto_saida: 300, previsto_boletos: 200, vencido_saida: 40, vencido_entrada: 70 }),
    dia('2026-10-19', { realizado_entrada: 999, previsto_entrada: 100, previsto_saida: 900 }),
  ];

  it('passado = realizado; hoje = realizado + previsto + vencido das saidas; futuro = previsto', () => {
    const p = projetarFluxo(dias, 1000, '2026-10-18');
    expect(p.map((d) => d.situacao)).toEqual(['passado', 'hoje', 'futuro']);
    expect(p[0]).toMatchObject({ entradas: 500, saidas: 100, saldo: 1400 });
    expect(p[1]).toMatchObject({ entradas: 250, saidas: 340, saldo: 1310 });
    expect(p[2]).toMatchObject({ entradas: 100, saidas: 900, saldo: 510, carga: 'atencao' });
  });

  it('opcoes: sem boletos e com todo o vencido', () => {
    const p = projetarFluxo(dias, 1000, '2026-10-18', { comBoletos: false, vencidos: 'tudo' });
    expect(p[1]).toMatchObject({ entradas: 120, saidas: 340 });
    const n = projetarFluxo(dias, 1000, '2026-10-18', { vencidos: 'nenhum' });
    expect(n[1].saidas).toBe(300);
  });

  it('saldo negativo e critico, e o primeiro dia negativo e apontado', () => {
    const p = projetarFluxo(dias, 0, '2026-10-18');
    expect(p[2].saldo).toBe(-490);
    expect(p[2].carga).toBe('critico');
    expect(primeiroDiaNegativo(p)?.dia).toBe('2026-10-19');
  });

  it('centavos nao acumulam erro', () => {
    const p = projetarFluxo([dia('2026-10-01', { realizado_entrada: 0.1 }), dia('2026-10-02', { realizado_entrada: 0.2 })], 0, '2026-10-30');
    expect(p[1].saldo).toBe(0.3);
  });

  it('totais', () => {
    expect(totaisFluxo(dias)).toMatchObject({ realizadoEntrada: 1549, realizadoSaida: 100, previstoSaida: 2199, previstoBoletos: 200 });
  });
});

describe('utilitarios', () => {
  it('textos da regra de mensalidade', () => {
    expect(textosDeMensalidade('cobranca, LIQUIDACAO\nboleto;ab;COBRANCA')).toEqual(['COBRANCA', 'LIQUIDACAO', 'BOLETO']);
  });
  it('dia anterior e resumo', () => {
    expect(diaAnteriorIso('2026-11-01')).toBe('2026-10-31');
    // campo de data vazio ou digitado pela metade nao derruba a tela
    expect(diaAnteriorIso('')).toBe('');
    expect(diaAnteriorIso('0002-1')).toBe('');
    expect(diaAnteriorIso('2026-13-45')).toBe('');
    expect(resumoConciliacao([{ situacao: 'PENDENTE', valor: 1 }, { situacao: 'CONCILIADO', valor: 2 }]))
      .toMatchObject({ PENDENTE: 1, CONCILIADO: 1, total: 2 });
  });
});

describe('agruparExtrato (0149)', () => {
  const l = (data: string, grupo: 'PIX' | 'COMPE_REDE' | null, entrada: number, saldo: number, conciliado = true, conta = 'c1') =>
    ({ data, conta_id: conta, grupo, entrada, saida: 0, saldo, conciliado });

  it('junta os contiguos do mesmo dia, conta e grupo; saldo e o do ultimo', () => {
    const itens = agruparExtrato([
      l('2026-10-13', 'COMPE_REDE', 70, 70), l('2026-10-13', 'COMPE_REDE', 30.1, 100.1),
      l('2026-10-13', 'PIX', 100, 200.1, false), l('2026-10-13', 'PIX', 50, 250.1),
      l('2026-10-13', null, 1000, 1250.1),
    ]);
    expect(itens.map((i) => i.tipo)).toEqual(['grupo', 'grupo', 'linha']);
    const [compe, pix] = itens as Extract<(typeof itens)[number], { tipo: 'grupo' }>[];
    expect(compe.entrada).toBe(100.1);
    expect(compe.saldo).toBe(100.1);
    expect(pix.linhas).toHaveLength(2);
    expect(pix.conciliados).toBe(1);
  });

  it('dia ou conta diferentes separam; grupo de um so vira linha', () => {
    const itens = agruparExtrato([
      l('2026-10-13', 'PIX', 1, 1), l('2026-10-14', 'PIX', 1, 2), l('2026-10-14', 'PIX', 1, 3, true, 'c2'),
    ]);
    expect(itens.map((i) => i.tipo)).toEqual(['linha', 'linha', 'linha']);
  });

  it('sem agrupar devolve todas as linhas', () => {
    const itens = agruparExtrato([l('2026-10-13', 'PIX', 1, 1), l('2026-10-13', 'PIX', 1, 2)], false);
    expect(itens.map((i) => i.tipo)).toEqual(['linha', 'linha']);
  });
});
