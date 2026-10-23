// Para onde cada login vai — e por que a ordem das perguntas importa.
//
// O SCar tem tres portas internas (matriz, franquia, vendedor) atras da MESMA
// tela de `/login`: o destino nao e escolhido, e deduzido do cadastro. O erro
// que essa funcao conserta: a deducao perguntava "tem cadastro de vendedor?"
// ANTES de perguntar "e da matriz?", entao um ADMIN que tambem tem ficha em
// `vendedores` (o dono que vende, o socio que testa o hotlink) caia no portal
// do vendedor e ficava sem sistema — o portal do vendedor nao tem porta de
// volta para a matriz, ao contrario do `/regional`.
//
// A ordem certa e da MAIOR responsabilidade para a menor: quem administra a
// empresa entra na empresa. O portal do vendedor continua acessivel para ele
// pela URL, do mesmo jeito que a matriz visita `/regional`.
//
// Isto NAO e controle de acesso — e so a porta de entrada. Quem decide o que
// cada um LE sao as policies de RLS e o `escopo_regional()` no banco.

import { temAcessoGlobal } from './unidade';

export interface PerfilLogin {
  papel: string;
  regional_id: string | null;
}

export type DestinoLogin = '/dashboard' | '/regional' | '/vendedor';

/**
 * Destino do login.
 * `ehVendedor` = `vendedor_atual()` devolveu um cadastro ATIVO.
 * Perfil nulo (nao e staff) so chega aqui vindo de um vendedor sem linha em
 * `usuarios`; sem cadastro nenhum o proprio `/dashboard` mostra "sem acesso".
 */
export function destinoAposLogin(
  perfil: PerfilLogin | null,
  ehVendedor: boolean,
): DestinoLogin {
  // A matriz manda: acesso global vence o cadastro de vendedor.
  if (perfil && temAcessoGlobal(perfil.papel)) return '/dashboard';
  // O gestor mora na unidade dele — sem regional no cadastro o portal nao abre.
  if (perfil?.papel === 'gestor_regional' && perfil.regional_id) return '/regional';
  // 23/10/2026: quem tem OUTRO papel de operacao (cobranca, supervisor, eventos,
  // 24h, auditoria) e tambem vende entra no sistema — o portal do vendedor fica
  // no menu ("Meu Portal de Vendas"). So o consultor (e o gestor sem unidade,
  // que nao tem portal proprio) cai direto no portal do vendedor.
  if (ehVendedor && (!perfil || ['consultor_vendas', 'gestor_regional'].includes(perfil.papel))) return '/vendedor';
  return '/dashboard';
}

function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().split(/\s+/)[0]?.toUpperCase() ?? '';
}

/**
 * O login escolhido para o cadastro de vendedor e da MESMA pessoa? Compara o
 * primeiro nome. Foi o defeito de 20/10/2026: o vendedor BIANCA2 (BIANCA MENDEZ)
 * foi ligado ao login da MARIA CAROLINE, e ela passou a entrar no portal como
 * Bianca. Sem nome dos dois lados nao ha como conferir: nao acusa.
 */
export function vinculoDeOutraPessoa(nomeVendedor: string | null | undefined, nomeUsuario: string | null | undefined): boolean {
  const a = primeiroNome(nomeVendedor);
  const b = primeiroNome(nomeUsuario);
  return !!a && !!b && a !== b;
}
