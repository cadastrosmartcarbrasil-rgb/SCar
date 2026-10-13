import { describe, it, expect } from 'vitest';
import { PERMISSOES, permissoesDoPapel, diferencaEntrePapeis } from './permissoes';
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
