import { describe, it, expect, beforeEach } from 'vitest';
import { consumirTentativa, limparTentativas, ipDaRequisicao, _resetLimites } from './rate-limit';

const AGORA = new Date('2026-09-20T12:00:00Z').getTime();

describe('limite de tentativas', () => {
  beforeEach(() => _resetLimites());

  it('deixa passar ate o limite e barra a proxima', () => {
    for (let i = 0; i < 5; i++) {
      expect(consumirTentativa('cpf:1', 5, 600, AGORA).permitido).toBe(true);
    }
    const barrado = consumirTentativa('cpf:1', 5, 600, AGORA);
    expect(barrado.permitido).toBe(false);
    expect(barrado.esperar).toBe(600);
  });

  it('conta por chave — um CPF nao derruba o outro', () => {
    for (let i = 0; i < 5; i++) consumirTentativa('cpf:1', 5, 600, AGORA);
    expect(consumirTentativa('cpf:2', 5, 600, AGORA).permitido).toBe(true);
  });

  it('libera quando a janela vence', () => {
    for (let i = 0; i < 5; i++) consumirTentativa('cpf:1', 5, 600, AGORA);
    expect(consumirTentativa('cpf:1', 5, 600, AGORA + 599_000).permitido).toBe(false);
    expect(consumirTentativa('cpf:1', 5, 600, AGORA + 601_000).permitido).toBe(true);
  });

  it('acertar a senha zera o contador', () => {
    for (let i = 0; i < 4; i++) consumirTentativa('cpf:1', 5, 600, AGORA);
    limparTentativas('cpf:1');
    expect(consumirTentativa('cpf:1', 5, 600, AGORA).restantes).toBe(4);
  });

  it('le o IP atras do proxy', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } });
    expect(ipDaRequisicao(req)).toBe('1.2.3.4');
    expect(ipDaRequisicao(new Request('http://x'))).toBe('desconhecido');
  });
});
