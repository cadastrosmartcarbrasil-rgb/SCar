import { describe, expect, it } from 'vitest';
import {
  MODELOS_WHATSAPP, limparMensagem, parteWhatsApp, previaWhatsApp, textosEfetivosWhatsApp,
  textosWhatsAppParaGravar, validarTextosWhatsApp,
} from './modelos-whatsapp';
import { mensagemDaProposta, mensagemDaVistoria } from '../venda-publica';
import { mensagemDoBoleto } from '../renegociacao';
import { mensagemComunicacao } from '../comunicacao-evento';
import { mensagemCobranca } from '../cobranca-fila';

describe('modelos de WhatsApp (0172)', () => {
  it('todo texto original passa na validação e usa só campos do modelo', () => {
    for (const m of MODELOS_WHATSAPP) {
      expect(validarTextosWhatsApp(m.codigo, textosEfetivosWhatsApp(m.codigo, {})), m.codigo).toEqual([]);
    }
  });

  it('o texto original continua saindo igual', () => {
    expect(mensagemDaProposta('https://x/c', 'JOAO DA SILVA'))
      .toBe('Olá, JOAO! Segue a sua proposta da Smart Car Brasil: https://x/c');
    expect(mensagemDaProposta('https://x/c')).toBe('Segue a sua proposta da Smart Car Brasil: https://x/c');
    expect(mensagemDaVistoria('L', null)).toBe(
      'Para concluir a sua proteção, faltam as fotos do veículo. É pelo celular mesmo e leva uns 3 minutos: L');
    expect(mensagemCobranca({ associado: 'ANA', boletos: 1, valor: 10 }))
      .toContain('Identificamos 1 mensalidade em aberto, no total de');
    expect(mensagemComunicacao({ papel: 'associado', link: 'L' }))
      .toBe('Olá! Recebemos a comunicação do evento com o seu veículo. Para agilizar, conte o que aconteceu e envie as fotos por este link:\nL\nLeva poucos minutos e você pode parar e continuar depois. Comunique o quanto antes.');
  });

  it('o texto gravado vale, e campo vazio some sem sobra', () => {
    const textos = { texto: 'Oi {nome} ({saudacao}) — sua proposta: {link}' };
    expect(mensagemDaProposta('https://x/c', null, textos)).toBe('Oi — sua proposta: https://x/c');
    expect(mensagemDaProposta('https://x/c', 'MARIA', textos)).toBe('Oi MARIA (Olá, MARIA!) — sua proposta: https://x/c');
    const m = mensagemDoBoleto({
      nome: 'ANA', substitui: false, textos: { fecho_mesmo: 'Dúvidas? Chame a central.' },
      boletos: [{ parcela: 1, vencimento: '2026-10-20', valor: 50, linha_digitavel: 'a', pix_copia_cola: null }],
    });
    expect(m).toContain('Olá, Ana! Segue o seu boleto da Smart Car Brasil.');
    expect(m.endsWith('Dúvidas? Chame a central.')).toBe(true);
    expect(mensagemComunicacao({ papel: 'testemunha', link: 'L', textos: { evento_terceiro: { texto: 'Conte aqui: {link}' } } }))
      .toBe('Conte aqui: L');
  });

  it('limpeza: espaço duplo, antes de pontuação e parênteses vazios; nunca junta linhas', () => {
    expect(limparMensagem('a  b , c ( ) d .\n\n  e')).toBe('a b, c d.\n\ne');
    expect(parteWhatsApp('carne', 'abertura', { saudacao: 'Olá!', veiculo: '' })).toBe('Olá! Seguem os boletos da sua proteção veicular:');
  });

  it('recusa campo desconhecido, vazio, sem link e palavra proibida', () => {
    expect(validarTextosWhatsApp('proposta', { texto: 'Oi {cpf} {link}' }).join()).toMatch(/\{cpf\}/);
    expect(validarTextosWhatsApp('proposta', { texto: '' }).join()).toMatch(/vazio/);
    expect(validarTextosWhatsApp('proposta', { texto: 'Veja a proposta' }).join()).toMatch(/\{link\}/);
    expect(validarTextosWhatsApp('evento_terceiro', { texto: 'Seu sinistro: {link}' }).join()).toMatch(/sinistro/);
    expect(validarTextosWhatsApp('cobranca', { texto: 'Vamos protestar no SERASA' }).join()).toMatch(/serasa/i);
    expect(validarTextosWhatsApp('xpto', {})).toEqual(['Modelo desconhecido.']);
  });

  it('grava só o que difere e a prévia mostra cada situação', () => {
    const o = textosEfetivosWhatsApp('boleto', {});
    expect(textosWhatsAppParaGravar('boleto', o)).toEqual({});
    expect(textosWhatsAppParaGravar('boleto', { ...o, fecho_mesmo: ' Novo ' })).toEqual({ fecho_mesmo: 'Novo' });
    expect(previaWhatsApp('boleto', o)).toHaveLength(3);
    expect(previaWhatsApp('proposta', o)[0].texto).toContain('https://');
  });
});
