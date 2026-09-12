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

/**
 * O REGISTRO do veiculo, que vem junto da consulta por PLACA.
 *
 * A Placa Fipe devolve duas coisas na mesma resposta e elas nao se misturam:
 * `fipe[]` e a AVALIACAO (quanto vale, codigo FIPE, referencia) e
 * `informacoes_veiculo` e o REGISTRO (o que o documento diz — chassi, cor,
 * numero do motor, municipio). O proxy lia so a primeira e jogava a segunda
 * fora, e por isso o chassi "nao vinha" mesmo com a consulta dizendo sucesso.
 *
 * Nao confundir com `/api/placa` (env `PLACA_API_URL`), que e OUTRO provedor,
 * opcional, e ate hoje nunca foi configurado.
 */
export interface RegistroPlaca {
  chassi: string | null;
  numeroMotor: string | null;
  cor: string | null;
  anoFabricacao: number | null;
  anoModelo: number | null;
  marca: string | null;
  modelo: string | null;
  municipio: string | null;
  uf: string | null;
  combustivel: string | null; // enum do banco
}

/** Primeiro valor de texto nao vazio entre chaves candidatas, NA ORDEM dada. */
function texto(o: Record<string, unknown>, ...chaves: string[]): string | null {
  for (const k of chaves) {
    const v = o[k];
    if (typeof v === 'number') return String(v);
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (t) return t;
  }
  return null;
}

function ano(o: Record<string, unknown>, ...chaves: string[]): number | null {
  const t = texto(o, ...chaves);
  const n = Number(String(t ?? '').replace(/\D/g, ''));
  // Ano fora de 1900..2100 e lixo do provedor, nao dado: melhor nulo que um
  // `ano_fabricacao` absurdo gravado na ficha sem ninguem perceber.
  return Number.isFinite(n) && n >= 1900 && n <= 2100 ? n : null;
}

/**
 * Le o bloco `informacoes_veiculo` da resposta da placa.
 *
 * Normaliza como o banco espera: **chassi so alfanumerico em caixa alta** (o
 * mesmo `regexp_replace` que `autorizar_entrada_lead` aplica, 0034) e o resto
 * em CAIXA ALTA, pela convencao de cadastro do projeto — dado que vem de fora
 * entra padronizado, senao "Preta" e "PRETA" viram duas cores.
 *
 * Devolve `null` quando o bloco nao veio: a consulta pode achar a avaliacao
 * FIPE e nao ter registro, e nesse caso a tela nao pode apagar o que ja estava
 * digitado.
 */
export function registroDaPlaca(bruto: unknown): RegistroPlaca | null {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;
  const o = bruto as Record<string, unknown>;

  const chassiBruto = texto(o, 'chassi', 'chassis', 'vin');
  const chassi = chassiBruto
    ? chassiBruto.replace(/[^0-9A-Za-z]/g, '').toUpperCase() || null
    : null;

  const registro: RegistroPlaca = {
    chassi,
    numeroMotor: texto(o, 'motor', 'numero_motor', 'num_motor')?.toUpperCase() ?? null,
    cor: texto(o, 'cor', 'color')?.toLocaleUpperCase('pt-BR') ?? null,
    anoFabricacao: ano(o, 'ano', 'ano_fabricacao'),
    anoModelo: ano(o, 'ano_modelo', 'anoModelo'),
    marca: texto(o, 'marca')?.toLocaleUpperCase('pt-BR') ?? null,
    modelo: texto(o, 'modelo')?.toLocaleUpperCase('pt-BR') ?? null,
    municipio: texto(o, 'municipio', 'cidade')?.toLocaleUpperCase('pt-BR') ?? null,
    uf: texto(o, 'uf', 'estado')?.toUpperCase() ?? null,
    combustivel: combustivelEnum(texto(o, 'combustivel')),
  };

  // Bloco presente mas sem NADA aproveitavel e o mesmo que bloco ausente.
  const temAlgo = Object.values(registro).some((v) => v !== null);
  return temAlgo ? registro : null;
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

// Placa -> avaliacao FIPE + REGISTRO do veiculo (uma chamada).
export function fipePorPlaca(placa: string) {
  return post<{
    configured: boolean;
    valor: FipeValor | null;
    opcoes: FipeValor[];
    registro: RegistroPlaca | null;
  }>('placa', { placa });
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
