// ---------------------------------------------------------------------------
// O QUE CADA PAPEL PODE FAZER — o mapa que a tela de Usuarios mostra.
//
// Quem decide o acesso sao os helpers do banco e a RLS que os usa. Desde a
// 0110 as permissoes marcadas `editavel` vivem em `papel_permissoes`, que o
// ADMIN ajusta na grade (concede/retira por papel). As demais sao a ESTRUTURA
// do sistema (alcance da unidade, Configuracoes) e seguem fixas no papel.
//
// Este arquivo NAO e controle de acesso — e a DESCRICAO do que o banco faz.
// `niveis` e o padrao (o seed da 0110); a grade aplica por cima o que esta
// gravado na tabela (`nivelEfetivo`). Mexeu num helper, mexa aqui e no teste.
// ---------------------------------------------------------------------------

import { PAPEIS_USUARIO, type PapelValor } from './usuario';

/**
 * total    = todas as unidades
 * unidade  = so a unidade do cadastro do usuario
 * proprio  = so o que e dele (os leads que ele criou ou recebeu)
 * nao      = sem acesso
 */
export type NivelPermissao = 'total' | 'unidade' | 'proprio' | 'nao';

export interface Permissao {
  chave: string;
  area: string;
  descricao: string;
  /** De onde a regra sai no banco — para conferir antes de mudar o texto. */
  origem: string;
  niveis: Record<PapelValor, NivelPermissao>;
  /** Observacao por papel, quando o nivel sozinho nao explica. */
  notas?: Partial<Record<PapelValor, string>>;
  /** O admin concede/retira por papel (tabela `papel_permissoes`, 0110). */
  editavel?: boolean;
}

/** Concessoes gravadas no banco: papel -> chave -> concedida. */
export type Concessoes = Record<string, Record<string, boolean>>;

const so = (
  papeis: Partial<Record<PapelValor, NivelPermissao>>,
): Record<PapelValor, NivelPermissao> => {
  const r = {} as Record<PapelValor, NivelPermissao>;
  for (const p of PAPEIS_USUARIO) r[p.valor] = papeis[p.valor] ?? 'nao';
  return r;
};

/** Staff da unidade: admin/financeiro em tudo, o resto na propria unidade. */
const TODO_STAFF_DA_UNIDADE = so({
  admin: 'total', financeiro: 'total', gestor_regional: 'unidade', consultor_vendas: 'unidade',
  sinistro: 'unidade', auditoria: 'unidade', assistencia_24h: 'unidade',
  supervisor: 'unidade', cobranca: 'unidade',
});

export const PERMISSOES: Permissao[] = [
  {
    chave: 'configuracoes',
    area: 'Administracao',
    descricao: 'Configuracoes do sistema, equipe, papeis e senhas',
    origem: 'is_admin() + layout de /configuracoes',
    niveis: so({ admin: 'total' }),
  },
  {
    chave: 'consolidado',
    area: 'Administracao',
    descricao: 'Numeros da empresa inteira (painel consolidado, DRE de todas as unidades)',
    origem: 'tem_acesso_global() / escopo_regional()',
    niveis: so({
      admin: 'total', financeiro: 'total', gestor_regional: 'unidade', consultor_vendas: 'unidade',
      sinistro: 'unidade', auditoria: 'unidade', assistencia_24h: 'unidade',
      supervisor: 'unidade', cobranca: 'unidade',
    }),
  },
  {
    chave: 'mutual',
    area: 'Administracao',
    descricao: 'Integracao Mutual (captura, de-para e carga)',
    origem: 'menu + rota /api/v1/mutual (admin/financeiro)',
    niveis: so({ admin: 'total', financeiro: 'total' }),
  },
  {
    chave: 'operacao',
    area: 'Atendimento',
    descricao: 'SAC, associados, veiculos, protocolos — ver e cadastrar',
    origem: 'pode_regional() / is_staff()',
    niveis: TODO_STAFF_DA_UNIDADE,
  },
  {
    chave: 'leads',
    editavel: true,
    area: 'Vendas',
    descricao: 'Leads e cotacoes',
    origem: 'pode_ver_carteira_regional() (0038)',
    niveis: so({
      admin: 'total', financeiro: 'total', gestor_regional: 'unidade', auditoria: 'unidade',
      consultor_vendas: 'proprio', sinistro: 'proprio', assistencia_24h: 'proprio',
      supervisor: 'proprio', cobranca: 'proprio',
    }),
  },
  {
    chave: 'desconto',
    editavel: true,
    area: 'Vendas',
    descricao: 'Aprovar desconto acima do limite da unidade',
    origem: 'pode_aprovar_desconto()',
    niveis: so({ admin: 'total', gestor_regional: 'unidade' }),
  },
  {
    chave: 'auditoria',
    editavel: true,
    area: 'Vendas',
    descricao: 'Autorizar a entrada do veiculo na base (Auditoria)',
    origem: 'pode_auditar()',
    niveis: so({ admin: 'total', auditoria: 'unidade' }),
  },
  {
    chave: 'precos',
    editavel: true,
    area: 'Vendas',
    descricao: 'Alterar a tabela de precos',
    origem: 'pode_editar_precos() (0110)',
    niveis: so({ admin: 'total', financeiro: 'total' }),
  },
  {
    chave: 'evento',
    editavel: true,
    area: 'Eventos',
    descricao: 'Tratar o evento: mudar a fase, cotar pecas, lancar nota fiscal',
    origem: 'pode_tratar_evento() (0077)',
    niveis: so({ admin: 'total', financeiro: 'total', sinistro: 'unidade', gestor_regional: 'unidade' }),
  },
  {
    chave: 'assistencia',
    editavel: true,
    area: 'Assistencia 24h',
    descricao: 'Operar a 24h: acionar, cotar prestador, gerar OS',
    origem: 'pode_assistencia()',
    niveis: so({
      admin: 'total', financeiro: 'total', gestor_regional: 'unidade', assistencia_24h: 'unidade',
    }),
  },
  {
    chave: 'liberar_24h',
    editavel: true,
    area: 'Assistencia 24h',
    descricao: 'Liberar acionamento bloqueado (alcada)',
    origem: 'pode_liberar_assistencia()',
    niveis: so({ admin: 'total', financeiro: 'total', gestor_regional: 'unidade' }),
  },
  {
    chave: 'cobranca',
    area: 'Financeiro',
    descricao: 'Painel e fila de cobranca',
    origem: 'cobranca_escopo() (0097)',
    niveis: so({
      admin: 'total', financeiro: 'total', gestor_regional: 'unidade',
      supervisor: 'unidade', cobranca: 'total',
    }),
    notas: {
      supervisor: 'as unidades marcadas na ficha dele',
      cobranca: 'o Brasil; com unidade no cadastro, so ela',
    },
  },
  {
    chave: 'financeiro',
    area: 'Financeiro',
    descricao: 'Contas a pagar e receber, baixas',
    origem: 'lanc_all = pode_regional()',
    niveis: TODO_STAFF_DA_UNIDADE,
  },
  {
    chave: 'fornecedor',
    editavel: true,
    area: 'Financeiro',
    descricao: 'Cadastrar fornecedor, prestador e rastreadora',
    origem: 'pode_cadastrar_fornecedor()',
    niveis: so({
      admin: 'total', financeiro: 'total', gestor_regional: 'unidade', assistencia_24h: 'unidade',
    }),
  },
  {
    chave: 'comunicados',
    editavel: true,
    area: 'Equipe',
    descricao: 'Publicar comunicados no mural',
    origem: 'pode_publicar_memo()',
    niveis: so({ admin: 'total', financeiro: 'total', gestor_regional: 'unidade' }),
    notas: { gestor_regional: 'para a propria equipe e para a diretoria' },
  },
  {
    chave: 'franquia',
    area: 'Equipe',
    descricao: 'Portal da franquia (/regional)',
    origem: 'layout de /regional',
    niveis: so({ admin: 'total', financeiro: 'total', gestor_regional: 'unidade' }),
  },
];

export const ROTULO_NIVEL: Record<NivelPermissao, string> = {
  total: 'Todas as unidades',
  unidade: 'Na unidade dele',
  proprio: 'So o que e dele',
  nao: 'Sem acesso',
};

/** Papeis com acesso a todas as unidades — concedida vale 'total' para eles. */
const PAPEIS_GLOBAIS = ['admin', 'financeiro'];

/**
 * O nivel que vale HOJE: o padrao do papel com a concessao gravada por cima.
 * Admin sempre tem o padrao (o banco nao deixa ajusta-lo). Sem concessao
 * gravada (tabela ainda nao lida) vale o padrao.
 *  . retirada -> 'nao' (em leads: 'proprio' — sem ver a carteira da unidade
 *    ele continua vendo os leads que sao dele)
 *  . concedida -> o padrao, se ele ja concedia; senao 'total' para papel
 *    global e 'unidade' para os demais (a unidade continua sendo o limite)
 */
export function nivelEfetivo(perm: Permissao, papel: string, concessoes?: Concessoes): NivelPermissao {
  const padrao = (perm.niveis as Record<string, NivelPermissao>)[papel] ?? 'nao';
  if (!perm.editavel || papel === 'admin') return padrao;
  const c = concessoes?.[papel]?.[perm.chave];
  if (c === undefined) return padrao;
  if (!c) return perm.chave === 'leads' ? 'proprio' : 'nao';
  if (padrao === 'total' || padrao === 'unidade') return padrao;
  return PAPEIS_GLOBAIS.includes(papel) ? 'total' : 'unidade';
}

/** A permissao esta concedida ao papel (para o interruptor da grade)? */
export function concedida(perm: Permissao, papel: string, concessoes?: Concessoes): boolean {
  const n = nivelEfetivo(perm, papel, concessoes);
  return perm.chave === 'leads' ? n !== 'proprio' && n !== 'nao' : n !== 'nao';
}

/** O que o papel PODE fazer (nivel diferente de 'nao'), na ordem da lista. */
export function permissoesDoPapel(
  papel: string,
  concessoes?: Concessoes,
): { permissao: Permissao; nivel: NivelPermissao; nota?: string }[] {
  return PERMISSOES
    .map((p) => ({
      permissao: p,
      nivel: nivelEfetivo(p, papel, concessoes),
      nota: (p.notas as Record<string, string> | undefined)?.[papel],
    }))
    .filter((x) => x.nivel !== 'nao');
}

/** As linhas de `papel_permissoes` viram o mapa papel -> chave -> concedida. */
export function mapaDeConcessoes(
  linhas: { papel: string; permissao: string; concedida: boolean }[] | null | undefined,
): Concessoes {
  const m: Concessoes = {};
  for (const l of linhas ?? []) (m[l.papel] ??= {})[l.permissao] = l.concedida;
  return m;
}

/**
 * A troca de papel em uma linha: o que a pessoa GANHA e o que PERDE. E o texto
 * da confirmacao da lista — trocar papel muda acesso na hora.
 */
export function diferencaEntrePapeis(
  de: string,
  para: string,
  concessoes?: Concessoes,
): { ganha: string[]; perde: string[] } {
  const ganha: string[] = [];
  const perde: string[] = [];
  const ordem: NivelPermissao[] = ['nao', 'proprio', 'unidade', 'total'];
  for (const p of PERMISSOES) {
    const a = nivelEfetivo(p, de, concessoes);
    const b = nivelEfetivo(p, para, concessoes);
    if (a === b) continue;
    if (ordem.indexOf(b) > ordem.indexOf(a)) ganha.push(p.descricao);
    else perde.push(p.descricao);
  }
  return { ganha, perde };
}
