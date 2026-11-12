import { describe, expect, it } from 'vitest';
import {
  competenciaComissionavel,
  janelaMeses,
  rankingConsultores,
  resumoRegionais,
  serieMensal,
  somarMeses,
  taxaRecebimento,
  variacao,
  vencimentoSugerido,
} from './comissoes';
import type { ComissaoMatrizDesempenho } from './database.types';

const L = (p: Partial<ComissaoMatrizDesempenho>): ComissaoMatrizDesempenho => ({
  competencia: '2026-11-01',
  regional_id: 'F',
  regional_nome: 'FRANQUIA',
  destino: 'FRANQUIA',
  taxa_regional: 0.15,
  vendedor_id: 'v1',
  vendedor_nome: 'ANA',
  vendedor_ativo: true,
  taxa_vendedor: 0.1,
  boletos_emitidos: 0,
  valor_emitido: 0,
  boletos_vencidos: 0,
  valor_vencido: 0,
  boletos_recebidos: 0,
  valor_recebido: 0,
  valor_recebido_vencidos: 0,
  comissao_franquia: 0,
  comissao_vendedor: 0,
  ...p,
});

// Mesmo cenario da suite SQL 0198 (franquia F; unidade M paga os consultores)
const linhas: ComissaoMatrizDesempenho[] = [
  L({ competencia: '2026-10-01', boletos_emitidos: 1, valor_emitido: 200, boletos_vencidos: 1, valor_vencido: 200,
      boletos_recebidos: 1, valor_recebido: 200, valor_recebido_vencidos: 200 }),
  L({ boletos_emitidos: 2, valor_emitido: 300, boletos_vencidos: 2, valor_vencido: 300, boletos_recebidos: 1,
      valor_recebido: 200, valor_recebido_vencidos: 200, comissao_franquia: 30 }),
  L({ regional_id: 'M', regional_nome: 'MATRIZ', destino: 'VENDEDORES', taxa_regional: 0.135, vendedor_id: 'v2',
      vendedor_nome: 'BRUNO', taxa_vendedor: 0.07, boletos_emitidos: 2, valor_emitido: 450, boletos_vencidos: 1,
      valor_vencido: 300, boletos_recebidos: 2, valor_recebido: 450, valor_recebido_vencidos: 300, comissao_vendedor: 31.5 }),
  L({ regional_id: 'M', regional_nome: 'MATRIZ', destino: 'VENDEDORES', vendedor_id: null, vendedor_nome: 'Sem consultor',
      boletos_emitidos: 1, valor_emitido: 50.1, boletos_vencidos: 1, valor_vencido: 50.1, boletos_recebidos: 1,
      valor_recebido: 50.2, valor_recebido_vencidos: 50.2 }),
];

describe('competencias', () => {
  it('soma meses atravessando o ano', () => {
    expect(somarMeses('2026-11-01', 2)).toBe('2027-01-01');
    expect(somarMeses('2027-01-01', -2)).toBe('2026-11-01');
  });
  it('janela dos ultimos 3 meses em ordem', () => {
    expect(janelaMeses('2026-11-15')).toEqual(['2026-09-01', '2026-10-01', '2026-11-01']);
  });
  it('so comissiona a partir de novembro/2026', () => {
    expect(competenciaComissionavel('2026-10-31')).toBe(false);
    expect(competenciaComissionavel('2026-11-01')).toBe(true);
  });
  it('vencimento sugerido no mes seguinte, dia limitado a 28', () => {
    expect(vencimentoSugerido('2026-11-01')).toBe('2026-12-10');
    expect(vencimentoSugerido('2026-12-01', 31)).toBe('2027-01-28');
  });
});

describe('indicadores', () => {
  it('taxa so sobre o que ja venceu', () => {
    expect(taxaRecebimento(75, 100)).toBe(0.75);
    expect(taxaRecebimento(10, 0)).toBeNull();
    expect(variacao(150, 100)).toBeCloseTo(0.5);
    expect(variacao(1, 0)).toBeNull();
  });

  it('serie soma as duas regionais sem erro de centavos', () => {
    const [set, out, nov] = serieMensal(linhas, janelaMeses('2026-11-01'));
    expect(set.valorEmitido).toBe(0);
    expect(out.taxaRecebimento).toBe(1);
    expect(nov.valorEmitido).toBe(800.1);
    expect(nov.valorRecebido).toBe(700.2);
    expect(nov.valorVencido).toBe(650.1);
    expect(nov.comissaoTotal).toBe(61.5);
    expect(nov.taxaRecebimento).toBeCloseTo(550.2 / 650.1);
  });

  it('resumo por regional com crescimento e variacao da taxa', () => {
    const r = resumoRegionais(linhas, '2026-11-01');
    expect(r.map((x) => x.regionalNome)).toEqual(['MATRIZ', 'FRANQUIA']);
    const f = r.find((x) => x.regionalId === 'F')!;
    expect(f.crescimentoRecebido).toBe(0);
    expect(f.variacaoTaxa).toBeCloseTo(200 / 300 - 1);
    expect(f.destino).toBe('FRANQUIA');
    expect(r[0].crescimentoRecebido).toBeNull(); // MATRIZ sem base em outubro
  });
});

describe('ranking de consultores', () => {
  const rk = rankingConsultores(linhas, janelaMeses('2026-11-01'));

  it('melhor recebimento primeiro, sem "Sem consultor"', () => {
    expect(rk.map((c) => c.nome)).toEqual(['BRUNO', 'ANA']);
    expect(rk.map((c) => c.posicao)).toEqual([1, 2]);
  });

  it('trilha dos 3 meses, crescimento e comissao do mes', () => {
    const ana = rk.find((c) => c.nome === 'ANA')!;
    expect(ana.recebidoPorMes).toEqual([0, 200, 200]);
    expect(ana.crescimentoMes).toBe(0);
    expect(ana.crescimentoJanela).toBeNull();
    expect(ana.comissao).toBe(30); // a da franquia sobre a carteira dela
    expect(ana.taxaPorMes[1]).toBe(1);
  });

  it('desempata pela taxa quando o recebido empata', () => {
    const r = rankingConsultores(
      [
        L({ vendedor_id: 'x', vendedor_nome: 'X', valor_emitido: 200, valor_vencido: 200, valor_recebido: 100, valor_recebido_vencidos: 100 }),
        L({ vendedor_id: 'y', vendedor_nome: 'Y', valor_emitido: 100, valor_vencido: 100, valor_recebido: 100, valor_recebido_vencidos: 100 }),
      ],
      ['2026-11-01'],
    );
    expect(r.map((c) => c.nome)).toEqual(['Y', 'X']);
  });
});
