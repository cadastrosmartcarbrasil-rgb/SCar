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
  if (ehVendedor) return '/vendedor';
  return '/dashboard';
}
