// ---------------------------------------------------------------------------
// Regras puras do cadastro do USUARIO da equipe — espelho da 0068.
//
// A regra que da nome ao arquivo: `ativo` no usuario e CONTROLE DE ACESSO, nao
// um rotulo. Ate a 0068 `is_staff()`/`auth_papel()` ignoravam o campo e
// desmarcar "ativo" nao cortava nada — a tela prometia uma revogacao que nunca
// acontecia. Agora corta de verdade, e por isso a tela precisa avisar direito
// ANTES de desativar: e a diferenca entre tirar um acesso e derrubar a pessoa
// que responde por uma unidade.
// ---------------------------------------------------------------------------

import { validarCPF } from './documento';

/** PAPEL e PERMISSAO. Nao confundir com `cargo`, que e a funcao na empresa. */
export const PAPEIS_USUARIO = [
  { valor: 'admin', rotulo: 'Administrador', nota: 'acesso global e gestao da equipe' },
  { valor: 'gestor_regional', rotulo: 'Gestor Regional', nota: 'a unidade dele' },
  { valor: 'consultor_vendas', rotulo: 'Consultor de Vendas', nota: 'a carteira dele' },
  { valor: 'financeiro', rotulo: 'Financeiro', nota: 'acesso global ao dinheiro' },
  { valor: 'sinistro', rotulo: 'Sinistro' },
  { valor: 'cotador', rotulo: 'Cotador' },
  { valor: 'auditoria', rotulo: 'Auditoria', nota: 'autoriza a entrada na base' },
  { valor: 'assistencia_24h', rotulo: 'Assistencia 24h' },
] as const;

export type PapelValor = (typeof PAPEIS_USUARIO)[number]['valor'];

export function rotuloPapel(papel: string): string {
  return PAPEIS_USUARIO.find((p) => p.valor === papel)?.rotulo ?? papel;
}

/**
 * Papeis que so fazem sentido COM unidade. O gestor regional sem unidade nao
 * entra em portal nenhum: `escopo_regional()` nao tem o que resolver e o
 * `/regional` mostra "Unidade nao vinculada".
 */
export function exigeUnidade(papel: string): boolean {
  return papel === 'gestor_regional';
}

export interface FichaUsuario {
  nome?: string | null;
  email?: string | null;
  documento?: string | null;
  data_inicio?: string | null;
  data_desligamento?: string | null;
  papel?: string | null;
  regional_id?: string | null;
}

/**
 * Espelho das travas da 0068 (`chk_usuario_documento_valido`,
 * `chk_usuario_periodo`) mais o que so a tela consegue exigir. Devolve a lista
 * de problemas — vazia quer dizer que pode salvar.
 */
export function validarFichaUsuario(f: FichaUsuario): string[] {
  const erros: string[] = [];

  if (!(f.nome ?? '').trim()) erros.push('Informe o nome completo.');
  const email = (f.email ?? '').trim();
  if (!email) erros.push('Informe o e-mail.');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erros.push('E-mail invalido.');

  const doc = (f.documento ?? '').replace(/\D/g, '');
  if (doc && !validarCPF(doc)) erros.push('CPF invalido.');

  if (f.data_inicio && f.data_desligamento && f.data_desligamento < f.data_inicio) {
    erros.push('A data de desligamento nao pode ser anterior a de inicio.');
  }

  if (exigeUnidade(f.papel ?? '') && !f.regional_id) {
    erros.push('Gestor Regional precisa de uma unidade — sem ela nao entra no portal da franquia.');
  }

  return erros;
}

/** Rotulo curto da situacao, para o selo da lista. */
export function situacaoUsuario(u: { ativo?: boolean | null; data_desligamento?: string | null }): string {
  if (u.ativo !== false) return 'Ativo';
  return u.data_desligamento ? `Desativado em ${formatarData(u.data_desligamento)}` : 'Desativado';
}

function formatarData(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

/**
 * Tempo de casa a partir da data de inicio. `hoje` e parametro para o teste
 * nao depender do relogio.
 */
export function tempoDeCasa(inicio: string | null | undefined, hoje = new Date()): string | null {
  if (!inicio) return null;
  const d = new Date(`${inicio.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime()) || d > hoje) return null;

  let meses = (hoje.getFullYear() - d.getFullYear()) * 12 + (hoje.getMonth() - d.getMonth());
  if (hoje.getDate() < d.getDate()) meses -= 1;
  if (meses < 1) return 'menos de 1 mes';

  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const partes: string[] = [];
  if (anos) partes.push(`${anos} ${anos === 1 ? 'ano' : 'anos'}`);
  if (resto) partes.push(`${resto} ${resto === 1 ? 'mes' : 'meses'}`);
  return partes.join(' e ');
}

/**
 * O aviso ANTES de desativar. Desde a 0068 desativar corta o acesso de
 * verdade, entao quem clica precisa saber o que mais cai junto: a unidade
 * fica sem responsavel e o vendedor perde o portal.
 */
export function avisoDeDesativacao(u: {
  nome: string;
  responsavel_por?: number | null;
  vendedor_ativo?: boolean | null;
}): string {
  const linhas = [
    `Desativar "${u.nome}"?`,
    '',
    'O acesso e cortado na hora: ela deixa de entrar no sistema e de aparecer como',
    'staff para a seguranca do banco. O historico do que ja fez continua intacto.',
  ];

  const n = Number(u.responsavel_por ?? 0);
  if (n > 0) {
    linhas.push(
      '',
      `ATENCAO: esta pessoa responde por ${n} ${n === 1 ? 'unidade' : 'unidades'} — ` +
        'escolha outro responsavel em Configuracoes -> Regionais.',
    );
  }
  if (u.vendedor_ativo) {
    linhas.push('', 'Ela tambem tem cadastro de VENDEDOR ativo: o portal do vendedor cai junto.');
  }
  return linhas.join('\n');
}
