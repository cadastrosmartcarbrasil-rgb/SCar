import { describe, it, expect } from 'vitest';
import { decidirUnidade, temAcessoGlobal, localDaUnidade } from './unidade';

const UNIDADES = ['u-cuiaba', 'u-natal'];

describe('quem escolhe unidade', () => {
  it('admin e financeiro enxergam todas', () => {
    expect(temAcessoGlobal('admin')).toBe(true);
    expect(temAcessoGlobal('financeiro')).toBe(true);
    expect(temAcessoGlobal('gestor_regional')).toBe(false);
  });

  it('a matriz sem escolha cai na tela de selecao', () => {
    expect(decidirUnidade({ papel: 'admin', regional_id: null }, null, UNIDADES))
      .toEqual({ modo: 'ESCOLHER' });
  });

  it('a matriz com unidade escolhida entra nela', () => {
    expect(decidirUnidade({ papel: 'admin', regional_id: null }, 'u-natal', UNIDADES))
      .toEqual({ modo: 'ESCOLHIDA', regionalId: 'u-natal' });
  });

  it('unidade que nao existe mais volta para a selecao', () => {
    expect(decidirUnidade({ papel: 'admin', regional_id: null }, 'u-apagada', UNIDADES))
      .toEqual({ modo: 'ESCOLHER' });
  });

  it('o gestor entra SEMPRE na propria unidade, mesmo com cookie de outra', () => {
    expect(decidirUnidade({ papel: 'gestor_regional', regional_id: 'u-cuiaba' }, 'u-natal', UNIDADES))
      .toEqual({ modo: 'PROPRIA', regionalId: 'u-cuiaba' });
  });

  it('gestor sem unidade no cadastro nao entra', () => {
    expect(decidirUnidade({ papel: 'gestor_regional', regional_id: null }, 'u-natal', UNIDADES))
      .toEqual({ modo: 'SEM_UNIDADE' });
  });
});

describe('rotulo do local', () => {
  it('monta cidade e UF', () => {
    expect(localDaUnidade({ cidade: 'Cuiaba', uf: 'mt' })).toBe('Cuiaba — MT');
  });
  it('aceita endereco incompleto ou ausente', () => {
    expect(localDaUnidade({ cidade: 'Natal' })).toBe('Natal');
    expect(localDaUnidade({ uf: 'SP' })).toBe('SP');
    expect(localDaUnidade(null)).toBe('');
    expect(localDaUnidade('nao e objeto')).toBe('');
  });
});
