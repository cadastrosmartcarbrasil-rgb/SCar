import { describe, expect, it } from 'vitest';
import {
  exigeRevistoria, extensaoDoVideo, formatarSegundos, mensagemRevistoria, mimeDeGravacao,
  progressoRevistoria, resumoExigencia, validarVideo, VIDEO_MAX_BYTES,
} from './revistoria';

describe('exigeRevistoria', () => {
  it('so ACIMA do limite (no dia 5 ainda nao)', () => {
    expect(exigeRevistoria(5, 5)).toBe(false);
    expect(exigeRevistoria(6, 5)).toBe(true);
    expect(exigeRevistoria(null, 5)).toBe(false);
  });
  it('limite configuravel', () => {
    expect(exigeRevistoria(3, 2)).toBe(true);
    expect(exigeRevistoria(3, 10)).toBe(false);
  });
});

describe('validarVideo', () => {
  it('ate 30 s (+2 de folga) e 50 MB', () => {
    expect(validarVideo(28, 5_000_000)).toBeNull();
    expect(validarVideo(32, 5_000_000)).toBeNull();
    expect(validarVideo(33, 5_000_000)).toMatch(/limite é 30/);
    expect(validarVideo(20, VIDEO_MAX_BYTES + 1)).toMatch(/50 MB/);
  });
  it('sem duracao legivel recusa', () => {
    expect(validarVideo(null, 1)).toMatch(/duração/);
    expect(validarVideo(Number.POSITIVE_INFINITY, 1)).toMatch(/duração/);
  });
});

describe('mimeDeGravacao', () => {
  it('prefere mp4 (iPhone) e cai no webm (Android)', () => {
    expect(mimeDeGravacao((m) => m.startsWith('video/mp4'))).toBe('video/mp4;codecs=avc1');
    expect(mimeDeGravacao((m) => m === 'video/webm')).toBe('video/webm');
    expect(mimeDeGravacao(() => false)).toBeNull();
  });
  it('extensao', () => {
    expect(extensaoDoVideo('video/mp4;codecs=avc1')).toBe('mp4');
    expect(extensaoDoVideo('video/webm;codecs=vp9')).toBe('webm');
    expect(extensaoDoVideo('video/quicktime')).toBe('mov');
  });
});

describe('progressoRevistoria', () => {
  it('conta so os obrigatorios', () => {
    const p = progressoRevistoria([
      { obrigatorio: true, enviado: true }, { obrigatorio: true, enviado: false }, { obrigatorio: false, enviado: false },
    ]);
    expect(p).toMatchObject({ obrigatorios: 2, feitos: 1, completa: false, percentual: 50 });
    expect(progressoRevistoria([{ obrigatorio: true, enviado: true }]).completa).toBe(true);
    expect(progressoRevistoria([]).completa).toBe(false);
  });
});

describe('mensagemRevistoria', () => {
  it('convite com placa, link e prazo', () => {
    const m = mensagemRevistoria({ nome: 'MARIA SILVA', placa: 'ABC1D23', link: 'https://x/revistoria/t', expiraEm: '2026-10-30T12:00:00Z' });
    expect(m).toMatch(/^Olá, Maria!/);
    expect(m).toContain('ABC1D23');
    expect(m).toContain('https://x/revistoria/t');
    expect(m).toContain('30 segundos');
    expect(m).toMatch(/vale até/);
  });
  it('reprovada leva o motivo e o mesmo link', () => {
    const m = mensagemRevistoria({ link: 'L', motivo: 'Foto escura.' });
    expect(m).toContain('refaça a revistoria');
    expect(m).toContain('Foto escura.');
  });
});

describe('resumoExigencia', () => {
  it('bloqueia enquanto houver veiculo sem liberacao', () => {
    expect(resumoExigencia([])).toMatchObject({ exige: false, bloqueia: false });
    const r = resumoExigencia([
      { liberada: true, situacao: 'APROVADA' }, { liberada: false, situacao: 'EM_ANALISE' }, { liberada: false, situacao: null },
    ]);
    expect(r).toMatchObject({ exige: true, bloqueia: true, pendentes: 2, emAnalise: 1, semPedido: 1 });
  });
});

describe('formatarSegundos', () => {
  it('m:ss', () => {
    expect(formatarSegundos(28.4)).toBe('0:28');
    expect(formatarSegundos(65)).toBe('1:05');
  });
});
