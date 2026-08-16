import { describe, it, expect } from 'vitest';
import {
  CATEGORIAS_PROTOCOLO,
  STATUS_PROTOCOLO,
  rotuloCategoria,
  corPrioridade,
  protocoloAberto,
  precisaAtencao,
  linkWhatsAppAssociado,
  mensagemPadrao,
  assuntoPadrao,
  linkEmail,
  valorAjustado,
  tituloEditavel,
  validarAjuste,
} from './protocolos';

describe('categorias e status do protocolo', () => {
  it('traz as categorias pedidas (financeiro, sinistro, duvidas, cancelamento, reclamacao)', () => {
    const valores = CATEGORIAS_PROTOCOLO.map((c) => c.value);
    expect(valores).toEqual(expect.arrayContaining([
      'FINANCEIRO', 'SINISTRO', 'DUVIDAS', 'CANCELAMENTO', 'RECLAMACAO',
    ]));
  });
  it('rotula a categoria e a prioridade', () => {
    expect(rotuloCategoria('FINANCEIRO')).toBe('Financeiro');
    expect(rotuloCategoria('RECLAMACAO')).toBe('Reclamacao');
    expect(corPrioridade('URGENTE')).toContain('rose');
  });
  it('todo status tem rotulo', () => {
    (['ABERTO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO'] as const)
      .forEach((s) => expect(STATUS_PROTOCOLO[s].label.length).toBeGreaterThan(0));
  });
});

describe('ciclo de vida do protocolo', () => {
  it('encerrado nao aceita mais tramitacao', () => {
    expect(protocoloAberto('ABERTO', null)).toBe(true);
    expect(protocoloAberto('EM_ANDAMENTO', null)).toBe(true);
    expect(protocoloAberto('CONCLUIDO', '2026-08-15T10:00:00Z')).toBe(false);
    expect(protocoloAberto('CANCELADO', null)).toBe(false);
  });

  it('destaca urgente, alta prioridade e parado ha mais de 7 dias', () => {
    expect(precisaAtencao({ prioridade: 'URGENTE', dias_aberto: 0 })).toBe(true);
    expect(precisaAtencao({ prioridade: 'ALTA', dias_aberto: 1 })).toBe(true);
    expect(precisaAtencao({ prioridade: 'NORMAL', dias_aberto: 9 })).toBe(true);
    expect(precisaAtencao({ prioridade: 'NORMAL', dias_aberto: 2 })).toBe(false);
    // encerrado nunca chama atencao
    expect(precisaAtencao({ prioridade: 'URGENTE', dias_aberto: 30, encerrado_em: '2026-08-01' })).toBe(false);
  });
});

describe('disparos rapidos do SAC', () => {
  it('monta o link do WhatsApp com DDI', () => {
    expect(linkWhatsAppAssociado('(11) 98888-7777')).toBe('https://wa.me/5511988887777');
    expect(linkWhatsAppAssociado('5511988887777')).toBe('https://wa.me/5511988887777');
    expect(linkWhatsAppAssociado('123')).toBeNull();
    expect(linkWhatsAppAssociado(null)).toBeNull();
  });

  it('inclui o texto quando informado', () => {
    const link = linkWhatsAppAssociado('11988887777', 'Ola');
    expect(link).toBe('https://wa.me/5511988887777?text=Ola');
  });

  it('mensagem padrao usa o primeiro nome e a placa', () => {
    const txt = mensagemPadrao({ associado: 'Joana Maria Silva', placa: 'ABC1D23', atendente: 'Carlos' });
    expect(txt).toContain('Ola, Joana!');
    expect(txt).toContain('Carlos');
    expect(txt).toContain('ABC1D23');
  });

  it('mensagem sem placa nao inventa veiculo', () => {
    expect(mensagemPadrao({ associado: 'Joana' })).not.toContain('veiculo');
  });

  it('assunto e mailto do e-mail rapido', () => {
    expect(assuntoPadrao({ associado: 'Joana', placa: 'ABC1D23' })).toContain('ABC1D23');
    const link = linkEmail('joana@teste.com', 'Assunto', 'Corpo');
    expect(link).toBe('mailto:joana@teste.com?subject=Assunto&body=Corpo');
    expect(linkEmail('', 'a', 'b')).toBeNull();
    expect(linkEmail('sem-arroba', 'a', 'b')).toBeNull();
  });
});

describe('ajuste do boleto (historico financeiro)', () => {
  it('recalcula sempre a partir do valor original', () => {
    expect(valorAjustado(200, 30, 5)).toBe(175);
    // novo ajuste nao acumula sobre o anterior
    expect(valorAjustado(200, 10, 5)).toBe(195);
    expect(valorAjustado(200, 0, 0)).toBe(200);
  });

  it('so edita boleto em aberto', () => {
    expect(tituloEditavel('pendente')).toBe(true);
    expect(tituloEditavel('vencido')).toBe(true);
    expect(tituloEditavel('pago')).toBe(false);
    expect(tituloEditavel('cancelado')).toBe(false);
  });

  it('valida desconto maior que o titulo e valores negativos', () => {
    expect(validarAjuste(200, 250, 0)).toContain('maior que o valor');
    expect(validarAjuste(200, -1, 0)).toContain('negativos');
    expect(validarAjuste(200, 50, 10)).toBeNull();
    // desconto pode chegar ao total quando ha acrescimo
    expect(validarAjuste(200, 210, 10)).toBeNull();
  });
});
