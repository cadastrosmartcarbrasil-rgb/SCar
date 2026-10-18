import { describe, expect, it } from 'vitest';
import {
  agruparCoberturas, grupoDaCobertura, gruposNaoIncluidos, textoDoLimite, textoJanela,
  type ItemCobertura,
} from './coberturas';

const item = (nome: string, categoria: string, extra: Partial<ItemCobertura> = {}): ItemCobertura => ({
  produto_id: nome, nome, categoria, valor: 0, origem: 'PLANO', tem_limite: false,
  quantidade_limite: null, janela_dias: null, usados: 0, elegivel: true, ultimo_uso: null, ...extra,
});

describe('grupoDaCobertura', () => {
  it('categoria decide; ADMIN nao e cobertura', () => {
    expect(grupoDaCobertura({ nome: 'Protecao Casco (RFC)', categoria: 'CASCO' })).toBe('CASCO');
    expect(grupoDaCobertura({ nome: 'RCF - Terceiros 50mil', categoria: 'RCF' })).toBe('TERCEIROS');
    expect(grupoDaCobertura({ nome: 'Protecao Parabrisas', categoria: 'VIDROS' })).toBe('VIDROS');
    expect(grupoDaCobertura({ nome: 'Taxa Administrativa', categoria: 'ADMIN' })).toBeNull();
  });
  it('BENEFICIO separado pelo nome', () => {
    expect(grupoDaCobertura({ nome: 'Assistencia 24h', categoria: 'BENEFICIO' })).toBe('ASSISTENCIA');
    expect(grupoDaCobertura({ nome: 'Carro Reserva 15 dias', categoria: 'BENEFICIO' })).toBe('CARRO_RESERVA');
    expect(grupoDaCobertura({ nome: 'SEGURO DE VIDA APP R$ 10.000,00', categoria: 'BENEFICIO' })).toBe('VIDA');
    expect(grupoDaCobertura({ nome: 'Kit Total Vidros', categoria: 'BENEFICIO' })).toBe('VIDROS');
    expect(grupoDaCobertura({ nome: 'Clube de descontos', categoria: 'BENEFICIO' })).toBe('OUTROS');
  });
});

describe('limite', () => {
  it('janela em meses quando fecha em ano', () => {
    expect(textoJanela(365)).toBe('a cada 12 meses');
    expect(textoJanela(730)).toBe('a cada 24 meses');
    expect(textoJanela(90)).toBe('a cada 3 meses');
    expect(textoJanela(45)).toBe('a cada 45 dias');
  });
  it('texto completo e vazio sem limite', () => {
    expect(textoDoLimite({ tem_limite: true, quantidade_limite: 2, janela_dias: 365, usados: 1 }))
      .toBe('2 usos a cada 12 meses · 1 usado');
    expect(textoDoLimite({ tem_limite: true, quantidade_limite: 1, janela_dias: 365, usados: 0 }))
      .toBe('1 uso a cada 12 meses · 0 usados');
    expect(textoDoLimite({ tem_limite: false, quantidade_limite: 1, janela_dias: 365, usados: 0 })).toBe('');
  });
});

describe('agruparCoberturas', () => {
  it('ordem da ficha, sem a taxa, plano antes do avulso', () => {
    const s = agruparCoberturas([
      item('Protecao Parabrisas', 'VIDROS', { origem: 'AVULSO' }),
      item('Taxa Administrativa', 'ADMIN'),
      item('Assistencia 24h', 'BENEFICIO'),
      item('Protecao Casco (RFC)', 'CASCO'),
      item('Vidros Basicos (I)', 'VIDROS'),
    ]);
    expect(s.map((x) => x.grupo)).toEqual(['CASCO', 'VIDROS', 'ASSISTENCIA']);
    expect(s[1].itens.map((i) => i.nome)).toEqual(['Vidros Basicos (I)', 'Protecao Parabrisas']);
  });
});

describe('gruposNaoIncluidos', () => {
  const disponiveis = [
    { nome: 'Protecao Casco (RFC)', categoria: 'CASCO' },
    { nome: 'RCF - Terceiros 30mil', categoria: 'RCF' },
    { nome: 'Protecao Parabrisas', categoria: 'VIDROS' },
    { nome: 'Assistencia 24h', categoria: 'BENEFICIO' },
    { nome: 'Carro Reserva 15 dias', categoria: 'BENEFICIO' },
  ];
  it('so cita o que a casa vende para o tipo', () => {
    expect(gruposNaoIncluidos({
      itens: [{ nome: 'Protecao Casco (RFC)', categoria: 'CASCO' }, { nome: 'Assistencia 24h', categoria: 'BENEFICIO' }],
      disponiveis,
    })).toEqual(['TERCEIROS', 'VIDROS', 'CARRO_RESERVA']);
    // moto: a casa nao vende vidros nem carro reserva para ela
    expect(gruposNaoIncluidos({
      itens: [{ nome: 'Assistencia 24h', categoria: 'BENEFICIO' }],
      disponiveis: disponiveis.slice(0, 2),
    })).toEqual(['CASCO', 'TERCEIROS']);
  });
  it('plano sem casco declara a falta do casco', () => {
    expect(gruposNaoIncluidos({ itens: [], disponiveis: [], semCasco: true })).toEqual(['CASCO']);
  });
});
