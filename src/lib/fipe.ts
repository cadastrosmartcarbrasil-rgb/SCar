// Integração com a API FIPE (apifipe.com.br).
// Fluxo em cascata: tipo -> marca -> modelo -> ano -> valor.
// O token é secreto e vive SÓ no servidor (route handler /api/fipe); o cliente
// nunca o vê. Aqui ficam os tipos + helpers usados nos dois lados.

export type FipeTipo = 'carros' | 'motos' | 'caminhoes';

export const FIPE_TIPOS: { value: FipeTipo; label: string }[] = [
  { value: 'carros', label: 'Carro' },
  { value: 'motos', label: 'Moto' },
  { value: 'caminhoes', label: 'Caminhao' },
];

// Código de combustível embutido no codAno ("2021-1" = 2021 Gasolina).
export const FIPE_COMBUSTIVEL: Record<string, string> = {
  '1': 'Gasolina',
  '2': 'Alcool',
  '3': 'Diesel',
  '4': 'Eletrico',
  '5': 'Flex',
  '6': 'Hibrido',
};

// Mapeia o dígito de combustível da FIPE para o enum `combustivel` do banco.
export function combustivelEnum(codAno: string | null | undefined): string | null {
  const d = String(codAno ?? '').split('-')[1];
  switch (d) {
    case '1': return 'gasolina';
    case '2': return 'alcool';
    case '3': return 'diesel';
    case '4': return 'eletrico';
    case '5': return 'flex';
    default: return null; // 6 (hibrido) nao existe no enum
  }
}

// "R$ 228.091,00" -> 228091.00 ; também aceita number puro.
export function parseValorBR(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (v == null) return null;
  const s = String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// --- Tipos normalizados devolvidos pelo /api/fipe ---
export interface FipeItem {
  cod: string;   // codMarca / codModelo / codAno
  nome: string;
}
export interface FipeValor {
  valor: number | null;        // valorVeiculo -> numero
  codigoFipe: string | null;   // codFipe
  referencia: string | null;   // refMes / refFipe
  marca: string | null;
  modelo: string | null;
  anoModelo: number | null;
  combustivel: string | null;  // enum do banco
  bruto: Record<string, unknown>;
}

// --- Chamadas ao proxy interno (cliente) ---
async function get<T>(params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/fipe?${qs}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || 'Falha ao consultar a FIPE');
  return body as T;
}

export function fipeMarcas(tipo: FipeTipo) {
  return get<{ configured: boolean; itens: FipeItem[] }>({ tipo });
}
export function fipeModelos(tipo: FipeTipo, marca: string) {
  return get<{ configured: boolean; itens: FipeItem[] }>({ tipo, marca });
}
export function fipeAnos(tipo: FipeTipo, marca: string, modelo: string) {
  return get<{ configured: boolean; itens: FipeItem[] }>({ tipo, marca, modelo });
}
export function fipeValor(tipo: FipeTipo, marca: string, modelo: string, ano: string) {
  return get<{ configured: boolean; valor: FipeValor }>({ tipo, marca, modelo, ano });
}
