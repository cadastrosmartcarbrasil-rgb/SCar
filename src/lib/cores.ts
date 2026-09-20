/**
 * Catalogo de cores do VEICULO (migration 0080).
 *
 * ATENCAO ao nome: isto NAO e a paleta visual do sistema (essa vive em
 * `globals.css` / `tema.ts` e, no white-label, ira para `empresa`). Aqui e a
 * cor do CARRO — o vocabulario do CRLV.
 *
 * Espelho puro do SQL: `cor_normalizada` e `cor_do_texto` existem no banco e e
 * LA que a regra vale (o trigger escreve por qualquer caminho). Esta copia
 * serve a TELA — para o seletor mostrar o que o banco fara antes de salvar.
 * Mexeu num lado, mexa no outro e nos dois testes.
 */

export type Cor = {
  id: string;
  nome: string;
  hex: string | null;
  ativo: boolean;
  apelidos?: string[] | null;
};

/** CAIXA ALTA, sem acento, pontuacao virando espaco, espaco unico. */
export function corNormalizada(texto: string | null | undefined): string | null {
  const limpo = (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
  return limpo === '' ? null : limpo;
}

/**
 * Os MESMOS quatro degraus do `cor_do_texto` do banco: nome, apelido, primeira
 * palavra como nome, primeira palavra como apelido. Devolve `null` quando nao
 * reconhece — e `null` aqui nunca significa "recusa", significa "vai para a
 * fila de `cores_nao_reconhecidas()`".
 */
export function corDoTexto(texto: string | null | undefined, catalogo: Cor[]): Cor | null {
  const alvo = corNormalizada(texto);
  if (!alvo) return null;

  const ativas = catalogo.filter((c) => c.ativo);
  const primeira = alvo.split(' ')[0] ?? '';

  const porNome = (t: string) => ativas.find((c) => corNormalizada(c.nome) === t) ?? null;
  const porApelido = (t: string) =>
    ativas.find((c) => (c.apelidos ?? []).some((a) => corNormalizada(a) === t)) ?? null;

  return (
    porNome(alvo) ??
    porApelido(alvo) ??
    (primeira ? porNome(primeira) : null) ??
    (primeira ? porApelido(primeira) : null)
  );
}

/**
 * O que o banco GRAVARIA para este texto. Reconhecida -> o nome canonico;
 * desconhecida -> o texto em caixa alta, com o acento PRESERVADO (a fila de
 * revisao e lida por gente); vazia -> `null`, nunca `''`.
 */
export function corComoSeraGravada(
  texto: string | null | undefined,
  catalogo: Cor[],
): { cor: string | null; cor_id: string | null; reconhecida: boolean } {
  if (corNormalizada(texto) === null) return { cor: null, cor_id: null, reconhecida: false };

  const achou = corDoTexto(texto, catalogo);
  if (achou) return { cor: achou.nome, cor_id: achou.id, reconhecida: true };

  return {
    cor: (texto ?? '').trim().replace(/\s+/g, ' ').toUpperCase(),
    cor_id: null,
    reconhecida: false,
  };
}

/**
 * Cor de veiculo nao tem hex exato — a amostra existe para RECONHECER, nao para
 * pintar. Branco e prata precisam de borda, senao somem no cartao claro; preto
 * precisa de borda clara no tema escuro. Por isso o contorno e sempre desenhado.
 */
export function amostraDaCor(cor: Pick<Cor, 'hex'> | null | undefined): string {
  return cor?.hex ?? 'transparent';
}

/** Opcoes do seletor: as ativas na ordem do catalogo, mais a cor JA GRAVADA
 *  quando ela nao esta na lista — senao abrir uma ficha antiga mostraria o
 *  campo em branco e o primeiro "salvar" apagaria a cor em silencio.
 *  (E a mesma regra do `opcoesParaEscolher` das regionais, 0067.) */
export function opcoesDeCor(catalogo: Cor[], atual: string | null | undefined): string[] {
  const nomes = catalogo.filter((c) => c.ativo).map((c) => c.nome);
  const valor = (atual ?? '').trim();
  if (valor && !nomes.some((n) => corNormalizada(n) === corNormalizada(valor))) {
    return [valor, ...nomes];
  }
  return nomes;
}
