import { describe, it, expect } from 'vitest';
import {
  interpretarPlanilhaRastreadora, conferirPlanilha, valorAQuestionar, chassiUtil, type VeiculoBase,
} from './rastreadora-planilha';

// formato real da fatura da MULTITRAC / TOTAL TRAC (outubro/2026)
const MATRIZ = [
  [' ', ' ', ' '],
  ['Placa', 'Chassi', 'Frota', 'Dias Prorata', 'Data Instalação Contrato', 'Data Retirada Contrato', 'Serviço mensal', 'Cliente', 'Filial'],
  ['BNR0712', ' ', ' ', '30', '22/10/2022', ' ', '24.9', 'ASSOCIACAO', '3 MULTITRAC'],
  ['CCU0F80', '9C2KC2200LR019536', ' ', '30', '13/06/2023', ' ', '24.9', 'ASSOCIACAO', '3 MULTITRAC'],
  ['EIJ4H24', '*****24132', ' ', '30', '01/01/2024', ' ', '24.9', 'ASSOCIACAO', '3 MULTITRAC'],
  ['FUH0F37', '', '', '30', '', '', '24,90', '', ''],
  ['GGA7E19', '', '', '30', '', '', '24.9', '', ''],
  ['XYZ9A99', '', '', '30', '', '02/10/2026', '24.9', '', ''],
  ['CCU0F80', '', '', '30', '', '', '24.9', '', ''],
  ['Total do Cliente', '', '', '', '', '', '1817.7', '', ''],
  ['TOTAL GERAL', '', '', '', '', '', '1817.7', '', ''],
];

const R = 'multitrac';
const v = (o: Partial<VeiculoBase>): VeiculoBase => ({
  id: o.placa ?? 'x', placa: null, chassi: null, status: 'ativo', regional: 'SP1', associado: 'A',
  empresa_rastreamento_id: null, parque_rastreadora_id: null, parque_rastreadora_nome: null, ...o,
});

describe('planilha da rastreadora', () => {
  it('le o cabecalho certo, ignora totais e repetidos', () => {
    const r = interpretarPlanilhaRastreadora(MATRIZ);
    expect(r.erros).toEqual([]);
    expect(r.linhas.map((l) => l.placa)).toEqual(['BNR0712', 'CCU0F80', 'EIJ4H24', 'FUH0F37', 'GGA7E19', 'XYZ9A99']);
    expect(r.linhas[0]).toMatchObject({ linha: 3, valor: 24.9, chassi: null, instalado_em: '22/10/2022' });
    expect(r.linhas[3].valor).toBe(24.9);
    expect(r.avisos.some((a) => a.includes('repetida'))).toBe(true);
  });

  it('casa a placa antiga da planilha com a Mercosul do SCar (e o contrario)', () => {
    const linhas = interpretarPlanilhaRastreadora([['Placa'], ['BNR0712'], ['QOW9I02']]).linhas;
    const c = conferirPlanilha(linhas, [v({ id: 'a', placa: 'BNR0H12' }), v({ id: 'b', placa: 'QOW9802' })], R);
    expect(c.itens.map((i) => [i.placa, i.situacao, i.veiculo?.id])).toEqual([
      ['BNR0712', 'VINCULAR', 'a'], ['QOW9I02', 'VINCULAR', 'b'],
    ]);
  });

  it('a mesma placa nos dois formatos na planilha conta uma vez', () => {
    const r = interpretarPlanilhaRastreadora([['Placa'], ['BNR0712'], ['BNR0H12']]);
    expect(r.linhas).toHaveLength(1);
    expect(r.avisos[0]).toContain('repetida');
  });

  it('chassi mascarado nao serve', () => {
    expect(chassiUtil('*****24132')).toBeNull();
    expect(chassiUtil('9c2kc2200lr019536')).toBe('9C2KC2200LR019536');
  });

  it('sem coluna Placa e erro', () => {
    expect(interpretarPlanilhaRastreadora([['a', 'b']]).erros.length).toBe(1);
  });

  it('classifica cada linha e soma o que questionar', () => {
    const { linhas } = interpretarPlanilhaRastreadora(MATRIZ);
    const base = [
      v({ id: 'ccu', placa: 'OUTRA01', chassi: '9C2KC2200LR019536' }), // casa pelo chassi
      v({ id: 'eij', placa: 'EIJ4H24', empresa_rastreamento_id: R }),
      v({ id: 'fuh', placa: 'FUH0F37', parque_rastreadora_id: 'nt', parque_rastreadora_nome: 'NEW TRACKER' }),
      v({ id: 'gga', placa: 'GGA7E19', status: 'inativo' }),
    ];
    const vinc = [v({ id: 'eij', placa: 'EIJ4H24', empresa_rastreamento_id: R }), v({ id: 'zzz', placa: 'ZZZ1A11', empresa_rastreamento_id: R })];
    const c = conferirPlanilha(linhas, base, R, vinc);
    const sit = Object.fromEntries(c.itens.map((i) => [i.placa, i.situacao]));
    expect(sit).toEqual({
      BNR0712: 'NAO_ENCONTRADO', CCU0F80: 'VINCULAR', EIJ4H24: 'JA_VINCULADO',
      FUH0F37: 'OUTRA_RASTREADORA', GGA7E19: 'FORA_DA_BASE', XYZ9A99: 'RETIRADO',
    });
    expect(c.itens.find((i) => i.placa === 'CCU0F80')?.casou_por).toBe('CHASSI');
    expect(c.fora_da_fatura.map((x) => x.id)).toEqual(['zzz']);
    expect(c.total).toEqual({ qtd: 6, valor: 149.4 });
    expect(valorAQuestionar(c)).toEqual({ qtd: 3, valor: 74.7 });
  });
});
