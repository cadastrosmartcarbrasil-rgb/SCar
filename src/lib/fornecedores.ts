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
  if (!fantasia || semAcento(fantasia) === semAcento(f.razao_social)) return f.razao_social;
  return `${fantasia} (${f.razao_social})`;
}

/** Ordena pelo nome que aparece (fantasia primeiro), sem acento. */
export function ordenarFornecedores<T extends Pick<FornecedorBuscavel, 'razao_social' | 'nome_fantasia'>>(lista: T[]): T[] {
  return [...lista].sort((a, b) => semAcento(rotuloFornecedor(a)).localeCompare(semAcento(rotuloFornecedor(b))));
}
