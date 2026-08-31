import { describe, expect, it } from 'vitest';
import {
  deveVoltarAoPool, diasDeProtecaoRestantes, diasDesde, mensagemAoVisitante,
  protecaoAtiva, rotuloMotivo,
} from './atribuicao';

const HOJE = new Date('2026-08-31T12:00:00Z');
const dias = (n: number) => new Date(HOJE.getTime() - n * 86_400_000).toISOString();

const lead = (over: Partial<Parameters<typeof protecaoAtiva>[0]> = {}) => ({
  vendedorId: 'v1',
  status: 'NOVO',
  ultimaInteracaoEm: dias(3),
  atribuidoEm: dias(3),
  createdAt: dias(3),
  ...over,
});

describe('protecao do lead', () => {
  it('lead recente esta protegido', () => {
    expect(protecaoAtiva(lead(), 30, HOJE)).toBe(true);
    expect(diasDeProtecaoRestantes(lead(), 30, HOJE)).toBe(27);
  });

  it('passada a janela, a protecao cai', () => {
    expect(protecaoAtiva(lead({ ultimaInteracaoEm: dias(45) }), 30, HOJE)).toBe(false);
    expect(diasDeProtecaoRestantes(lead({ ultimaInteracaoEm: dias(45) }), 30, HOJE)).toBe(0);
  });

  it('lead sem dono nao protege ninguem', () => {
    expect(protecaoAtiva(lead({ vendedorId: null }), 30, HOJE)).toBe(false);
  });

  it('perdido e convertido nao protegem', () => {
    expect(protecaoAtiva(lead({ status: 'PERDIDO' }), 30, HOJE)).toBe(false);
    expect(protecaoAtiva(lead({ status: 'ATIVO' }), 30, HOJE)).toBe(false);
  });

  it('a franquia pode desligar a protecao com 0 dias', () => {
    expect(protecaoAtiva(lead(), 0, HOJE)).toBe(false);
  });

  it('trabalhar o lead renova a janela', () => {
    const antigo = lead({ createdAt: dias(60), atribuidoEm: dias(60), ultimaInteracaoEm: dias(1) });
    expect(protecaoAtiva(antigo, 30, HOJE)).toBe(true);
  });
});

describe('devolucao ao pool', () => {
  it('devolve o que passou do prazo', () => {
    expect(deveVoltarAoPool(lead({ ultimaInteracaoEm: dias(20) }), 7, HOJE)).toBe(true);
  });

  it('nao devolve o que foi trabalhado', () => {
    expect(deveVoltarAoPool(lead({ ultimaInteracaoEm: dias(2) }), 7, HOJE)).toBe(false);
  });

  it('nao mexe em lead perdido, em auditoria ou ja convertido', () => {
    for (const status of ['PERDIDO', 'ATIVO', 'EM_AUDITORIA', 'APROVADO']) {
      expect(deveVoltarAoPool(lead({ status, ultimaInteracaoEm: dias(90) }), 7, HOJE)).toBe(false);
    }
  });

  it('lead que ja esta no pool nao volta de novo', () => {
    expect(deveVoltarAoPool(lead({ vendedorId: null, ultimaInteracaoEm: dias(90) }), 7, HOJE)).toBe(false);
  });

  it('0 dia desliga a devolucao', () => {
    expect(deveVoltarAoPool(lead({ ultimaInteracaoEm: dias(90) }), 0, HOJE)).toBe(false);
  });
});

describe('apoio de tela', () => {
  it('conta os dias sem contato', () => {
    expect(diasDesde(dias(5), HOJE)).toBe(5);
    expect(diasDesde(null, HOJE)).toBe(Infinity);
  });

  it('traduz o motivo da atribuicao', () => {
    expect(rotuloMotivo('RODIZIO')).toBe('Distribuido por rodizio');
    expect(rotuloMotivo('QUALQUER_COISA')).toBe('QUALQUER_COISA');
    expect(rotuloMotivo(null)).toBe('—');
  });

  it('nao promete atendimento novo a quem ja e associado', () => {
    expect(mensagemAoVisitante('CARTEIRA')).toMatch(/ja e nosso associado/i);
    expect(mensagemAoVisitante('DUPLICADO', 'Amanda')).toMatch(/Amanda/);
    expect(mensagemAoVisitante('NOVO')).toMatch(/Recebemos/);
  });
});
