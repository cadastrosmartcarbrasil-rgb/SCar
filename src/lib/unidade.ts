// Qual unidade (franquia) o portal esta mostrando.
//
// Regra do produto: quem tem ACESSO GLOBAL (admin/financeiro da matriz) entra
// no portal de QUALQUER franquia, mas precisa ESCOLHER uma — nao existe portal
// "de todas ao mesmo tempo", porque a tela e a operacao de uma unidade. Quem e
// gestor de unidade nao escolhe nada: entra sempre na propria.
//
// A escolha viaja num cookie para o layout (server component) saber se mostra a
// tela de selecao ou o portal. Cookie e escrito pelo navegador, entao NAO e
// controle de acesso: quem decide o que volta e o `escopo_regional()` no banco,
// que ignora o id pedido por quem nao tem acesso global. Aqui a checagem existe
// para a TELA nao mentir (mostrar "Natal" servindo dados de Cuiaba).

export const COOKIE_UNIDADE = 'scar_unidade';
/** 12h: o suporte da matriz trabalha o dia todo na mesma unidade sem reescolher. */
export const MAX_AGE_UNIDADE = 60 * 60 * 12;

export interface PerfilPortal {
  papel: string;
  regional_id: string | null;
}

export type DecisaoUnidade =
  | { modo: 'PROPRIA'; regionalId: string }        // gestor: a unidade dele
  | { modo: 'ESCOLHIDA'; regionalId: string }      // matriz: escolheu uma
  | { modo: 'ESCOLHER' }                           // matriz: precisa escolher
  | { modo: 'SEM_UNIDADE' };                       // gestor sem unidade no cadastro

/** Papeis que enxergam todas as unidades (espelha `tem_acesso_global()`). */
export function temAcessoGlobal(papel: string): boolean {
  return papel === 'admin' || papel === 'financeiro';
}

/**
 * Decide o que a tela faz, dado o perfil, o cookie e as unidades existentes.
 * `unidadesValidas` evita entrar numa unidade apagada (ou num id inventado).
 */
export function decidirUnidade(
  perfil: PerfilPortal,
  cookie: string | null | undefined,
  unidadesValidas: string[],
): DecisaoUnidade {
  if (!temAcessoGlobal(perfil.papel)) {
    // Gestor de unidade: o cookie e ignorado — vale o cadastro dele.
    return perfil.regional_id
      ? { modo: 'PROPRIA', regionalId: perfil.regional_id }
      : { modo: 'SEM_UNIDADE' };
  }
  if (cookie && unidadesValidas.includes(cookie)) {
    return { modo: 'ESCOLHIDA', regionalId: cookie };
  }
  return { modo: 'ESCOLHER' };
}

/** "CUIABA — MT" a partir do endereco (jsonb) da unidade. */
export function localDaUnidade(endereco: unknown): string {
  const e = (endereco ?? {}) as Record<string, unknown>;
  const cidade = typeof e.cidade === 'string' ? e.cidade.trim() : '';
  const uf = typeof e.uf === 'string' ? e.uf.trim().toUpperCase() : '';
  if (cidade && uf) return `${cidade} — ${uf}`;
  return cidade || uf || '';
}
