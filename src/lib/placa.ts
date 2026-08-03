// Helpers de placa (formatacao e consulta).

export interface DadosPlaca {
  found: boolean;
  manual?: boolean;
  marca?: string | null;
  modelo?: string | null;
  ano_fabricacao?: number | null;
  ano_modelo?: number | null;
  cor?: string | null;
  chassi?: string | null;
}

export function normalizarPlaca(v: string): string {
  return (v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

// Aceita placa antiga (ABC1234) e Mercosul (ABC1D23).
export function placaValida(v: string): boolean {
  const p = normalizarPlaca(v);
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p);
}

export async function consultarPlaca(placa: string): Promise<DadosPlaca> {
  const res = await fetch('/api/placa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ placa: normalizarPlaca(placa) }),
  });
  if (!res.ok) return { found: false, manual: true };
  return res.json();
}
