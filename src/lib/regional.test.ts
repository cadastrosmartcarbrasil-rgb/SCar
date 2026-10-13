import { describe, it, expect } from 'vitest';
import {
  opcoesParaEscolher,
  opcoesParaFiltrar,
  pendenciasDaUnidade,
  podeExcluirUnidade,
  avisoDeInativacao,
  rotuloSituacao,
  resumoDaEquipe,
  filtrarEquipe,
  hotlinkResolve,
  avisoDeSituacaoVendedor,
  composicaoDaCarteira,
  avisoCobrancaExterna,
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

// ---------------------------------------------------------------------------
// A EQUIPE E A CARTEIRA NO PORTAL DA FRANQUIA (0102)
// ---------------------------------------------------------------------------
describe('resumoDaEquipe', () => {
  it('separa cadastrados de ativos — o caso real da importacao (0069)', () => {
    // 66 importados, todos inativos de proposito, e 2 ligados depois.
    const lista = [
      ...Array.from({ length: 64 }, () => ({ ativo: false })),
      { ativo: true }, { ativo: true },
    ];
    expect(resumoDaEquipe(lista)).toEqual({ cadastrados: 66, ativos: 2, inativos: 64 });
  });

  it('ativo ausente conta como ativo (o default da coluna)', () => {
    expect(resumoDaEquipe([{}, { ativo: null }])).toEqual({ cadastrados: 2, ativos: 2, inativos: 0 });
  });

  it('lista vazia nao quebra', () => {
    expect(resumoDaEquipe(undefined)).toEqual({ cadastrados: 0, ativos: 0, inativos: 0 });
  });
});

describe('filtrarEquipe', () => {
  const lista = [{ ativo: true }, { ativo: false }, { ativo: null }];
  it('todos devolve a lista inteira', () => {
    expect(filtrarEquipe(lista, 'todos')).toHaveLength(3);
  });
  it('ativos inclui quem tem ativo nulo', () => {
    expect(filtrarEquipe(lista, 'ativos')).toHaveLength(2);
  });
  it('inativos e so o false explicito', () => {
    expect(filtrarEquipe(lista, 'inativos')).toHaveLength(1);
  });
});

describe('hotlinkResolve', () => {
  it('o link do vendedor inativo NAO resolve — a tela nao pode oferecer', () => {
    expect(hotlinkResolve({ ativo: false })).toBe(false);
    expect(hotlinkResolve({ ativo: true })).toBe(true);
    expect(hotlinkResolve({})).toBe(true);
    expect(hotlinkResolve(null)).toBe(false);
  });
});

describe('avisoDeSituacaoVendedor', () => {
  it('inativar diz o que PARA e garante que nada e apagado', () => {
    const t = avisoDeSituacaoVendedor('Amanda', true);
    expect(t).toContain('Inativar');
    expect(t).toContain('NAO sao apagados');
  });
  it('ativar fala do hotlink e do rodizio', () => {
    const t = avisoDeSituacaoVendedor('Amanda', false);
    expect(t).toContain('Ativar');
    expect(t).toContain('rodizio');
  });
});

describe('composicaoDaCarteira', () => {
  it('abre o total nos status que ele esconde', () => {
    expect(composicaoDaCarteira({
      veiculos_carteira: 1169, veiculos_ativos: 1149, veiculos_inadimplentes: 0,
    })).toBe('1149 ativos · 20 em vistoria/evento');
  });

  it('mostra o inadimplente quando existe', () => {
    expect(composicaoDaCarteira({
      veiculos_carteira: 10, veiculos_ativos: 8, veiculos_inadimplentes: 2,
    })).toBe('8 ativos · 2 inadimplentes');
  });

  it('unidade sem carteira diz isso, nao "0 ativos"', () => {
    expect(composicaoDaCarteira({ veiculos_carteira: 0 })).toContain('Nenhum veiculo');
    expect(composicaoDaCarteira(null)).toContain('Nenhum veiculo');
  });
});

describe('avisoCobrancaExterna', () => {
  it('silencia quando nao ha nenhum — aviso que aparece sempre ninguem le', () => {
    expect(avisoCobrancaExterna({ veiculos_carteira: 10, veiculos_cobranca_externa: 0 })).toBeNull();
    expect(avisoCobrancaExterna(null)).toBeNull();
  });

  it('a carteira INTEIRA migrada tem texto proprio', () => {
    const t = avisoCobrancaExterna({ veiculos_carteira: 1169, veiculos_cobranca_externa: 1169 });
    expect(t).toContain('Toda a carteira');
    expect(t).toContain('nenhum boleto sai por aqui');
  });

  it('parcial diz quantos de quantos', () => {
    const t = avisoCobrancaExterna({ veiculos_carteira: 474, veiculos_cobranca_externa: 467 });
    expect(t).toContain('467 de 474');
  });
});
