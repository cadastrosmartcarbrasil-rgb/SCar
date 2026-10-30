import { describe, expect, it } from 'vitest';
import { mensagemBoasVindasWhatsApp, textoBoasVindasEmail } from './boas-vindas';

const base = {
  nome: 'MARIA DA SILVA',
  placa: 'ABC1D23',
  portalUrl: 'https://appsmartcar.com.br/portal/login',
};

describe('boas-vindas (0161)', () => {
  it('o e-mail ensina o login do portal e a senha do primeiro acesso', () => {
    const t = textoBoasVindasEmail(base);
    expect(t).toContain('Olá, Maria!');
    expect(t).toContain('ABC1D23');
    expect(t).toContain('https://appsmartcar.com.br/portal/login');
    expect(t).toContain('Login: o seu CPF');
    expect(t).toContain('Senha do primeiro acesso');
  });

  it('lista os documentos do portal e os boletos (adesao primeiro)', () => {
    const t = textoBoasVindasEmail({
      ...base,
      documentos: ['Manual da Assistência 24h', 'Regulamento'],
      boletos: [
        { vencimento: '2026-12-10', valor: 150, adesao: false, linha_digitavel: '7489 2' },
        { vencimento: '2026-11-10', valor: 40, adesao: false, linha_digitavel: '7489 1' },
        { vencimento: '2026-11-02', valor: 400, adesao: true, linha_digitavel: '7489 A' },
        { vencimento: '2027-01-10', valor: 150, adesao: false, linha_digitavel: null },
      ],
    });
    expect(t).toContain('• Manual da Assistência 24h');
    expect(t.indexOf('7489 A')).toBeLessThan(t.indexOf('7489 1'));
    expect(t.indexOf('7489 1')).toBeLessThan(t.indexOf('7489 2'));
    expect(t).not.toContain('10/01/2027'); // sem linha digitavel nao entra
  });

  it('diz quando a cobertura comeca (24h depois)', () => {
    const t = textoBoasVindasEmail({ ...base, coberturaDesde: '2026-10-31T18:30:00Z' });
    expect(t).toContain('A cobertura começa em 31/10/2026');
  });

  it('o WhatsApp e curto e traz o portal', () => {
    const m = mensagemBoasVindasWhatsApp(base);
    expect(m).toContain('Seja bem-vindo(a)');
    expect(m).toContain('portal/login');
    expect(m).not.toContain('Seus boletos');
  });
});
