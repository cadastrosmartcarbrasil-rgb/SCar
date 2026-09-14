import { describe, it, expect } from 'vitest';
import {
  periodoPainel, presetAtivo, periodoValido, variacao, direcaoVariacao,
  rotuloPonto, serieParaGrafico, ordenarComparativo, riscoRegional,
  totaisComparativo, contaOrdenavel, contaValida, validarIntervaloContas,
  rotuloIntervalo, PERIODO_PADRAO_PAINEL,
} from './regionais';
import type { RegionaisPainelLinha, RegionaisPainelPonto } from './database.types';

// Sexta-feira, 14/09/2026 — data fixa para o teste nao depender de "hoje".
const HOJE = new Date(2026, 8, 14);

describe('periodo do painel', () => {
  it('o padrao e os ultimos 30 dias, e o periodo tem 30 dias (inclui hoje)', () => {
    expect(PERIODO_PADRAO_PAINEL).toBe('trinta_dias');
    const p = periodoPainel('trinta_dias', HOJE);
    expect(p).toEqual({ inicio: '2026-08-16', fim: '2026-09-14' });
    const dias = (new Date(p.fim).getTime() - new Date(p.inicio).getTime()) / 86400000 + 1;
    expect(dias).toBe(30);
  });

  it('7 dias inclui hoje', () => {
    expect(periodoPainel('sete_dias', HOJE)).toEqual({ inicio: '2026-09-08', fim: '2026-09-14' });
  });

  it('mes atual vai do dia 1 ate hoje (nao ate o fim do mes, que e futuro)', () => {
    expect(periodoPainel('mes', HOJE)).toEqual({ inicio: '2026-09-01', fim: '2026-09-14' });
  });

  it('ano atual comeca em 1 de janeiro', () => {
    expect(periodoPainel('ano', HOJE)).toEqual({ inicio: '2026-01-01', fim: '2026-09-14' });
  });

  it('reconhece qual preset esta em tela e devolve null para periodo digitado', () => {
    expect(presetAtivo(periodoPainel('ano', HOJE), HOJE)).toBe('ano');
    expect(presetAtivo({ inicio: '2026-03-02', fim: '2026-04-07' }, HOJE)).toBeNull();
  });

  it('periodo invertido e invalido', () => {
    expect(periodoValido({ inicio: '2026-09-01', fim: '2026-09-14' })).toBe(true);
    expect(periodoValido({ inicio: '2026-09-14', fim: '2026-09-01' })).toBe(false);
    expect(periodoValido({ inicio: '', fim: '2026-09-01' })).toBe(false);
  });
});

describe('variacao contra o periodo anterior', () => {
  it('calcula a fracao', () => {
    expect(variacao(120, 100)).toBeCloseTo(0.2);
    expect(variacao(80, 100)).toBeCloseTo(-0.2);
  });

  it('sem base de comparacao devolve null em vez de inventar +100%', () => {
    expect(variacao(10, 0)).toBeNull();
    expect(variacao(0, 0)).toBe(0);
  });

  it('usa o modulo da base: sair de -100 para -50 e melhora de 50%', () => {
    expect(variacao(-50, -100)).toBeCloseTo(0.5);
  });

  it('a direcao depende do indicador: carteira subindo e boa, churn subindo e ruim', () => {
    expect(direcaoVariacao(0.2, true)).toBe('boa');
    expect(direcaoVariacao(0.2, false)).toBe('ruim');
    expect(direcaoVariacao(-0.2, false)).toBe('boa');
    expect(direcaoVariacao(0, true)).toBe('neutra');
    expect(direcaoVariacao(null, true)).toBe('neutra');
  });
});

describe('serie temporal', () => {
  const ponto = (over: Partial<RegionaisPainelPonto>): RegionaisPainelPonto => ({
    balde: '2026-09-14', fim_balde: '2026-09-14', granularidade: 'DIA',
    ativos: 100, inadimplentes: 5, sinistros: 1, recebido: 1000, gasto_eventos: 300, ...over,
  });

  it('rotula conforme a granularidade que o banco escolheu', () => {
    expect(rotuloPonto(ponto({}))).toBe('14/09');
    expect(rotuloPonto(ponto({ granularidade: 'SEMANA', balde: '2026-09-07', fim_balde: '2026-09-13' })))
      .toBe('07/09–13/09');
    expect(rotuloPonto(ponto({ granularidade: 'MES', balde: '2026-09-01', fim_balde: '2026-09-30' })))
      .toBe('set/26');
  });

  it('devolve o resultado do balde (recebido - gasto com evento)', () => {
    const [p] = serieParaGrafico([ponto({})]);
    expect(p.resultado).toBe(700);
    expect(p.rotulo).toBe('14/09');
  });
});

const linha = (over: Partial<RegionaisPainelLinha>): RegionaisPainelLinha => ({
  regional_id: 'r', regional: 'Unidade', cidade: 'CUIABA', uf: 'MT', ativa: true,
  veiculos_ativos: 100, veiculos_novos: 5, veiculos_cancelados: 2,
  veiculos_inadimplentes: 10, inadimplencia: 0.1, sinistros: 3,
  recebido: 10000, gasto_eventos: 3000, resultado: 7000, sinistralidade: 0.3, ...over,
});

describe('ordenacao do comparativo', () => {
  const linhas = [
    linha({ regional_id: 'a', regional: 'Cuiaba', veiculos_ativos: 300, resultado: 500, sinistralidade: 0.9 }),
    linha({ regional_id: 'b', regional: 'Natal', veiculos_ativos: 120, resultado: -900, sinistralidade: 1.4 }),
    linha({ regional_id: 'c', regional: 'Sao Paulo', veiculos_ativos: 900, resultado: 8000, sinistralidade: 0.2 }),
  ];

  it('ordena do maior para o menor', () => {
    expect(ordenarComparativo(linhas, 'ativos').map((l) => l.regional_id)).toEqual(['c', 'a', 'b']);
    expect(ordenarComparativo(linhas, 'sinistralidade').map((l) => l.regional_id)).toEqual(['b', 'a', 'c']);
  });

  it('em resultado, o PIOR vem primeiro — e o que precisa de decisao', () => {
    expect(ordenarComparativo(linhas, 'resultado').map((l) => l.regional_id)).toEqual(['b', 'a', 'c']);
  });

  it('nome e alfabetico', () => {
    expect(ordenarComparativo(linhas, 'nome').map((l) => l.regional)).toEqual(['Cuiaba', 'Natal', 'Sao Paulo']);
  });

  it('nao muta a lista recebida', () => {
    const antes = linhas.map((l) => l.regional_id);
    ordenarComparativo(linhas, 'ativos');
    expect(linhas.map((l) => l.regional_id)).toEqual(antes);
  });
});

describe('risco da unidade', () => {
  it('sinistralidade acima de 1 e critico: gasta mais com evento do que arrecada', () => {
    expect(riscoRegional(linha({ sinistralidade: 1.2 }))).toBe('critico');
  });

  it('inadimplencia acima de 25% da carteira tambem e critico', () => {
    expect(riscoRegional(linha({ inadimplencia: 0.3 }))).toBe('critico');
  });

  it('a pior das duas reguas manda', () => {
    expect(riscoRegional(linha({ sinistralidade: 0.1, inadimplencia: 0.18 }))).toBe('atencao');
    expect(riscoRegional(linha({ sinistralidade: 0.8, inadimplencia: 0.01 }))).toBe('atencao');
  });

  it('unidade sem carteira nao e saudavel — e sem dados', () => {
    expect(riscoRegional(linha({ veiculos_ativos: 0, sinistralidade: 0, inadimplencia: 0 })))
      .toBe('sem_dados');
  });

  it('dentro das duas reguas e saudavel', () => {
    expect(riscoRegional(linha({ sinistralidade: 0.35, inadimplencia: 0.06 }))).toBe('saudavel');
  });
});

describe('totais do rodape', () => {
  it('o percentual e do TOTAL, nao a media dos percentuais', () => {
    const t = totaisComparativo([
      // 1 de 10 em atraso (10%) e 100 de 1000 (10%) — mas com pesos diferentes.
      linha({ veiculos_ativos: 10, veiculos_inadimplentes: 5, recebido: 1000, gasto_eventos: 900 }),
      linha({ veiculos_ativos: 1000, veiculos_inadimplentes: 50, recebido: 100000, gasto_eventos: 10000 }),
    ]);
    expect(t.ativos).toBe(1010);
    expect(t.inadimplentes).toBe(55);
    expect(t.inadimplencia).toBeCloseTo(55 / 1010);       // 5,4% — nao a media (7,5%)
    expect(t.sinistralidade).toBeCloseTo(10900 / 101000); // consolidado, nao media
    expect(t.resultado).toBe(90100);
    expect(t.unidades).toBe(2);
  });

  it('lista vazia nao divide por zero', () => {
    const t = totaisComparativo([]);
    expect(t.inadimplencia).toBe(0);
    expect(t.sinistralidade).toBe(0);
    expect(t.resultado).toBe(0);
  });
});

describe('intervalo de contas', () => {
  it('compara conta como NUMERO por segmento: 1.10.00 e maior que 1.9.99', () => {
    expect(contaOrdenavel('1.10.00') > contaOrdenavel('1.9.99')).toBe(true);
    // o erro que a comparacao de texto crua comete:
    expect('1.10.00' > '1.9.99').toBe(false);
  });

  it('aceita so numeros e pontos', () => {
    expect(contaValida('1.0.00')).toBe(true);
    expect(contaValida('3')).toBe(true);
    expect(contaValida('1,0,00')).toBe(false);
    expect(contaValida('1.a.00')).toBe(false);
  });

  it('recusa intervalo invertido e codigo invalido', () => {
    expect(validarIntervaloContas('1.0.00', '3.9.99')).toBeNull();
    expect(validarIntervaloContas('', '')).toBeNull();
    expect(validarIntervaloContas('3.9.99', '1.0.00')).toMatch(/maior que a final/);
    expect(validarIntervaloContas('1,0', '')).toMatch(/inicial invalida/);
    expect(validarIntervaloContas('', 'x')).toMatch(/final invalida/);
  });

  it('rotula o recorte no botao', () => {
    expect(rotuloIntervalo(null, null)).toBe('Todas as contas');
    expect(rotuloIntervalo('1.0.00', '3.9.99')).toBe('1.0.00 a 3.9.99');
    expect(rotuloIntervalo('1.0.00', null)).toBe('de 1.0.00');
    expect(rotuloIntervalo(null, '3.9.99')).toBe('ate 3.9.99');
  });
});
