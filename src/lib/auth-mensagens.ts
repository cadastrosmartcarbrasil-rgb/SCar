// Mensagens de LOGIN em portugues.
//
// O `signInWithPassword` devolve o texto do GoTrue em ingles ("Invalid login
// credentials"), e era isso que aparecia no toast — quem esta tentando entrar
// nao sabe se errou a senha, se o cadastro esta inativo ou se o sistema caiu.
//
// A REGRA DE SEGURANCA CONTINUA: e-mail inexistente e senha errada tem a MESMA
// resposta (a mesma escolha do /portal/login), para nao confirmar a ninguem se
// um e-mail e da equipe.

/** Sessao guardada no navegador que o servidor nao aceita mais. */
export function ehSessaoCorrompida(mensagem: string | null | undefined): boolean {
  const m = (mensagem ?? '').toLowerCase();
  return (
    m.includes('refresh token') ||
    m.includes('invalid claim') ||
    m.includes('session') && m.includes('expired') ||
    m.includes('jwt')
  );
}

export function mensagemDeLogin(mensagem: string | null | undefined): string {
  const m = (mensagem ?? '').toLowerCase();
  if (!m) return 'Nao foi possivel entrar. Tente de novo.';
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'E-mail ainda nao confirmado. Fale com o administrador.';
  if (m.includes('user is banned') || m.includes('user not found')) return 'E-mail ou senha incorretos.';
  if (m.includes('too many requests') || m.includes('rate limit')) {
    return 'Tentativas demais. Espere um minuto e tente de novo.';
  }
  if (ehSessaoCorrompida(m)) {
    return 'A sessao anterior expirou. Limpamos o acesso — clique em Entrar de novo.';
  }
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed')) {
    return 'Sem conexao com o servidor. Confira a internet e tente de novo.';
  }
  return 'Nao foi possivel entrar. Tente de novo.';
}

/**
 * Para onde o login pode mandar depois de entrar.
 *
 * O `?redirect=` vem da URL, entao e escrito por QUEM MANDA O LINK — nao por
 * nos. Sem filtro, `/login?redirect=https://site-falso/` faz a nossa tela de
 * login legitima jogar a pessoa em outro dominio logo apos ela digitar a
 * senha: e o desenho classico de phishing. So caminho INTERNO passa.
 *
 * E o `/api/*` tambem fica de fora: o middleware protege as rotas de API do
 * mesmo jeito que as paginas, entao um logout durante uma chamada dessas grava
 * `redirect=/api/...` — e o login "bem-sucedido" terminaria numa tela de JSON,
 * que para quem esta olhando e igualzinho a "nao entrou".
 */
export function destinoDoLogin(redirect: string | null | undefined, padrao: string): string {
  if (!redirect) return padrao;
  // `//host` e `/\host` sao caminhos relativos a protocolo: saem do dominio.
  if (!redirect.startsWith('/') || redirect.startsWith('//') || redirect.startsWith('/\\')) {
    return padrao;
  }
  if (redirect === '/api' || redirect.startsWith('/api/')) return padrao;
  if (redirect === '/login' || redirect.startsWith('/login')) return padrao;
  return redirect;
}
