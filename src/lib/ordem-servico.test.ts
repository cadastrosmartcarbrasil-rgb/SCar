import { describe, expect, it } from 'vitest';
import {
  itensDaCotacao, mensagemOSWhatsApp, problemasDaOS, situacaoDoPrazo, somarDiasUteis, subtotalItem,
  tipoDaOrdem, totaisDaOS, type ItemOS,
} from './ordem-servico';

const itens: ItemOS[] = [
  { tipo: 'MAO_DE_OBRA', descricao: 'FUNILARIA', quantidade: 1, valor_unitario: 800 },
  { tipo: 'PECA', descricao: 'PARACHOQUE', quantidade: 2, valor_unitario: 250.5 },
];

describe('totais da OS (o mesmo calculo do banco)', () => {
  it('autorizado = M.O. + pecas; liquido = autorizado - participacao - pecas da Smart Car', () => {
    const t = totaisDaOS(itens, 500, 100);
    expect(t).toEqual({ mao_obra: 800, pecas: 501, autorizado: 1301, participacao: 500, pecas_smartcar: 100, liquido: 701 });
  });
  it('centavos sem erro de ponto flutuante', () => {
    const t = totaisDaOS([{ tipo: 'PECA', descricao: 'X', quantidade: 3, valor_unitario: 0.1 }], 0, 0);
    expect(t.pecas).toBe(0.3);
    expect(subtotalItem({ tipo: 'PECA', descricao: 'X', quantidade: 1.5, valor_unitario: 33.33 })).toBe(50);
  });
  it('liquido negativo bloqueia a emissao', () => {
    const t = totaisDaOS(itens, 1500, 0);
    expect(t.liquido).toBeLessThan(0);
    expect(problemasDaOS({ fornecedorId: 'f', itens, dataLimite: '2026-11-20', documento: 'AUTORIZACAO', totais: t }))
      .toContain('O valor líquido a faturar ficaria negativo.');
  });
  it('tipo da ordem pelos itens', () => {
    expect(tipoDaOrdem(itens)).toBe('MISTA');
    expect(tipoDaOrdem([itens[0]])).toBe('MAO_DE_OBRA');
    expect(tipoDaOrdem([itens[1]])).toBe('PECAS');
    expect(tipoDaOrdem([])).toBeNull();
  });
});

describe('problemas antes de emitir', () => {
  const t = totaisDaOS(itens, 0, 0);
  it('exige prestador, item, data limite e a OS retificada', () => {
    const p = problemasDaOS({ fornecedorId: null, itens: [], dataLimite: null, documento: 'RETIFICACAO', totais: t });
    expect(p).toEqual(expect.arrayContaining([
      'Escolha o prestador (fornecedor cadastrado).', 'Inclua pelo menos um item.',
      'Informe a data limite de entrega.', 'Escolha a OS que está sendo retificada.',
    ]));
  });
  it('limite antes do inicio', () => {
    expect(problemasDaOS({ fornecedorId: 'f', itens, inicio: '2026-11-10', dataLimite: '2026-11-09', documento: 'AUTORIZACAO', totais: t }))
      .toEqual(['A data limite não pode ser antes do início previsto.']);
  });
  it('tudo certo, nenhum problema', () => {
    expect(problemasDaOS({ fornecedorId: 'f', itens, inicio: '2026-11-10', dataLimite: '2026-11-10', documento: 'AUTORIZACAO', totais: t }))
      .toEqual([]);
  });
});

describe('dias uteis (espelho de somar_dias_uteis)', () => {
  it('pula fim de semana e feriado', () => {
    expect(somarDiasUteis('2026-11-19', 2, ['2026-11-20'])).toBe('2026-11-24');
    expect(somarDiasUteis('2026-11-06', 1)).toBe('2026-11-09'); // sexta + 1 = segunda
    expect(somarDiasUteis('2026-11-23', 0)).toBe('2026-11-23');
  });
});

describe('situacao do prazo', () => {
  const os = (s: string, limite: string, entrega: string | null = null) =>
    ({ status: s, data_limite_entrega: limite, data_entrega_real: entrega });
  it('vence em / hoje / atrasada', () => {
    expect(situacaoDoPrazo(os('ENVIADA', '2026-11-15'), '2026-11-05').texto).toBe('vence em 10 dias');
    expect(situacaoDoPrazo(os('ENVIADA', '2026-11-07'), '2026-11-05')).toMatchObject({ tipo: 'vence_logo', texto: 'vence em 2 dias' });
    expect(situacaoDoPrazo(os('EMITIDA', '2026-11-05'), '2026-11-05').tipo).toBe('vence_hoje');
    expect(situacaoDoPrazo(os('EM_EXECUCAO', '2026-11-03'), '2026-11-05')).toMatchObject({ tipo: 'atrasada', texto: 'atrasada 2 dias' });
  });
  it('entregue no prazo ou com atraso; cancelada nao conta prazo', () => {
    expect(situacaoDoPrazo(os('ENTREGUE', '2026-11-05', '2026-11-04'), '2026-11-20').texto).toBe('entregue no prazo');
    expect(situacaoDoPrazo(os('ENTREGUE', '2026-11-05', '2026-11-06'), '2026-11-20').texto).toBe('entregue com 1 dia de atraso');
    expect(situacaoDoPrazo(os('CANCELADA', '2026-11-01'), '2026-11-20').tipo).toBe('encerrada');
  });
});

describe('da cotacao para a OS', () => {
  it('itens herdam o tipo (sem tipo = peca)', () => {
    expect(itensDaCotacao([
      { descricao_peca: 'PINTURA', quantidade: 1, valor_unitario: 300, tipo_item: 'MAO_DE_OBRA' },
      { descricao_peca: 'FAROL', quantidade: 1, valor_unitario: 200 },
    ]).map((i) => i.tipo)).toEqual(['MAO_DE_OBRA', 'PECA']);
  });
  it('mensagem do WhatsApp sem valor nem dado pessoal', () => {
    const m = mensagemOSWhatsApp({ prestador: 'OFICINA X', numero: 'OS-2026-000001', protocolo: 'EVT-1', link: 'https://x/os/t', limite: '2026-11-20' });
    expect(m).toContain('OS-2026-000001');
    expect(m).toContain('20/11/2026');
    expect(m).not.toMatch(/R\$/);
  });
});

import { lerTokenDaOS, tokenDaOS, tokenDoBoleto } from './comunicacao/servidor';

describe('link assinado da OS (7 dias)', () => {
  const id = '11111111-2222-3333-4444-555555555555';
  it('vale ate expirar e nao aceita token de boleto', () => {
    const t = tokenDaOS(id, 2000, 'segredo-de-teste-com-mais-de-32-caracteres');
    expect(lerTokenDaOS(t, 'segredo-de-teste-com-mais-de-32-caracteres', 1000)).toEqual({ osId: id });
    expect(lerTokenDaOS(t, 'segredo-de-teste-com-mais-de-32-caracteres', 3000)).toEqual({ erro: 'expirado' });
    expect(lerTokenDaOS(t, 'outro-segredo-qualquer-com-32-caracteres!!', 1000)).toEqual({ erro: 'invalido' });
    const boleto = tokenDoBoleto(id, 2000, 'segredo-de-teste-com-mais-de-32-caracteres');
    expect(lerTokenDaOS(boleto, 'segredo-de-teste-com-mais-de-32-caracteres', 1000)).toEqual({ erro: 'invalido' });
  });
});
