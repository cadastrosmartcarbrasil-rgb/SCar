import { describe, expect, it } from 'vitest';
import {
  avulsosParaCotacao, progressoVistoria, proximaPose, separarOpcionais,
} from './vistoria';

const pose = (codigo: string, obrigatorio: boolean, ordem: number, enviada = false) =>
  ({ codigo, nome: codigo, instrucao: null, obrigatorio, ordem, enviada });

describe('progressoVistoria', () => {
  const poses = [
    pose('FRENTE', true, 1, true),
    pose('TRASEIRA', true, 2),
    pose('LATERAL_ESQUERDA', true, 3),
    pose('MOTOR', false, 7, true),
  ];

  it('conta so as obrigatorias no progresso', () => {
    const p = progressoVistoria(poses);
    expect(p.obrigatorias).toBe(3);
    expect(p.obrigatoriasFeitas).toBe(1);
    expect(p.totalFeitas).toBe(2);
    expect(p.percentual).toBe(33);
    expect(p.completa).toBe(false);
    expect(p.faltando).toEqual(['TRASEIRA', 'LATERAL_ESQUERDA']);
  });

  it('so fica completa com todas as obrigatorias', () => {
    const todas = poses.map((p) => ({ ...p, enviada: p.obrigatorio ? true : p.enviada }));
    expect(progressoVistoria(todas).completa).toBe(true);
    expect(progressoVistoria(todas).percentual).toBe(100);
  });

  it('opcional enviada nao completa a vistoria', () => {
    const so_opcional = [pose('FRENTE', true, 1), pose('MOTOR', false, 7, true)];
    expect(progressoVistoria(so_opcional).completa).toBe(false);
  });

  it('sem pose obrigatoria cadastrada nao aprova por omissao', () => {
    expect(progressoVistoria([pose('MOTOR', false, 7, true)]).completa).toBe(false);
  });
});

describe('proximaPose', () => {
  it('pede a obrigatoria pendente de menor ordem', () => {
    const poses = [pose('CHASSI', true, 5), pose('TRASEIRA', true, 2), pose('MOTOR', false, 7)];
    expect(proximaPose(poses)?.codigo).toBe('TRASEIRA');
  });

  it('so depois das obrigatorias sugere a opcional', () => {
    const poses = [pose('TRASEIRA', true, 2, true), pose('MOTOR', false, 7)];
    expect(proximaPose(poses)?.codigo).toBe('MOTOR');
  });

  it('tudo enviado nao pede mais nada', () => {
    expect(proximaPose([pose('TRASEIRA', true, 2, true)])).toBeNull();
  });
});

describe('itens do plano x avulsos', () => {
  const opcionais = [{ id: 'reserva' }, { id: 'vidros' }, { id: 'vip' }];

  it('separa o que ja vem no combo', () => {
    const r = separarOpcionais(opcionais, ['reserva']);
    expect(r.inclusos.map((p) => p.id)).toEqual(['reserva']);
    expect(r.avulsos.map((p) => p.id)).toEqual(['vidros', 'vip']);
  });

  it('sem plano, tudo e avulso', () => {
    expect(separarOpcionais(opcionais, []).avulsos).toHaveLength(3);
  });

  it('nao manda como avulso o que o plano ja carrega', () => {
    expect(avulsosParaCotacao(['reserva', 'vidros'], ['reserva'])).toEqual(['vidros']);
  });

  it('o que foi marcado antes de escolher o plano tambem e limpo', () => {
    expect(avulsosParaCotacao(new Set(['reserva']), ['reserva'])).toEqual([]);
  });
});
