import { describe, expect, it } from 'vitest';
import {
  CABECALHO_CSV,
  FILTROS_VAZIOS,
  celulaSegura,
  contarFiltros,
  indiceDaCorDoAtendente,
  formatarDataHora,
  limitesDoDia,
  linhaCsv,
  placaParaFiltro,
  trechoDeBusca,
} from './acionamentos-consulta';

describe('contarFiltros', () => {
  it('filtros vazios = 0, e espaco em branco nao conta', () => {
    expect(contarFiltros(FILTROS_VAZIOS)).toBe(0);
    expect(contarFiltros({ ...FILTROS_VAZIOS, placa: '   ' })).toBe(0);
  });
  it('conta cada filtro ligado, inclusive os de marcar', () => {
    expect(
      contarFiltros({ ...FILTROS_VAZIOS, placa: 'ABC', status: 'NEGADO', meus: true, agendados: true, dia: '2026-10-30' }),
    ).toBe(5);
  });
});

describe('trechoDeBusca / placaParaFiltro', () => {
  it('tira o que quebra o filtro `or` do PostgREST', () => {
    expect(trechoDeBusca('a,b(c)*d%e')).toBe('a b c d e');
  });
  it('placa: maiuscula e so letras/numeros', () => {
    expect(placaParaFiltro('abc-1d23')).toBe('ABC1D23');
    expect(placaParaFiltro('  ')).toBe('');
  });
});

describe('limitesDoDia', () => {
  it('o dia local vira [00:00 do dia, 00:00 do seguinte)', () => {
    const l = limitesDoDia('2026-10-30');
    expect(l).not.toBeNull();
    const de = new Date(l!.de);
    const ate = new Date(l!.ate);
    expect([de.getFullYear(), de.getMonth(), de.getDate(), de.getHours()]).toEqual([2026, 9, 30, 0]);
    expect([ate.getFullYear(), ate.getMonth(), ate.getDate(), ate.getHours()]).toEqual([2026, 9, 31, 0]);
  });
  it('vira o mes e o ano', () => {
    const l = limitesDoDia('2026-12-31');
    const ate = new Date(l!.ate);
    expect([ate.getFullYear(), ate.getMonth(), ate.getDate()]).toEqual([2027, 0, 1]);
  });
  it('vazio ou data impossivel = sem filtro (nunca o dia errado)', () => {
    expect(limitesDoDia('')).toBeNull();
    expect(limitesDoDia('30/10/2026')).toBeNull();
    expect(limitesDoDia('2026-02-31')).toBeNull();
  });
});

describe('indiceDaCorDoAtendente', () => {
  it('a mesma pessoa cai sempre na mesma cor', () => {
    const id = '5f1c0a52-3b7e-4c9d-8a11-2e9f6d4b7c10';
    expect(indiceDaCorDoAtendente(id, 6)).toBe(indiceDaCorDoAtendente(id, 6));
  });
  it('fica sempre dentro da paleta', () => {
    for (let i = 0; i < 200; i++) {
      const k = indiceDaCorDoAtendente(`usuario-${i}`, 6);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThan(6);
    }
  });
  it('sem atendente (ou paleta vazia) = -1', () => {
    expect(indiceDaCorDoAtendente(null, 6)).toBe(-1);
    expect(indiceDaCorDoAtendente(undefined, 6)).toBe(-1);
    expect(indiceDaCorDoAtendente('', 6)).toBe(-1);
    expect(indiceDaCorDoAtendente('x', 0)).toBe(-1);
  });
  it('ids diferentes espalham entre as cores (nao cai tudo numa so)', () => {
    const usadas = new Set(Array.from({ length: 60 }, (_, i) => indiceDaCorDoAtendente(`usuario-${i}-${i * 7919}`, 6)));
    expect(usadas.size).toBeGreaterThan(3);
  });
});

describe('formatarDataHora', () => {
  it('dd/mm/aaaa hh:mm:ss', () => {
    expect(formatarDataHora(new Date(2026, 9, 31, 2, 26, 41))).toBe('31/10/2026 02:26:41');
  });
  it('vazio e invalido viram "-"', () => {
    expect(formatarDataHora(null)).toBe('-');
    expect(formatarDataHora('nao-e-data')).toBe('-');
  });
});

describe('celulaSegura (injecao de formula na planilha)', () => {
  it('neutraliza = + - @', () => {
    expect(celulaSegura('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(celulaSegura('+55 65 99999')).toBe(`'+55 65 99999`);
    expect(celulaSegura('-1')).toBe(`'-1`);
    expect(celulaSegura('@cmd')).toBe(`'@cmd`);
  });
  it('texto comum passa intacto', () => {
    expect(celulaSegura('FLORISVALDO SANTOS CARVALHO')).toBe('FLORISVALDO SANTOS CARVALHO');
    expect(celulaSegura(null)).toBe('');
  });
});

describe('linhaCsv', () => {
  it('uma celula por coluna do cabecalho, valor como numero', () => {
    const linha = linhaCsv(
      {
        protocolo: '261031022641',
        codigo_os: null,
        created_at: new Date(2026, 9, 31, 2, 26, 41).toISOString(),
        status: 'CONCLUIDO',
        valor_total: '150.5',
        veiculos: { placa: 'TLO9E29' },
        clientes: { nome_razao_social: '=CMD' },
        servicos_assistencia: { descricao: 'REBOQUE EVENTO - LEVE' },
        regionais: { nome: 'CUIABÁ' },
        fornecedores: null,
      },
      'LUANA CASTILHO',
      'Concluído',
    );
    expect(linha).toHaveLength(CABECALHO_CSV.length);
    expect(linha[4]).toBe(`'=CMD`);
    expect(linha[8]).toBe('');
    expect(linha[10]).toBe(150.5);
  });
});
