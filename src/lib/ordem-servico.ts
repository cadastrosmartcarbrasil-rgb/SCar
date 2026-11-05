/**
 * ORDEM DE SERVICO do evento (0181) — regras puras.
 *
 * A OS e a formalizacao do reparo aprovado: nasce da cotacao (cotacoes_pecas)
 * e e emitida pelo modulo de Termos. Os totais daqui sao os MESMOS que o banco
 * recalcula em `emitir_ordem_servico` — se divergirem, a emissao e recusada.
 * Contas a pagar NAO e gerado pela OS (decisao do usuario, 05/11/2026).
 */

export type TipoItemOS = 'MAO_DE_OBRA' | 'PECA';
export type StatusOS = 'EMITIDA' | 'ENVIADA' | 'EM_EXECUCAO' | 'ENTREGUE' | 'CANCELADA' | 'SUBSTITUIDA';
export type DocumentoOS = 'AUTORIZACAO' | 'RETIFICACAO';

export interface ItemOS {
  tipo: TipoItemOS;
  descricao: string;
  codigo?: string | null;
  quantidade: number;
  valor_unitario: number;
}

export const ROTULO_TIPO_ITEM: Record<TipoItemOS, string> = { MAO_DE_OBRA: 'Mão de obra', PECA: 'Peça' };
export const SIGLA_TIPO_ITEM: Record<TipoItemOS, string> = { MAO_DE_OBRA: 'M.O.', PECA: 'Peça' };

export const STATUS_OS: Record<StatusOS, { rotulo: string; cor: string }> = {
  EMITIDA: { rotulo: 'Emitida', cor: 'bg-slate-100 text-slate-700' },
  ENVIADA: { rotulo: 'Enviada ao prestador', cor: 'bg-cyan-50 text-cyan-800' },
  EM_EXECUCAO: { rotulo: 'Em execução', cor: 'bg-amber-50 text-amber-800' },
  ENTREGUE: { rotulo: 'Entregue', cor: 'bg-emerald-50 text-emerald-700' },
  CANCELADA: { rotulo: 'Cancelada', cor: 'bg-rose-50 text-rose-700' },
  SUBSTITUIDA: { rotulo: 'Substituída', cor: 'bg-slate-100 text-slate-500' },
};

/** Abertas = ainda contam prazo. */
export const STATUS_ABERTOS: StatusOS[] = ['EMITIDA', 'ENVIADA', 'EM_EXECUCAO'];

const centavos = (v: number) => Math.round(Number(v || 0) * 100);
const subtotalCentavos = (i: ItemOS) => Math.round(Number(i.quantidade || 0) * Number(i.valor_unitario || 0) * 100);

/** Subtotal de um item, como a coluna gerada do banco (round(q * u, 2)). */
export const subtotalItem = (i: ItemOS) => subtotalCentavos(i) / 100;

export interface TotaisOS {
  mao_obra: number;
  pecas: number;
  autorizado: number;
  participacao: number;
  pecas_smartcar: number;
  liquido: number;
}

/** Autorizado = M.O. + pecas; liquido = autorizado − participacao − pecas da Smart Car. */
export function totaisDaOS(itens: ItemOS[], participacao: number | null | undefined, pecasSmartcar: number | null | undefined): TotaisOS {
  let mo = 0;
  let pc = 0;
  for (const i of itens) {
    if (i.tipo === 'MAO_DE_OBRA') mo += subtotalCentavos(i);
    else pc += subtotalCentavos(i);
  }
  const part = centavos(participacao ?? 0);
  const psc = centavos(pecasSmartcar ?? 0);
  return {
    mao_obra: mo / 100,
    pecas: pc / 100,
    autorizado: (mo + pc) / 100,
    participacao: part / 100,
    pecas_smartcar: psc / 100,
    liquido: (mo + pc - part - psc) / 100,
  };
}

export function tipoDaOrdem(itens: ItemOS[]): 'MAO_DE_OBRA' | 'PECAS' | 'MISTA' | null {
  const mo = itens.some((i) => i.tipo === 'MAO_DE_OBRA');
  const pc = itens.some((i) => i.tipo === 'PECA');
  if (mo && pc) return 'MISTA';
  if (mo) return 'MAO_DE_OBRA';
  if (pc) return 'PECAS';
  return null;
}

/** O que impede emitir (a tela mostra; o banco confere de novo). */
export function problemasDaOS(d: {
  fornecedorId?: string | null;
  itens: ItemOS[];
  dataLimite?: string | null;
  inicio?: string | null;
  documento: DocumentoOS;
  osAnteriorId?: string | null;
  totais: TotaisOS;
}): string[] {
  const p: string[] = [];
  if (!d.fornecedorId) p.push('Escolha o prestador (fornecedor cadastrado).');
  if (d.itens.length === 0) p.push('Inclua pelo menos um item.');
  d.itens.forEach((i, n) => {
    if (!i.descricao?.trim()) p.push(`Item ${n + 1}: informe a descrição.`);
    if (!(Number(i.quantidade) > 0)) p.push(`Item ${n + 1}: quantidade maior que zero.`);
    if (!(Number(i.valor_unitario) >= 0)) p.push(`Item ${n + 1}: valor não pode ser negativo.`);
  });
  if (!d.dataLimite) p.push('Informe a data limite de entrega.');
  else if (d.inicio && d.dataLimite < d.inicio) p.push('A data limite não pode ser antes do início previsto.');
  if (d.documento === 'RETIFICACAO' && !d.osAnteriorId) p.push('Escolha a OS que está sendo retificada.');
  if (d.totais.liquido < 0) p.push('O valor líquido a faturar ficaria negativo.');
  return p;
}

// ---------------------------------------------------------------------------
// Datas (AAAA-MM-DD, sem fuso)
// ---------------------------------------------------------------------------
function somarDias(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

const diaDaSemana = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 = domingo
};

/** Espelho de `somar_dias_uteis` (0181): pula sabado, domingo e os feriados cadastrados. */
export function somarDiasUteis(inicio: string, dias: number, feriados: Iterable<string> = []): string {
  if (!inicio) return inicio;
  if (!(dias > 0)) return inicio;
  const fer = new Set(feriados);
  let d = inicio;
  let n = 0;
  for (let guarda = 0; n < dias && guarda < 400; guarda += 1) {
    d = somarDias(d, 1);
    const s = diaDaSemana(d);
    if (s !== 0 && s !== 6 && !fer.has(d)) n += 1;
  }
  return d;
}

/** Diferenca em dias corridos (b − a). */
export function diasEntre(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

export type SituacaoPrazo =
  | { tipo: 'encerrada'; texto: string }
  | { tipo: 'entregue'; texto: string; atraso: number }
  | { tipo: 'no_prazo' | 'vence_logo' | 'vence_hoje' | 'atrasada'; texto: string; dias: number };

/** "vence em 3 dias" / "vence hoje" / "atrasada 2 dias" / "entregue no prazo". */
export function situacaoDoPrazo(
  os: { status: StatusOS | string; data_limite_entrega: string; data_entrega_real?: string | null },
  hoje: string,
): SituacaoPrazo {
  if (os.status === 'CANCELADA' || os.status === 'SUBSTITUIDA') {
    return { tipo: 'encerrada', texto: STATUS_OS[os.status as StatusOS]?.rotulo ?? os.status };
  }
  if (os.status === 'ENTREGUE') {
    const atraso = os.data_entrega_real ? diasEntre(os.data_limite_entrega, os.data_entrega_real) : 0;
    return {
      tipo: 'entregue',
      atraso: Math.max(0, atraso),
      texto: atraso > 0 ? `entregue com ${atraso} dia${atraso > 1 ? 's' : ''} de atraso` : 'entregue no prazo',
    };
  }
  const dias = diasEntre(hoje, os.data_limite_entrega);
  if (dias < 0) return { tipo: 'atrasada', dias, texto: `atrasada ${-dias} dia${dias < -1 ? 's' : ''}` };
  if (dias === 0) return { tipo: 'vence_hoje', dias, texto: 'vence hoje' };
  if (dias <= 3) return { tipo: 'vence_logo', dias, texto: `vence em ${dias} dia${dias > 1 ? 's' : ''}` };
  return { tipo: 'no_prazo', dias, texto: `vence em ${dias} dias` };
}

/** Itens da cotacao aprovada -> itens da OS. */
export function itensDaCotacao(
  itens: { descricao_peca: string; quantidade: number; valor_unitario: number; tipo_item?: string | null; codigo?: string | null }[],
): ItemOS[] {
  return itens.map((i) => ({
    tipo: i.tipo_item === 'MAO_DE_OBRA' ? 'MAO_DE_OBRA' : 'PECA',
    descricao: i.descricao_peca,
    codigo: i.codigo ?? null,
    quantidade: Number(i.quantidade),
    valor_unitario: Number(i.valor_unitario),
  }));
}

/** Mensagem do WhatsApp ao prestador: so o numero da OS e o link (sem dado pessoal nem valor). */
export function mensagemOSWhatsApp(a: { prestador: string; numero: string; protocolo: string | null; link: string; limite: string }): string {
  const [y, m, d] = a.limite.split('-');
  return [
    `Olá, ${a.prestador}!`,
    `Segue a Ordem de Serviço ${a.numero}${a.protocolo ? ` do evento ${a.protocolo}` : ''} da Smart Car Brasil.`,
    `Data limite de entrega: ${d}/${m}/${y}.`,
    `Abra o documento: ${a.link}`,
    'Serviços ou peças adicionais só com nova autorização escrita.',
  ].join('\n');
}
