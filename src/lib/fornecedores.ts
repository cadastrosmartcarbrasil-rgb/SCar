// ---------------------------------------------------------------------------
// Busca e rotulo de FORNECEDOR (prestador da 24h, rastreadora, pecas).
//
// O nome que a equipe conhece e o FANTASIA ("Guincho do Ze"), nao a razao
// social ("JOSE DA SILVA TRANSPORTES LTDA") — por isso a busca olha os dois,
// sem acento e sem caixa, e o rotulo mostra o fantasia primeiro.
// ---------------------------------------------------------------------------

import { semAcento } from './crm';

export interface FornecedorBuscavel {
  razao_social: string;
  nome_fantasia?: string | null;
  documento?: string | null;
  cobertura?: string | null;
  contato?: string | null;
}

/**
 * Casa o termo com fantasia, razao social, cobertura, contato ou documento.
 * O documento so entra quando o termo TEM digito: antes, "guincho" virava ""
 * apos tirar os nao-digitos, e `documento.includes('')` e sempre verdadeiro —
 * a busca devolvia a lista inteira para qualquer texto.
 */
export function fornecedorCasaComBusca(f: FornecedorBuscavel, termo: string): boolean {
  const t = semAcento(termo.trim());
  if (!t) return true;
  const textos = [f.nome_fantasia, f.razao_social, f.cobertura, f.contato]
    .filter(Boolean)
    .map((v) => semAcento(String(v)));
  if (textos.some((v) => v.includes(t))) return true;
  const digitos = termo.replace(/\D/g, '');
  return digitos.length >= 3 && (f.documento ?? '').replace(/\D/g, '').includes(digitos);
}

/** "FANTASIA (RAZAO SOCIAL)" — ou so a razao quando nao ha fantasia (ou e igual). */
export function rotuloFornecedor(f: Pick<FornecedorBuscavel, 'razao_social' | 'nome_fantasia'>): string {
  const fantasia = f.nome_fantasia?.trim();
  const razao = (f.razao_social ?? '').trim();
  if (!fantasia || semAcento(fantasia) === semAcento(razao)) return razao;
  return `${fantasia} (${razao})`;
}

/** Ordena pelo nome que aparece (fantasia primeiro), sem acento. */
export function ordenarFornecedores<T extends Pick<FornecedorBuscavel, 'razao_social' | 'nome_fantasia'>>(lista: T[]): T[] {
  return [...lista].sort((a, b) => semAcento(rotuloFornecedor(a)).localeCompare(semAcento(rotuloFornecedor(b))));
}

export interface OpcaoPrestador {
  fornecedor_id: string;
  rotulo: string;
  vinculado: boolean;
  valor_acordado: number | null;
  valor_km: number | null;
  prazo_medio_min: number | null;
}

/**
 * As opcoes de prestador na cotacao do acionamento: primeiro quem tem o
 * SERVICO vinculado (com o valor acordado), depois TODO prestador ativo
 * que ainda nao tem o vinculo. Antes so os vinculados apareciam, e
 * prestador recem-cadastrado (sem servicos marcados) sumia da cotacao —
 * o banco aceita os dois (sem acordo, vale o valor padrao do servico).
 */
export function opcoesPrestadorDoServico(
  vinculados: { fornecedor_id: string; razao_social: string; cobertura?: string | null;
    valor_acordado: number | null; valor_km: number | null; prazo_medio_min: number | null }[],
  todos: (FornecedorBuscavel & { id: string; ativo?: boolean | null; prestador_assistencia?: boolean | null })[],
): OpcaoPrestador[] {
  const porId = new Map(todos.map((f) => [f.id, f]));
  const comCobertura = (base: string, cob?: string | null) => (cob ? `${base} — ${cob}` : base);
  const ja = new Set<string>();
  const primeiro: OpcaoPrestador[] = vinculados.map((v) => {
    ja.add(v.fornecedor_id);
    const f = porId.get(v.fornecedor_id);
    return {
      fornecedor_id: v.fornecedor_id,
      rotulo: comCobertura(f ? rotuloFornecedor(f) : v.razao_social.trim(), v.cobertura),
      vinculado: true,
      valor_acordado: v.valor_acordado,
      valor_km: v.valor_km,
      prazo_medio_min: v.prazo_medio_min,
    };
  });
  const demais = ordenarFornecedores(
    todos.filter((f) => f.ativo !== false && f.prestador_assistencia !== false && !ja.has(f.id)),
  ).map((f) => ({
    fornecedor_id: f.id,
    rotulo: comCobertura(rotuloFornecedor(f), f.cobertura),
    vinculado: false,
    valor_acordado: null,
    valor_km: null,
    prazo_medio_min: null,
  }));
  return [...primeiro, ...demais];
}
