// Helper client-side para consulta de CNPJ (via /api/cnpj -> BrasilAPI, CNPJ.ws, ReceitaWS).
export interface DadosCnpj {
  found: boolean;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  situacao_cadastral?: string | null;
  cnae_principal?: string | null;
  email?: string | null;
  telefone?: string | null;
  endereco?: {
    cep?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    uf?: string | null;
  };
  /** qual provedor respondeu (BrasilAPI, CNPJ.ws, ReceitaWS) */
  fonte?: string;
  /** todos responderam que o CNPJ nao existe */
  nao_encontrado?: boolean;
  /** o que cada provedor respondeu, quando nenhum achou */
  tentativas?: string[];
  raw?: unknown;
}

export async function consultarCnpj(cnpj: string): Promise<DadosCnpj> {
  try {
    const res = await fetch('/api/cnpj', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cnpj }),
    });
    if (!res.ok) return { found: false, tentativas: [`servidor: HTTP ${res.status}`] };
    return res.json();
  } catch {
    return { found: false, tentativas: ['sem conexão com o servidor'] };
  }
}
