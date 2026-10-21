// ---------------------------------------------------------------------------
// PERMISSOES POR PERFIL — grade MODULO x ACAO (0111), editavel pelo admin.
//
// Fonte de verdade: o banco. `perfil_permissoes` guarda as celulas por papel e
// `papel_permissoes` (0110) as 3 alcadas; `perfil_pode(modulo, acao)` responde
// e os helpers (`pode_auditar`, `pode_assistencia`, `pode_tratar_evento`...)
// leem a grade. Este arquivo descreve a grade (modulos, acoes, padrao) e
// resolve a celula para a TELA — mexeu na lista de celulas, mexa em
// `permissao_celula_valida` (SQL) e no teste.
// ---------------------------------------------------------------------------

import { PAPEIS_USUARIO } from './usuario';

export const ACOES = [
  'ver', 'criar', 'editar', 'excluir', 'exportar',
  'baixar', 'estornar', 'cancelar', 'transferir', 'fechar',
] as const;
export type Acao = (typeof ACOES)[number];

export const ROTULO_ACAO: Record<Acao, string> = {
  ver: 'Ver', criar: 'Criar', editar: 'Editar', excluir: 'Excluir', exportar: 'Exportar',
  baixar: 'Baixar', estornar: 'Estornar', cancelar: 'Cancelar', transferir: 'Transferir', fechar: 'Fechar',
};

export interface Modulo {
  chave: string;
  rotulo: string;
  /** Acoes que existem no modulo (o resto "nao se aplica"). */
  acoes: Acao[];
  /** O que cada acao significa ali, quando o nome sozinho nao diz. */
  notas?: Partial<Record<Acao, string>>;
  /** Telas do modulo (o menu e a guarda de pagina usam o VER). */
  rotas: string[];
  /**
   * Fixo pela estrutura (nao editavel): quem tem cada acao. Esses modulos
   * sao protegidos por papel no banco e nas rotas (is_admin, tem_acesso_global).
   */
  fixo?: string[];
}

export const MODULOS: Modulo[] = [
  { chave: 'painel', rotulo: 'Painel / Visão Geral', acoes: ['ver', 'exportar'], rotas: ['/dashboard'] },
  { chave: 'sac', rotulo: 'SAC / Atendimento', acoes: ['ver', 'criar', 'editar', 'transferir', 'fechar'],
    notas: { criar: 'abrir protocolo', fechar: 'encerrar protocolo' }, rotas: ['/sac'] },
  { chave: 'protocolos', rotulo: 'Protocolos', acoes: ['ver', 'criar', 'editar', 'transferir', 'fechar'],
    notas: { fechar: 'encerrar' }, rotas: ['/protocolos'] },
  { chave: 'assistencia', rotulo: 'Assistência 24h',
    acoes: ['ver', 'criar', 'editar', 'excluir', 'cancelar', 'transferir', 'fechar'],
    notas: { criar: 'acionar', excluir: 'apagar acionamento lançado por engano', transferir: 'trocar prestador',
      fechar: 'concluir a OS' }, rotas: ['/assistencia'] },
  { chave: 'vendas', rotulo: 'Vendas / CRM',
    acoes: ['ver', 'criar', 'editar', 'excluir', 'exportar', 'cancelar', 'transferir', 'fechar'],
    notas: { cancelar: 'marcar perdido', transferir: 'atribuir lead', fechar: 'autorizar entrada na base (Auditoria)' },
    rotas: ['/vendas'] },
  { chave: 'associados', rotulo: 'Associados', acoes: ['ver', 'criar', 'editar', 'excluir', 'exportar'],
    rotas: ['/associados'] },
  { chave: 'veiculos', rotulo: 'Veículos', acoes: ['ver', 'criar', 'editar', 'excluir', 'exportar', 'cancelar'],
    notas: { cancelar: 'inativar / cancelar contrato' }, rotas: ['/veiculos'] },
  { chave: 'rastreadores', rotulo: 'Rastreadores', acoes: ['ver', 'criar', 'editar', 'transferir', 'baixar'],
    notas: { baixar: 'baixa de patrimônio' }, rotas: ['/rastreadores'] },
  { chave: 'eventos', rotulo: 'Eventos',
    acoes: ['ver', 'criar', 'editar', 'excluir', 'exportar', 'cancelar', 'transferir', 'fechar'],
    notas: { editar: 'tratar: fase, peças, nota fiscal', transferir: 'tramitar e pedir parecer' },
    rotas: ['/eventos'] },
  { chave: 'cobranca', rotulo: 'Cobrança', acoes: ['ver', 'criar', 'editar', 'exportar', 'baixar', 'cancelar'],
    notas: { criar: 'gerar faturas e remessas', editar: 'ajustar boleto' }, rotas: ['/cobrancas'] },
  { chave: 'precificacao', rotulo: 'Precificação', acoes: ['ver', 'editar', 'exportar'],
    notas: { editar: 'alterar a tabela de preços' }, rotas: ['/precificacao'] },
  { chave: 'fornecedores', rotulo: 'Fornecedores', acoes: ['ver', 'criar', 'editar', 'excluir', 'exportar'],
    rotas: ['/fornecedores'] },
  { chave: 'financeiro', rotulo: 'Financeiro / DRE',
    acoes: ['ver', 'criar', 'editar', 'excluir', 'exportar', 'baixar', 'estornar', 'cancelar'],
    rotas: ['/financeiro'] },
  { chave: 'comunicados', rotulo: 'Comunicados', acoes: ['ver', 'criar', 'editar', 'excluir'],
    notas: { criar: 'publicar no mural' }, rotas: [] },
  { chave: 'termos', rotulo: 'Termos — emitir', acoes: ['ver', 'criar', 'exportar', 'cancelar'],
    notas: { criar: 'emitir termo para o associado', exportar: 'baixar o PDF', cancelar: 'cancelar termo emitido' },
    rotas: [] },
  { chave: 'termos_modelos', rotulo: 'Termos — gerenciar modelos', acoes: ['ver', 'criar', 'editar', 'excluir'],
    notas: { criar: 'criar modelo e publicar versão', editar: 'editar o texto e publicar versão' },
    rotas: [] },
  { chave: 'regionais', rotulo: 'Regionais (dashboard e portal)', acoes: ['ver', 'exportar'],
    rotas: ['/regionais'], fixo: ['admin', 'financeiro', 'gestor_regional'] },
  { chave: 'mutual', rotulo: 'Integração Mutual', acoes: ['ver', 'criar', 'editar'],
    rotas: ['/integracao'], fixo: ['admin', 'financeiro'] },
  { chave: 'usuarios', rotulo: 'Usuários e permissões', acoes: ['ver', 'criar', 'editar', 'excluir'],
    rotas: [], fixo: ['admin'] },
  { chave: 'configuracoes', rotulo: 'Configurações', acoes: ['ver', 'editar'],
    rotas: ['/configuracoes'], fixo: ['admin'] },
];

/** As alcadas que nao sao modulo x acao (0110). */
export const ALCADAS = [
  { chave: 'desconto', rotulo: 'Aprovar desconto acima do limite da unidade' },
  { chave: 'liberar_24h', rotulo: 'Liberar acionamento da 24h bloqueado' },
  { chave: 'leads', rotulo: 'Ver a carteira de leads da unidade inteira (sem ela: só os leads dele)' },
] as const;

/** Chave de celula: 'modulo.acao'. */
export const chaveCelula = (modulo: string, acao: Acao) => `${modulo}.${acao}`;

const TODOS = PAPEIS_USUARIO.map((p) => p.valor).filter((p) => p !== 'admin');

/**
 * O PADRAO — espelho do seed da 0111 (quem recebe cada celula). Vale quando
 * a tabela ainda nao foi lida; o que estiver gravado manda.
 */
const PADRAO: Record<string, readonly string[]> = {
  'painel.ver': TODOS, 'painel.exportar': TODOS,
  'sac.ver': TODOS, 'sac.criar': TODOS, 'sac.editar': TODOS, 'sac.transferir': TODOS, 'sac.fechar': TODOS,
  'protocolos.ver': TODOS, 'protocolos.criar': TODOS, 'protocolos.editar': TODOS,
  'protocolos.transferir': TODOS, 'protocolos.fechar': TODOS,
  'assistencia.ver': TODOS,
  'assistencia.criar': ['financeiro', 'gestor_regional', 'assistencia_24h'],
  'assistencia.editar': ['financeiro', 'gestor_regional', 'assistencia_24h'],
  'assistencia.excluir': ['financeiro'],
  'assistencia.cancelar': ['financeiro', 'gestor_regional', 'assistencia_24h'],
  'assistencia.transferir': ['financeiro', 'gestor_regional', 'assistencia_24h'],
  'assistencia.fechar': ['financeiro', 'gestor_regional', 'assistencia_24h'],
  'vendas.ver': TODOS, 'vendas.criar': TODOS, 'vendas.editar': TODOS, 'vendas.excluir': ['financeiro'],
  'vendas.exportar': TODOS, 'vendas.cancelar': TODOS,
  'vendas.transferir': ['financeiro', 'gestor_regional'], 'vendas.fechar': ['auditoria'],
  'associados.ver': TODOS, 'associados.criar': TODOS, 'associados.editar': TODOS,
  'associados.excluir': ['financeiro', 'gestor_regional'], 'associados.exportar': TODOS,
  'veiculos.ver': TODOS, 'veiculos.criar': TODOS, 'veiculos.editar': TODOS,
  'veiculos.excluir': ['financeiro', 'gestor_regional'], 'veiculos.exportar': TODOS,
  'veiculos.cancelar': ['financeiro', 'gestor_regional'],
  'rastreadores.ver': TODOS, 'rastreadores.criar': TODOS, 'rastreadores.editar': TODOS,
  'rastreadores.transferir': TODOS, 'rastreadores.baixar': ['financeiro'],
  'eventos.ver': TODOS, 'eventos.criar': TODOS, 'eventos.exportar': TODOS, 'eventos.transferir': TODOS,
  'eventos.editar': ['financeiro', 'sinistro', 'gestor_regional'],
  'eventos.cancelar': ['financeiro', 'sinistro', 'gestor_regional'],
  'eventos.fechar': ['financeiro', 'sinistro', 'gestor_regional'],
  'cobranca.ver': TODOS, 'cobranca.exportar': TODOS, 'cobranca.criar': ['financeiro'],
  'cobranca.editar': ['financeiro', 'gestor_regional', 'supervisor', 'cobranca'],
  'cobranca.baixar': ['financeiro'], 'cobranca.cancelar': ['financeiro'],
  'precificacao.ver': TODOS, 'precificacao.exportar': TODOS, 'precificacao.editar': ['financeiro'],
  'fornecedores.ver': TODOS, 'fornecedores.exportar': TODOS,
  'fornecedores.criar': ['financeiro', 'gestor_regional', 'assistencia_24h'],
  'fornecedores.editar': ['financeiro', 'gestor_regional', 'assistencia_24h'],
  'fornecedores.excluir': ['financeiro'],
  'financeiro.ver': ['financeiro', 'gestor_regional', 'assistencia_24h', 'supervisor', 'cobranca'],
  'financeiro.exportar': ['financeiro', 'gestor_regional', 'assistencia_24h', 'supervisor', 'cobranca'],
  'financeiro.criar': ['financeiro', 'gestor_regional', 'assistencia_24h'],
  'financeiro.editar': ['financeiro', 'gestor_regional', 'assistencia_24h'],
  'financeiro.baixar': ['financeiro', 'gestor_regional', 'assistencia_24h'],
  'financeiro.excluir': ['financeiro'], 'financeiro.estornar': ['financeiro'],
  'financeiro.cancelar': ['financeiro', 'gestor_regional'],
  'comunicados.ver': TODOS, 'comunicados.criar': ['financeiro', 'gestor_regional'],
  'comunicados.editar': ['financeiro', 'gestor_regional'],
  'comunicados.excluir': ['financeiro', 'gestor_regional'],
  'termos.ver': TODOS.filter((p) => p !== 'consultor_vendas'),
  'termos.criar': TODOS.filter((p) => p !== 'consultor_vendas'),
  'termos.exportar': TODOS.filter((p) => p !== 'consultor_vendas'),
  'termos.cancelar': ['financeiro', 'gestor_regional'],
  desconto: ['gestor_regional'],
  liberar_24h: ['financeiro', 'gestor_regional'],
  leads: ['financeiro', 'gestor_regional', 'auditoria'],
};

/** Concessoes gravadas no banco: papel -> chave ('modulo.acao' ou alcada) -> concedida. */
export type Concessoes = Record<string, Record<string, boolean>>;

export function moduloPorChave(chave: string): Modulo | undefined {
  return MODULOS.find((m) => m.chave === chave);
}

/** A celula existe no modulo? */
export function celulaAplica(modulo: Modulo, acao: Acao): boolean {
  return modulo.acoes.includes(acao);
}

/** A celula pode ser ajustada pelo admin para este papel? */
export function celulaEditavel(modulo: Modulo, acao: Acao, papel: string): boolean {
  return papel !== 'admin' && !modulo.fixo && celulaAplica(modulo, acao);
}

/**
 * O papel tem a permissao? `chave` e 'modulo.acao' ou uma alcada. Admin sempre;
 * modulo fixo pela lista; o resto pelo que esta gravado (ou o padrao).
 */
export function temPermissao(
  papel: string, chave: string, concessoes?: Concessoes, bases?: BasesDePerfil,
): boolean {
  // `papel` e a CHAVE da grade: um papel ou o id de um perfil personalizado
  // (0130). O que e estrutura (modulo fixo, padrao) segue o papel de base.
  const base = bases?.[papel] ?? papel;
  if (base === 'admin') return true;
  const [mod, acao] = chave.split('.');
  const modulo = acao ? moduloPorChave(mod) : undefined;
  if (acao) {
    if (!modulo || !celulaAplica(modulo, acao as Acao)) return false;
    if (modulo.fixo) return modulo.fixo.includes(base);
  }
  const gravado = concessoes?.[papel]?.[chave];
  if (gravado !== undefined) return gravado;
  return (PADRAO[chave] ?? []).includes(base);
}

/** Perfil personalizado (0130): id -> papel de base. */
export type BasesDePerfil = Record<string, string>;

export interface PerfilAcesso {
  id: string;
  nome: string;
  descricao: string | null;
  papel_base: string;
}

export function basesDosPerfis(perfis: PerfilAcesso[] | null | undefined): BasesDePerfil {
  return Object.fromEntries((perfis ?? []).map((p) => [p.id, p.papel_base]));
}

/** A chave da grade de um usuario: o perfil personalizado, se houver, ou o papel. */
export function chaveDoUsuario(u: { papel: string; perfil_id?: string | null }): string {
  return u.perfil_id ?? u.papel;
}

/** Valor do seletor de perfil: 'perfil:<id>' para o personalizado, o papel para o resto. */
export function valorDoSeletor(u: { papel: string; perfil_id?: string | null }): string {
  return u.perfil_id ? `perfil:${u.perfil_id}` : u.papel;
}

/** O que o seletor escolheu: papel (base) + perfil personalizado (ou nulo). */
export function lerSeletor(
  valor: string, perfis: PerfilAcesso[] | null | undefined,
): { papel: string; perfil_id: string | null } | null {
  if (!valor.startsWith('perfil:')) return { papel: valor, perfil_id: null };
  const p = (perfis ?? []).find((x) => x.id === valor.slice(7));
  return p ? { papel: p.papel_base, perfil_id: p.id } : null;
}

/** Nome de uma chave da grade (papel ou perfil personalizado). */
export function nomeDaChave(chave: string, perfis: PerfilAcesso[] | null | undefined, rotuloPapel: (p: string) => string): string {
  return (perfis ?? []).find((p) => p.id === chave)?.nome ?? rotuloPapel(chave);
}

/** As linhas das duas tabelas viram o mapa papel -> chave -> concedida. */
export function mapaDeConcessoes(
  celulas: { papel: string; modulo: string; acao: string; concedida: boolean }[] | null | undefined,
  alcadas: { papel: string; permissao: string; concedida: boolean }[] | null | undefined,
): Concessoes {
  const m: Concessoes = {};
  for (const l of celulas ?? []) (m[l.papel] ??= {})[`${l.modulo}.${l.acao}`] = l.concedida;
  for (const l of alcadas ?? []) (m[l.papel] ??= {})[l.permissao] = l.concedida;
  return m;
}

/** Todas as chaves que existem (celulas + alcadas), na ordem da grade. */
export function todasAsChaves(): string[] {
  return [
    ...MODULOS.flatMap((m) => m.acoes.map((a) => chaveCelula(m.chave, a))),
    ...ALCADAS.map((a) => a.chave),
  ];
}

/** Rotulo legivel de uma chave ('veiculos.excluir' -> 'Veiculos: Excluir'). */
export function rotuloDaChave(chave: string): string {
  const [mod, acao] = chave.split('.');
  if (!acao) return ALCADAS.find((a) => a.chave === mod)?.rotulo ?? chave;
  const modulo = moduloPorChave(mod);
  return `${modulo?.rotulo ?? mod}: ${ROTULO_ACAO[acao as Acao] ?? acao}`;
}

/** O que o papel pode (para o resumo embaixo do seletor de papel). */
export function permissoesDoPapel(papel: string, concessoes?: Concessoes, bases?: BasesDePerfil): string[] {
  return todasAsChaves().filter((k) => temPermissao(papel, k, concessoes, bases));
}

/**
 * A troca de papel: o que a pessoa GANHA e o que PERDE (texto da confirmacao).
 */
export function diferencaEntrePapeis(
  de: string,
  para: string,
  concessoes?: Concessoes,
  bases?: BasesDePerfil,
): { ganha: string[]; perde: string[] } {
  const ganha: string[] = [];
  const perde: string[] = [];
  for (const k of todasAsChaves()) {
    const a = temPermissao(de, k, concessoes, bases);
    const b = temPermissao(para, k, concessoes, bases);
    if (a === b) continue;
    (b ? ganha : perde).push(rotuloDaChave(k));
  }
  return { ganha, perde };
}

/** Diferenca entre a grade gravada e a editada (o que vai para o banco). */
export function mudancasDoPerfil(
  papel: string,
  concessoes: Concessoes | undefined,
  editado: Record<string, boolean>,
  bases?: BasesDePerfil,
): { modulo: string; acao: string; concedida: boolean }[] {
  const out: { modulo: string; acao: string; concedida: boolean }[] = [];
  for (const [chave, valor] of Object.entries(editado)) {
    if (temPermissao(papel, chave, concessoes, bases) === valor) continue;
    const [mod, acao] = chave.split('.');
    out.push(acao ? { modulo: mod, acao, concedida: valor } : { modulo: 'alcada', acao: mod, concedida: valor });
  }
  return out;
}

/** Modulo de uma rota da matriz (para o menu e a guarda de pagina). */
export function moduloDaRota(pathname: string): Modulo | undefined {
  return MODULOS.find((m) => m.rotas.some((r) => pathname === r || pathname.startsWith(r + '/')));
}

// ---------------------------------------------------------------------------
// PERMISSAO EXTRA POR USUARIO (0116) — so SOMA ao papel, com motivo e validade.
// No banco: `usuario_permissoes`; `perfil_pode`/`papel_pode` somam o extra
// vigente. Aqui: o que a tela oferece e como ela resume.
// ---------------------------------------------------------------------------

/** Um extra gravado: chave 'modulo.acao' (ou a alcada) + validade (ISO, inclusive). */
export interface ExtraUsuario {
  chave: string;
  expira_em: string | null;
  motivo?: string | null;
}

/** Linha do banco (modulo/acao; alcada = modulo 'alcada') -> chave da grade. */
export function chaveDoExtra(modulo: string, acao: string): string {
  return modulo === 'alcada' ? acao : `${modulo}.${acao}`;
}

/** Chave da grade -> o par que o banco grava. */
export function extraParaBanco(chave: string): { modulo: string; acao: string } {
  const [mod, acao] = chave.split('.');
  return acao ? { modulo: mod, acao } : { modulo: 'alcada', acao: mod };
}

/** A chave pode ser concedida por usuario? (modulo fixo nao; o que nao existe nao) */
export function chavePermiteExtra(chave: string): boolean {
  const [mod, acao] = chave.split('.');
  if (!acao) return ALCADAS.some((a) => a.chave === mod);
  const modulo = moduloPorChave(mod);
  return !!modulo && !modulo.fixo && celulaAplica(modulo, acao as Acao);
}

/** O extra vale hoje? `hoje` em 'AAAA-MM-DD' (Sao Paulo). Sem validade = vale. */
export function extraVigente(expiraEm: string | null | undefined, hoje: string): boolean {
  return !expiraEm || expiraEm.slice(0, 10) >= hoje;
}

/** Hoje em Sao Paulo, 'AAAA-MM-DD' — a mesma regua do `data_sp(now())` do banco. */
export function hojeSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
}

/** O que o usuario pode de fato: o papel + os extras vigentes. */
export function permissoesEfetivas(
  papel: string,
  concessoes: Concessoes | undefined,
  extras: ExtraUsuario[],
  hoje: string,
  bases?: BasesDePerfil,
): string[] {
  const vig = new Set(extras.filter((e) => extraVigente(e.expira_em, hoje)).map((e) => e.chave));
  return todasAsChaves().filter((k) => temPermissao(papel, k, concessoes, bases) || (papel !== 'admin' && vig.has(k) && chavePermiteExtra(k)));
}

/** Diferenca entre a lista gravada e a editada (rotulos para a confirmacao). */
export function mudancasDosExtras(
  atuais: string[],
  novos: string[],
): { entram: string[]; saem: string[] } {
  const a = new Set(atuais);
  const b = new Set(novos);
  return {
    entram: novos.filter((k) => !a.has(k)),
    saem: atuais.filter((k) => !b.has(k)),
  };
}

/**
 * Copiar o perfil: o que o DESTINO ganha e perde em acesso efetivo, e se a
 * unidade muda. Espelha `copiar_perfil_usuario` (os extras vencidos nao vao).
 */
export function resumoDaCopia(
  origem: { papel: string; regional_id: string | null; extras: ExtraUsuario[] },
  destino: { papel: string; regional_id: string | null; extras: ExtraUsuario[] },
  concessoes: Concessoes | undefined,
  copiarUnidade: boolean,
  hoje: string,
  bases?: BasesDePerfil,
): { trocaPapel: boolean; trocaUnidade: boolean; ganha: string[]; perde: string[]; extrasCopiados: number } {
  const copiados = origem.papel === 'admin' ? [] : origem.extras.filter((e) => extraVigente(e.expira_em, hoje));
  const antes = new Set(permissoesEfetivas(destino.papel, concessoes, destino.extras, hoje, bases));
  const depois = new Set(permissoesEfetivas(origem.papel, concessoes, copiados, hoje, bases));
  const ganha: string[] = [];
  const perde: string[] = [];
  for (const k of todasAsChaves()) {
    if (antes.has(k) === depois.has(k)) continue;
    (depois.has(k) ? ganha : perde).push(rotuloDaChave(k));
  }
  return {
    trocaPapel: origem.papel !== destino.papel,
    trocaUnidade: copiarUnidade && (origem.regional_id ?? null) !== (destino.regional_id ?? null),
    ganha,
    perde,
    extrasCopiados: copiados.length,
  };
}
