// Regras puras do modulo de Terceiros do Evento (testadas em terceiros.test.ts).
// O banco (0103) e a fonte de verdade; aqui ficam as mesmas regras para dar
// feedback imediato na tela, sem ida e volta ao servidor.

import { validarDocumento, soDigitos } from './documento';
import { placaValida, normalizarPlaca } from './placa';
import { somarMoeda } from './money';
import type {
  EventoTerceirosRow,
  LancamentosFinanceirosRow,
  StatusTerceiro,
  TipoEnvolvimento,
} from './database.types';

export const PAPEL_LABEL: Record<TipoEnvolvimento, string> = {
  CAUSADOR: 'Causador',
  VITIMA: 'Vitima',
};

export const STATUS_TERCEIRO: Record<StatusTerceiro, { label: string; cor: string }> = {
  EM_ANALISE: { label: 'Em analise', cor: 'border-sky-200 bg-sky-50 text-sky-700' },
  AGUARDANDO_DOCUMENTOS: { label: 'Aguardando documentos', cor: 'border-amber-200 bg-amber-50 text-amber-700' },
  EM_REPARO: { label: 'Em reparo', cor: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  ACORDO: { label: 'Acordo', cor: 'border-violet-200 bg-violet-50 text-violet-700' },
  INDENIZADO: { label: 'Indenizado', cor: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  NEGADO: { label: 'Negado', cor: 'border-rose-200 bg-rose-50 text-rose-700' },
  ENCERRADO: { label: 'Encerrado', cor: 'border-slate-200 bg-slate-100 text-slate-600' },
};

/** Rotulo do vinculo exigido pela regra de negocio. */
export function rotuloVinculo(codigo: string, protocolo: string | null, associado: string | null): string {
  return `Terceiro ${codigo} · Evento ${protocolo ?? '-'} · Associado ${associado ?? '-'}`;
}

export type TerceiroForm = Partial<EventoTerceirosRow>;

/** Valida o cadastro do terceiro. Retorna a lista de erros (vazia = ok). */
export function validarTerceiro(t: TerceiroForm): string[] {
  const erros: string[] = [];
  if (!t.nome?.trim()) erros.push('Informe o nome do terceiro');

  const doc = soDigitos(t.cpf_cnpj ?? '');
  if (doc && !validarDocumento(doc, t.tipo_pessoa ?? 'PF')) {
    erros.push(t.tipo_pessoa === 'PJ' ? 'CNPJ do terceiro invalido' : 'CPF do terceiro invalido');
  }

  if (t.condutor_e_proprietario === false) {
    if (!t.condutor_nome?.trim()) erros.push('Informe o nome do condutor');
    const cpfCondutor = soDigitos(t.condutor_cpf ?? '');
    if (cpfCondutor && !validarDocumento(cpfCondutor, 'PF')) erros.push('CPF do condutor invalido');
  }

  if (t.possui_veiculo !== false && t.veiculo_placa && !placaValida(normalizarPlaca(t.veiculo_placa))) {
    erros.push('Placa do veiculo do terceiro invalida');
  }

  if (t.possui_seguro && !t.seguradora?.trim()) erros.push('Informe a seguradora do terceiro');
  if (t.valor_estimado_danos != null && t.valor_estimado_danos < 0) erros.push('Valor dos danos nao pode ser negativo');
  return erros;
}

/** Evento informou terceiros mas ainda nao ha nenhum cadastrado. */
export function terceiroPendente(possuiTerceiros: boolean, qtdCadastrados: number): boolean {
  return possuiTerceiros && qtdCadastrados === 0;
}

// ---------------------------------------------------------------------------
// Favorecido das contas do evento
// ---------------------------------------------------------------------------
type LancFav = Pick<LancamentosFinanceirosRow, 'tipo' | 'evento_id' | 'fornecedor_id' | 'evento_terceiro_id'>;

export type TipoFavorecido = 'FORNECEDOR' | 'TERCEIRO' | null;

/**
 * Quem recebe o pagamento. Regra (igual ao banco): fornecedor preenchido manda;
 * sem fornecedor e com terceiro, o favorecido e o proprio terceiro (indenizacao).
 */
export function tipoFavorecido(l: Pick<LancFav, 'fornecedor_id' | 'evento_terceiro_id'>): TipoFavorecido {
  if (l.fornecedor_id) return 'FORNECEDOR';
  if (l.evento_terceiro_id) return 'TERCEIRO';
  return null;
}

/** Mensagem de erro se a conta a pagar do evento estiver sem favorecido. */
export function erroFavorecidoEvento(l: Partial<LancFav>): string | null {
  if (l.tipo !== 'DESPESA' || !l.evento_id) return null;
  if (l.fornecedor_id || l.evento_terceiro_id) return null;
  return 'Conta a pagar do evento exige favorecido: informe o fornecedor ou o terceiro';
}

// ---------------------------------------------------------------------------
// Resumo financeiro do evento (ou de um terceiro)
// ---------------------------------------------------------------------------
type LancResumo = Pick<LancamentosFinanceirosRow, 'tipo' | 'status' | 'valor_original' | 'valor_pago' | 'valor_saldo'>;

export interface ResumoFinanceiroEvento {
  aPagar: number;
  aReceber: number;
  pago: number;
  recebido: number;
  saldoPagar: number;
  saldoReceber: number;
  /** Custo liquido do evento: despesas - receitas (cancelados fora). */
  custoLiquido: number;
}

export function resumoFinanceiroEvento(lancs: LancResumo[]): ResumoFinanceiroEvento {
  const ativos = lancs.filter((l) => l.status !== 'cancelado');
  const desp = ativos.filter((l) => l.tipo === 'DESPESA');
  const rec = ativos.filter((l) => l.tipo === 'RECEITA');
  const soma = (xs: LancResumo[], f: (l: LancResumo) => number) => somarMoeda(...xs.map(f));

  const aPagar = soma(desp, (l) => Number(l.valor_original));
  const aReceber = soma(rec, (l) => Number(l.valor_original));
  return {
    aPagar,
    aReceber,
    pago: soma(desp, (l) => Number(l.valor_pago)),
    recebido: soma(rec, (l) => Number(l.valor_pago)),
    saldoPagar: soma(desp, (l) => Number(l.valor_saldo)),
    saldoReceber: soma(rec, (l) => Number(l.valor_saldo)),
    custoLiquido: somarMoeda(aPagar, -aReceber),
  };
}
