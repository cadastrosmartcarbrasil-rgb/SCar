import { describe, it, expect } from 'vitest';
import {
  PERMISSOES, permissoesDoPapel, diferencaEntrePapeis, nivelEfetivo, concedida, mapaDeConcessoes,
} from './permissoes';
import { PAPEIS_USUARIO } from './usuario';

describe('PERMISSOES', () => {
  it('toda permissao tem nivel para todos os papeis vivos', () => {
    for (const p of PERMISSOES) {
      for (const papel of PAPEIS_USUARIO) expect(p.niveis[papel.valor]).toBeDefined();
    }
  });

  it('chaves unicas', () => {
    expect(new Set(PERMISSOES.map((p) => p.chave)).size).toBe(PERMISSOES.length);
  });

  it('so o admin entra em Configuracoes', () => {
    const c = PERMISSOES.find((p) => p.chave === 'configuracoes')!;
    expect(PAPEIS_USUARIO.filter((p) => c.niveis[p.valor] !== 'nao').map((p) => p.valor)).toEqual(['admin']);
  });

  it('sinistro trata evento e nao opera a 24h (0077)', () => {
    const chaves = permissoesDoPapel('sinistro').map((x) => x.permissao.chave);
    expect(chaves).toContain('evento');
    expect(chaves).not.toContain('assistencia');
  });

  it('consultor de vendas ve so os proprios leads', () => {
    const l = permissoesDoPapel('consultor_vendas').find((x) => x.permissao.chave === 'leads');
    expect(l?.nivel).toBe('proprio');
  });

  it('papel desconhecido nao ganha nada', () => {
    expect(permissoesDoPapel('cotador')).toEqual([]);
  });
});

describe('diferencaEntrePapeis', () => {
  it('promover consultor a gestor ganha desconto e nao perde nada', () => {
    const d = diferencaEntrePapeis('consultor_vendas', 'gestor_regional');
    expect(d.ganha).toContain('Aprovar desconto acima do limite da unidade');
    expect(d.perde).toEqual([]);
  });

  it('rebaixar admin perde as Configuracoes', () => {
    const d = diferencaEntrePapeis('admin', 'financeiro');
    expect(d.perde).toContain('Configuracoes do sistema, equipe, papeis e senhas');
  });

  it('mesmo papel nao muda nada', () => {
    expect(diferencaEntrePapeis('sinistro', 'sinistro')).toEqual({ ganha: [], perde: [] });
  });
});

describe('concessoes editaveis (0110)', () => {
  const perm = (k: string) => PERMISSOES.find((p) => p.chave === k)!;

  it('as 9 chaves editaveis sao as mesmas da migration', () => {
    expect(PERMISSOES.filter((p) => p.editavel).map((p) => p.chave).sort()).toEqual([
      'assistencia', 'auditoria', 'comunicados', 'desconto', 'evento',
      'fornecedor', 'leads', 'liberar_24h', 'precos',
    ]);
  });

  it('sem concessao gravada vale o padrao', () => {
    expect(nivelEfetivo(perm('evento'), 'sinistro')).toBe('unidade');
    expect(nivelEfetivo(perm('evento'), 'sinistro', {})).toBe('unidade');
  });

  it('retirar zera; em leads volta para so os proprios', () => {
    const c = mapaDeConcessoes([
      { papel: 'sinistro', permissao: 'evento', concedida: false },
      { papel: 'gestor_regional', permissao: 'leads', concedida: false },
    ]);
    expect(nivelEfetivo(perm('evento'), 'sinistro', c)).toBe('nao');
    expect(nivelEfetivo(perm('leads'), 'gestor_regional', c)).toBe('proprio');
    expect(concedida(perm('leads'), 'gestor_regional', c)).toBe(false);
  });

  it('conceder vale na unidade (ou total para papel global)', () => {
    const c = mapaDeConcessoes([
      { papel: 'consultor_vendas', permissao: 'desconto', concedida: true },
      { papel: 'financeiro', permissao: 'desconto', concedida: true },
    ]);
    expect(nivelEfetivo(perm('desconto'), 'consultor_vendas', c)).toBe('unidade');
    expect(nivelEfetivo(perm('desconto'), 'financeiro', c)).toBe('total');
  });

  it('admin e estrutura nao mudam por concessao', () => {
    const c = { admin: { precos: false }, gestor_regional: { configuracoes: true } } as never;
    expect(nivelEfetivo(perm('precos'), 'admin', c)).toBe('total');
    expect(nivelEfetivo(perm('configuracoes'), 'gestor_regional', c)).toBe('nao');
  });

  it('a troca de papel considera as concessoes', () => {
    const c = mapaDeConcessoes([{ papel: 'consultor_vendas', permissao: 'desconto', concedida: true }]);
    const d = diferencaEntrePapeis('consultor_vendas', 'gestor_regional', c);
    expect(d.ganha).not.toContain('Aprovar desconto acima do limite da unidade');
  });
});
