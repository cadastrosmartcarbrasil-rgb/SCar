import { describe, it, expect } from 'vitest';
import {
  MODULOS, ACOES, ALCADAS, temPermissao, mapaDeConcessoes, diferencaEntrePapeis,
  mudancasDoPerfil, moduloDaRota, celulaEditavel, todasAsChaves, permissoesDoPapel,
  chaveDoExtra, extraParaBanco, chavePermiteExtra, extraVigente, hojeSaoPaulo, permissoesEfetivas,
  mudancasDosExtras, resumoDaCopia, rotuloDaChave, basesDosPerfis, valorDoSeletor, lerSeletor, chaveDoUsuario,
  abasConfiguracoesPermitidas, abaConfiguracaoDaRota, coerenciaVerEditar, acoesNaAba,
} from './permissoes';

describe('grade modulo x acao (0111)', () => {
  it('chaves unicas e acoes conhecidas', () => {
    expect(new Set(MODULOS.map((m) => m.chave)).size).toBe(MODULOS.length);
    for (const m of MODULOS) for (const a of m.acoes) expect(ACOES).toContain(a);
  });

  it('155 celulas editaveis (as mesmas de permissao_celula_valida) + 3 alcadas', () => {
    const editaveis = MODULOS.filter((m) => !m.fixo).flatMap((m) => m.acoes);
    // 89 ate a 0140 + DRE (ver, exportar) + 16 abas de Configuracoes x (ver, editar) — 0141
    expect(editaveis.length).toBe(155);
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
    expect(moduloDaRota('/cobrancas/revistorias')?.chave).toBe('revistoria');
    expect(moduloDaRota('/veiculos/abc')?.chave).toBe('veiculos');
    expect(moduloDaRota('/vendedor')).toBeUndefined();
  });

  it('papel desconhecido nao ganha nada', () => {
    expect(permissoesDoPapel('cotador')).toEqual([]);
  });
});

describe('permissao extra por usuario (0116)', () => {
  const hoje = '2026-10-18';

  it('converte entre a chave da grade e o par do banco', () => {
    expect(chaveDoExtra('veiculos', 'excluir')).toBe('veiculos.excluir');
    expect(chaveDoExtra('alcada', 'desconto')).toBe('desconto');
    expect(extraParaBanco('veiculos.excluir')).toEqual({ modulo: 'veiculos', acao: 'excluir' });
    expect(extraParaBanco('desconto')).toEqual({ modulo: 'alcada', acao: 'desconto' });
  });

  it('so oferece o que existe e nao e fixo', () => {
    expect(chavePermiteExtra('veiculos.excluir')).toBe(true);
    expect(chavePermiteExtra('desconto')).toBe(true);
    expect(chavePermiteExtra('painel.excluir')).toBe(false);
    expect(chavePermiteExtra('configuracoes.ver')).toBe(false);
    expect(chavePermiteExtra('inexistente')).toBe(false);
  });

  it('validade inclusive; sem validade vale sempre', () => {
    expect(extraVigente(null, hoje)).toBe(true);
    expect(extraVigente('2026-10-18', hoje)).toBe(true);
    expect(extraVigente('2026-10-17', hoje)).toBe(false);
  });

  it('hoje em Sao Paulo, nao em UTC', () => {
    // 01:30 UTC de 19/10 ainda e 18/10 em Sao Paulo
    expect(hojeSaoPaulo(new Date('2026-10-19T01:30:00Z'))).toBe('2026-10-18');
  });

  it('extra soma ao papel so para a pessoa e so enquanto vigente', () => {
    const base = permissoesEfetivas('consultor_vendas', undefined, [], hoje);
    expect(base).not.toContain('veiculos.excluir');
    const com = permissoesEfetivas('consultor_vendas', undefined,
      [{ chave: 'veiculos.excluir', expira_em: null }, { chave: 'desconto', expira_em: '2026-01-01' }], hoje);
    expect(com).toContain('veiculos.excluir');
    expect(com).not.toContain('desconto');
    expect(com.length).toBe(base.length + 1);
  });

  it('extra em modulo fixo e ignorado', () => {
    const com = permissoesEfetivas('consultor_vendas', undefined, [{ chave: 'configuracoes.ver', expira_em: null }], hoje);
    expect(com).not.toContain('configuracoes.ver');
  });

  it('mudancas da lista', () => {
    expect(mudancasDosExtras(['a', 'b'], ['b', 'c'])).toEqual({ entram: ['c'], saem: ['a'] });
  });

  it('copiar perfil: diz o que o destino ganha e perde', () => {
    const r = resumoDaCopia(
      { papel: 'gestor_regional', regional_id: 'r1', extras: [{ chave: 'financeiro.estornar', expira_em: null }] },
      { papel: 'consultor_vendas', regional_id: 'r2', extras: [{ chave: 'rastreadores.baixar', expira_em: null }] },
      undefined, true, hoje,
    );
    expect(r.trocaPapel).toBe(true);
    expect(r.trocaUnidade).toBe(true);
    expect(r.extrasCopiados).toBe(1);
    expect(r.ganha).toContain(rotuloDaChave('financeiro.estornar'));
    expect(r.ganha).toContain(rotuloDaChave('desconto'));
    expect(r.perde).toContain(rotuloDaChave('rastreadores.baixar'));
  });

  it('copiar sem a unidade nao a troca; extra vencido da origem nao vai', () => {
    const r = resumoDaCopia(
      { papel: 'consultor_vendas', regional_id: 'r1', extras: [{ chave: 'veiculos.excluir', expira_em: '2026-01-01' }] },
      { papel: 'consultor_vendas', regional_id: 'r2', extras: [] },
      undefined, false, hoje,
    );
    expect(r.trocaUnidade).toBe(false);
    expect(r.extrasCopiados).toBe(0);
    expect(r.ganha).toEqual([]);
    expect(r.perde).toEqual([]);
  });
});

describe('perfil personalizado (0130)', () => {
  const ID = '11111111-2222-3333-4444-555555555555';
  const perfis = [{ id: ID, nome: 'ATENDENTE SAC', descricao: null, papel_base: 'financeiro' }];
  const bases = basesDosPerfis(perfis);

  it('a grade e a do perfil; modulo fixo e padrao seguem a base', () => {
    const conc = { [ID]: { 'veiculos.excluir': true, 'associados.ver': false } };
    expect(temPermissao(ID, 'veiculos.excluir', conc, bases)).toBe(true);
    expect(temPermissao(ID, 'associados.ver', conc, bases)).toBe(false);
    // Integracao Mutual e fixa de admin/financeiro: vem da base
    const mutual = MODULOS.find((m) => m.fixo && m.fixo.includes('financeiro') && !m.fixo.includes('gestor_regional'));
    if (mutual) expect(temPermissao(ID, `${mutual.chave}.${mutual.acoes[0]}`, conc, bases)).toBe(true);
    // sem gravacao, cai no padrao da base
    expect(temPermissao(ID, 'financeiro.estornar', conc, bases)).toBe(true);
    expect(temPermissao(ID, 'financeiro.estornar', conc)).toBe(false);
  });

  it('seletor: papel puro x perfil personalizado', () => {
    expect(valorDoSeletor({ papel: 'financeiro', perfil_id: ID })).toBe(`perfil:${ID}`);
    expect(valorDoSeletor({ papel: 'auditoria', perfil_id: null })).toBe('auditoria');
    expect(lerSeletor(`perfil:${ID}`, perfis)).toEqual({ papel: 'financeiro', perfil_id: ID });
    expect(lerSeletor('auditoria', perfis)).toEqual({ papel: 'auditoria', perfil_id: null });
    expect(lerSeletor('perfil:outro', perfis)).toBeNull();
    expect(chaveDoUsuario({ papel: 'financeiro', perfil_id: ID })).toBe(ID);
    expect(chaveDoUsuario({ papel: 'financeiro' })).toBe('financeiro');
  });

  it('diferenca entre papel e perfil usa as bases', () => {
    const conc = { [ID]: { 'veiculos.excluir': false } };
    const { perde } = diferencaEntrePapeis('financeiro', ID, conc, bases);
    expect(perde).toContain('Veículos: Excluir');
  });
});

describe('configuracoes por aba e DRE (0141)', () => {
  it('o DRE nasce com quem ja tinha o Financeiro', () => {
    for (const p of ['financeiro', 'gestor_regional', 'assistencia_24h', 'supervisor', 'cobranca']) {
      expect(temPermissao(p, 'financeiro_dre.ver')).toBe(temPermissao(p, 'financeiro.ver'));
    }
    expect(temPermissao('consultor_vendas', 'financeiro_dre.ver')).toBe(false);
    // retirado do perfil, o DRE some e o financeiro fica
    const c = { gestor_regional: { 'financeiro_dre.ver': false } };
    expect(temPermissao('gestor_regional', 'financeiro_dre.ver', c)).toBe(false);
    expect(temPermissao('gestor_regional', 'financeiro.ver', c)).toBe(true);
  });

  it('as abas nascem sem ninguem e aceitam extra', () => {
    expect(temPermissao('financeiro', 'cfg_plano_contas.editar')).toBe(false);
    expect(chavePermiteExtra('cfg_plano_contas.editar')).toBe(true);
    expect(chavePermiteExtra('cfg_plano_contas.criar')).toBe(true);
    expect(chavePermiteExtra('cfg_plano_contas.excluir')).toBe(true);
    expect(chavePermiteExtra('cfg_plano_contas.exportar')).toBe(false);
    expect(chavePermiteExtra('configuracoes.ver')).toBe(false);
  });

  it('a rota da aba vence a de Configuracoes', () => {
    expect(moduloDaRota('/configuracoes/marcas-modelos')?.chave).toBe('cfg_marcas_modelos');
    expect(moduloDaRota('/configuracoes/usuarios')?.chave).toBe('configuracoes');
    expect(abaConfiguracaoDaRota('/configuracoes/plano-contas')?.chave).toBe('cfg_plano_contas');
    expect(abaConfiguracaoDaRota('/configuracoes/termos')).toBeUndefined();
  });

  it('abas que a pessoa abre', () => {
    expect(abasConfiguracoesPermitidas(true, [])).toBeNull();
    expect(abasConfiguracoesPermitidas(false, ['cfg_cores.ver', 'cfg_plano_contas.editar', 'termos_modelos.ver']))
      .toEqual(['/configuracoes/cores', '/configuracoes/plano-contas', '/configuracoes/termos']);
    expect(abasConfiguracoesPermitidas(false, ['financeiro.ver'])).toEqual([]);
  });

  it('o que a pessoa faz na aba', () => {
    expect(acoesNaAba('cfg_plano_contas', false, ['cfg_plano_contas.ver', 'cfg_plano_contas.criar']))
      .toEqual({ criar: true, editar: false, excluir: false, soConsulta: false });
    expect(acoesNaAba('cfg_plano_contas', false, ['cfg_plano_contas.ver']).soConsulta).toBe(true);
    expect(acoesNaAba('cfg_plano_contas', true, []))
      .toEqual({ criar: true, editar: true, excluir: true, soConsulta: false });
  });

  it('editar traz o ver; tirar o ver leva o editar', () => {
    expect(coerenciaVerEditar('cfg_cores.editar', true)).toEqual({ 'cfg_cores.editar': true, 'cfg_cores.ver': true });
    expect(coerenciaVerEditar('cfg_cores.criar', true)).toEqual({ 'cfg_cores.criar': true, 'cfg_cores.ver': true });
    expect(coerenciaVerEditar('cfg_cores.ver', false)).toEqual({
      'cfg_cores.ver': false, 'cfg_cores.criar': false, 'cfg_cores.editar': false, 'cfg_cores.excluir': false,
    });
    expect(coerenciaVerEditar('cfg_cores.excluir', false)).toEqual({ 'cfg_cores.excluir': false });
    expect(coerenciaVerEditar('veiculos.editar', true)).toEqual({ 'veiculos.editar': true });
  });
});
