import { describe, expect, it } from 'vitest';
import {
  etapaDoVendedor, filtrarPorEtapa, proximoPagamentoMensal, proximoPagamentoSemanal,
  resumoComissoes, rotuloDiaSemana, rotuloStatusLead,
} from './vendedor';

describe('etapas do lead na visao do vendedor', () => {
  it('junta as etapas internas em "em analise"', () => {
    expect(etapaDoVendedor('APROVADO')).toBe('analise');
    expect(etapaDoVendedor('EM_AUDITORIA')).toBe('analise');
  });

  it('separa andamento, venda e perdido', () => {
    expect(etapaDoVendedor('NOVO')).toBe('andamento');
    expect(etapaDoVendedor('EM_NEGOCIACAO')).toBe('andamento');
    expect(etapaDoVendedor('ATIVO')).toBe('venda');
    expect(etapaDoVendedor('PERDIDO')).toBe('perdido');
  });

  it('mantem o rotulo interno disponivel', () => {
    expect(rotuloStatusLead('EM_AUDITORIA')).toBe('Em Auditoria');
  });

  it('filtra a lista pela etapa', () => {
    const leads = [
      { status: 'NOVO' }, { status: 'EM_AUDITORIA' }, { status: 'ATIVO' }, { status: 'PERDIDO' },
    ];
    expect(filtrarPorEtapa(leads, '')).toHaveLength(4);
    expect(filtrarPorEtapa(leads, 'analise')).toEqual([{ status: 'EM_AUDITORIA' }]);
    expect(filtrarPorEtapa(leads, 'venda')).toEqual([{ status: 'ATIVO' }]);
  });
});

describe('resumoComissoes', () => {
  const lista = [
    { is_adesao: true, valor_comissao: 500, status_pagamento: 'pendente' },
    { is_adesao: false, valor_comissao: 120.5, status_pagamento: 'pago' },
    { is_adesao: false, valor_comissao: 80, status_pagamento: 'pendente' },
  ];

  it('separa pendente, pago, adesao e recorrencia', () => {
    const r = resumoComissoes(lista);
    expect(r.total).toBe(700.5);
    expect(r.pendente).toBe(580);
    expect(r.pago).toBe(120.5);
    expect(r.adesao).toBe(500);
    expect(r.recorrente).toBe(200.5);
  });

  it('nao quebra com lista vazia', () => {
    expect(resumoComissoes([]).total).toBe(0);
  });
});

describe('proximo pagamento', () => {
  // 2026-08-31 e uma segunda-feira.
  const segunda = new Date(2026, 7, 31);

  it('semanal: caindo hoje, e hoje', () => {
    expect(proximoPagamentoSemanal(1, segunda)?.getDate()).toBe(31);
  });

  it('semanal: sexta da mesma semana', () => {
    const d = proximoPagamentoSemanal(5, segunda);
    expect(d?.getDay()).toBe(5);
    expect(d?.getDate()).toBe(4); // 4 de setembro
  });

  it('semanal: domingo e o dia 7 do cadastro', () => {
    expect(proximoPagamentoSemanal(7, segunda)?.getDay()).toBe(0);
  });

  it('semanal: dia invalido nao inventa data', () => {
    expect(proximoPagamentoSemanal(null, segunda)).toBeNull();
    expect(proximoPagamentoSemanal(9, segunda)).toBeNull();
  });

  it('mensal: dia ainda por vir cai neste mes', () => {
    const d = proximoPagamentoMensal(20, new Date(2026, 7, 10));
    expect(d?.getMonth()).toBe(7);
    expect(d?.getDate()).toBe(20);
  });

  it('mensal: dia ja passado cai no mes seguinte', () => {
    const d = proximoPagamentoMensal(5, new Date(2026, 7, 10));
    expect(d?.getMonth()).toBe(8);
    expect(d?.getDate()).toBe(5);
  });

  it('mensal: dia 31 em fevereiro vira o ultimo dia do mes', () => {
    const d = proximoPagamentoMensal(31, new Date(2026, 1, 15));
    expect(d?.getMonth()).toBe(1);
    expect(d?.getDate()).toBe(28);
  });

  it('rotula o dia da semana do cadastro', () => {
    expect(rotuloDiaSemana(1)).toBe('segunda');
    expect(rotuloDiaSemana(7)).toBe('domingo');
    expect(rotuloDiaSemana(null)).toBeNull();
  });
});
