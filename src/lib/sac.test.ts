import { describe, it, expect } from 'vitest';
import {
  calcularElegibilidade,
  montarFaturas,
  resumoFinanceiro,
  veiculoInadimplente,
  statusVeiculoResumo,
  type OpcionalCfg,
  type EventoUso,
  type VeiculoFaturavel,
  type TituloVeiculo,
} from './sac';

const HOJE = new Date('2026-08-15T12:00:00Z');

describe('calcularElegibilidade — janela flutuante de 365 dias', () => {
  const parabrisa: OpcionalCfg = { produto_id: 'p1', nome: 'Para-brisa', quantidade_limite: 1, janela_dias: 365, tipo_evento_id: 'ev-vidros' };
  const reboque: OpcionalCfg = { produto_id: 'p2', nome: 'Reboque', quantidade_limite: 2, janela_dias: 365, tipo_evento_id: 'ev-guincho' };

  it('sem eventos: disponivel (0/1)', () => {
    const [r] = calcularElegibilidade([parabrisa], [], HOJE);
    expect(r.usados).toBe(0);
    expect(r.elegivel).toBe(true);
    expect(r.ultimo_uso).toBeNull();
  });

  it('limite excedido (2/2) ignorando evento fora da janela (>365 dias)', () => {
    const eventos: EventoUso[] = [
      { tipo_evento_id: 'ev-guincho', data_ocorrencia: '2026-07-16' }, // 30 dias
      { tipo_evento_id: 'ev-guincho', data_ocorrencia: '2026-01-27' }, // 200 dias
      { tipo_evento_id: 'ev-guincho', data_ocorrencia: '2025-07-11' }, // 400 dias -> fora
    ];
    const [r] = calcularElegibilidade([reboque], eventos, HOJE);
    expect(r.usados).toBe(2);
    expect(r.elegivel).toBe(false);
    expect(r.ultimo_uso).toBe('2026-07-16');
  });

  it('conta evento exatamente no limite da janela (365 dias)', () => {
    const eventos: EventoUso[] = [{ tipo_evento_id: 'ev-vidros', data_ocorrencia: '2025-08-15' }];
    const [r] = calcularElegibilidade([parabrisa], eventos, HOJE);
    expect(r.usados).toBe(1);
    expect(r.elegivel).toBe(false);
  });

  it('nao conta evento de outro tipo', () => {
    const eventos: EventoUso[] = [{ tipo_evento_id: 'ev-guincho', data_ocorrencia: '2026-08-01' }];
    const [r] = calcularElegibilidade([parabrisa], eventos, HOJE);
    expect(r.usados).toBe(0);
    expect(r.elegivel).toBe(true);
  });
});

describe('montarFaturas — troca de modo Agrupado <-> Individual', () => {
  const valor = (v: VeiculoFaturavel) => (v.id === 'a' ? 200 : 120);
  const veicA: VeiculoFaturavel = { id: 'a', placa: 'AAA1A11', modelo: 'Toro', tipo_faturamento: 'AGRUPADO_ASSOCIADO' };
  const veicB: VeiculoFaturavel = { id: 'b', placa: 'BBB2B22', modelo: 'Onix', tipo_faturamento: 'AGRUPADO_ASSOCIADO' };

  it('ambos agrupados: 1 fatura agrupada com 2 itens, sem individuais', () => {
    const plano = montarFaturas([veicA, veicB], valor);
    expect(plano.agrupada).not.toBeNull();
    expect(plano.agrupada!.itens).toHaveLength(2);
    expect(plano.agrupada!.total).toBe(320);
    expect(plano.individuais).toHaveLength(0);
  });

  it('trocar B para individual: agrupada com 1 item + 1 individual', () => {
    const plano = montarFaturas([veicA, { ...veicB, tipo_faturamento: 'INDIVIDUAL_VEICULO' }], valor);
    expect(plano.agrupada!.itens).toHaveLength(1);
    expect(plano.agrupada!.total).toBe(200);
    expect(plano.individuais).toHaveLength(1);
    expect(plano.individuais[0].total).toBe(120);
    expect(plano.individuais[0].veiculo_id).toBe('b');
  });

  it('todos individuais: sem fatura agrupada', () => {
    const plano = montarFaturas(
      [
        { ...veicA, tipo_faturamento: 'INDIVIDUAL_VEICULO' },
        { ...veicB, tipo_faturamento: 'INDIVIDUAL_VEICULO' },
      ],
      valor,
    );
    expect(plano.agrupada).toBeNull();
    expect(plano.individuais).toHaveLength(2);
  });
});

describe('veiculoInadimplente / statusVeiculoResumo (lista resumida)', () => {
  const veic = { id: 'a', tipo_faturamento: 'AGRUPADO_ASSOCIADO' as const };
  const titulos: TituloVeiculo[] = [
    { veiculo_id: 'a', status: 'pago', data_vencimento: '2026-06-10' },
    { veiculo_id: 'b', status: 'vencido', data_vencimento: '2026-07-10' }, // de outro veiculo
  ];

  it('nao inadimplente quando o vencido e de outro veiculo', () => {
    expect(veiculoInadimplente(veic, titulos, HOJE)).toBe(false);
  });

  it('inadimplente com titulo vencido do proprio veiculo', () => {
    expect(veiculoInadimplente(veic, [{ veiculo_id: 'a', status: 'vencido', data_vencimento: '2026-07-10' }], HOJE)).toBe(true);
  });

  it('agrupado: titulo consolidado (veiculo_id nulo) vencido conta como inadimplente', () => {
    expect(veiculoInadimplente(veic, [{ veiculo_id: null, status: 'pendente', data_vencimento: '2026-07-10' }], HOJE)).toBe(true);
  });

  it('individual: titulo consolidado vencido NAO afeta o veiculo', () => {
    const ind = { id: 'a', tipo_faturamento: 'INDIVIDUAL_VEICULO' as const };
    expect(veiculoInadimplente(ind, [{ veiculo_id: null, status: 'vencido', data_vencimento: '2026-07-10' }], HOJE)).toBe(false);
  });

  it('rotulo de status: cancelado/inativo/inadimplente/ativo', () => {
    expect(statusVeiculoResumo('baixado', false).label).toBe('Cancelado');
    expect(statusVeiculoResumo('inativo', false).label).toBe('Inativo');
    expect(statusVeiculoResumo('ativo', true).label).toBe('Inadimplente');
    expect(statusVeiculoResumo('ativo', false).label).toBe('Ativo');
  });
});

describe('resumoFinanceiro', () => {
  it('marca inadimplente quando ha titulo vencido', () => {
    const r = resumoFinanceiro(
      [
        { status: 'pago', data_vencimento: '2026-06-10', valor: 200 },
        { status: 'pendente', data_vencimento: '2026-07-10', valor: 200 }, // vencido vs HOJE
        { status: 'pendente', data_vencimento: '2026-09-10', valor: 200 }, // em aberto
      ],
      HOJE,
    );
    expect(r.pagos).toBe(1);
    expect(r.abertos).toBe(2);
    expect(r.vencidos).toBe(1);
    expect(r.valorEmAberto).toBe(400);
    expect(r.adimplente).toBe(false);
  });
});
