// Integração com a API Placa Fipe (placafipe.com.br).
// Contrato: POST JSON, token NO CORPO, base https://api.placafipe.com.br,
// envelope de resposta { codigo, msg, tempo, unidade_tempo, ...payload }.
// O token é secreto e vive SÓ no servidor (proxy /api/fipe). O cliente chama
// o proxy interno por "action".
//
// Endpoints usados (todos POST):
//   getplacafipe   {placa}                 -> { fipe: [ {marca,modelo,ano_modelo,codigo_fipe,combustivel,valor,...} ] }
//   get-veiculos-tipos {}                  -> tipos
//   get-marcas     {codigo_tipo_veiculo?}  -> [ {codigo_marca, descricao, veiculo_tipo} ]
//   get-modelos    {codigo_marca}          -> { modelos:[{Label,Value}], anos:[{Label,Value}] }
//   fipebycodigo   {codigo_fipe, ano}      -> { marca,modelo,ano_modelo,codigo_fipe,combustivel,valor }

export type FipeTipo = 'carros' | 'motos' | 'caminhoes';

export const FIPE_TIPOS: { value: FipeTipo; label: string; codigo: number }[] = [
  { value: 'carros', label: 'Carro', codigo: 1 },
  { value: 'motos', label: 'Moto', codigo: 2 },
  { value: 'caminhoes', label: 'Caminhao', codigo: 3 },
];

// "22159.00" (placafipe) e "R$ 228.091,00" (formato BR) -> numero.
// Detecta o separador decimal pela ULTIMA ocorrencia de , ou .
export function parseValor(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  const s = String(v).replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const dec = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  if (dec === -1) {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  const intPart = s.slice(0, dec).replace(/[.,]/g, '');
  const fracPart = s.slice(dec + 1).replace(/[.,]/g, '');
  const n = Number(`${intPart || '0'}.${fracPart}`);
  return Number.isFinite(n) ? n : null;
}

// Combustivel textual da FIPE -> enum `combustivel` do banco.
export function combustivelEnum(texto: string | null | undefined): string | null {
  const s = String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  if (!s) return null;
  if (s.includes('FLEX') || s.includes('/')) return 'flex';
  if (s.startsWith('GASOL')) return 'gasolina';
  if (s.startsWith('ALCO') || s.startsWith('ETAN')) return 'alcool';
  if (s.startsWith('DIES')) return 'diesel';
  if (s.startsWith('ELET')) return 'eletrico';
  return null; // hibrido e outros nao existem no enum
}

// --- Tipos normalizados devolvidos pelo /api/fipe ---
export interface FipeItem {
  cod: string;
  nome: string;
}
export interface FipeValor {
  valor: number | null;
  codigoFipe: string | null;
  referencia: string | null;
  marca: string | null;
  modelo: string | null;
  anoModelo: number | null;
  combustivel: string | null; // enum do banco
  bruto: Record<string, unknown>;
}

type Action = 'placa' | 'tipos' | 'marcas' | 'modelos' | 'valor';

async function post<T>(action: Action, params: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/fipe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || 'Falha ao consultar a FIPE');
  return body as T;
}

// Placa -> dados + valor FIPE (uma chamada).
export function fipePorPlaca(placa: string) {
  return post<{ configured: boolean; valor: FipeValor | null; opcoes: FipeValor[] }>('placa', { placa });
}
export function fipeMarcas(tipoCodigo: number) {
  return post<{ configured: boolean; itens: FipeItem[] }>('marcas', { codigo_tipo_veiculo: tipoCodigo });
}
export function fipeModelos(codigoMarca: string) {
  return post<{ configured: boolean; modelos: FipeItem[]; anos: FipeItem[] }>('modelos', { codigo_marca: codigoMarca });
}
export function fipeValor(codigoFipe: string, ano: string) {
  return post<{ configured: boolean; valor: FipeValor | null }>('valor', { codigo_fipe: codigoFipe, ano });
}
