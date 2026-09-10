import { describe, it, expect } from 'vitest';
import {
  DIAS_TOLERANCIA_PADRAO, STATUS_FATURAVEIS, STATUS_BLOQUEADOS,
  bloqueiaBeneficios, diasNoStatus, tolerancia, avisoDeTolerancia,
} from './inadimplencia';

const emDias = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

describe('inadimplencia do veiculo (0072)', () => {
  it('INADIMPLENTE CONTINUA FATURAVEL — quem encerra a cobranca e o INATIVO', () => {
    // Se este teste virar vermelho porque alguem tirou 'inadimplente' da lista,
    // leia a nota do topo da 0072: a carteira inadimplente pararia de ser
    // cobrada em silencio no dia em que o CRON entrasse.
    expect(STATUS_FATURAVEIS).toContain('inadimplente');
    expect(STATUS_FATURAVEIS).not.toContain('inativo');
    expect(STATUS_FATURAVEIS).not.toContain('suspenso');
  });

  it('inadimplente bloqueia os beneficios, como o suspenso', () => {
    expect(STATUS_BLOQUEADOS).toContain('inadimplente');
    expect(bloqueiaBeneficios('inadimplente')).toBe(true);
    expect(bloqueiaBeneficios('ativo')).toBe(false);
  });

  it('conta os dias no status; sem relogio nao inventa prazo', () => {
    expect(diasNoStatus(emDias(12))).toBe(12);
    expect(diasNoStatus(null)).toBe(0);
    expect(diasNoStatus('nao e data')).toBe(0);
  });

  it('a contagem regressiva usa o parametro, nao um numero fixo', () => {
    const v = { status: 'inadimplente' as const, status_desde: emDias(12) };
    expect(tolerancia(v).diasRestantes).toBe(8);        // padrao 20
    expect(tolerancia(v, 30).diasRestantes).toBe(18);
    expect(DIAS_TOLERANCIA_PADRAO).toBe(20);
  });

  it('no 20o dia a tolerancia vence — e o gatilho do CRON', () => {
    expect(tolerancia({ status: 'inadimplente', status_desde: emDias(19) }).vencida).toBe(false);
    expect(tolerancia({ status: 'inadimplente', status_desde: emDias(20) }).vencida).toBe(true);
    expect(tolerancia({ status: 'inadimplente', status_desde: emDias(45) }).vencida).toBe(true);
  });

  it('nunca mostra dias negativos', () => {
    expect(tolerancia({ status: 'inadimplente', status_desde: emDias(45) }).diasRestantes).toBe(0);
  });

  it('quem nao esta inadimplente nao tem prazo correndo', () => {
    const t = tolerancia({ status: 'ativo', status_desde: emDias(400) });
    expect(t.inadimplente).toBe(false);
    expect(t.diasRestantes).toBeNull();
    expect(t.vencida).toBe(false);
    expect(avisoDeTolerancia(t)).toBeNull();
  });

  it('tolerancia zero inativa na primeira passagem', () => {
    expect(tolerancia({ status: 'inadimplente', status_desde: emDias(0) }, 0).vencida).toBe(true);
  });

  it('o aviso fala em dias RESTANTES, nao em dias corridos', () => {
    expect(avisoDeTolerancia(tolerancia({ status: 'inadimplente', status_desde: emDias(12) })))
      .toBe('Inativa em 8 dias');
    expect(avisoDeTolerancia(tolerancia({ status: 'inadimplente', status_desde: emDias(19) })))
      .toBe('Inativa amanha');
    expect(avisoDeTolerancia(tolerancia({ status: 'inadimplente', status_desde: emDias(30) })))
      .toBe('Tolerancia vencida — sera inativado');
  });
});
