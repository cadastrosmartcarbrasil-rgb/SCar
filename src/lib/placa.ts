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

/**
 * 0136 — como o veiculo aparece na tela quando falta a placa. O 0 km (placa
 * pendente) e identificado pelo CHASSI; mostrar so "—" faria a lista ter
 * varias linhas iguais e o atendente nao acharia o carro. O final do chassi e
 * o que se le no documento e no proprio veiculo.
 */
export function identificacaoVeiculo(
  placa: string | null | undefined,
  chassi?: string | null,
): string {
  const p = (placa ?? '').trim();
  if (p) return p;
  const c = (chassi ?? '').trim().toUpperCase();
  return c ? `0 KM · CHASSI …${c.slice(-6)}` : '0 KM · SEM PLACA';
}

/** 0136 — placa pendente = sem placa gravada (o 0 km que ainda nao emplacou). */
export function placaPendente(placa: string | null | undefined): boolean {
  return !(placa ?? '').trim();
}

/**
 * 0136 — a mesma regra de `chk_veiculo_identidade`, para a TELA dizer o motivo
 * antes do banco recusar: com placa, ela tem de ser valida; sem placa, so
 * marcado 0 km E com o chassi (17 caracteres, a identidade do 0 km).
 */
export function validarIdentidadeVeiculo(v: {
  placa?: string | null;
  zero_km?: boolean | null;
  chassi?: string | null;
}): string | null {
  const placa = normalizarPlaca(v.placa ?? '');
  if (placa) return placaValida(placa) ? null : 'Placa inválida';
  if (!v.zero_km) return 'Informe a placa ou marque "Veículo 0 km (placa pendente)"';
  const chassi = (v.chassi ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (chassi.length !== 17) return 'Veículo 0 km sem placa precisa do chassi completo (17 caracteres)';
  return null;
}
