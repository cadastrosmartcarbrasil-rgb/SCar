// ---------------------------------------------------------------------------
// Caixa do texto digitado nos formularios.
//
// Regra do negocio: cadastro se escreve em MAIUSCULAS. Nome, endereco, cidade,
// marca, modelo — tudo padronizado, para que a mesma pessoa nao apareca como
// "Joao da Silva", "JOAO DA SILVA" e "joao da silva" em tres telas.
//
// A transformacao e no VALOR, nao no CSS: `text-transform: uppercase` so pinta
// a tela e continuaria gravando no banco o que foi digitado — o cadastro seguiria
// baguncado, que e exatamente o problema que se quer resolver.
//
// Ha excecoes que NAO podem ser tocadas, porque a caixa alta as quebra:
//   . e-mail        — o padrao manda tratar a caixa da parte local como
//                     significativa; alem disso "JOAO@X.COM" e feio no envio;
//   . senha         — caixa alta muda a credencial;
//   . URL / link    — caminho de servidor pode diferenciar maiuscula;
//   . chave PIX     — a aleatoria e um UUID e a de e-mail e um e-mail: os dois
//                     deixam de casar com o cadastro do banco se forem alterados;
//   . token/codigo de integracao — sao segredos, comparados byte a byte.
// ---------------------------------------------------------------------------

/** Tipos de input que nao sao texto livre — mexer neles nao faz sentido. */
const TIPOS_NAO_TEXTUAIS = new Set([
  'number', 'date', 'time', 'datetime-local', 'month', 'week',
  'color', 'file', 'checkbox', 'radio', 'range', 'hidden', 'image', 'submit', 'button',
]);

/** Tipos que sao texto, mas cujo conteudo nao pode virar caixa alta. */
const TIPOS_CAIXA_ORIGINAL = new Set(['email', 'password', 'url']);

/**
 * Nomes de campo que preservam a caixa mesmo sendo `type="text"`.
 * Casa por PEDACO do nome: `chave_pix`, `chavePix` e `pix` caem todos aqui.
 */
const NOMES_CAIXA_ORIGINAL = [
  'email', 'mail', 'senha', 'password', 'url', 'link', 'site',
  'pix', 'token', 'chave', 'secret', 'slug', 'webhook',
];

function normalizarNome(nome?: string) {
  return (nome ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * O campo deve manter exatamente o que foi digitado?
 * `type` e `name` sao os do proprio <input>, entao a decisao acontece sem que
 * cada tela precise lembrar de marcar nada.
 */
export function preservaCaixa(type?: string, name?: string): boolean {
  const t = (type ?? 'text').toLowerCase();
  if (TIPOS_NAO_TEXTUAIS.has(t)) return true;
  if (TIPOS_CAIXA_ORIGINAL.has(t)) return true;

  const n = normalizarNome(name);
  return NOMES_CAIXA_ORIGINAL.some((termo) => n.includes(termo));
}

/**
 * Aplica a caixa alta preservando acentuacao ("acao" -> "ACAO", "joao" -> "JOAO").
 * `toLocaleUpperCase('pt-BR')` e o certo aqui: o `toUpperCase()` simples ja
 * resolveria o portugues, mas o locale deixa a intencao explicita e evita
 * surpresa se algum dia entrar texto de outro idioma.
 */
export function paraCaixaAlta(valor: string): string {
  return valor.toLocaleUpperCase('pt-BR');
}

/**
 * O que gravar a partir do que foi digitado, ja considerando as excecoes.
 * E esta a funcao que o <Input> chama.
 */
export function valorComCaixaPadrao(valor: string, type?: string, name?: string): string {
  return preservaCaixa(type, name) ? valor : paraCaixaAlta(valor);
}
