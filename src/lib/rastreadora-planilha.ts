// Planilha de FATURAMENTO de uma rastreadora (ex.: MULTITRAC / TOTAL TRAC):
// uma linha por veiculo rastreado, ligada por PLACA (chassi como reserva).
// Ela serve para duas coisas, na mesma tela:
//   1. ligar a ficha do veiculo a rastreadora (veiculos.empresa_rastreamento_id),
//      quando a planilha nao traz IMEI e o equipamento nao pode entrar no parque;
//   2. CONFERIR a fatura: quem e cobrado e ja saiu da base, quem tem rastreador
//      de outra empresa, quem nao existe aqui e quem a rastreadora deixou de cobrar.
// Nada aqui grava: a tela grava so o que for VINCULAR.

import { normalizarCabecalho } from './precificacao-import';
import { normalizarPlaca, placaValida, placaCanonica } from './placa';
import { parseMoedaBR } from './money';

export interface LinhaRastreadora {
  /** linha no Excel (1 = primeira), para a tela apontar */
  linha: number;
  placa: string;
  chassi: string | null;
  valor: number | null;
  instalado_em: string | null;
  retirado_em: string | null;
  imei: string | null;
}

export interface LeituraPlanilha {
  linhas: LinhaRastreadora[];
  erros: string[];
  avisos: string[];
}

const COLUNAS: Record<keyof Omit<LinhaRastreadora, 'linha'>, string[]> = {
  placa: ['placa'],
  chassi: ['chassi', 'chassis'],
  valor: ['servico mensal', 'valor', 'valor mensal', 'mensalidade'],
  instalado_em: ['data instalacao contrato', 'data instalacao', 'instalacao', 'data de instalacao'],
  retirado_em: ['data retirada contrato', 'data retirada', 'retirada', 'data de retirada'],
  imei: ['imei', 'serial', 'numero de serie'],
};

/** Chassi utilizavel: 17 caracteres e sem mascara ("*****24132" nao serve). */
export function chassiUtil(v: string | null | undefined): string | null {
  const c = String(v ?? '').toUpperCase().replace(/[^A-Z0-9*]/g, '');
  if (!c || c.includes('*') || c.length !== 17) return null;
  return c;
}

const cabecalho = (t: string) => normalizarCabecalho(t).toLowerCase();

function texto(v: string | undefined): string | null {
  const t = String(v ?? '').trim();
  return t ? t : null;
}

/** Le a matriz da planilha: acha o cabecalho (a linha que tem "Placa") e ignora totais. */
export function interpretarPlanilhaRastreadora(matriz: string[][]): LeituraPlanilha {
  const erros: string[] = [];
  const avisos: string[] = [];
  const iCab = matriz.findIndex((l) => l.some((c) => cabecalho(c) === 'placa'));
  if (iCab < 0) return { linhas: [], erros: ['Não achei a coluna "Placa" na planilha.'], avisos };

  const cab = matriz[iCab].map((c) => cabecalho(c));
  const col = {} as Record<keyof typeof COLUNAS, number>;
  (Object.keys(COLUNAS) as (keyof typeof COLUNAS)[]).forEach((k) => {
    col[k] = cab.findIndex((c) => COLUNAS[k].includes(c));
  });

  const linhas: LinhaRastreadora[] = [];
  const vistas = new Map<string, number>();
  for (let i = iCab + 1; i < matriz.length; i++) {
    const l = matriz[i];
    const bruta = texto(l[col.placa]);
    if (!bruta) continue;
    if (/total/i.test(bruta)) continue;
    const placa = normalizarPlaca(bruta);
    const nLinha = i + 1;
    if (!placaValida(placa)) {
      avisos.push(`Linha ${nLinha}: "${bruta}" não é uma placa — ignorada.`);
      continue;
    }
    const chave = placaCanonica(placa);
    if (vistas.has(chave)) {
      avisos.push(`Linha ${nLinha}: ${placa} repetida (já na linha ${vistas.get(chave)}) — ignorada.`);
      continue;
    }
    vistas.set(chave, nLinha);
    const valorTxt = col.valor >= 0 ? texto(l[col.valor]) : null;
    const imei = col.imei >= 0 ? String(l[col.imei] ?? '').replace(/\D/g, '') : '';
    linhas.push({
      linha: nLinha,
      placa,
      chassi: col.chassi >= 0 ? chassiUtil(l[col.chassi]) : null,
      valor: valorTxt == null ? null : (Number(valorTxt.replace(',', '.')) || parseMoedaBR(valorTxt)),
      instalado_em: col.instalado_em >= 0 ? texto(l[col.instalado_em]) : null,
      retirado_em: col.retirado_em >= 0 ? texto(l[col.retirado_em]) : null,
      imei: /^\d{14,17}$/.test(imei) ? imei : null,
    });
  }
  if (!linhas.length) erros.push('Nenhuma placa válida na planilha.');
  return { linhas, erros, avisos };
}

/** O que a tela sabe de cada veiculo da base encontrado. */
export interface VeiculoBase {
  id: string;
  placa: string | null;
  chassi: string | null;
  status: string;
  regional: string | null;
  associado: string | null;
  empresa_rastreamento_id: string | null;
  /** rastreadora do equipamento ATIVO/INADIMPLENTE no parque, se houver */
  parque_rastreadora_id: string | null;
  parque_rastreadora_nome: string | null;
}

export type SituacaoRastreadora =
  | 'VINCULAR'
  | 'JA_VINCULADO'
  | 'OUTRA_RASTREADORA'
  | 'FORA_DA_BASE'
  | 'RETIRADO'
  | 'NAO_ENCONTRADO';

export const ROTULO_SITUACAO: Record<SituacaoRastreadora, { titulo: string; texto: string; tom: 'ok' | 'info' | 'alerta' }> = {
  VINCULAR: { titulo: 'Vincular', texto: 'Na base e sem outro rastreador: a ficha passa a dizer que esta rastreadora rastreia o veículo.', tom: 'ok' },
  JA_VINCULADO: { titulo: 'Já vinculado', texto: 'A ficha já aponta para esta rastreadora.', tom: 'info' },
  OUTRA_RASTREADORA: { titulo: 'Rastreador de outra empresa', texto: 'O veículo tem rastreador de outra empresa. Troca de equipamento ou dois aparelhos? Conferir a cobrança.', tom: 'alerta' },
  FORA_DA_BASE: { titulo: 'Fora da base (cobrado)', texto: 'O veículo saiu da base e a rastreadora continua cobrando: pedir a retirada e o abatimento.', tom: 'alerta' },
  RETIRADO: { titulo: 'Retirado', texto: 'A planilha informa a data de retirada: não é vinculado.', tom: 'info' },
  NAO_ENCONTRADO: { titulo: 'Não está na base', texto: 'Nenhum veículo com essa placa (nem com o chassi) no SCar: conferir com a rastreadora.', tom: 'alerta' },
};

/** Os status em que o veiculo ainda esta na base (o mesmo recorte da 0174). */
const NA_BASE = ['ativo', 'em_evento', 'vistoria_pendente', 'inadimplente'];

export interface ItemConferencia extends LinhaRastreadora {
  situacao: SituacaoRastreadora;
  veiculo: VeiculoBase | null;
  casou_por: 'PLACA' | 'CHASSI' | null;
  detalhe: string | null;
}

export interface Conferencia {
  itens: ItemConferencia[];
  /** veiculos ligados a esta rastreadora na ficha que NAO vieram na fatura */
  fora_da_fatura: VeiculoBase[];
  porSituacao: Record<SituacaoRastreadora, { qtd: number; valor: number }>;
  total: { qtd: number; valor: number };
}

export function conferirPlanilha(
  linhas: LinhaRastreadora[],
  veiculos: VeiculoBase[],
  rastreadoraId: string,
  vinculadosHoje: VeiculoBase[] = [],
): Conferencia {
  const porPlaca = new Map<string, VeiculoBase>();
  const porChassi = new Map<string, VeiculoBase>();
  // na placa repetida (nao deveria), o que esta na base vence
  const ordem = [...veiculos].sort((a, b) => Number(NA_BASE.includes(b.status)) - Number(NA_BASE.includes(a.status)));
  for (const v of ordem) {
    // chave na forma antiga: a planilha e o SCar podem ter a placa em formatos diferentes (Mercosul)
    if (v.placa && !porPlaca.has(placaCanonica(v.placa))) porPlaca.set(placaCanonica(v.placa), v);
    const ch = chassiUtil(v.chassi);
    if (ch && !porChassi.has(ch)) porChassi.set(ch, v);
  }

  const itens: ItemConferencia[] = linhas.map((l) => {
    let veiculo = porPlaca.get(placaCanonica(l.placa)) ?? null;
    let casou_por: ItemConferencia['casou_por'] = veiculo ? 'PLACA' : null;
    if (!veiculo && l.chassi) {
      veiculo = porChassi.get(l.chassi) ?? null;
      if (veiculo) casou_por = 'CHASSI';
    }
    const base = { ...l, veiculo, casou_por };
    if (l.retirado_em) return { ...base, situacao: 'RETIRADO', detalhe: `Retirado em ${l.retirado_em}` };
    if (!veiculo) return { ...base, situacao: 'NAO_ENCONTRADO', detalhe: null };
    if (!NA_BASE.includes(veiculo.status)) {
      return { ...base, situacao: 'FORA_DA_BASE', detalhe: `Veículo ${veiculo.status} no SCar` };
    }
    const outra =
      (veiculo.parque_rastreadora_id && veiculo.parque_rastreadora_id !== rastreadoraId)
        ? veiculo.parque_rastreadora_nome ?? 'outra rastreadora'
        : (veiculo.empresa_rastreamento_id && veiculo.empresa_rastreamento_id !== rastreadoraId)
          ? 'outra rastreadora (na ficha)'
          : null;
    if (outra) return { ...base, situacao: 'OUTRA_RASTREADORA', detalhe: outra };
    if (veiculo.empresa_rastreamento_id === rastreadoraId) return { ...base, situacao: 'JA_VINCULADO', detalhe: null };
    return { ...base, situacao: 'VINCULAR', detalhe: null };
  });

  const naFatura = new Set(itens.map((i) => i.veiculo?.id).filter(Boolean) as string[]);
  const fora_da_fatura = vinculadosHoje.filter((v) => !naFatura.has(v.id) && NA_BASE.includes(v.status));

  const porSituacao = Object.fromEntries(
    (Object.keys(ROTULO_SITUACAO) as SituacaoRastreadora[]).map((s) => [s, { qtd: 0, valor: 0 }]),
  ) as Conferencia['porSituacao'];
  let qtd = 0;
  let cent = 0;
  const centSit = new Map<SituacaoRastreadora, number>();
  for (const i of itens) {
    porSituacao[i.situacao].qtd++;
    const c = Math.round((i.valor ?? 0) * 100);
    centSit.set(i.situacao, (centSit.get(i.situacao) ?? 0) + c);
    qtd++;
    cent += c;
  }
  centSit.forEach((c, s) => { porSituacao[s].valor = c / 100; });
  return { itens, fora_da_fatura, porSituacao, total: { qtd, valor: cent / 100 } };
}

/** Quanto da fatura e cobranca a questionar com a rastreadora. */
export function valorAQuestionar(c: Conferencia): { qtd: number; valor: number } {
  const s: SituacaoRastreadora[] = ['FORA_DA_BASE', 'OUTRA_RASTREADORA', 'NAO_ENCONTRADO'];
  return {
    qtd: s.reduce((a, k) => a + c.porSituacao[k].qtd, 0),
    valor: Math.round(s.reduce((a, k) => a + c.porSituacao[k].valor * 100, 0)) / 100,
  };
}
