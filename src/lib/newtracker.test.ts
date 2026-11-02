import { describe, expect, it } from 'vitest';
import {
  BASE_NEWTRACKER, camposDaAmostra, ehRecursoNewTracker, imeiNewTracker, lerPaginaNewTracker,
  mensagemErroNewTracker, semSinal, temMaisPaginas, urlNewTracker,
} from './newtracker';

describe('urlNewTracker', () => {
  it('monta a URL da API externa com o recurso', () => {
    expect(urlNewTracker('', 'status')).toBe(`${BASE_NEWTRACKER}/api-externa?recurso=status`);
  });
  it('limita a pagina a 500 e normaliza a placa', () => {
    const u = new URL(urlNewTracker(BASE_NEWTRACKER + '/', 'veiculos', { limite: 9000, pagina: 2, placa: 'abc-1d23' }));
    expect(u.searchParams.get('limite')).toBe('500');
    expect(u.searchParams.get('pagina')).toBe('2');
    expect(u.searchParams.get('placa')).toBe('ABC1D23');
  });
  it('placa so vale em veiculos e status ignora paginacao', () => {
    expect(urlNewTracker('', 'posicoes', { placa: 'ABC1D23' })).not.toContain('placa');
    expect(urlNewTracker('', 'status', { limite: 5 })).not.toContain('limite');
  });
});

describe('lerPaginaNewTracker', () => {
  it('le o envelope documentado', () => {
    const p = lerPaginaNewTracker({ success: true, recurso: 'equipamentos', pagina: 1, limite: 50, total: 128, dados: [{ imei: '1' }, 3] });
    expect(p).toMatchObject({ ok: true, total: 128, pagina: 1, limite: 50 });
    expect(p.dados).toEqual([{ imei: '1' }]);
  });
  it('status nao e listagem: corpo inteiro', () => {
    const p = lerPaginaNewTracker({ success: true, empresa_id: 'x', permissoes: ['veiculos'] });
    expect(p.dados).toEqual([]);
    expect(p.corpo?.empresa_id).toBe('x');
  });
  it('lixo nao quebra', () => {
    expect(lerPaginaNewTracker('html').ok).toBe(false);
  });
});

describe('temMaisPaginas', () => {
  it('pelo total', () => {
    expect(temMaisPaginas({ ok: true, total: 128, pagina: 2, limite: 50, dados: [], corpo: null }, 50)).toBe(true);
    expect(temMaisPaginas({ ok: true, total: 128, pagina: 3, limite: 50, dados: [], corpo: null }, 50)).toBe(false);
  });
  it('sem total: pagina cheia', () => {
    expect(temMaisPaginas({ ok: true, total: null, pagina: null, limite: null, dados: [{}, {}], corpo: null }, 2)).toBe(true);
  });
});

describe('mensagemErroNewTracker', () => {
  it('traduz os codigos documentados', () => {
    expect(mensagemErroNewTracker(403, { code: 'FORBIDDEN_SCOPE' })).toContain('permissão');
    expect(mensagemErroNewTracker(401, {})).toContain('inválida');
    expect(mensagemErroNewTracker(500, { error: 'falhou' })).toBe('A New Tracker respondeu HTTP 500: falhou.');
  });
});

describe('camposDaAmostra', () => {
  it('conta preenchidos e abre um nivel', () => {
    const c = camposDaAmostra([
      { imei: '123', modelo: '', veiculo: { placa: 'ABC1D23' } },
      { imei: '456', modelo: null },
    ]);
    expect(c.find((x) => x.campo === 'imei')).toMatchObject({ preenchidos: 2, total: 2, exemplo: '123' });
    expect(c.find((x) => x.campo === 'modelo')).toMatchObject({ preenchidos: 0, exemplo: null });
    expect(c.find((x) => x.campo === 'veiculo.placa')?.preenchidos).toBe(1);
  });
});

describe('imeiNewTracker e semSinal', () => {
  it('imei so digitos 14..17', () => {
    expect(imeiNewTracker(' 86-0000000000001 ')).toBe('860000000000001');
    expect(imeiNewTracker('123')).toBeNull();
  });
  it('sem sinal depois de 3 dias', () => {
    const agora = new Date('2026-11-05T12:00:00Z');
    expect(semSinal('2026-11-03T12:00:00Z', agora)).toBe(false);
    expect(semSinal('2026-11-01T11:00:00Z', agora)).toBe(true);
    expect(semSinal(null, agora)).toBe(true);
  });
  it('recurso valido', () => {
    expect(ehRecursoNewTracker('posicoes')).toBe(true);
    expect(ehRecursoNewTracker('faturas')).toBe(false);
  });
});
