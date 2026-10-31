// Regras da tela "Consultar acionamentos" (Assistencia 24h) em TypeScript puro,
// sem I/O: filtros por coluna, limites do dia, cor do atendente, selo da
// situacao e a linha do CSV. Ficam aqui para a tela so desenhar e para os
// testes cobrirem o que nao precisa de navegador.
import type { StatusAcionamento } from '@/lib/database.types';
import { seguroParaFiltro } from '@/lib/crm';

// ---------------------------------------------------------------------------
// Filtros (um por coluna da tabela)
// ---------------------------------------------------------------------------
export interface FiltrosConsulta {
  placa: string;
  beneficiario: string;
  servico: string;
  protocolo: string;
  /** YYYY-MM-DD (dia local); vazio = qualquer data. */
  dia: string;
  regional: string;
  atendente: string;
  status: StatusAcionamento | '';
  /** So os abertos pelo usuario logado. */
  meus: boolean;
  /** So os agendados para depois (agendado_para preenchido). */
  agendados: boolean;
}

export const FILTROS_VAZIOS: FiltrosConsulta = {
  placa: '',
  beneficiario: '',
  servico: '',
  protocolo: '',
  dia: '',
  regional: '',
  atendente: '',
  status: '',
  meus: false,
  agendados: false,
};

/** Quantos filtros estao ligados (decide se "Limpar filtros" aparece). */
export function contarFiltros(f: FiltrosConsulta): number {
  let n = 0;
  if (f.placa.trim()) n++;
  if (f.beneficiario.trim()) n++;
  if (f.servico.trim()) n++;
  if (f.protocolo.trim()) n++;
  if (f.dia) n++;
  if (f.regional.trim()) n++;
  if (f.atendente.trim()) n++;
  if (f.status) n++;
  if (f.meus) n++;
  if (f.agendados) n++;
  return n;
}

/** Texto digitado -> trecho seguro para `ilike`/`or` do PostgREST (sem , ( ) * % " ' \). */
export function trechoDeBusca(bruto: string): string {
  return seguroParaFiltro(bruto ?? '');
}

/** Placa digitada ("abc-1d23") -> so letras e numeros, em maiuscula. */
export function placaParaFiltro(bruto: string): string {
  return (bruto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Limites do dia LOCAL escolhido, em ISO/UTC, para `created_at >= de` e
 * `created_at < ate`. A tela mostra as horas no fuso do navegador
 * (formatDateTime), entao o dia filtrado tem de ser o mesmo dia que se le.
 * Data invalida ou vazia = sem filtro.
 */
export function limitesDoDia(dia: string): { de: string; ate: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia ?? '');
  if (!m) return null;
  const [ano, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const inicio = new Date(ano, mes - 1, d, 0, 0, 0, 0);
  // Rejeita 2026-02-31 (o Date "rola" para marco) em vez de filtrar o dia errado.
  if (inicio.getFullYear() !== ano || inicio.getMonth() !== mes - 1 || inicio.getDate() !== d) return null;
  const fim = new Date(ano, mes - 1, d + 1, 0, 0, 0, 0);
  return { de: inicio.toISOString(), ate: fim.toISOString() };
}

// ---------------------------------------------------------------------------
// Apresentacao
// ---------------------------------------------------------------------------

/**
 * Qual das cores do chip cabe ao atendente: a MESMA pessoa cai sempre na mesma
 * posicao, em qualquer tela e em qualquer dia (hash do id, sem estado). Devolve
 * -1 quando nao ha atendente. As classes de cor em si ficam no COMPONENTE: o
 * Tailwind deste projeto so varre src/components, src/app e src/pages, entao
 * classe escrita aqui em src/lib nunca vira CSS.
 */
export function indiceDaCorDoAtendente(id: string | null | undefined, total: number): number {
  if (!id || total <= 0) return -1;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % total;
}

const dois = (n: number) => String(n).padStart(2, '0');

/** "31/10/2026 02:26:41" (fuso do navegador). Vazio/invalido = "-". */
export function formatarDataHora(valor: string | Date | null | undefined): string {
  if (!valor) return '-';
  const d = typeof valor === 'string' ? new Date(valor) : valor;
  if (Number.isNaN(d.getTime())) return '-';
  return (
    `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}`
  );
}

// ---------------------------------------------------------------------------
// Exportacao (CSV que abre no Excel)
// ---------------------------------------------------------------------------

/**
 * Texto de celula seguro para planilha: quem comeca com = + - @ viraria
 * FORMULA no Excel (nome de associado, observacao digitada por terceiros).
 * O apostrofo na frente neutraliza.
 */
export function celulaSegura(valor: string | null | undefined): string {
  const t = String(valor ?? '');
  return /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
}

export const CABECALHO_CSV = [
  'Protocolo', 'OS', 'Data/Hora', 'Placa', 'Beneficiário', 'Serviço',
  'Regional', 'Atendente', 'Prestador', 'Situação', 'Valor total',
];

export interface LinhaConsulta {
  protocolo: string | null;
  codigo_os: string | null;
  created_at: string;
  status: StatusAcionamento;
  valor_total: number | string | null;
  veiculos?: { placa: string } | null;
  clientes?: { nome_razao_social: string } | null;
  servicos_assistencia?: { descricao: string } | null;
  regionais?: { nome: string } | null;
  fornecedores?: { razao_social: string } | null;
}

export function linhaCsv(
  a: LinhaConsulta,
  atendente: string,
  rotuloStatus: string,
): (string | number)[] {
  return [
    celulaSegura(a.protocolo),
    celulaSegura(a.codigo_os),
    formatarDataHora(a.created_at),
    celulaSegura(a.veiculos?.placa),
    celulaSegura(a.clientes?.nome_razao_social),
    celulaSegura(a.servicos_assistencia?.descricao),
    celulaSegura(a.regionais?.nome),
    celulaSegura(atendente),
    celulaSegura(a.fornecedores?.razao_social),
    rotuloStatus,
    Number(a.valor_total ?? 0),
  ];
}
