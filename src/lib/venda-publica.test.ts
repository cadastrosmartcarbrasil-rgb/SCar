import { describe, expect, it } from 'vitest';
import { mensagemDeErro, ordenarPlanos, planoSugerido, podeAvancar } from './venda-publica';

const plano = (id: string, nivel: number | null, mensalidade: number) => ({
  plano_id: id, nome: id, descricao: null, nivel, mensalidade,
  adesao: 350, participacao: 2000, itens: [],
});

describe('podeAvancar.contato', () => {
  it('exige nome e celular com DDD', () => {
    expect(podeAvancar.contato({ nome: 'Joao Silva', celular: '(11) 98888-1111' })).toBe(true);
    expect(podeAvancar.contato({ nome: 'Jo', celular: '(11) 98888-1111' })).toBe(false);
    expect(podeAvancar.contato({ nome: 'Joao Silva', celular: '98888' })).toBe(false);
  });
});

describe('podeAvancar.aceite', () => {
  const ok = { nome: 'Joao da Silva', documento: '111.444.777-35', marcado: true };

  it('libera com nome completo, documento valido e caixa marcada', () => {
    expect(podeAvancar.aceite(ok)).toBe(true);
  });

  it('sem marcar o aceite nao passa', () => {
    expect(podeAvancar.aceite({ ...ok, marcado: false })).toBe(false);
  });

  it('nome sem sobrenome nao passa', () => {
    expect(podeAvancar.aceite({ ...ok, nome: 'Joao' })).toBe(false);
  });

  it('CPF invalido nao passa', () => {
    expect(podeAvancar.aceite({ ...ok, documento: '111.111.111-11' })).toBe(false);
  });

  it('aceita CNPJ valido', () => {
    expect(podeAvancar.aceite({ ...ok, documento: '11.222.333/0001-81' })).toBe(true);
  });
});

describe('mensagemDeErro', () => {
  it('mostra ao cliente o texto que a nossa regra escreveu', () => {
    expect(mensagemDeErro('Esta proposta ja foi aceita em 31/08/2026 10:00'))
      .toMatch(/ja foi aceita/);
  });

  it('esconde erro tecnico do banco', () => {
    expect(mensagemDeErro('duplicate key value violates unique constraint "x"'))
      .toBe('Nao consegui concluir agora. Tente de novo em instantes.');
    expect(mensagemDeErro('permission denied for relation leads'))
      .toBe('Nao consegui concluir agora. Tente de novo em instantes.');
  });

  it('sem mensagem, texto generico', () => {
    expect(mensagemDeErro(null)).toMatch(/Tente de novo/);
    expect(mensagemDeErro('   ')).toMatch(/Tente de novo/);
  });
});

describe('ordem e sugestao dos planos', () => {
  const planos = [plano('Diamante', 3, 250), plano('Prata', 1, 150), plano('Ouro', 2, 190)];

  it('ordena do mais simples ao mais completo', () => {
    expect(ordenarPlanos(planos).map((p) => p.plano_id)).toEqual(['Prata', 'Ouro', 'Diamante']);
  });

  it('desempata por preco quando nao ha nivel', () => {
    const semNivel = [plano('B', null, 200), plano('A', null, 100)];
    expect(ordenarPlanos(semNivel).map((p) => p.plano_id)).toEqual(['A', 'B']);
  });

  it('sugere o do meio', () => {
    expect(planoSugerido(planos)?.plano_id).toBe('Ouro');
  });

  it('com um plano so, sugere ele mesmo', () => {
    expect(planoSugerido([plano('Unico', 1, 100)])?.plano_id).toBe('Unico');
    expect(planoSugerido([])).toBeNull();
  });
});
