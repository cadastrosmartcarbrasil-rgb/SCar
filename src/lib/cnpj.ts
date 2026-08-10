// Helper client-side para consulta de CNPJ (via /api/cnpj -> BrasilAPI).
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
  raw?: unknown;
}

export async function consultarCnpj(cnpj: string): Promise<DadosCnpj> {
  try {
    const res = await fetch('/api/cnpj', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cnpj }),
    });
    if (!res.ok) return { found: false };
    return res.json();
  } catch {
    return { found: false };
  }
}
