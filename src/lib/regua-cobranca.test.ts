import { describe, expect, it } from 'vitest';
import { REGUA_PADRAO, etapasDaRegua, proximaOrdem, validarRegua } from './regua-cobranca';
import { ORDEM_SITUACOES, situacaoFila } from './cobranca-fila';

describe('regua de cobranca (0139)', () => {
  it('o padrao e o exemplo do pedido passam', () => {
    expect(validarRegua(REGUA_PADRAO)).toBeNull();
    expect(validarRegua({ bloqueio: 1, revistoria: 9, inativacao: 20 })).toBeNull();
  });
  it('espelha a ordem do banco', () => {
    expect(validarRegua({ bloqueio: 25, revistoria: 9, inativacao: 20 })).toMatch(/bloqueio/);
    expect(validarRegua({ bloqueio: 1, revistoria: 20, inativacao: 20 })).toMatch(/revistoria/);
    expect(validarRegua({ bloqueio: 0, revistoria: 5, inativacao: 20 })).toMatch(/1 a 90/);
    expect(validarRegua({ bloqueio: 1.5, revistoria: 5, inativacao: 20 })).toMatch(/inteiros/);
  });
  it('"sem vistoria ate 9" e "exige a partir de 10" sao o mesmo numero', () => {
    const e = etapasDaRegua({ bloqueio: 1, revistoria: 9, inativacao: 20 });
    expect(e.map((x) => x.dia)).toEqual([1, 10, 20]);
    expect(e[1].texto).toContain('Até 9 dia(s)');
  });
  it('o cabecalho alterna prioridade -> menor -> maior atraso', () => {
    expect(proximaOrdem('prioridade')).toBe('atraso_asc');
    expect(proximaOrdem('atraso_asc')).toBe('atraso_desc');
    expect(proximaOrdem('atraso_desc')).toBe('prioridade');
  });
  it('passou do prazo: "a inativar", fora dos tiles da fila', () => {
    const base = { hoje: '2026-10-22', vencidoDesde: '2026-09-01', contatoEm: null, retornoEm: null,
      acordoStatus: null, quebraEm: null };
    expect(situacaoFila({ ...base, diasAtraso: 51, diasInativacao: 20 })).toBe('a_inativar');
    expect(situacaoFila({ ...base, diasAtraso: 19, diasInativacao: 20 })).toBe('sem_contato');
    expect(ORDEM_SITUACOES).not.toContain('a_inativar');
  });
});
