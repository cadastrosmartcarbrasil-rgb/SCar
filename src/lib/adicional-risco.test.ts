import { describe, it, expect } from 'vitest';
import {
  mensalidadeComAdicional,
  adicionalVigente,
  temAdicional,
  resumoDaGrade,
  avisoDeReajuste,
  textoDaDivergencia,
  type AdicionalRegional,
} from './adicional-risco';

const linha = (over: Partial<AdicionalRegional> = {}): AdicionalRegional => ({
  regional_id: 'r1',
  regional_nome: 'Sao Paulo',
  regional_ativa: true,
  adicional_id: 'a1',
  valor: 5,
  justificativa: null,
  vigencia_inicio: '2026-01-01',
  vigencia_fim: null,
  veiculos: 0,
  ...over,
});

describe('mensalidadeComAdicional — UMA vez, nunca por produto', () => {
  it('+R$ 5,00 sobre uma faixa de 2 produtos soma exatamente 5,00', () => {
    // A faixa custa 120 (dois produtos: 90 + 30). Somar dentro do laco daria 130.
    expect(mensalidadeComAdicional(120, 5)).toBe(125);
  });

  it('vale igual na faixa mais cara — uma linha cobre a tabela inteira', () => {
    expect(mensalidadeComAdicional(860.4, 5)).toBe(865.4);
  });

  it('sem adicional, o valor e o da matriz, intacto (regressao)', () => {
    expect(mensalidadeComAdicional(120, 0)).toBe(120);
  });

  it('nao acumula erro de ponto flutuante', () => {
    expect(mensalidadeComAdicional(0.1, 0.2)).toBe(0.3);
  });
});

describe('adicionalVigente', () => {
  it('linha que so comeca no futuro NAO afeta hoje', () => {
    expect(adicionalVigente([linha({ vigencia_inicio: '2099-01-01' })], '2026-09-20')).toBe(0);
  });

  it('linha encerrada nao vale mais', () => {
    expect(
      adicionalVigente([linha({ vigencia_fim: '2026-09-01' })], '2026-09-20'),
    ).toBe(0);
  });

  it('a vigencia e meio-aberta: o dia do fim ja NAO vale', () => {
    // Igual ao daterange '[)' da constraint no banco. Fechada aqui mostraria um
    // dia a mais do que o banco cobra.
    expect(adicionalVigente([linha({ vigencia_fim: '2026-09-20' })], '2026-09-20')).toBe(0);
    expect(adicionalVigente([linha({ vigencia_fim: '2026-09-21' })], '2026-09-20')).toBe(5);
  });

  it('sem linha nenhuma devolve 0, nunca null', () => {
    expect(adicionalVigente([], '2026-09-20')).toBe(0);
  });
});

describe('temAdicional — "sem adicional" nao e "R$ 0,00"', () => {
  it('distingue null de zero', () => {
    expect(temAdicional({ valor: null })).toBe(false);
    expect(temAdicional({ valor: 0 })).toBe(false);
    expect(temAdicional({ valor: 5 })).toBe(true);
  });
});

describe('resumoDaGrade', () => {
  it('conta quem cobra, o maior salto e os veiculos afetados', () => {
    const r = resumoDaGrade([
      linha({ valor: 5, veiculos: 10 }),
      linha({ regional_nome: 'Natal', valor: 12, veiculos: 3 }),
      linha({ regional_nome: 'Cuiaba', valor: null, adicional_id: null, veiculos: 99 }),
    ]);
    expect(r).toEqual({ comAdicional: 2, total: 3, maior: 12, veiculosAfetados: 13 });
  });
});

describe('avisoDeReajuste — o cadastro NAO retroage', () => {
  it('avisa quantos veiculos ficam com o adicional da entrada', () => {
    expect(avisoDeReajuste(linha({ valor: 5, veiculos: 40 }), 12)).toContain('40 veiculo(s)');
    expect(avisoDeReajuste(linha({ valor: 5, veiculos: 40 }), 12)).toContain('venda nova');
  });

  it('sem carteira, fala so do futuro', () => {
    expect(avisoDeReajuste(linha({ valor: 5, veiculos: 0 }), 12)).toContain('proximas vendas');
  });

  it('retirar o adicional devolve a unidade ao preco da matriz', () => {
    expect(avisoDeReajuste(linha({ valor: 5, veiculos: 0 }), null)).toContain('preco da matriz');
  });

  it('valor igual nao gera aviso', () => {
    expect(avisoDeReajuste(linha({ valor: 5 }), 5)).toBeNull();
  });
});

describe('textoDaDivergencia', () => {
  it('nomeia as duas unidades e diz qual manda', () => {
    const t = textoDaDivergencia('Sao Paulo', 'Natal');
    expect(t).toContain('Sao Paulo');
    expect(t).toContain('Natal');
    expect(t).toContain('preco segue o do associado');
  });

  it('mesma unidade dos dois lados nao e divergencia', () => {
    expect(textoDaDivergencia('Natal', 'Natal')).toBeNull();
    expect(textoDaDivergencia(null, 'Natal')).toBeNull();
  });
});
