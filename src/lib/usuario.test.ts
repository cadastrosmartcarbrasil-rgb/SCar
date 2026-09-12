import { describe, it, expect } from 'vitest';
import {
  rotuloPapel,
  exigeUnidade,
  validarFichaUsuario,
  situacaoUsuario,
  tempoDeCasa,
  avisoDeDesativacao,
  podeTratarEvento,
  PAPEIS_USUARIO,
} from './usuario';

const BASE = { nome: 'MARIA SILVA', email: 'maria@smartcar.com.br', papel: 'financeiro' };

describe('rotuloPapel / exigeUnidade', () => {
  it('traduz o papel e devolve o proprio valor quando nao conhece', () => {
    expect(rotuloPapel('auditoria')).toBe('Auditoria');
    expect(rotuloPapel('papel_futuro')).toBe('papel_futuro');
  });

  it('so o gestor regional exige unidade', () => {
    // Sem unidade, `escopo_regional()` nao resolve e o /regional mostra
    // "Unidade nao vinculada" — o cadastro nasce quebrado.
    expect(exigeUnidade('gestor_regional')).toBe(true);
    expect(exigeUnidade('admin')).toBe(false);
    expect(exigeUnidade('consultor_vendas')).toBe(false);
  });
});

describe('validarFichaUsuario', () => {
  it('ficha completa passa', () => {
    expect(validarFichaUsuario(BASE)).toEqual([]);
  });

  it('cobra nome e e-mail', () => {
    expect(validarFichaUsuario({ ...BASE, nome: '  ' })).toContain('Informe o nome completo.');
    expect(validarFichaUsuario({ ...BASE, email: '' })).toContain('Informe o e-mail.');
    expect(validarFichaUsuario({ ...BASE, email: 'maria@' })).toContain('E-mail invalido.');
  });

  it('CPF e opcional, mas quando informado tem de ser valido', () => {
    // Espelha `chk_usuario_documento_valido` (0068) — a mesma recusa no banco.
    expect(validarFichaUsuario({ ...BASE, documento: '' })).toEqual([]);
    expect(validarFichaUsuario({ ...BASE, documento: '529.982.247-25' })).toEqual([]);
    expect(validarFichaUsuario({ ...BASE, documento: '111.111.111-11' })).toContain('CPF invalido.');
  });

  it('desligamento nao pode ser antes do inicio', () => {
    const erros = validarFichaUsuario({
      ...BASE, data_inicio: '2024-03-01', data_desligamento: '2024-01-01',
    });
    expect(erros).toContain('A data de desligamento nao pode ser anterior a de inicio.');
  });

  it('mesma data de inicio e desligamento e valida (entrou e saiu no mesmo dia)', () => {
    expect(validarFichaUsuario({ ...BASE, data_inicio: '2024-03-01', data_desligamento: '2024-03-01' }))
      .toEqual([]);
  });

  it('gestor regional sem unidade e recusado', () => {
    const erros = validarFichaUsuario({ ...BASE, papel: 'gestor_regional', regional_id: null });
    expect(erros.join(' ')).toContain('Gestor Regional precisa de uma unidade');
    expect(validarFichaUsuario({ ...BASE, papel: 'gestor_regional', regional_id: 'r1' })).toEqual([]);
  });
});

describe('situacaoUsuario', () => {
  it('mostra desde quando o acesso caiu', () => {
    expect(situacaoUsuario({ ativo: true })).toBe('Ativo');
    expect(situacaoUsuario({ ativo: false, data_desligamento: '2026-09-09' }))
      .toBe('Desativado em 09/09/2026');
    expect(situacaoUsuario({ ativo: false, data_desligamento: null })).toBe('Desativado');
  });
});

describe('tempoDeCasa', () => {
  const hoje = new Date('2026-09-09T12:00:00');

  it('conta anos e meses', () => {
    expect(tempoDeCasa('2024-03-01', hoje)).toBe('2 anos e 6 meses');
    expect(tempoDeCasa('2025-09-09', hoje)).toBe('1 ano');
    expect(tempoDeCasa('2026-06-09', hoje)).toBe('3 meses');
  });

  it('nao conta o mes que ainda nao fechou', () => {
    // Entrou dia 20; em 09/09 o mes corrente ainda nao completou.
    expect(tempoDeCasa('2026-08-20', hoje)).toBe('menos de 1 mes');
  });

  it('sem data, data futura ou data invalida devolve null', () => {
    expect(tempoDeCasa(null, hoje)).toBeNull();
    expect(tempoDeCasa('2027-01-01', hoje)).toBeNull();
    expect(tempoDeCasa('nao-e-data', hoje)).toBeNull();
  });
});

describe('avisoDeDesativacao', () => {
  it('diz que o acesso cai e que o historico fica', () => {
    const t = avisoDeDesativacao({ nome: 'JOAO' });
    expect(t).toContain('O acesso e cortado na hora');
    expect(t).toContain('historico do que ja fez continua intacto');
  });

  it('avisa quando a pessoa responde por unidade', () => {
    // Desativar sem trocar o responsavel deixa a unidade sem dono.
    expect(avisoDeDesativacao({ nome: 'ANA', responsavel_por: 2 })).toContain('responde por 2 unidades');
    expect(avisoDeDesativacao({ nome: 'ANA', responsavel_por: 1 })).toContain('responde por 1 unidade');
    expect(avisoDeDesativacao({ nome: 'ANA', responsavel_por: 0 })).not.toContain('responde por');
  });

  it('avisa que o portal do vendedor cai junto', () => {
    expect(avisoDeDesativacao({ nome: 'ANA', vendedor_ativo: true })).toContain('portal do vendedor cai junto');
    expect(avisoDeDesativacao({ nome: 'ANA', vendedor_ativo: false })).not.toContain('portal do vendedor');
  });
});

describe('podeTratarEvento (espelho de pode_tratar_evento, 0077)', () => {
  it('o time de sinistro trata, e e a razao de ser do papel', () => {
    expect(podeTratarEvento('sinistro')).toBe(true);
  });

  it('gestao trata: gestor responde pela unidade, admin/financeiro sao globais', () => {
    expect(podeTratarEvento('gestor_regional')).toBe(true);
    expect(podeTratarEvento('admin')).toBe(true);
    expect(podeTratarEvento('financeiro')).toBe(true);
  });

  it('atendente comum ABRE e VE o evento, mas nao muda a fase dele', () => {
    expect(podeTratarEvento('consultor_vendas')).toBe(false);
  });

  it('auditoria autoriza a entrada na base, nao trata sinistro', () => {
    expect(podeTratarEvento('auditoria')).toBe(false);
  });

  it('guincho nao e sinistro', () => {
    expect(podeTratarEvento('assistencia_24h')).toBe(false);
  });

  it('sem papel nao trata', () => {
    expect(podeTratarEvento(null)).toBe(false);
    expect(podeTratarEvento(undefined)).toBe(false);
  });
});

describe('cotador aposentado (0077)', () => {
  it('saiu da lista que a tela oferece', () => {
    // O proprio TS ja recusa `p.valor === 'cotador'` (o valor saiu da union), o
    // que e a trava em tempo de compilacao. Aqui a assercao e em runtime, para
    // o dia em que alguem devolver o valor ao tipo sem querer.
    const valores: string[] = PAPEIS_USUARIO.map((p) => p.valor);
    expect(valores).not.toContain('cotador');
    expect(valores).toContain('consultor_vendas');
  });

  it('o rotulo cai no valor CRU, nunca num papel plausivel', () => {
    // Regra da casa: fallback de rotulo mostra o valor, nao escolhe um vizinho.
    expect(rotuloPapel('cotador')).toBe('cotador');
  });
});
