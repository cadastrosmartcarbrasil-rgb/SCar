import { describe, it, expect } from 'vitest';
import {
  SECOES_POR_PAPEL, POSES_POR_PAPEL, TEXTOS, TERMOS_PROIBIDOS, compararDeclaracoes, dadosParaGravar,
  linkComunicacao, linhasDaDeclaracao, mensagemComunicacao, pendenciasDaComunicacao, situacaoComunicacao,
  type PapelComunicacao,
} from './comunicacao-evento';

describe('papeis', () => {
  it('terceiro nao tem a secao do veiculo do associado', () => {
    expect(SECOES_POR_PAPEL.terceiro_condutor).not.toContain('veiculo');
    expect(SECOES_POR_PAPEL.terceiro_proprietario).not.toContain('evento');
    expect(SECOES_POR_PAPEL.testemunha).toEqual(['identificacao', 'evento', 'final']);
  });
  it('poses: testemunha nao manda foto, associado manda as do veiculo e CNH', () => {
    expect(POSES_POR_PAPEL.testemunha).toHaveLength(0);
    expect(POSES_POR_PAPEL.associado.map((p) => p.codigo)).toEqual(expect.arrayContaining(['FRENTE', 'DANO', 'CNH', 'BO']));
  });
});

describe('pendencias', () => {
  it('pede nome, telefone, data e relato; foto nunca e obrigatoria', () => {
    expect(pendenciasDaComunicacao('testemunha', {})).toEqual(['Seu nome', 'Seu telefone com DDD', 'Data do evento', 'O relato do que aconteceu']);
    expect(pendenciasDaComunicacao('testemunha', {
      identificacao: { nome: 'Ana Souza', telefone: '(65) 99999-0000' },
      evento: { data: '2026-10-20', relato: 'Vi o carro bater no outro' },
    })).toEqual([]);
  });
  it('terceiro precisa do CPF; associado precisa da natureza', () => {
    expect(pendenciasDaComunicacao('terceiro_proprietario', { identificacao: { nome: 'Ana Souza', telefone: '65999990000' } }))
      .toEqual(['Seu CPF/CNPJ', 'Placa do seu veiculo']);
    expect(pendenciasDaComunicacao('associado', {
      identificacao: { nome: 'Ana Souza', telefone: '65999990000' }, evento: { data: '2026-10-20', relato: 'bateu na traseira' },
    })).toEqual(['O que aconteceu (natureza)']);
  });
});

describe('dadosParaGravar', () => {
  it('descarta secao fora do papel e texto vazio', () => {
    const d = dadosParaGravar('testemunha', {
      identificacao: { nome: '  Ana  ', email: '' }, veiculo_terceiro: { placa: 'ABC' }, evento: { relato: 'x' },
    });
    expect(d).toEqual({ identificacao: { nome: 'Ana' }, evento: { relato: 'x' } });
  });
  it('passageiro so informa se houve lesao (sem detalhe de saude)', () => {
    const d = dadosParaGravar('passageiro_vitima', { vitimas: { houve: true, quantidade: '2', socorro: 'SAMU' } });
    expect(d.vitimas).toEqual({ houve: true });
  });
});

describe('situacao', () => {
  const agora = new Date('2026-10-20T12:00:00Z');
  it('vencido e calculado; enviado nao vence', () => {
    expect(situacaoComunicacao({ status: 'ABERTO', expira_em: '2026-10-19T00:00:00Z' }, agora)).toBe('EXPIRADO');
    expect(situacaoComunicacao({ status: 'ENVIADO', expira_em: '2026-10-19T00:00:00Z' }, agora)).toBe('ENVIADO');
    expect(situacaoComunicacao({ status: 'CORRECAO', expira_em: '2026-10-25T00:00:00Z' }, agora)).toBe('CORRECAO');
  });
});

describe('mensagens', () => {
  it('link e mensagem do terceiro nao citam associado', () => {
    const link = linkComunicacao('https://appsmartcar.com.br/', 'abc');
    expect(link).toBe('https://appsmartcar.com.br/comunicar/abc');
    const m = mensagemComunicacao({ papel: 'terceiro_condutor', nome: 'Fulano Silva', protocolo: 'EVT-1', link });
    expect(m).toContain('Ola, Fulano!');
    expect(m).not.toMatch(/associad/i);
  });
  it('nenhum texto ao envolvido usa vocabulario proibido', () => {
    const textos = [
      ...Object.values(TEXTOS),
      ...(['associado', 'terceiro_condutor', 'testemunha'] as PapelComunicacao[])
        .map((papel) => mensagemComunicacao({ papel, nome: 'X', protocolo: 'P', link: 'L' })),
    ].join(' ').toLowerCase();
    for (const t of TERMOS_PROIBIDOS) expect(textos).not.toContain(t);
  });
});

describe('comparador', () => {
  it('destaca o que diverge, ignora acento e caixa, nunca o relato', () => {
    const linhas = compararDeclaracoes([
      { evento: { data: '2026-10-20', natureza: 'Colisao', relato: 'a' } },
      { evento: { data: '2026-10-21', natureza: 'COLISÃO', relato: 'b' } },
    ]);
    const por = Object.fromEntries(linhas.map((l) => [l.chave, l]));
    expect(por.data.diverge).toBe(true);
    expect(por.natureza.diverge).toBe(false);
    expect(por.relato.diverge).toBe(false);
  });
});

describe('linhasDaDeclaracao', () => {
  it('so mostra o que foi preenchido', () => {
    const l = linhasDaDeclaracao('testemunha', { identificacao: { nome: 'Ana' }, evento: { relato: 'vi' } });
    expect(l).toEqual([
      { secao: 'Identificacao', itens: [['Nome', 'Ana']] },
      { secao: 'O evento', itens: [['Relato', 'vi']] },
    ]);
  });
});
