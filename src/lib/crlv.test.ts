import { describe, expect, it } from 'vitest';
import { interpretarQrCrlv, normalizarPlaca, qrTrouxeDados } from './crlv';

describe('normalizarPlaca', () => {
  it('aceita Mercosul e placa antiga, ignorando traco e caixa', () => {
    expect(normalizarPlaca('abc1d23')).toBe('ABC1D23');
    expect(normalizarPlaca('ABC-1234')).toBe('ABC1234');
  });
  it('recusa o que nao e placa', () => {
    expect(normalizarPlaca('12345')).toBeNull();
    expect(normalizarPlaca(null)).toBeNull();
  });
});

describe('interpretarQrCrlv', () => {
  it('guarda o bruto e reconhece a URL de validacao', () => {
    const d = interpretarQrCrlv('https://www.gov.br/crlv/validar?chave=ABC123');
    expect(d.bruto).toContain('gov.br');
    expect(d.url).toBe('https://www.gov.br/crlv/validar?chave=ABC123');
  });

  it('extrai placa, renavam e chassi da querystring', () => {
    const d = interpretarQrCrlv('https://gov.br/crlv?placa=ABC1D23&renavam=12345678901&chassi=9BWZZZ377VT004251');
    expect(d.placa).toBe('ABC1D23');
    expect(d.renavam).toBe('12345678901');
    expect(d.chassi).toBe('9BWZZZ377VT004251');
    expect(qrTrouxeDados(d)).toBe(true);
  });

  it('extrai do corpo em texto, com rotulo e dois-pontos', () => {
    const d = interpretarQrCrlv('CRLV-e\nPLACA: ABC-1234\nRENAVAM: 987654321\nCHASSI: 9BWZZZ377VT004252');
    expect(d.placa).toBe('ABC1234');
    expect(d.renavam).toBe('987654321');
    expect(d.chassi).toBe('9BWZZZ377VT004252');
  });

  it('acha a placa solta no meio do texto', () => {
    const d = interpretarQrCrlv('DOCUMENTO DO VEICULO ABC1D23 EMITIDO EM 2026');
    expect(d.placa).toBe('ABC1D23');
  });

  it('nao confunde o chassi com o renavam', () => {
    const d = interpretarQrCrlv('9BWZZZ377VT004251 12345678901');
    expect(d.chassi).toBe('9BWZZZ377VT004251');
    expect(d.renavam).toBe('12345678901');
  });

  it('QR que so tem link de validacao: guarda a prova, sem inventar dados', () => {
    const d = interpretarQrCrlv('https://serpro.gov.br/consulta/9f2c8a1b');
    expect(d.url).toBeTruthy();
    expect(d.placa).toBeNull();
    expect(qrTrouxeDados(d)).toBe(false);
  });

  it('nunca lanca com entrada vazia ou lixo', () => {
    expect(interpretarQrCrlv('')).toMatchObject({ bruto: '', url: null, placa: null });
    expect(() => interpretarQrCrlv('!!!???')).not.toThrow();
  });
});
