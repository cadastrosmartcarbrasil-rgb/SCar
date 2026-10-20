/**
 * O PostgREST do Supabase devolve no MAXIMO 1.000 linhas por consulta
 * (max-rows), em silencio: sem erro, sem aviso. Lista que carrega a tabela
 * inteira para filtrar na tela passa a mentir no dia em que a tabela cresce —
 * foi o que aconteceu com veiculos (2.898) e clientes (2.564) depois da carga
 * do Mutual: 1.898 veiculos sumiram de /veiculos, inclusive do "Editar" do SAC.
 *
 * `lerTodas` pede pagina a pagina ate vir uma pagina incompleta. A consulta
 * passada TEM de ter ordenacao total (com desempate unico, ex.: `id`), senao
 * o banco pode repetir ou pular linhas entre uma pagina e outra.
 */
export const PAGINA_POSTGREST = 1000;

export async function lerTodas<T>(
  pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  tamanho = PAGINA_POSTGREST,
  limiteDePaginas = 200,
): Promise<T[]> {
  const todas: T[] = [];
  for (let p = 0; p < limiteDePaginas; p++) {
    const de = p * tamanho;
    const { data, error } = await pagina(de, de + tamanho - 1);
    if (error) throw error;
    const linhas = data ?? [];
    todas.push(...linhas);
    if (linhas.length < tamanho) return todas;
  }
  throw new Error('Leitura paginada passou do limite de páginas — a consulta não termina.');
}
