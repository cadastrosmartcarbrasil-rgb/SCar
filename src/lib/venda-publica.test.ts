import { describe, expect, it } from 'vitest';
import {
  inferirTipoFipe, linkWhatsApp, mensagemDaProposta, mensagemDeErro, numeroWhatsApp,
  ordenarPlanos, placaCompleta, planoSugerido, podeAvancar, tipoVeiculoSugerido,
} from './venda-publica';

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

describe('o tipo do veiculo sai dos dados da placa', () => {
  const tipos = [
    { id: 'passeio', nome: 'Passeio' },
    { id: 'moto', nome: 'Moto' },
    { id: 'pickup', nome: 'Pick-up / Van' },
    { id: 'caminhao', nome: 'Caminhao Pesado' },
  ];

  it('reconhece moto pelo registro da FIPE', () => {
    expect(inferirTipoFipe({ tipo_veiculo: 'MOTOCICLETA' })).toBe('MOTO');
    expect(tipoVeiculoSugerido({ tipo_veiculo: 'MOTOCICLETA' }, tipos)).toBe('moto');
  });

  it('reconhece caminhao', () => {
    expect(inferirTipoFipe({ segmento: 'Caminhoes' })).toBe('CAMINHAO');
    expect(tipoVeiculoSugerido({ segmento: 'Caminhoes' }, tipos)).toBe('caminhao');
  });

  it('aceita o codigo numerico do tipo', () => {
    expect(inferirTipoFipe({ codigo_tipo_veiculo: 2 })).toBe('MOTO');
    expect(inferirTipoFipe({ codigo_tipo_veiculo: 3 })).toBe('CAMINHAO');
    expect(inferirTipoFipe({ codigo_tipo_veiculo: 1 })).toBe('CARRO');
  });

  it('sem indicacao nenhuma, assume carro de passeio', () => {
    expect(inferirTipoFipe({ marca: 'FIAT', modelo: 'ARGO' })).toBe('CARRO');
    expect(tipoVeiculoSugerido({ marca: 'FIAT' }, tipos)).toBe('passeio');
    expect(inferirTipoFipe(null)).toBe('CARRO');
  });

  it('nao inventa tipo quando o cadastro esta vazio', () => {
    expect(tipoVeiculoSugerido({ tipo: 'moto' }, [])).toBeNull();
  });

  it('cai no primeiro tipo quando o cadastro nao tem o nome esperado', () => {
    expect(tipoVeiculoSugerido({ tipo: 'moto' }, [{ id: 'x', nome: 'Outro' }])).toBe('x');
  });
});

describe('placaCompleta', () => {
  it('aceita os dois padroes de placa', () => {
    expect(placaCompleta('ABC1234')).toBe(true);
    expect(placaCompleta('ABC1D23')).toBe(true);
    expect(placaCompleta('abc1d23')).toBe(true);
    expect(placaCompleta('ABC-1234')).toBe(true);
  });

  it('recusa placa incompleta — e o que evita consultar a cada tecla', () => {
    expect(placaCompleta('ABC12')).toBe(false);
    expect(placaCompleta('')).toBe(false);
    expect(placaCompleta('ABCD123')).toBe(false);
  });
});

describe('numeroWhatsApp', () => {
  it('monta o numero com DDI a partir do que foi digitado', () => {
    expect(numeroWhatsApp('(11) 98888-7777')).toBe('5511988887777');
    expect(numeroWhatsApp('1133334444')).toBe('551133334444');
  });

  it('nao duplica o DDI de quem ja gravou com 55', () => {
    expect(numeroWhatsApp('5511988887777')).toBe('5511988887777');
  });

  it('recusa o que nao da para discar', () => {
    expect(numeroWhatsApp('98887777')).toBeNull();
    expect(numeroWhatsApp('')).toBeNull();
    expect(numeroWhatsApp(null)).toBeNull();
  });
});

describe('mensagemDaProposta e linkWhatsApp', () => {
  it('chama a pessoa pelo primeiro nome', () => {
    expect(mensagemDaProposta('https://x/cotacao/abc', 'JOAO DA SILVA'))
      .toBe('Ola, JOAO! Segue a sua proposta da Smart Car Brasil: https://x/cotacao/abc');
  });

  it('sem nome, manda so a proposta', () => {
    expect(mensagemDaProposta('https://x/cotacao/abc')).not.toContain('Ola');
  });

  it('sem celular, abre o WhatsApp sem destinatario (a pessoa escolhe)', () => {
    expect(linkWhatsApp('oi')).toBe('https://wa.me/?text=oi');
    expect(linkWhatsApp('oi', '(11) 98888-7777')).toBe('https://wa.me/5511988887777?text=oi');
  });
});
