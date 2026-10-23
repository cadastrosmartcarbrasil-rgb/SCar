import { describe, expect, it } from 'vitest';
import {
  mensagemDoCarne, resumoDoCarne, validarMesesCarne, vencimentoPadraoAdesao, vencimentosDoCarne,
  type BoletoDoCarne,
} from './carne';

describe('vencimentosDoCarne (espelho de gerar_carne_veiculo)', () => {
  it('pula o vencimento do mes que ja passou', () => {
    const v = vencimentosDoCarne({ ativacao: '2026-10-23', dia: 10, hoje: '2026-10-23', meses: 3 });
    expect(v.map((x) => x.vencimento)).toEqual(['2026-11-10', '2026-12-10', '2027-01-10']);
  });
  it('usa o mes da ativacao quando o vencimento ainda vem', () => {
    const v = vencimentosDoCarne({ ativacao: '2026-10-05', dia: 20, hoje: '2026-10-05', meses: 2 });
    expect(v[0]).toEqual({ competencia: '2026-10-01', vencimento: '2026-10-20' });
  });
  it('exige 2 dias de folga', () => {
    const v = vencimentosDoCarne({ ativacao: '2026-10-19', dia: 20, hoje: '2026-10-19', meses: 1 });
    expect(v[0].vencimento).toBe('2026-11-20');
    const w = vencimentosDoCarne({ ativacao: '2026-10-18', dia: 20, hoje: '2026-10-18', meses: 1 });
    expect(w[0].vencimento).toBe('2026-10-20');
  });
  it('dia 31 cai no ultimo dia; sem dia, dia 10 do mes seguinte', () => {
    const v = vencimentosDoCarne({ ativacao: '2027-02-01', dia: 31, hoje: '2027-02-01', meses: 2 });
    expect(v.map((x) => x.vencimento)).toEqual(['2027-02-28', '2027-03-31']);
    const s = vencimentosDoCarne({ ativacao: '2026-10-23', dia: null, hoje: '2026-10-23', meses: 1 });
    expect(s[0].vencimento).toBe('2026-11-10');
  });
  it('vira o ano', () => {
    const v = vencimentosDoCarne({ ativacao: '2026-12-20', dia: 5, hoje: '2026-12-20', meses: 2 });
    expect(v.map((x) => x.vencimento)).toEqual(['2027-01-05', '2027-02-05']);
  });
});

describe('validacoes', () => {
  it('meses de 0 a 12 (0 = so a adesao)', () => {
    expect(validarMesesCarne(6)).toBeNull();
    expect(validarMesesCarne(0)).toBeNull();
    expect(validarMesesCarne(-1)).not.toBeNull();
    expect(validarMesesCarne(13)).not.toBeNull();
    expect(validarMesesCarne(2.5)).not.toBeNull();
  });
  it('adesao vence em hoje + 3', () => {
    expect(vencimentoPadraoAdesao('2026-10-30')).toBe('2026-11-02');
  });
});

const b = (p: Partial<BoletoDoCarne>): BoletoDoCarne => ({
  titulo_id: 'x', vencimento: '2026-11-10', valor: 100, adesao: false,
  linha_digitavel: '7489', pix_copia_cola: null, erro: null, ...p,
});

describe('resumo e mensagem', () => {
  const lista = [
    b({ titulo_id: '2', vencimento: '2026-12-10' }),
    b({ titulo_id: '1', vencimento: '2026-11-10' }),
    b({ titulo_id: 'a', vencimento: '2026-10-26', valor: 400, adesao: true }),
    b({ titulo_id: '3', vencimento: '2027-01-10', linha_digitavel: null, erro: 'recusado' }),
  ];
  it('resume', () => {
    const r = resumoDoCarne(lista);
    expect(r).toMatchObject({ mensalidades: 3, primeiro: '2026-11-10', ultimo: '2027-01-10', total: 700, registrados: 3, comErro: 1 });
    expect(r.adesao?.valor).toBe(400);
  });
  it('mensagem com adesao primeiro e so os registrados', () => {
    const m = mensagemDoCarne('MARIA SOUZA', 'ABC1D23', lista);
    expect(m).toContain('Olá, MARIA');
    expect(m.indexOf('Adesão')).toBeLessThan(m.indexOf('Mensalidade'));
    expect(m.match(/Mensalidade/g)?.length).toBe(2);
  });
});
