// Regras puras do modulo de RASTREADORES (sem I/O), espelhando as constraints
// do banco (0025_rastreadores): formato de IMEI, numero do chip e a regra que
// diz se o veiculo esta com o rastreamento pendente.

/** Mantem so digitos (o operador cola IMEI com espacos/hifens do sistema da rastreadora). */
export function normalizarDigitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '');
}

/** IMEI: 14 a 17 digitos (mesmo check do banco). 15 e o padrao GSM. */
export function imeiFormatoValido(imei: string | null | undefined): boolean {
  const d = normalizarDigitos(imei);
  return d.length >= 14 && d.length <= 17;
}

/** Digito verificador (Luhn) do IMEI de 15 digitos — vale so para 15 posicoes. */
export function imeiLuhnValido(imei: string | null | undefined): boolean {
  const d = normalizarDigitos(imei);
  if (d.length !== 15) return false;
  let soma = 0;
  for (let i = 0; i < 15; i++) {
    let n = Number(d[i]);
    // dobra as posicoes pares (indice impar), da direita para a esquerda.
    if ((15 - i) % 2 === 0) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    soma += n;
  }
  return soma % 10 === 0;
}

/** Numero do chip (linha M2M ou ICCID): 8 a 22 digitos (mesmo check do banco). */
export function chipFormatoValido(chip: string | null | undefined): boolean {
  const d = normalizarDigitos(chip);
  return d.length >= 8 && d.length <= 22;
}

/** Exibicao amigavel do chip: telefone BR (10/11 digitos) ou ICCID em blocos de 4. */
export function formatarChip(chip: string | null | undefined): string {
  const d = normalizarDigitos(chip);
  if (!d) return '';
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

export interface DadosRastreador {
  rastreador_imei: string | null;
  rastreador_chip: string | null;
  empresa_rastreamento_id: string | null;
}

/** Ha algum dado de rastreamento preenchido no veiculo? */
export function temRastreador(v: DadosRastreador): boolean {
  return !!(normalizarDigitos(v.rastreador_imei) || normalizarDigitos(v.rastreador_chip) || v.empresa_rastreamento_id);
}

export type SituacaoRastreamento = 'COMPLETO' | 'INCOMPLETO' | 'PENDENTE' | 'NAO_EXIGE';

/**
 * Situacao do rastreamento do veiculo.
 * `exige` vem da regra por tipo de veiculo (`tipos_veiculo.exige_rastreador`).
 *  - COMPLETO  : IMEI + chip + prestador informados.
 *  - INCOMPLETO: comecou a preencher mas falta algo.
 *  - PENDENTE  : exige rastreador e nao ha nenhum dado (alerta "Rastreador pendente").
 *  - NAO_EXIGE : nao exige e nada preenchido.
 */
export function situacaoRastreamento(v: DadosRastreador, exige = false): SituacaoRastreamento {
  const imei = imeiFormatoValido(v.rastreador_imei);
  const chip = chipFormatoValido(v.rastreador_chip);
  const prestador = !!v.empresa_rastreamento_id;
  if (imei && chip && prestador) return 'COMPLETO';
  if (temRastreador(v)) return 'INCOMPLETO';
  return exige ? 'PENDENTE' : 'NAO_EXIGE';
}

/** Valida o formulario de rastreamento; devolve a mensagem do primeiro erro (ou null). */
export function validarRastreador(v: DadosRastreador): string | null {
  const imei = normalizarDigitos(v.rastreador_imei);
  const chip = normalizarDigitos(v.rastreador_chip);
  if (imei && !imeiFormatoValido(imei)) return 'IMEI deve ter de 14 a 17 digitos';
  if (chip && !chipFormatoValido(chip)) return 'Numero do chip deve ter de 8 a 22 digitos';
  if ((imei || chip) && !v.empresa_rastreamento_id) return 'Informe a empresa de rastreamento ("Rastreador por")';
  return null;
}

// ---------------------------------------------------------------------------
// MODULO DE RASTREADORES (0050) — o equipamento como entidade.
// Tudo aqui e espelho exato do banco: `transicao_rastreador_valida`,
// `status_rastreador_exige_motivo` e `numero_status_rastreador`. Mexeu num
// lado, mexa no outro (e no teste).
// ---------------------------------------------------------------------------

// O enum vive em database.types.ts (fonte unica, como os outros do sistema).
import type { StatusRastreador } from '@/lib/database.types';
export type { StatusRastreador };

export interface StatusMeta {
  status: StatusRastreador;
  /** O numero que a equipe fala ("2 - Ativo"). Vem do sistema antigo. */
  numero: number;
  rotulo: string;
  descricao: string;
  /** classes de cor do selo (tokens do tema, nunca hex cru) */
  cor: string;
}

export const STATUS_RASTREADOR: StatusMeta[] = [
  { status: 'DISPONIVEL', numero: 1, rotulo: 'Disponivel', descricao: 'Em estoque, pronto para instalar', cor: 'bg-emerald-50 text-emerald-700' },
  { status: 'ATIVO', numero: 2, rotulo: 'Ativo / Instalado', descricao: 'Instalado em veiculo', cor: 'bg-cyan-50 text-cyan-700' },
  { status: 'INADIMPLENTE', numero: 3, rotulo: 'Inadimplente', descricao: '35+ dias sem pagamento — tentar recuperar', cor: 'bg-amber-50 text-amber-700' },
  { status: 'INATIVO', numero: 4, rotulo: 'Inativo', descricao: 'Pedir devolucao do equipamento', cor: 'bg-amber-50 text-amber-700' },
  { status: 'A_DEVOLVER', numero: 5, rotulo: 'A devolver', descricao: 'Devolucao solicitada — prazo de 5 dias', cor: 'bg-amber-50 text-amber-800' },
  { status: 'COBRAR_RASTREADOR', numero: 6, rotulo: 'Cobrar rastreador', descricao: 'Equipamento nao devolvido — cobrar', cor: 'bg-rose-50 text-rose-700' },
  { status: 'BOLETO_GERADO', numero: 7, rotulo: 'Boleto gerado', descricao: 'Boleto do equipamento emitido', cor: 'bg-rose-50 text-rose-700' },
  { status: 'PENDENCIA_DADOS', numero: 8, rotulo: 'Pendencia de dados', descricao: 'Cadastro incompleto', cor: 'bg-slate-100 text-slate-600' },
  { status: 'MANUTENCAO', numero: 9, rotulo: 'Manutencao', descricao: 'Em reparo', cor: 'bg-slate-100 text-slate-600' },
  { status: 'DUPLICADO', numero: 10, rotulo: 'Duplicado', descricao: 'Registro repetido', cor: 'bg-slate-100 text-slate-500' },
  { status: 'BAIXADO', numero: 11, rotulo: 'Baixado', descricao: 'Sem condicao de uso', cor: 'bg-slate-100 text-slate-500' },
];

export function statusMeta(status: StatusRastreador): StatusMeta {
  return STATUS_RASTREADOR.find((s) => s.status === status) ?? STATUS_RASTREADOR[0];
}
/** "2 - Ativo / Instalado" — como a equipe le. */
export function rotuloStatus(status: StatusRastreador): string {
  const m = statusMeta(status);
  return `${m.numero} - ${m.rotulo}`;
}

/** Espelho de `transicao_rastreador_valida` no banco. */
const TRANSICOES: Record<StatusRastreador, StatusRastreador[]> = {
  DISPONIVEL:        ['ATIVO', 'MANUTENCAO', 'PENDENCIA_DADOS', 'DUPLICADO', 'BAIXADO'],
  ATIVO:             ['DISPONIVEL', 'INADIMPLENTE', 'INATIVO', 'A_DEVOLVER', 'MANUTENCAO', 'BAIXADO'],
  INADIMPLENTE:      ['ATIVO', 'INATIVO', 'A_DEVOLVER', 'DISPONIVEL', 'BAIXADO'],
  INATIVO:           ['A_DEVOLVER', 'COBRAR_RASTREADOR', 'DISPONIVEL', 'MANUTENCAO', 'BAIXADO'],
  A_DEVOLVER:        ['DISPONIVEL', 'COBRAR_RASTREADOR', 'MANUTENCAO', 'BAIXADO'],
  COBRAR_RASTREADOR: ['BOLETO_GERADO', 'DISPONIVEL', 'BAIXADO'],
  BOLETO_GERADO:     ['DISPONIVEL', 'COBRAR_RASTREADOR', 'BAIXADO'],
  PENDENCIA_DADOS:   ['DISPONIVEL', 'DUPLICADO', 'MANUTENCAO', 'BAIXADO'],
  MANUTENCAO:        ['DISPONIVEL', 'BAIXADO'],
  DUPLICADO:         ['DISPONIVEL', 'BAIXADO'],
  BAIXADO:           [],   // terminal: nada volta do sucateado
};

export function transicoesValidas(de: StatusRastreador): StatusRastreador[] {
  return TRANSICOES[de] ?? [];
}
export function podeTransicionar(de: StatusRastreador, para: StatusRastreador): boolean {
  return de === para || transicoesValidas(de).includes(para);
}
/** Baixa, duplicidade e cobranca mexem em patrimonio ou no bolso do associado. */
export function exigeMotivo(para: StatusRastreador): boolean {
  return para === 'BAIXADO' || para === 'DUPLICADO' || para === 'COBRAR_RASTREADOR';
}
/** Ativar e instalar: precisa do veiculo, entao nao entra no menu de status. */
export function statusEscolhiveis(de: StatusRastreador): StatusRastreador[] {
  return transicoesValidas(de).filter((s) => s !== 'ATIVO');
}

export interface AlertaPrazo { mensagem: string; sugestao: StatusRastreador | null; dias: number }

/** Prazos contados sobre `status_desde` — os mesmos da divergencia STATUS_INCOERENTE. */
export function alertaDePrazo(
  status: StatusRastreador,
  statusDesde: string | Date | null | undefined,
  hoje: Date = new Date(),
): AlertaPrazo | null {
  if (!statusDesde) return null;
  const desde = statusDesde instanceof Date ? statusDesde : new Date(statusDesde);
  if (Number.isNaN(desde.getTime())) return null;
  const dias = Math.floor((hoje.getTime() - desde.getTime()) / 86_400_000);
  if (status === 'A_DEVOLVER' && dias > 5)
    return { mensagem: `Devolucao pedida ha ${dias} dias (prazo de 5)`, sugestao: 'COBRAR_RASTREADOR', dias };
  if (status === 'INADIMPLENTE' && dias > 35)
    return { mensagem: `Inadimplente ha ${dias} dias`, sugestao: 'A_DEVOLVER', dias };
  if (status === 'MANUTENCAO' && dias > 30)
    return { mensagem: `Ha ${dias} dias em manutencao`, sugestao: null, dias };
  if (status === 'BOLETO_GERADO' && dias > 30)
    return { mensagem: `Boleto emitido ha ${dias} dias sem desfecho`, sugestao: null, dias };
  return null;
}

/** Tipos de divergencia (espelha `rastreadores_divergencias`). */
export const DIVERGENCIAS: { tipo: string; rotulo: string; severidade: 'ALTA' | 'MEDIA' | 'BAIXA' }[] = [
  { tipo: 'VEICULO_SEM_RASTREADOR', rotulo: 'Veiculo sem rastreador', severidade: 'ALTA' },
  { tipo: 'RASTREADOR_ORFAO', rotulo: 'Equipamento ativo sem veiculo', severidade: 'ALTA' },
  { tipo: 'RASTREADOR_EM_VEICULO_INATIVO', rotulo: 'Equipamento em veiculo fora da base', severidade: 'ALTA' },
  { tipo: 'INADIMPLENTE_COM_EQUIPAMENTO_ATIVO', rotulo: 'Inadimplente com equipamento ativo', severidade: 'ALTA' },
  { tipo: 'VEICULO_COM_MAIS_DE_UM_ATIVO', rotulo: 'Mais de um equipamento no veiculo', severidade: 'ALTA' },
  { tipo: 'EQUIPAMENTO_DUPLICADO', rotulo: 'Numero de serie repetido', severidade: 'ALTA' },
  { tipo: 'STATUS_INCOERENTE', rotulo: 'Status incoerente ou prazo estourado', severidade: 'MEDIA' },
  { tipo: 'FICHA_SEM_EQUIPAMENTO', rotulo: 'Ficha do veiculo sem equipamento cadastrado', severidade: 'MEDIA' },
  { tipo: 'CADASTRO_INCOMPLETO', rotulo: 'Cadastro incompleto', severidade: 'BAIXA' },
];

export const COR_SEVERIDADE: Record<string, string> = {
  ALTA: 'bg-rose-50 text-rose-700',
  MEDIA: 'bg-amber-50 text-amber-700',
  BAIXA: 'bg-slate-100 text-slate-600',
};

export function rotuloDivergencia(tipo: string): string {
  return DIVERGENCIAS.find((d) => d.tipo === tipo)?.rotulo ?? tipo;
}
