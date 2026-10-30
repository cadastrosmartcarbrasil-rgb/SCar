// ---------------------------------------------------------------------------
// PROPOSTA COMERCIAL v2 (30/10/2026) — os dados das 3 paginas, ja resolvidos.
//
// A pagina publica /cotacao/<token> e o PDF (/api/v1/cotacoes/pdf) montam o
// MESMO objeto por `montarProposta` e o entregam pronto aos componentes de
// src/components/proposta. Nada interno chega ao navegador: a Assistencia
// Profissional entra somada (totalDoCliente / itensParaCliente, 0158), o
// desconto aparece so como o total final e nao ha CPF.
//
// A tabela da Assistencia 24h e a mesma para todos (o manual vigente); so o
// limite do reboque muda, e ele vem do TIPO DE VEICULO (0164).
// ---------------------------------------------------------------------------
import { totalDoCliente, itensParaCliente } from './assistencia-profissional';
import { grupoDaCobertura } from './coberturas';
import { regraRastreadorCobra } from './produtos';

// --------------------------------------------------------------- constantes
/** O que a proteção do veículo (casco) cobre, aberto em itens na página 2. */
export const CASCO_INCLUI = [
  'Roubo e furto', 'Colisão', 'Perda total', 'Incêndio após colisão', 'Fenômenos da natureza',
] as const;

export const TELEFONE_ASSISTENCIA = '0800 737 0737';
export const TELEFONE_COMERCIAL = '0800 591 8920';

export type ServicoAssistencia = { servico: string; inclui: string; limite: string; reboque?: boolean };

/** A tabela da 24h (manual vigente). O reboque mostra o km do tipo do veículo. */
export const ASSISTENCIA_24H_PROPOSTA: ServicoAssistencia[] = [
  { servico: 'Reboque por pane', inclui: 'Até a oficina ou local adequado mais próximo', limite: 'Km contratado', reboque: true },
  { servico: 'Reboque após acidente', inclui: 'Colisão, abalroamento ou capotamento', limite: 'Km contratado', reboque: true },
  { servico: 'Troca de pneus', inclui: 'Troca pelo estepe ou remoção à borracharia', limite: 'Raio de 50 km' },
  { servico: 'Chaveiro', inclui: 'Abertura ou retirada de chave quebrada', limite: 'Mão de obra inclusa' },
  { servico: 'Recarga de bateria', inclui: 'Carga emergencial no local', limite: 'Raio de 50 km' },
  { servico: 'Pane seca', inclui: '10 litros de combustível ou remoção ao posto', limite: 'Raio de 20 km' },
  { servico: 'Táxi / Uber / 99', inclui: 'Retorno ao domicílio após reboque', limite: 'Até R$ 70,00' },
  { servico: 'Transporte alternativo', inclui: 'Retorno ou continuação, a +100 km de casa', limite: 'Após reboque' },
  { servico: 'Guarda do veículo', inclui: 'Fora do horário comercial', limite: '1 diária por evento' },
  { servico: 'Hospedagem emergencial', inclui: 'A +100 km de casa, sem reparo em 48h', limite: '2 diárias de até R$ 100,00 cada' },
];

export const REGRAS_ASSISTENCIA = [
  '1 acionamento por serviço ao mês (dia 1 ao 31), sem acúmulo',
  'Cancelamento só até 5 minutos após o chamado',
  'Espera acima de 15 min: hora parada por conta do usuário',
  'Tenha em mãos: documento do veículo, nome e CPF, endereço de origem e destino',
  'Táxi e transporte alternativo: até 5 pessoas (moto, 2). Hospedagem: até 4 acompanhantes (moto, 1)',
  'Táxi, vans e uso comercial: benefícios de transporte só para o motorista',
  'Reboque não vale para trocar de oficina ou pesquisar preços',
];

export const ASSISTENCIA_NAO_COBRE = [
  'Peças e mão de obra de reparo',
  'Veículo carregado e remoção de carga',
  'Munk, guindaste e serviços especiais',
  'Terceiros e seus ocupantes',
  'Multas',
  'Condutor alcoolizado ou sob efeito de drogas',
  'Panes repetitivas por falta de manutenção',
];

// --------------------------------------------------------------------- tipos
export type IconeCobertura =
  | 'cadeado' | 'colisao' | 'perda' | 'fogo' | 'natureza' | 'terceiros' | 'rastreador'
  | 'carro' | 'vidros' | 'vida' | 'estrela';

export type TileCobertura = { titulo: string; detalhe: string | null; icone: IconeCobertura };

export type RegraCondicao = { titulo: string; texto: string };

export type PropostaDados = {
  token: string;
  link: string;
  dataCotacao: string;
  validade: string;
  detalhada: boolean;
  veiculo: { placa: string | null; modelo: string; ano: string | null; valorProtegido: number | null };
  plano: { nome: string | null };
  valores: {
    mensal: number;
    adesao: number | null;
    rastreador: string;
    cotaPercentual: number | null;
    cotaValor: number | null;
  };
  coberturas: TileCobertura[];
  vidros: { tipo: string; descricao: string | null } | null;
  reboque: { total: number | null; ida: number | null; volta: number | null };
  regras: RegraCondicao[];
  consultor: { nome: string; telefone: string | null; email: string | null } | null;
  empresa: {
    nome: string; cnpj: string | null; site: string | null; telefoneComercial: string;
    telefoneAssistencia: string; regulamentoUrl: string | null;
  };
  aceite: { feito: boolean; em: string | null; desatualizada: boolean };
};

export type FontesProposta = {
  cotacao: {
    token: string; created_at: string; enviada_em?: string | null; modo_envio: string | null; fipe: number | null;
    itens: { produto_id: string | null; nome: string; valor: number; obrigatorio: boolean; categoria?: string | null }[];
    total_mensalidade: number; total_com_desconto?: number | null; valor_assistencia_profissional?: number | null;
    taxa_adesao: number | null; adesao_com_desconto?: number | null; participacao: number | null;
  };
  lead: { placa: string | null; marca: string | null; modelo: string | null; ano_modelo: string | number | null;
    aceite_em?: string | null; aceite_cotacao_id?: string | null } | null;
  cotacaoId: string;
  ultimaCotacaoId: string | null;
  plano: { nome: string } | null;
  cotaPercentual: number | null;
  tipo: { nome: string; exige_rastreador: boolean; valor_limite_isencao: number;
    km_reboque_ida: number | null; km_reboque_volta: number | null } | null;
  produtos: { id: string; categoria: string | null; descricao_cobertura: string | null }[];
  consultor: { nome: string | null; telefone: string | null; email: string | null } | null;
  empresa: { razao_social: string | null; nome_fantasia: string | null; cnpj: string | null; site: string | null;
    telefone_fixo: string | null; regulamento_url: string | null; validade_proposta_dias: number | null } | null;
  origem: string;
};

// -------------------------------------------------------------------- texto
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
// Espaço comum no lugar do não separável do Intl: o texto vai para PDF e WhatsApp.
export const moeda = (v: number) => BRL.format(v).replace(/\u00a0/g, ' ');

/** dd/mm/aaaa no fuso de São Paulo. */
export function dataSaoPaulo(iso: string | Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
}

/** A data da cotação + N dias (o dia em São Paulo). */
export function validadeDaProposta(iso: string, dias: number): string {
  const d = new Date(iso);
  return dataSaoPaulo(new Date(d.getTime() + Math.max(1, dias) * 86_400_000));
}

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em', 'para', 'com']);
/** "SAÚDE SMART - DESCONTO" -> "Saúde Smart - Desconto" (só quando vem tudo em caixa alta). */
export function tituloLegivel(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().split(' ').map((w, i) =>
    /^(i{1,3}|iv|v|vi{1,3})$/.test(w) ? w.toUpperCase()
      : i > 0 && MINUSCULAS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** "RCF - Terceiros 50mil" -> 50000; "Terceiros até R$ 20.000,00" -> 20000. */
export function valorDoNome(nome: string): number | null {
  const mil = nome.match(/(\d+(?:[.,]\d+)?)\s*mil\b/i);
  if (mil) return Math.round(Number(mil[1].replace(',', '.')) * 1000);
  const rs = nome.match(/R\$\s*([\d.]+)(?:,\d{2})?/i);
  if (rs) return Number(rs[1].replace(/\./g, ''));
  return null;
}

const diasDoNome = (nome: string) => nome.match(/(\d+)\s*dias?/i)?.[1] ?? null;

// ---------------------------------------------------------------- coberturas
type ItemFonte = FontesProposta['cotacao']['itens'][number] & { descricao?: string | null };

/** Os tiles da página 2, na ordem da ficha (casco aberto, terceiros, vidros...). */
export function tilesDeCobertura(itens: ItemFonte[], detalhada: boolean): {
  tiles: TileCobertura[]; vidros: PropostaDados['vidros'];
} {
  const tiles: TileCobertura[] = [];
  let vidros: PropostaDados['vidros'] = null;
  const comValor = (v: number, base: string | null) =>
    detalhada && v > 0 ? [base, `${moeda(v)}/mês`].filter(Boolean).join(' · ') : base;
  const grupos = itens.map((i) => ({ i, g: grupoDaCobertura(i) }));

  if (grupos.some((x) => x.g === 'CASCO')) {
    const icones: IconeCobertura[] = ['cadeado', 'colisao', 'perda', 'fogo', 'natureza'];
    CASCO_INCLUI.forEach((t, k) => tiles.push({ titulo: t, detalhe: null, icone: icones[k] }));
  }
  for (const { i, g } of grupos) {
    if (!g || g === 'CASCO' || g === 'ASSISTENCIA') continue;
    if (g === 'TERCEIROS') {
      const v = valorDoNome(i.nome);
      tiles.push({ titulo: 'Proteção a terceiros', detalhe: comValor(i.valor, v ? `Até ${moeda(v)}` : null), icone: 'terceiros' });
    } else if (g === 'CARRO_RESERVA') {
      const d = diasDoNome(i.nome);
      tiles.push({ titulo: 'Carro reserva', detalhe: comValor(i.valor, d ? `${d} dias` : null), icone: 'carro' });
    } else if (g === 'VIDROS') {
      // "VIDROS III - PARAB + V LAT..." -> "Vidros III"; o que cobre vem da descricao do produto.
      const nivel = i.nome.match(/vidros?\s+(especiais|i{1,3}|iv)\b/i);
      const tipo = nivel ? `Vidros ${/especiais/i.test(nivel[1]) ? 'especiais' : nivel[1].toUpperCase()}` : tituloLegivel(i.nome);
      if (!vidros) vidros = { tipo, descricao: i.descricao ? tituloLegivel(i.descricao) : null };
      tiles.push({ titulo: tipo, detalhe: comValor(i.valor, i.descricao ? tituloLegivel(i.descricao) : null), icone: 'vidros' });
    } else if (g === 'RASTREAMENTO') {
      // O rastreador ja aparece na linha de valores; sem tile para nao repetir.
      continue;
    } else if (g === 'VIDA') {
      tiles.push({ titulo: tituloLegivel(i.nome), detalhe: comValor(i.valor, null), icone: 'vida' });
    } else {
      tiles.push({ titulo: tituloLegivel(i.nome), detalhe: comValor(i.valor, i.descricao ? tituloLegivel(i.descricao) : null), icone: 'estrela' });
    }
  }
  return { tiles, vidros };
}

/** O texto do rastreador na linha de valores. */
export function textoRastreador(
  itens: ItemFonte[], tipo: FontesProposta['tipo'], fipe: number | null, detalhada: boolean,
): string {
  const r = itens.find((i) => grupoDaCobertura(i) === 'RASTREAMENTO');
  if (r) return r.valor > 0 && detalhada ? `${moeda(r.valor)}/mês` : 'Incluso';
  return regraRastreadorCobra(tipo, fipe) ? 'Incluso' : 'Não exigido';
}

/** As regras gerais da página 3 (rastreador lido da regra do tipo; vidros só se houver). */
export function regrasDaProposta(tipo: FontesProposta['tipo'], temVidros: boolean): RegraCondicao[] {
  const regras: RegraCondicao[] = [
    { titulo: 'Mensalidade em dia', texto: 'O atraso suspende a proteção a partir da data do inadimplemento.' },
  ];
  if (tipo?.exige_rastreador) {
    regras.push({
      titulo: 'Rastreador',
      texto: `Para ${tipo.nome.toLowerCase()}, obrigatório acima de ${moeda(Math.ceil(Number(tipo.valor_limite_isencao)))} (valor FIPE). `
        + 'Sem rastreador, a cobertura é de 70% do valor em roubo ou perda total.',
    });
  }
  regras.push({
    titulo: 'Leilão e salvados',
    texto: 'Veículo de leilão ou com perda total anterior: 70% da tabela FIPE em roubo, furto e perda total.',
  });
  if (temVidros) {
    regras.push({
      titulo: 'Vidros, lanternas e faróis',
      texto: 'Participação do associado: 40% no 1º evento e 50% no 2º evento, em 12 meses.',
    });
  }
  regras.push({
    titulo: 'Boletos e cartão',
    texto: 'Boleto na Área do Associado (2ª via). Prefira cadastrar o cartão de crédito para débito das mensalidades.',
  });
  return regras;
}

// ------------------------------------------------------------------ montagem
export function montarProposta(f: FontesProposta): PropostaDados {
  const c = f.cotacao;
  const detalhada = c.modo_envio !== 'CONSOLIDADA';
  const porId = new Map(f.produtos.map((p) => [p.id, p]));
  const itens: ItemFonte[] = itensParaCliente(c.itens ?? [], c.valor_assistencia_profissional).map((i) => ({
    ...i,
    categoria: i.categoria ?? (i.produto_id ? porId.get(i.produto_id)?.categoria : null) ?? (/rastre/i.test(i.nome) ? 'RASTREADOR' : null),
    descricao: i.produto_id ? porId.get(i.produto_id)?.descricao_cobertura ?? null : null,
  }));
  const { tiles, vidros } = tilesDeCobertura(itens, detalhada);
  const quando = c.enviada_em ?? c.created_at;
  const adesao = Number(c.adesao_com_desconto ?? c.taxa_adesao ?? 0);
  const ida = f.tipo?.km_reboque_ida ?? null;
  const volta = f.tipo?.km_reboque_volta ?? null;
  const lead = f.lead;
  const emp = f.empresa;
  const aceitaEsta = !!lead?.aceite_em && lead.aceite_cotacao_id === f.cotacaoId;

  return {
    token: c.token,
    link: `${f.origem.replace(/\/$/, '')}/cotacao/${c.token}`,
    dataCotacao: dataSaoPaulo(quando),
    validade: validadeDaProposta(quando, emp?.validade_proposta_dias ?? 30),
    detalhada,
    veiculo: {
      placa: lead?.placa ?? null,
      modelo: [lead?.marca, lead?.modelo].filter(Boolean).join(' ') || 'Veículo',
      ano: lead?.ano_modelo != null ? String(lead.ano_modelo) : null,
      valorProtegido: c.fipe != null ? Number(c.fipe) : null,
    },
    plano: { nome: f.plano?.nome ?? null },
    valores: {
      mensal: totalDoCliente(c),
      adesao: adesao > 0 ? adesao : null,
      rastreador: textoRastreador(itens, f.tipo, c.fipe, detalhada),
      cotaPercentual: f.cotaPercentual != null ? Number(f.cotaPercentual) : null,
      cotaValor: c.participacao != null && Number(c.participacao) > 0 ? Number(c.participacao) : null,
    },
    coberturas: tiles,
    vidros,
    reboque: { total: ida != null || volta != null ? (ida ?? 0) + (volta ?? 0) : null, ida, volta },
    regras: regrasDaProposta(f.tipo, !!vidros),
    consultor: f.consultor?.nome
      ? { nome: tituloLegivel(f.consultor.nome), telefone: f.consultor.telefone, email: f.consultor.email?.toLowerCase() ?? null }
      : null,
    empresa: {
      nome: emp?.nome_fantasia || emp?.razao_social || 'Smart Car Brasil',
      cnpj: emp?.cnpj ?? null,
      site: emp?.site ?? null,
      telefoneComercial: emp?.telefone_fixo || TELEFONE_COMERCIAL,
      telefoneAssistencia: TELEFONE_ASSISTENCIA,
      regulamentoUrl: emp?.regulamento_url ?? null,
    },
    aceite: {
      feito: !!lead?.aceite_em,
      em: aceitaEsta && lead?.aceite_em ? dataSaoPaulo(lead.aceite_em) : null,
      desatualizada: !!f.ultimaCotacaoId && f.ultimaCotacaoId !== f.cotacaoId,
    },
  };
}

/** "1.000 km" / "500 km ida + 500 km volta". */
export function textoReboque(r: PropostaDados['reboque']): { total: string; detalhe: string } {
  if (r.total == null) return { total: 'Conforme o tipo', detalhe: 'do veículo, no manual da assistência' };
  const n = (v: number) => v.toLocaleString('pt-BR');
  return {
    total: `${n(r.total)} km`,
    detalhe: r.ida != null && r.volta != null ? `${n(r.ida)} km ida + ${n(r.volta)} km volta` : 'no total',
  };
}

/** "12.345.678/0001-90". */
export function cnpjFormatado(c: string | null): string | null {
  const d = (c ?? '').replace(/\D/g, '');
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c;
}
