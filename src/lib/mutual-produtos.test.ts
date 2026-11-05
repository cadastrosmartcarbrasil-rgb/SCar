import { describe, expect, it } from 'vitest';
import {
  sugestaoDestinoProduto, totaisDeParaProdutos, valorDoDestino, lerDestino,
} from './mutual-produtos';
import type { MutualProdutoExterno } from './database.types';

describe('sugestaoDestinoProduto', () => {
  it('sugere BASE para os itens do plano essencial, nas duas grafias do Mutual', () => {
    expect(sugestaoDestinoProduto('Taxa Administrativa')).toBe('BASE');
    expect(sugestaoDestinoProduto('TAXA ADMMIG')).toBe('BASE');
    expect(sugestaoDestinoProduto('Assistência 24 Horas -')).toBe('BASE');
    expect(sugestaoDestinoProduto('ASSIST 24 HORAS - GUINCHO 100 KM IDA /100 KM VOLTA- 200 TOTAISMIG')).toBe('BASE');
    expect(sugestaoDestinoProduto('CHAVEIROMIG')).toBe('BASE');
    expect(sugestaoDestinoProduto('Retorno ao domicílio - Táxi / Uber / Ônibus')).toBe('BASE');
    expect(sugestaoDestinoProduto('Proteção/ Roubo/ Furto / Colisão/ Perda Total/ (Incêndio, Após Colisão)')).toBe('BASE');
    expect(sugestaoDestinoProduto('PROTEÇÃO DE ROUBO, FURTO, COLISÃO, (INCÊNDIO EM CASO DE COLISÃO)MIG')).toBe('BASE');
  });

  it('sugere IGNORAR para a assistencia profissional (tem tela propria)', () => {
    expect(sugestaoDestinoProduto('Assistência Profissional')).toBe('IGNORAR');
    expect(sugestaoDestinoProduto('7 ASSISTENCIA PROFISSIONAL 28MIG')).toBe('IGNORAR');
  });

  it('nao sugere nada para o que e opcional (a pessoa escolhe qual)', () => {
    expect(sugestaoDestinoProduto('Carros Reserva')).toBeNull();
    expect(sugestaoDestinoProduto('VIDROS III - PARAB + V LAT + RET+LANT/FARÓIS (AUTO)MIG')).toBeNull();
    expect(sugestaoDestinoProduto('B- PROTEÇÃO TERCEIROS BRASIL ATÉ (30.000)MIG')).toBeNull();
    expect(sugestaoDestinoProduto(null)).toBeNull();
  });
});

describe('totaisDeParaProdutos', () => {
  const l = (acao: MutualProdutoExterno['acao'], base: number): MutualProdutoExterno => ({
    chave: String(Math.random()), nome: 'x', veiculos: base, veiculos_na_base: base,
    acao, produto_id: acao === 'OPCIONAL' ? 'p' : null, produto_nome: null,
  });
  it('conta por destino e pesa pela base viva', () => {
    const t = totaisDeParaProdutos([l(null, 10), l('OPCIONAL', 5), l('BASE', 20), l('IGNORAR', 1)]);
    expect(t).toMatchObject({ produtos: 4, semDePara: 1, opcionais: 1, base: 1, ignorados: 1 });
    expect(t.itensNaBase).toBe(36);
    expect(t.itensNaBaseResolvidos).toBe(26);
  });
});

describe('valorDoDestino / lerDestino', () => {
  it('ida e volta', () => {
    expect(valorDoDestino({ acao: 'OPCIONAL', produto_id: 'abc' })).toBe('OPCIONAL:abc');
    expect(lerDestino('OPCIONAL:abc')).toEqual({ acao: 'OPCIONAL', produtoId: 'abc' });
    expect(valorDoDestino({ acao: 'BASE', produto_id: null })).toBe('BASE');
    expect(lerDestino('BASE')).toEqual({ acao: 'BASE', produtoId: null });
    expect(valorDoDestino({ acao: null, produto_id: null })).toBe('');
    expect(lerDestino('')).toEqual({ acao: null, produtoId: null });
  });
});
