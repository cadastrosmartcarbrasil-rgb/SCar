import { describe, it, expect } from 'vitest';
import {
  opcoesParaEscolher,
  opcoesParaFiltrar,
  pendenciasDaUnidade,
  podeExcluirUnidade,
  avisoDeInativacao,
  rotuloSituacao,
} from './regional';

const CUIABA = { id: 'a', nome: 'Cuiaba', ativo: true };
const NATAL = { id: 'b', nome: 'Natal', ativo: true };
const ENCERRADA = { id: 'c', nome: 'Unidade Encerrada', ativo: false };

describe('opcoesParaEscolher', () => {
  it('esconde a unidade inativa das listas de cadastro', () => {
    expect(opcoesParaEscolher([CUIABA, NATAL, ENCERRADA]).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('mantem a inativa quando ela e a que ja esta selecionada', () => {
    // Sem isso, abrir um associado de unidade encerrada mostraria o campo em
    // branco e o primeiro "salvar" trocaria a unidade dele em silencio.
    expect(opcoesParaEscolher([CUIABA, ENCERRADA], 'c').map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('trata ativo indefinido como ativa (cadastro antigo, antes da 0067)', () => {
    expect(opcoesParaEscolher([{ id: 'x', nome: 'Antiga' }])).toHaveLength(1);
  });

  it('aguenta lista vazia', () => {
    expect(opcoesParaEscolher(undefined)).toEqual([]);
  });
});

describe('opcoesParaFiltrar', () => {
  it('separa ativas de inativas, sem perder nenhuma', () => {
    // Relatorio de periodo passado precisa poder ser filtrado por uma unidade
    // ja encerrada — por isso ela nao pode simplesmente sumir do filtro.
    const { ativas, inativas } = opcoesParaFiltrar([CUIABA, ENCERRADA, NATAL]);
    expect(ativas.map((r) => r.id)).toEqual(['a', 'b']);
    expect(inativas.map((r) => r.id)).toEqual(['c']);
  });
});

describe('pendenciasDaUnidade', () => {
  it('lista so o que tem contagem, no singular e no plural', () => {
    expect(pendenciasDaUnidade({ usuarios: 1, veiculos: 12, leads: 0 })).toEqual([
      '1 usuario',
      '12 veiculos',
    ]);
  });

  it('unidade zerada nao tem pendencia', () => {
    expect(pendenciasDaUnidade({ usuarios: 0, associados: 0 })).toEqual([]);
    expect(podeExcluirUnidade({ usuarios: 0 })).toBe(true);
  });

  it('qualquer registro impede a exclusao', () => {
    // Apagar a unidade dispara ~20 FKs `on delete set null`, e neste sistema
    // regional nula = MATRIZ: o associado migraria de escopo em silencio.
    expect(podeExcluirUnidade({ associados: 1 })).toBe(false);
  });

  it('aceita null/undefined sem quebrar', () => {
    expect(pendenciasDaUnidade(null)).toEqual([]);
    expect(pendenciasDaUnidade(undefined)).toEqual([]);
  });
});

describe('avisoDeInativacao', () => {
  it('diz explicitamente que o historico NAO some', () => {
    const texto = avisoDeInativacao('Cuiaba', { associados: 300, veiculos: 412 });
    expect(texto).toContain('NAO e apagado');
    expect(texto).toContain('300 associados');
    expect(texto).toContain('412 veiculos');
  });

  it('unidade vazia recebe aviso curto', () => {
    expect(avisoDeInativacao('Nova', {})).toContain('Nao ha nenhum registro vinculado');
  });
});

describe('rotuloSituacao', () => {
  it('so `false` e inativa', () => {
    expect(rotuloSituacao(false)).toBe('Inativa');
    expect(rotuloSituacao(true)).toBe('Ativa');
    expect(rotuloSituacao(null)).toBe('Ativa');
    expect(rotuloSituacao(undefined)).toBe('Ativa');
  });
});
