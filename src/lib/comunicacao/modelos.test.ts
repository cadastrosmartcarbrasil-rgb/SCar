import { describe, expect, it } from 'vitest';
import {
  MODELOS_EMAIL, aplicarCampos, paragrafosRicos, textosEfetivos, textosParaGravar, validarTextos,
} from './modelos';
import { emails } from './templates';

const pag = { linhaDigitavel: '7489', pixCopiaCola: '000201' };

describe('modelos de e-mail editaveis', () => {
  it('todo campo usado no texto original existe no modelo e o original passa na validacao', () => {
    for (const m of MODELOS_EMAIL) {
      const t = textosEfetivos(m.codigo, {});
      expect(validarTextos(m.codigo, t), m.codigo).toEqual([]);
    }
  });

  it('grava so o que difere do original; vazio volta ao original', () => {
    const t = textosEfetivos('lembrete', {});
    expect(textosParaGravar('lembrete', t)).toEqual({});
    expect(textosParaGravar('lembrete', { ...t, assunto: '  Novo {quando}  ', titulo: '' }))
      .toEqual({ assunto: 'Novo {quando}' });
    expect(textosEfetivos('lembrete', { assunto: 'X', inexistente: 'y' }).assunto).toBe('X');
    expect(textosEfetivos('lembrete', { assunto: '   ' }).assunto).toContain('Lembrete');
  });

  it('recusa campo desconhecido, obrigatorio vazio, limite e palavra de ameaca na cobranca', () => {
    expect(validarTextos('lembrete', { corpo: 'Olá {cpf}' }).join()).toMatch(/\{cpf\}/);
    expect(validarTextos('lembrete', { assunto: '' }).join()).toMatch(/vazio/);
    expect(validarTextos('lembrete', { assunto: 'x'.repeat(151) }).join()).toMatch(/150/);
    expect(validarTextos('atraso', { corpo: 'Seu nome vai para o SERASA' }).join()).toMatch(/serasa/);
    expect(validarTextos('aniversario', { corpo: 'Último aviso de alegria' })).toEqual([]);
    expect(validarTextos('xpto', {})).toEqual(['Modelo desconhecido.']);
    expect(validarTextos('lembrete', { foo: 'x' }).join()).toMatch(/desconhecida/);
  });

  it('campos e negrito', () => {
    expect(aplicarCampos('Olá {nome}, {nada}', { nome: 'Ma*ria' })).toBe('Olá Maria, {nada}');
    expect(paragrafosRicos('Olá **Ana**!\n\nSegundo')).toEqual([
      [{ texto: 'Olá ', negrito: false }, { texto: 'Ana', negrito: true }, { texto: '!', negrito: false }],
      [{ texto: 'Segundo', negrito: false }],
    ]);
    expect(paragrafosRicos('meio ** aberto')).toEqual([[{ texto: 'meio ** aberto', negrito: false }]]);
  });

  it('o texto editado chega ao e-mail renderizado, com HTML escapado', async () => {
    const e = await emails.lembrete({
      nome: 'JOAO SOUZA', valor: 100, vencimento: '2026-11-10', diasParaVencer: 1, pagamento: pag,
      textos: { assunto: 'Oi {nome}, vence {quando}', corpo: 'Linha **forte** <b>x</b>\n\nOutra' },
    });
    expect(e.assunto).toBe('Oi Joao, vence amanhã');
    expect(e.html).toContain('<strong>forte</strong>');
    expect(e.html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(e.texto).toContain('Outra');
  });

  it('atraso: o quadro do rastreador usa o texto editado', async () => {
    const e = await emails.atraso({
      nome: 'ANA', valor: 50, vencimento: '2026-11-01', diasAtraso: 3, pagamento: pag, temRastreador: true,
      textos: { rastreador_com: 'Sinal **suspenso** até o pagamento.' },
    });
    expect(e.texto).toContain('Sinal suspenso até o pagamento.');
  });
});
