import { describe, it, expect } from 'vitest';
import {
  MODULOS, ACOES, ALCADAS, temPermissao, mapaDeConcessoes, diferencaEntrePapeis,
  mudancasDoPerfil, moduloDaRota, celulaEditavel, todasAsChaves, permissoesDoPapel,
} from './permissoes';

describe('grade modulo x acao (0111)', () => {
  it('chaves unicas e acoes conhecidas', () => {
    expect(new Set(MODULOS.map((m) => m.chave)).size).toBe(MODULOS.length);
    for (const m of MODULOS) for (const a of m.acoes) expect(ACOES).toContain(a);
  });

  it('76 celulas editaveis (as mesmas de permissao_celula_valida) + 3 alcadas', () => {
    const editaveis = MODULOS.filter((m) => !m.fixo).flatMap((m) => m.acoes);
    expect(editaveis.length).toBe(76);
    expect(ALCADAS.length).toBe(3);
  });

  it('admin pode tudo, inclusive modulo fixo', () => {
    expect(todasAsChaves().every((k) => temPermissao('admin', k))).toBe(true);
  });

  it('modulo fixo ignora o que estiver gravado', () => {
    const c = { gestor_regional: { 'configuracoes.ver': true } };
    expect(temPermissao('gestor_regional', 'configuracoes.ver', c)).toBe(false);
    expect(temPermissao('financeiro', 'mutual.ver')).toBe(true);
    expect(celulaEditavel(MODULOS.find((m) => m.chave === 'configuracoes')!, 'ver', 'financeiro')).toBe(false);
  });

  it('acao que nao se aplica nunca e concedida', () => {
    expect(temPermissao('financeiro', 'painel.excluir')).toBe(false);
  });

  it('padrao = seed: sinistro trata evento, nao ve o financeiro', () => {
    expect(temPermissao('sinistro', 'eventos.editar')).toBe(true);
    expect(temPermissao('sinistro', 'financeiro.ver')).toBe(false);
    expect(temPermissao('auditoria', 'vendas.fechar')).toBe(true);
  });

  it('o gravado manda sobre o padrao', () => {
    const c = mapaDeConcessoes(
      [{ papel: 'sinistro', modulo: 'eventos', acao: 'editar', concedida: false }],
      [{ papel: 'consultor_vendas', permissao: 'leads', concedida: true }],
    );
    expect(temPermissao('sinistro', 'eventos.editar', c)).toBe(false);
    expect(temPermissao('consultor_vendas', 'leads', c)).toBe(true);
  });

  it('troca de papel lista ganhos e perdas', () => {
    const d = diferencaEntrePapeis('consultor_vendas', 'gestor_regional');
    expect(d.ganha).toContain('Associados: Excluir');
    expect(d.perde).toEqual([]);
    expect(diferencaEntrePapeis('sinistro', 'sinistro')).toEqual({ ganha: [], perde: [] });
  });

  it('mudancas so leva o que mudou, alcada como modulo "alcada"', () => {
    const m = mudancasDoPerfil('consultor_vendas', undefined, {
      'associados.excluir': true, 'sac.ver': true, desconto: true,
    });
    expect(m).toEqual([
      { modulo: 'associados', acao: 'excluir', concedida: true },
      { modulo: 'alcada', acao: 'desconto', concedida: true },
    ]);
  });

  it('rota -> modulo', () => {
    expect(moduloDaRota('/cobrancas/painel')?.chave).toBe('cobranca');
    expect(moduloDaRota('/veiculos/abc')?.chave).toBe('veiculos');
    expect(moduloDaRota('/vendedor')).toBeUndefined();
  });

  it('papel desconhecido nao ganha nada', () => {
    expect(permissoesDoPapel('cotador')).toEqual([]);
  });
});
