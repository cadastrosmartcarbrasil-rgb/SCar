import { describe, expect, it } from 'vitest';
import {
  filtrarRelatorio,
  periodoDoAtalho,
  resumoPorConsultor,
  tabelasDoRelatorio,
  totaisRelatorio,
} from './comissoes-relatorio';
import type { ComissaoRelatorioLinha } from './database.types';

const L = (p: Partial<ComissaoRelatorioLinha>): ComissaoRelatorioLinha => ({
  data_credito: '2026-11-06',
  credito_estimado: false,
  data_pagamento: '2026-11-05',
  vencimento: '2026-11-05',
  origem: 'MUTUAL',
  boleto_id: 'b1',
  regional_id: 'M',
  regional_nome: 'MATRIZ',
  quem_paga: 'MATRIZ',
  vendedor_id: 'v1',
  vendedor_nome: 'ANA',
  vendedor_ativo: true,
  associado: 'JOÃO DA SILVA',
  placa: 'ABC1D23',
  valor_recebido: 0,
  taxa: 0.07,
  valor_assistencia: 0,
  valor_comissao: 0,
  situacao: 'PENDENTE',
  documento: null,
  ...p,
});

const linhas: ComissaoRelatorioLinha[] = [
  L({ boleto_id: 'b1', valor_recebido: 300, valor_comissao: 21, situacao: 'PENDENTE' }),
  L({ boleto_id: 'b2', origem: 'SCAR', data_credito: '2026-11-11', valor_recebido: 150.1, valor_comissao: 10.51,
      situacao: 'PAGO', documento: 'COM-202611-ab12-001' }),
  L({ boleto_id: 'b3', vendedor_id: 'v2', vendedor_nome: 'BRUNO', regional_nome: 'FRANQUIA', quem_paga: 'FRANQUIA',
      valor_recebido: 200, taxa: 0.1, valor_comissao: 20, situacao: 'PELA_FRANQUIA', placa: 'XYZ9A87' }),
  L({ boleto_id: 'b4', vendedor_id: null, vendedor_nome: 'Sem consultor', valor_recebido: 50, valor_comissao: 0,
      situacao: 'SEM_CONSULTOR', credito_estimado: true }),
  // o mesmo boleto agrupado repartido em dois veiculos do mesmo consultor
  L({ boleto_id: 'b5', valor_recebido: 60, valor_comissao: 4.2, situacao: 'NAO_APURADO', placa: 'AAA1A11' }),
  L({ boleto_id: 'b5', valor_recebido: 40, valor_comissao: 2.8, situacao: 'NAO_APURADO', placa: 'BBB2B22' }),
];

describe('resumo por consultor', () => {
  const r = resumoPorConsultor(linhas);

  it('agrupa, ordena pela comissão e deixa "Sem consultor" no fim', () => {
    expect(r.map((x) => x.nome)).toEqual(['ANA', 'BRUNO', 'Sem consultor']);
  });

  it('soma sem erro de centavos e conta boleto agrupado uma vez', () => {
    const ana = r[0];
    expect(ana.boletos).toBe(3);
    expect(ana.recebido).toBe(550.1);
    expect(ana.comissao).toBe(38.51);
    expect(ana.paga).toBe(10.51);
    expect(ana.aPagar).toBe(21);
    expect(ana.aApurar).toBe(7);
  });

  it('quem paga e o que é da franquia', () => {
    expect(r[1].quemPaga).toEqual(['Franquia']);
    expect(r[1].pelaFranquia).toBe(20);
    expect(r[2].quemPaga).toEqual([]);
    expect(r[2].creditoEstimado).toBe(1);
  });

  it('totais', () => {
    const t = totaisRelatorio(r);
    expect(t.consultores).toBe(2);
    expect(t.boletos).toBe(5);
    expect(t.recebido).toBe(800.1);
    expect(t.comissao).toBe(58.51);
  });
});

describe('filtro', () => {
  it('por consultor, sem consultor e por texto sem acento/máscara', () => {
    expect(filtrarRelatorio(linhas, 'v2', '')).toHaveLength(1);
    expect(filtrarRelatorio(linhas, '__sem__', '')).toHaveLength(1);
    expect(filtrarRelatorio(linhas, '', 'joao')).toHaveLength(6);
    expect(filtrarRelatorio(linhas, '', 'xyz-9a87')).toHaveLength(1);
    expect(filtrarRelatorio(linhas, '', 'COM-202611')).toHaveLength(1);
  });
});

describe('período', () => {
  const hoje = new Date(2026, 10, 13);
  it('atalhos', () => {
    expect(periodoDoAtalho('mes', hoje)).toEqual({ inicio: '2026-11-01', fim: '2026-11-30' });
    expect(periodoDoAtalho('mes_anterior', hoje)).toEqual({ inicio: '2026-10-01', fim: '2026-10-31' });
    expect(periodoDoAtalho('semana', hoje)).toEqual({ inicio: '2026-11-07', fim: '2026-11-13' });
    expect(periodoDoAtalho('hoje', hoje)).toEqual({ inicio: '2026-11-13', fim: '2026-11-13' });
  });
});

describe('tabelas de exportação', () => {
  const { resumo, detalhe } = tabelasDoRelatorio(linhas, { inicio: '2026-11-01', fim: '2026-11-30' }, 'Todas as regionais');

  it('resumo com uma linha por consultor e total', () => {
    expect(resumo.linhas).toHaveLength(3);
    expect(resumo.rodape?.[5]).toBe(58.51);
    expect(resumo.subtitulo).toContain('crédito de 01/11/2026 a 30/11/2026');
  });

  it('detalhe agrupado com subtotal, crédito estimado marcado e taxa legível', () => {
    expect(detalhe.linhas).toHaveLength(6 + 3);
    const subAna = detalhe.linhas.find((l) => l[0] === 'Subtotal ANA');
    expect(subAna?.[9]).toBe(38.51);
    const est = detalhe.linhas.find((l) => l[0] === 'Sem consultor' && String(l[1]).endsWith('*'));
    expect(est).toBeTruthy();
    expect(detalhe.linhas[0][8]).toBe('7%');
    // na ordem do crédito
    const datasAna = detalhe.linhas.filter((l) => l[0] === 'ANA').map((l) => l[1]);
    expect(datasAna[datasAna.length - 1]).toBe('11/11/2026');
  });
});
