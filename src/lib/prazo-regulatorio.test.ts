import { describe, expect, it } from 'vitest';
import {
  MARCOS_PADRAO,
  alertasParaEmail,
  descricaoDoNivel,
  validarMarcos,
  assuntoEmailPrazos,
  calcularPrazo,
  contarPorNivel,
  diasEntre,
  fracaoDoPrazo,
  linhaDoAlerta,
  nivelDoPrazo,
  rotuloMarco,
  somarDias,
  textoDoPrazo,
} from './prazo-regulatorio';

describe('nivelDoPrazo (espelho de prazo_regulatorio_nivel)', () => {
  it('sem documentacao completa o relogio nao corre', () => {
    expect(nivelDoPrazo(null, false, false)).toBe('DOCUMENTACAO_PENDENTE');
    expect(nivelDoPrazo(null, false, true)).toBe('ENCERRADO_SEM_PRAZO');
  });
  it('marcos 30/60/75/85 e vencido acima de 90', () => {
    const casos: [number, string][] = [
      [0, 'NO_PRAZO'], [29, 'NO_PRAZO'], [30, 'AVISO'], [59, 'AVISO'], [60, 'ATENCAO'],
      [74, 'ATENCAO'], [75, 'URGENCIA'], [84, 'URGENCIA'], [85, 'CRITICO'], [90, 'CRITICO'], [91, 'VENCIDO'],
    ];
    for (const [d, n] of casos) expect(nivelDoPrazo(d, true, false)).toBe(n);
  });
  it('encerrado diz se foi dentro ou fora', () => {
    expect(nivelDoPrazo(90, true, true)).toBe('ENCERRADO_NO_PRAZO');
    expect(nivelDoPrazo(91, true, true)).toBe('ENCERRADO_FORA_DO_PRAZO');
  });
});

describe('datas', () => {
  it('dias corridos e soma, atravessando mes e ano', () => {
    expect(diasEntre('2026-10-01', '2026-10-31')).toBe(30);
    expect(diasEntre('2026-12-20', '2027-01-10')).toBe(21);
    expect(somarDias('2026-10-17', 90)).toBe('2027-01-15');
    expect(somarDias('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('calcularPrazo', () => {
  it('o inicio e o MAIS TARDE entre aviso e documentacao completa', () => {
    const p = calcularPrazo({ aviso: '2026-09-01', documentacaoCompleta: '2026-09-10', hoje: '2026-10-20' });
    expect(p.inicio).toBe('2026-09-10');
    expect(p.limite).toBe('2026-12-09');
    expect(p.dias).toBe(40);
    expect(p.restantes).toBe(50);
    expect(p.diasDesdeAviso).toBe(49);
    expect(p.nivel).toBe('AVISO');
  });
  it('documentacao entregue antes do aviso conta do aviso', () => {
    const p = calcularPrazo({ aviso: '2026-09-10', documentacaoCompleta: '2026-09-05', hoje: '2026-09-10' });
    expect(p.inicio).toBe('2026-09-10');
    expect(p.dias).toBe(0);
  });
  it('sem documentacao: sem inicio, sem limite', () => {
    const p = calcularPrazo({ aviso: '2026-09-01', documentacaoCompleta: null, hoje: '2026-10-01' });
    expect(p).toMatchObject({ inicio: null, limite: null, dias: null, restantes: null, nivel: 'DOCUMENTACAO_PENDENTE' });
    expect(p.diasDesdeAviso).toBe(30);
  });
  it('encerrado congela o relogio no dia do encerramento', () => {
    const p = calcularPrazo({
      aviso: '2026-01-01', documentacaoCompleta: '2026-01-01', encerradoEm: '2026-03-01', hoje: '2026-10-01',
    });
    expect(p.dias).toBe(59);
    expect(p.restantes).toBeNull();
    expect(p.nivel).toBe('ENCERRADO_NO_PRAZO');
  });
  it('vencido: restantes negativos', () => {
    const p = calcularPrazo({ aviso: '2026-01-01', documentacaoCompleta: '2026-01-01', hoje: '2026-04-11' });
    expect(p.dias).toBe(100);
    expect(p.restantes).toBe(-10);
    expect(p.nivel).toBe('VENCIDO');
  });
});

describe('apresentacao', () => {
  it('barra', () => {
    expect(fracaoDoPrazo(null)).toBe(0);
    expect(fracaoDoPrazo(45)).toBe(0.5);
    expect(fracaoDoPrazo(120)).toBe(1);
  });
  it('rotulo do marco', () => {
    expect(rotuloMarco(30)).toBe('30 dias');
    expect(rotuloMarco(91)).toBe('Vencido');
  });
  it('texto', () => {
    const base = { dias_desde_aviso: 12 };
    expect(textoDoPrazo({ ...base, nivel: 'DOCUMENTACAO_PENDENTE', dias_transcorridos: null, dias_restantes: null }))
      .toBe('Aguardando documentação · 12 dia(s) desde o aviso');
    expect(textoDoPrazo({ ...base, nivel: 'AVISO', dias_transcorridos: 40, dias_restantes: 50 })).toBe('40 de 90 dias · faltam 50');
    expect(textoDoPrazo({ ...base, nivel: 'CRITICO', dias_transcorridos: 90, dias_restantes: 0 })).toBe('90 de 90 dias · vence HOJE');
    expect(textoDoPrazo({ ...base, nivel: 'VENCIDO', dias_transcorridos: 100, dias_restantes: -10 }))
      .toBe('100 dias · vencido há 10 dia(s)');
    expect(textoDoPrazo({ ...base, nivel: 'ENCERRADO_NO_PRAZO', dias_transcorridos: 20, dias_restantes: null }))
      .toBe('Encerrado com 20 de 90 dias');
  });
  it('contagem por nivel', () => {
    const c = contarPorNivel([{ nivel: 'VENCIDO' }, { nivel: 'VENCIDO' }, { nivel: 'AVISO' }, { nivel: 'XYZ' }]);
    expect(c.VENCIDO).toBe(2);
    expect(c.AVISO).toBe(1);
    expect(c.NO_PRAZO).toBe(0);
  });
});

describe('e-mail da rotina', () => {
  const a = (evento: string, marco: number, limite = '2026-12-01') => ({
    alerta_id: `${evento}-${marco}`, evento_id: evento, numero_protocolo: `EVT-${evento}`, marco,
    nivel: ({ 30: 'AVISO', 60: 'ATENCAO', 75: 'URGENCIA', 85: 'CRITICO', 91: 'VENCIDO' } as Record<number, string>)[marco],
    dias: marco,
    limite_prazo: limite, regional_id: null, regional_nome: null, placa: 'ABC1D23', cliente_nome: 'FULANO',
  });
  it('so 85 e vencido, um por evento (o maior)', () => {
    const r = alertasParaEmail([a('1', 30), a('1', 60), a('1', 85), a('1', 91), a('2', 75), a('3', 85)]);
    expect(r.map((x) => `${x.evento_id}:${x.marco}`)).toEqual(['1:91', '3:85']);
  });
  it('assunto e linha', () => {
    expect(assuntoEmailPrazos([a('1', 91), a('3', 85)])).toBe('Prazo regulatório de eventos (Art. 22): 1 vencido(s) e 1 critico(s)');
    expect(linhaDoAlerta(a('1', 91, '2026-12-01'))).toBe('EVT-1 · ABC1D23 · FULANO · Matriz · VENCIDO · limite 01/12/2026');
  });
});

describe('marcos configuraveis (0114)', () => {
  const m = { aviso: 20, atencao: 50, urgencia: 70, critico: 80 };
  it('o nivel segue os marcos', () => {
    expect(nivelDoPrazo(55, true, false, m)).toBe('ATENCAO');
    expect(nivelDoPrazo(55, true, false)).toBe('AVISO');
    expect(nivelDoPrazo(80, true, false, m)).toBe('CRITICO');
    expect(nivelDoPrazo(91, true, false, m)).toBe('VENCIDO');
    expect(calcularPrazo({ aviso: '2026-01-01', documentacaoCompleta: '2026-01-01', hoje: '2026-02-20', marcos: m }).nivel).toBe('ATENCAO');
  });
  it('validacao espelha o CHECK do banco', () => {
    expect(validarMarcos(MARCOS_PADRAO)).toBeNull();
    expect(validarMarcos(m)).toBeNull();
    expect(validarMarcos({ ...m, atencao: 20 })).toMatch(/crescentes/);
    expect(validarMarcos({ ...m, critico: 91 })).toMatch(/90/);
    expect(validarMarcos({ ...m, aviso: 0 })).toMatch(/1 dia/);
  });
  it('descricao com os numeros em vigor', () => {
    expect(descricaoDoNivel('ATENCAO', m)).toBe('Meio do caminho: passou de 50 dias.');
    expect(descricaoDoNivel('VENCIDO', m)).toMatch(/90 dias/);
  });
});
