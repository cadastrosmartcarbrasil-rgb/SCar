// ---------------------------------------------------------------------------
// Relatorio de comissoes POR CONSULTOR (0199) — logica pura, testada.
// Fonte: RPC comissoes_consultores_relatorio (uma linha por boleto x veiculo
// recebido no periodo, pela DATA DO CREDITO no banco). Aqui: o resumo por
// consultor, os totais e as tabelas que vao para o Excel e o PDF.
// ---------------------------------------------------------------------------
import { somarMoeda } from './money';
import type { ComissaoRelatorioLinha } from './database.types';

export type SituacaoComissao = ComissaoRelatorioLinha['situacao'];

export const SITUACAO_COMISSAO: Record<SituacaoComissao, { rotulo: string; tom: 'ok' | 'aviso' | 'neutro' | 'fora' }> = {
  PAGO: { rotulo: 'Paga', tom: 'ok' },
  A_PAGAR: { rotulo: 'No contas a pagar', tom: 'aviso' },
  PENDENTE: { rotulo: 'Apurada, a enviar', tom: 'aviso' },
  NAO_APURADO: { rotulo: 'A apurar', tom: 'neutro' },
  PELA_FRANQUIA: { rotulo: 'Paga pela franquia', tom: 'neutro' },
  CONSULTOR_INATIVO: { rotulo: 'Consultor inativo', tom: 'fora' },
  SEM_COMISSAO: { rotulo: 'Unidade sem comissão', tom: 'fora' },
  SEM_CONSULTOR: { rotulo: 'Sem consultor', tom: 'fora' },
};

export const QUEM_PAGA: Record<ComissaoRelatorioLinha['quem_paga'], string> = {
  MATRIZ: 'Matriz',
  FRANQUIA: 'Franquia',
  NENHUM: '—',
};

export type ResumoConsultor = {
  vendedorId: string | null;
  nome: string;
  ativo: boolean;
  regionais: string[];
  quemPaga: string[];
  boletos: number;
  recebido: number;
  comissao: number;
  assistencia: number;
  paga: number;
  aPagar: number;
  aApurar: number;
  pelaFranquia: number;
  creditoEstimado: number;
};

const num = (v: unknown) => Number(v ?? 0) || 0;
const unicos = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).sort((a, b) => a.localeCompare(b));

/** Agrupa por consultor. "Sem consultor" vai para o fim; o resto pela maior comissão. */
export function resumoPorConsultor(linhas: ComissaoRelatorioLinha[]): ResumoConsultor[] {
  const grupos = new Map<string, ComissaoRelatorioLinha[]>();
  for (const l of linhas) {
    const k = l.vendedor_id ?? '__sem__';
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  const soma = (ls: ComissaoRelatorioLinha[], f: (l: ComissaoRelatorioLinha) => boolean) =>
    somarMoeda(...ls.filter(f).map((l) => num(l.valor_comissao)));
  return Array.from(grupos.entries())
    .map(([k, ls]) => ({
      vendedorId: k === '__sem__' ? null : k,
      nome: k === '__sem__' ? 'Sem consultor' : ls[0].vendedor_nome,
      ativo: k !== '__sem__' && Boolean(ls[0].vendedor_ativo),
      regionais: unicos(ls.map((l) => l.regional_nome)),
      quemPaga: unicos(ls.filter((l) => num(l.valor_comissao) > 0).map((l) => QUEM_PAGA[l.quem_paga])),
      boletos: new Set(ls.map((l) => l.boleto_id)).size,
      recebido: somarMoeda(...ls.map((l) => num(l.valor_recebido))),
      comissao: somarMoeda(...ls.map((l) => num(l.valor_comissao))),
      assistencia: somarMoeda(...ls.map((l) => num(l.valor_assistencia))),
      paga: soma(ls, (l) => l.situacao === 'PAGO'),
      aPagar: soma(ls, (l) => l.situacao === 'A_PAGAR' || l.situacao === 'PENDENTE'),
      aApurar: soma(ls, (l) => l.situacao === 'NAO_APURADO'),
      pelaFranquia: soma(ls, (l) => l.situacao === 'PELA_FRANQUIA'),
      creditoEstimado: ls.filter((l) => l.credito_estimado).length,
    }))
    .sort((a, b) =>
      a.vendedorId === null ? 1 : b.vendedorId === null ? -1 : b.comissao - a.comissao || a.nome.localeCompare(b.nome),
    );
}

export function totaisRelatorio(resumo: ResumoConsultor[]) {
  return {
    consultores: resumo.filter((r) => r.vendedorId && r.comissao > 0).length,
    boletos: resumo.reduce((s, r) => s + r.boletos, 0),
    recebido: somarMoeda(...resumo.map((r) => r.recebido)),
    comissao: somarMoeda(...resumo.map((r) => r.comissao)),
    paga: somarMoeda(...resumo.map((r) => r.paga)),
    aPagar: somarMoeda(...resumo.map((r) => r.aPagar)),
    aApurar: somarMoeda(...resumo.map((r) => r.aApurar)),
    pelaFranquia: somarMoeda(...resumo.map((r) => r.pelaFranquia)),
  };
}

/** Filtra por consultor (id) e texto livre (associado, placa, regional, consultor). */
export function filtrarRelatorio(linhas: ComissaoRelatorioLinha[], vendedorId: string, busca: string) {
  const termo = busca
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  return linhas.filter((l) => {
    if (vendedorId === '__sem__' && l.vendedor_id) return false;
    if (vendedorId && vendedorId !== '__sem__' && l.vendedor_id !== vendedorId) return false;
    if (!termo) return true;
    const alvo = [l.associado, l.placa, l.regional_nome, l.vendedor_nome, l.documento]
      .join(' ')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
    return alvo.includes(termo) || alvo.replace(/[^a-z0-9]/g, '').includes(termo.replace(/[^a-z0-9]/g, ''));
  });
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Atalhos de período (o filtro é pela data do crédito). */
export function periodoDoAtalho(chave: 'mes' | 'mes_anterior' | 'semana' | 'hoje', hoje = new Date()) {
  const y = hoje.getFullYear();
  const m = hoje.getMonth();
  if (chave === 'mes') return { inicio: iso(new Date(y, m, 1)), fim: iso(new Date(y, m + 1, 0)) };
  if (chave === 'mes_anterior') return { inicio: iso(new Date(y, m - 1, 1)), fim: iso(new Date(y, m, 0)) };
  if (chave === 'hoje') return { inicio: iso(hoje), fim: iso(hoje) };
  const ini = new Date(hoje);
  ini.setDate(hoje.getDate() - 6);
  return { inicio: iso(ini), fim: iso(hoje) };
}

const dataBR = (s: string | null | undefined) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
const pct = (v: number) => `${(v * 100).toFixed(2).replace('.', ',').replace(',00', '')}%`;

export type TabelaRelatorio = {
  titulo: string;
  subtitulo?: string;
  cabecalho: string[];
  linhas: (string | number | null)[][];
  rodape?: (string | number | null)[];
  colunasMoeda?: number[];
};

/**
 * As duas tabelas que vão para o Excel (2 abas) e para o PDF: o RESUMO por
 * consultor e o DETALHE de cada boleto, agrupado por consultor com subtotal.
 */
export function tabelasDoRelatorio(
  linhas: ComissaoRelatorioLinha[],
  periodo: { inicio: string; fim: string },
  escopo: string,
): { resumo: TabelaRelatorio; detalhe: TabelaRelatorio } {
  const resumo = resumoPorConsultor(linhas);
  const t = totaisRelatorio(resumo);
  const sub = `${escopo} · crédito de ${dataBR(periodo.inicio)} a ${dataBR(periodo.fim)} · ${t.boletos} boleto(s) recebido(s)`;

  const tabResumo: TabelaRelatorio = {
    titulo: 'Comissões por consultor — resumo',
    subtitulo: sub,
    cabecalho: ['Consultor', 'Regional', 'Quem paga', 'Boletos', 'Recebido (R$)', 'Comissão (R$)', 'Paga (R$)',
      'A pagar (R$)', 'A apurar (R$)', 'Pela franquia (R$)'],
    linhas: resumo.map((r) => [
      r.ativo || !r.vendedorId ? r.nome : `${r.nome} (inativo)`,
      r.regionais.join(', '), r.quemPaga.join(', ') || '—', r.boletos,
      r.recebido, r.comissao, r.paga, r.aPagar, r.aApurar, r.pelaFranquia,
    ]),
    rodape: ['Total', '', '', t.boletos, t.recebido, t.comissao, t.paga, t.aPagar, t.aApurar, t.pelaFranquia],
    colunasMoeda: [4, 5, 6, 7, 8, 9],
  };

  const det: (string | number | null)[][] = [];
  for (const r of resumo) {
    const ls = linhas
      .filter((l) => (l.vendedor_id ?? null) === r.vendedorId)
      .sort((a, b) => a.data_credito.localeCompare(b.data_credito) || (a.placa ?? '').localeCompare(b.placa ?? ''));
    for (const l of ls) {
      det.push([
        r.nome, dataBR(l.data_credito) + (l.credito_estimado ? ' *' : ''), dataBR(l.vencimento), l.associado ?? '',
        l.placa ?? '', l.regional_nome, l.origem === 'SCAR' ? 'SCar' : 'Mutual', num(l.valor_recebido),
        num(l.valor_assistencia) > 0 ? 'Assist. prof.' : pct(num(l.taxa)), num(l.valor_comissao),
        SITUACAO_COMISSAO[l.situacao].rotulo, l.documento ?? '',
      ]);
    }
    det.push([`Subtotal ${r.nome}`, '', '', `${r.boletos} boleto(s)`, '', '', '', r.recebido, '', r.comissao, '', '']);
  }
  const tabDetalhe: TabelaRelatorio = {
    titulo: 'Comissões por consultor — boletos recebidos',
    subtitulo: `${sub} · * data do pagamento (o recebimento não passou pelo nosso banco)`,
    cabecalho: ['Consultor', 'Crédito', 'Vencimento', 'Associado', 'Placa', 'Regional', 'Origem', 'Recebido (R$)',
      'Taxa', 'Comissão (R$)', 'Situação', 'Documento'],
    linhas: det,
    rodape: ['Total', '', '', '', '', '', '', t.recebido, '', t.comissao, '', ''],
    colunasMoeda: [7, 9],
  };
  return { resumo: tabResumo, detalhe: tabDetalhe };
}
