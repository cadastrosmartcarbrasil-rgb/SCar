import { describe, expect, it } from 'vitest';
import { CONTATO_PADRAO, REMETENTE_PADRAO, remetenteEmail } from './email';

describe('remetenteEmail', () => {
  it('sem env usa o dominio do app', () => {
    expect(remetenteEmail({})).toBe('Smart Car Brasil <nao-responda@appsmartcar.com.br>');
  });
  it('env vazia (o compose repassa "") conta como ausente', () => {
    expect(remetenteEmail({ EMAIL_FROM: '', RESEND_FROM: '  ' })).toBe(REMETENTE_PADRAO);
  });
  it('EMAIL_FROM vence RESEND_FROM', () => {
    expect(remetenteEmail({ EMAIL_FROM: 'A <a@x.com>', RESEND_FROM: 'B <b@x.com>' })).toBe('A <a@x.com>');
    expect(remetenteEmail({ RESEND_FROM: 'B <b@x.com>' })).toBe('B <b@x.com>');
  });
  it('nada aponta para o dominio antigo', () => {
    expect(`${REMETENTE_PADRAO} ${CONTATO_PADRAO}`).not.toMatch(/smartvida/i);
  });
});
