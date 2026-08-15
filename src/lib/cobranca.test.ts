import { describe, it, expect } from 'vitest';
import {
  calcularVencimento,
  competenciaDe,
  rotuloCompetencia,
  ultimoDiaDoMes,
  veiculoFaturavel,
  diaVencimentoAgrupado,
  valorMensalidadeVeiculo,
  previaFaturas,
  type VeiculoCobranca,
} from './cobranca';

const veic = (v: Partial<VeiculoCobranca> & { id: string }): VeiculoCobranca => ({
  status: 'ativo',
  tipo_faturamento: 'AGRUPADO_ASSOCIADO',
  ...v,
});

describe('competencia', () => {
  it('normaliza para o dia 1', () => {
    expect(competenciaDe('2026-03')).toBe('2026-03-01');
    expect(competenciaDe('2026-03-27')).toBe('2026-03-01');
  });
  it('rotulo em portugues', () => {
    expect(rotuloCompetencia('2026-03-01')).toBe('Marco/2026');
  });
  it('ultimo dia do mes (inclusive bissexto)', () => {
    expect(ultimoDiaDoMes('2026-02-01')).toBe(28);
    expect(ultimoDiaDoMes('2028-02-01')).toBe(29);
    expect(ultimoDiaDoMes('2026-04-01')).toBe(30);
  });
});

describe('calcularVencimento — espelha o SQL calcular_vencimento', () => {
  it('dia normal fica no mes da competencia', () => {
    expect(calcularVencimento('2026-01-01', 5)).toBe('2026-01-05');
  });
  it('dia 31 em fevereiro cai no ultimo dia', () => {
    expect(calcularVencimento('2026-02-01', 31)).toBe('2026-02-28');
  });
  it('sem dia definido: padrao legado dia 10 do mes seguinte', () => {
    expect(calcularVencimento('2026-01-01', null)).toBe('2026-02-10');
    expect(calcularVencimento('2026-12-01', null)).toBe('2027-01-10');
  });
});

describe('veiculoFaturavel', () => {
  it('cobra ativo, em evento e vistoria pendente', () => {
    expect(veiculoFaturavel(veic({ id: '1' }), '2026-03-01')).toBe(true);
    expect(veiculoFaturavel(veic({ id: '2', status: 'em_evento' }), '2026-03-01')).toBe(true);
    expect(veiculoFaturavel(veic({ id: '3', status: 'vistoria_pendente' }), '2026-03-01')).toBe(true);
  });
  it('nao cobra suspenso / inativo / baixado', () => {
    expect(veiculoFaturavel(veic({ id: '4', status: 'suspenso' }), '2026-03-01')).toBe(false);
    expect(veiculoFaturavel(veic({ id: '5', status: 'inativo' }), '2026-03-01')).toBe(false);
    expect(veiculoFaturavel(veic({ id: '6', status: 'baixado' }), '2026-03-01')).toBe(false);
  });
  it('nao cobra antes da ativacao e passa a cobrar no mes da ativacao', () => {
    const v = veic({ id: '7', data_ativacao: '2026-05-01' });
    expect(veiculoFaturavel(v, '2026-03-01')).toBe(false);
    expect(veiculoFaturavel(v, '2026-05-01')).toBe(true);
    expect(veiculoFaturavel(veic({ id: '8', data_ativacao: '2026-03-31' }), '2026-03-01')).toBe(true);
  });
});

describe('diaVencimentoAgrupado', () => {
  it('usa o dia mais frequente entre os agrupados', () => {
    const vs = [
      veic({ id: '1', dia_vencimento: 5 }),
      veic({ id: '2', dia_vencimento: 5 }),
      veic({ id: '3', dia_vencimento: 20 }),
      veic({ id: '4', dia_vencimento: 15, tipo_faturamento: 'INDIVIDUAL_VEICULO' }),
    ];
    expect(diaVencimentoAgrupado(vs, '2026-03-01')).toBe(5);
  });
  it('empate: menor dia', () => {
    const vs = [veic({ id: '1', dia_vencimento: 20 }), veic({ id: '2', dia_vencimento: 10 })];
    expect(diaVencimentoAgrupado(vs, '2026-03-01')).toBe(10);
  });
  it('sem dia definido: null (cai no padrao legado)', () => {
    expect(diaVencimentoAgrupado([veic({ id: '1' })], '2026-03-01')).toBeNull();
  });
});

describe('valorMensalidadeVeiculo — precedencia override > motor', () => {
  it('override da ficha vence o motor de precos', () => {
    expect(valorMensalidadeVeiculo(veic({ id: '1', valor_mensalidade: 150 }), () => 99)).toBe(150);
  });
  it('sem override usa o motor (cotar_plano)', () => {
    expect(valorMensalidadeVeiculo(veic({ id: '2' }), () => 135)).toBe(135);
  });
  it('sem override e sem motor: zero', () => {
    expect(valorMensalidadeVeiculo(veic({ id: '3' }))).toBe(0);
  });
});

describe('previaFaturas — espelha gerar_faturas_cliente', () => {
  const veiculos = [
    veic({ id: 'v1', valor_mensalidade: 150, dia_vencimento: 5 }),
    veic({ id: 'v2', valor_mensalidade: 100, dia_vencimento: 5 }),
    veic({ id: 'v3', valor_mensalidade: 999, dia_vencimento: 5, status: 'suspenso' }),
    veic({ id: 'v4', valor_mensalidade: 200, dia_vencimento: 31, tipo_faturamento: 'INDIVIDUAL_VEICULO' }),
    veic({ id: 'v5', valor_mensalidade: 300, dia_vencimento: 10, tipo_faturamento: 'INDIVIDUAL_VEICULO', data_ativacao: '2026-05-01' }),
    veic({ id: 'v6' }), // sem valor: nao entra
  ];

  it('1 agrupada (soma dos agrupados) + 1 por individual, ignorando suspenso/zerado/futuro', () => {
    const faturas = previaFaturas(veiculos, '2026-03-01');
    expect(faturas).toHaveLength(2);

    const agrupada = faturas.find((f) => f.tipo_faturamento === 'AGRUPADO_ASSOCIADO')!;
    expect(agrupada.valor_total).toBe(250);
    expect(agrupada.itens.map((i) => i.veiculo_id)).toEqual(['v1', 'v2']);
    expect(agrupada.vencimento).toBe('2026-03-05');

    const individual = faturas.find((f) => f.veiculo_id === 'v4')!;
    expect(individual.valor_total).toBe(200);
    expect(individual.vencimento).toBe('2026-03-31'); // dia 31 existe em marco
  });

  it('veiculo ativado depois entra na competencia seguinte', () => {
    const faturas = previaFaturas(veiculos, '2026-06-01');
    expect(faturas).toHaveLength(3);
    expect(faturas.reduce((s, f) => s + f.valor_total, 0)).toBe(750);
    expect(faturas.find((f) => f.veiculo_id === 'v5')!.vencimento).toBe('2026-06-10');
  });

  it('associado sem valor nenhum nao gera fatura', () => {
    expect(previaFaturas([veic({ id: 'x' })], '2026-03-01')).toHaveLength(0);
  });
});
