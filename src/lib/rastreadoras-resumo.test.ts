import { describe, it, expect } from 'vitest';
import { resumoPorRastreadora, type VeiculoDaRastreadora } from './rastreadoras-resumo';

const v = (o: Partial<VeiculoDaRastreadora>): VeiculoDaRastreadora => ({
  id: 'x', placa: 'AAA1A11', status: 'ativo', empresa_rastreamento_id: 'nt', rastreador_imei: null,
  regional: 'SP1', associado: 'A', ...o,
});

describe('resumo por rastreadora', () => {
  it('conta ficha, base, parque e custo por rastreadora', () => {
    const r = resumoPorRastreadora(
      [
        { id: 'nt', nome: 'NEW TRACKER', custo_mensal_equipamento: 10.9 },
        { id: 'tt', nome: 'TOTAL TRAC', custo_mensal_equipamento: 24.9 },
        { id: 'zz', nome: 'SEM NADA', custo_mensal_equipamento: 0 },
      ],
      [
        v({ id: 'a', regional: 'MATRIZ' }), v({ id: 'b', regional: 'MATRIZ' }),
        v({ id: 'c', status: 'inativo' }),
        v({ id: 'd', empresa_rastreamento_id: 'tt' }), v({ id: 'e', empresa_rastreamento_id: 'tt', regional: null }),
      ],
      [
        { empresa_rastreamento_id: 'nt', status: 'ATIVO', veiculo_id: 'a' },
        { empresa_rastreamento_id: 'nt', status: 'INADIMPLENTE', veiculo_id: 'b' },
        { empresa_rastreamento_id: 'nt', status: 'INATIVO', veiculo_id: 'c' },
      ],
    );
    expect(r.map((x) => x.nome)).toEqual(['NEW TRACKER', 'TOTAL TRAC']); // sem nada some
    const [nt, tt] = r;
    expect(nt).toMatchObject({
      veiculos: 3, naBase: 2, foraDaBase: 1, semParque: 0,
      parqueAtivo: 1, parqueInadimplente: 1, parqueInativo: 1, parqueTotal: 3, custoEstimado: 21.8,
    });
    expect(nt.porUnidade).toEqual([{ unidade: 'MATRIZ', veiculos: 2 }]);
    expect(tt).toMatchObject({ veiculos: 2, naBase: 2, semParque: 2, parqueTotal: 0, custoEstimado: 49.8 });
    expect(tt.porUnidade).toEqual([{ unidade: 'Matriz', veiculos: 1 }, { unidade: 'SP1', veiculos: 1 }]);
  });

  it('sem custo cadastrado não inventa valor', () => {
    const [r] = resumoPorRastreadora([{ id: 'nt', nome: 'NT', custo_mensal_equipamento: null }], [v({})], []);
    expect(r.custoEstimado).toBeNull();
  });
});
