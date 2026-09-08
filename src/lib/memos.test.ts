import { describe, it, expect } from 'vitest';
import {
  memoVigente, pendenteCiencia, ordenarMemos, resumoLeitura, categoriaMeta, prioridadeMeta,
  type MemoBase,
} from './memos';

const HOJE = new Date('2026-09-20T12:00:00Z');
const base = (p: Partial<MemoBase> & { id: string }): MemoBase => ({
  categoria: 'COMUNICADO', prioridade: 'MEDIA', exige_leitura: false,
  publicado_em: '2026-09-01T10:00:00Z', ...p,
});

describe('vigencia', () => {
  it('sem prazo, vale sempre', () => {
    expect(memoVigente({ expira_em: null }, HOJE)).toBe(true);
  });
  it('vence no fim do dia marcado', () => {
    expect(memoVigente({ expira_em: '2026-09-20' }, HOJE)).toBe(true);
    expect(memoVigente({ expira_em: '2026-09-19' }, HOJE)).toBe(false);
  });
});

describe('ciencia', () => {
  it('so quem exige leitura e nao leu fica pendente', () => {
    expect(pendenteCiencia(base({ id: '1', exige_leitura: true, lido: false }))).toBe(true);
    expect(pendenteCiencia(base({ id: '2', exige_leitura: true, lido: true }))).toBe(false);
    expect(pendenteCiencia(base({ id: '3', exige_leitura: false }))).toBe(false);
  });
});

describe('ordem do mural', () => {
  it('ciencia pendente primeiro, depois prioridade, depois o mais recente', () => {
    const lista = [
      base({ id: 'antigo-alta', prioridade: 'ALTA', publicado_em: '2026-09-01T10:00:00Z' }),
      base({ id: 'novo-baixa', prioridade: 'BAIXA', publicado_em: '2026-09-18T10:00:00Z' }),
      base({ id: 'ciencia', prioridade: 'BAIXA', exige_leitura: true, lido: false,
             publicado_em: '2026-08-01T10:00:00Z' }),
      base({ id: 'novo-alta', prioridade: 'ALTA', publicado_em: '2026-09-19T10:00:00Z' }),
    ];
    expect(ordenarMemos(lista).map((m) => m.id))
      .toEqual(['ciencia', 'novo-alta', 'antigo-alta', 'novo-baixa']);
  });
  it('nao altera a lista recebida', () => {
    const lista = [base({ id: 'a' }), base({ id: 'b', prioridade: 'ALTA' })];
    ordenarMemos(lista);
    expect(lista.map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('acompanhamento da gestao', () => {
  it('mostra quantos deram ciencia', () => {
    expect(resumoLeitura(3, 12)).toBe('3 de 12 deram ciencia (25%)');
  });
  it('sem destinatario calculado, mostra so o numero', () => {
    expect(resumoLeitura(2, 0)).toBe('2 leitura(s)');
  });
});

describe('rotulos', () => {
  it('cai no padrao quando o valor e desconhecido', () => {
    expect(categoriaMeta('INVENTADO').valor).toBe('COMUNICADO');
    expect(prioridadeMeta('INVENTADO').valor).toBe('MEDIA');
    expect(categoriaMeta('SCRIPT').rotulo).toBe('Script / Procedimento');
  });
});
