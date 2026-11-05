import { describe, expect, it } from 'vitest';
import { problemasDaEntrega, resumoTermosEntrega } from './termo-entrega';

describe('termo de entrega', () => {
  it('parcial exige descricao e terceiro exige escolha', () => {
    expect(problemasDaEntrega({ recebedor_tipo: 'ASSOCIADO', abrangencia: 'TOTAL', data_entrega: '2026-11-05' })).toEqual([]);
    const p = problemasDaEntrega({ recebedor_tipo: 'TERCEIRO', abrangencia: 'PARCIAL', data_entrega: null });
    expect(p).toHaveLength(3);
  });
  it('entrega antes da ocorrencia', () => {
    expect(problemasDaEntrega({ recebedor_tipo: 'ASSOCIADO', abrangencia: 'TOTAL', data_entrega: '2026-10-01' }, '2026-10-10'))
      .toEqual(['A entrega não pode ser antes da ocorrência do evento.']);
  });
  it('resumo ignora cancelados', () => {
    expect(resumoTermosEntrega([
      { situacao: 'ASSINADO', abrangencia: 'PARCIAL' },
      { situacao: 'AGUARDANDO_ASSINATURA', abrangencia: 'TOTAL' },
      { situacao: 'CANCELADO', abrangencia: 'TOTAL' },
    ])).toEqual({ total: 2, aguardando: 1, assinados: 1, temTotal: true });
  });
});
