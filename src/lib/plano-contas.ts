/**
 * Plano de contas padrao (0152): hierarquia, DRE gerencial, balancete de
 * verificacao e fluxo de caixa evolutivo. Logica pura — as telas so desenham.
 *
 * A hierarquia sai do CODIGO: a mae de "4.2.1.01" e a conta existente de
 * prefixo mais longo ("4.2.1", senao "4.2", senao "4"). Sintetica soma as
 * filhas pelo prefixo; so a analitica recebe lancamento.
 */
import { arredondarMoeda, somarMoeda } from './money';

export type Natureza =
  | 'ATIVO' | 'PASSIVO' | 'PATRIMONIO_LIQUIDO'
  | 'RECEITA' | 'DEDUCAO' | 'CUSTO' | 'DESPESA'
  | 'RESULTADO_FINANCEIRO' | 'RECEITA_FINANCEIRA' | 'DESPESA_FINANCEIRA';

export interface ContaPlano {
  id: string;
  codigo_estruturado: string;
  nome: string;
  tipo?: string | null;
  ativo: boolean;
  analitica?: boolean | null;
  natureza?: string | null;
  destino?: string | null;
  automatica?: boolean | null;
  codigo_anterior?: string | null;
}

export const NATUREZAS: { valor: Natureza; rotulo: string; lado: 'D' | 'C'; grupo: 'BALANCO' | 'DRE'; cor: string }[] = [
  { valor: 'ATIVO', rotulo: 'Ativo', lado: 'D', grupo: 'BALANCO', cor: 'bg-sky-50 text-sky-700' },
  { valor: 'PASSIVO', rotulo: 'Passivo', lado: 'C', grupo: 'BALANCO', cor: 'bg-violet-50 text-violet-700' },
  { valor: 'PATRIMONIO_LIQUIDO', rotulo: 'Patrimônio líquido', lado: 'C', grupo: 'BALANCO', cor: 'bg-violet-50 text-violet-700' },
  { valor: 'RECEITA', rotulo: 'Receita', lado: 'C', grupo: 'DRE', cor: 'bg-emerald-50 text-emerald-700' },
  { valor: 'DEDUCAO', rotulo: 'Dedução da receita', lado: 'D', grupo: 'DRE', cor: 'bg-amber-50 text-amber-700' },
  { valor: 'CUSTO', rotulo: 'Custo', lado: 'D', grupo: 'DRE', cor: 'bg-amber-50 text-amber-700' },
  { valor: 'DESPESA', rotulo: 'Despesa', lado: 'D', grupo: 'DRE', cor: 'bg-rose-50 text-rose-700' },
  { valor: 'RESULTADO_FINANCEIRO', rotulo: 'Resultado financeiro', lado: 'D', grupo: 'DRE', cor: 'bg-slate-100 text-slate-600' },
  { valor: 'RECEITA_FINANCEIRA', rotulo: 'Receita financeira', lado: 'C', grupo: 'DRE', cor: 'bg-emerald-50 text-emerald-700' },
  { valor: 'DESPESA_FINANCEIRA', rotulo: 'Despesa financeira', lado: 'D', grupo: 'DRE', cor: 'bg-rose-50 text-rose-700' },
];

export const metaNatureza = (n: string | null | undefined) => NATUREZAS.find((x) => x.valor === n);

/** Codigo antigo (x.y.zz), de antes do plano padrao. */
const CODIGO_ANTIGO = /^[1-4]\.\d\.\d{2}$/;

/** Natureza pelo codigo do plano padrao — espelho de `natureza_por_codigo` (0152). */
export function naturezaPorCodigo(codigo: string): Natureza | null {
  const c = codigo.trim();
  if (/^1(\.|$)/.test(c)) return 'ATIVO';
  if (/^2\.2(\.|$)/.test(c)) return 'PATRIMONIO_LIQUIDO';
  if (/^2(\.|$)/.test(c)) return 'PASSIVO';
  if (/^3\.2(\.|$)/.test(c)) return 'DEDUCAO';
  if (/^3(\.|$)/.test(c)) return 'RECEITA';
  if (/^4\.1(\.|$)/.test(c)) return 'CUSTO';
  if (/^4\.3\.1(\.|$)/.test(c)) return 'RECEITA_FINANCEIRA';
  if (/^4\.3\.2(\.|$)/.test(c)) return 'DESPESA_FINANCEIRA';
  if (/^4\.3$/.test(c)) return 'RESULTADO_FINANCEIRO';
  if (/^4(\.|$)/.test(c)) return 'DESPESA';
  return null;
}

/** Natureza efetiva: a gravada; senao o codigo; senao o `tipo` antigo. */
export function naturezaDe(c: Pick<ContaPlano, 'codigo_estruturado' | 'natureza' | 'tipo'>): Natureza {
  if (c.natureza && metaNatureza(c.natureza)) return c.natureza as Natureza;
  const pelo = CODIGO_ANTIGO.test(c.codigo_estruturado) ? null : naturezaPorCodigo(c.codigo_estruturado);
  if (pelo) return pelo;
  return c.tipo === 'RECEITA' ? 'RECEITA' : c.tipo === 'CUSTO_VARIAVEL' ? 'CUSTO' : 'DESPESA';
}

export const ehAnalitica = (c: Pick<ContaPlano, 'analitica'>) => c.analitica !== false;

export const nivelConta = (codigo: string) => codigo.trim().split('.').filter(Boolean).length;

/** Ordena codigos por segmento numerico (1.10 depois de 1.9). */
export function compararCodigos(a: string, b: string): number {
  const sa = a.split('.').map(Number);
  const sb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    const x = sa[i] ?? -1;
    const y = sb[i] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

export const ordenarPlano = <T extends { codigo_estruturado: string }>(plano: T[]) =>
  [...plano].sort((a, b) => compararCodigos(a.codigo_estruturado, b.codigo_estruturado));

/** A conta existente de prefixo mais longo — a "mae" na arvore. */
export function codigoPai(codigo: string, codigos: Iterable<string>): string | null {
  const set = new Set(codigos);
  const partes = codigo.split('.');
  for (let n = partes.length - 1; n >= 1; n--) {
    const pref = partes.slice(0, n).join('.');
    if (set.has(pref)) return pref;
  }
  return null;
}

/** Profundidade na arvore (quantas maes existem acima). */
export function profundidade(codigo: string, codigos: Iterable<string>): number {
  const lista = [...codigos];
  let n = 0;
  let atual: string | null = codigo;
  while ((atual = codigoPai(atual, lista))) n++;
  return n;
}

/** A descricao "exata" sem caixa, acento nem espaco duplo — espelho de `nome_conta_normalizado`. */
export const nomeNormalizado = (nome: string) =>
  nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

/** Formato do codigo: numeros separados por ponto. */
export const codigoValido = (codigo: string) => /^\d+(\.\d+)*$/.test(codigo.trim());

/**
 * Antes de inserir: a conta ja existe pelo CODIGO ou pela DESCRICAO exata?
 * Devolve a conta existente (para a tela oferecer "usar a existente").
 */
export function contaDuplicada<T extends Pick<ContaPlano, 'id' | 'codigo_estruturado' | 'nome'>>(
  nova: { id?: string | null; codigo_estruturado: string; nome: string },
  plano: T[],
): { motivo: 'codigo' | 'descricao'; conta: T } | null {
  const outras = plano.filter((c) => c.id !== nova.id);
  const porCodigo = outras.find((c) => c.codigo_estruturado.trim() === nova.codigo_estruturado.trim());
  if (porCodigo) return { motivo: 'codigo', conta: porCodigo };
  const alvo = nomeNormalizado(nova.nome);
  const porNome = outras.find((c) => nomeNormalizado(c.nome) === alvo);
  return porNome ? { motivo: 'descricao', conta: porNome } : null;
}

/** O que impede salvar a conta (null = pode). A trava de verdade e do banco (0152). */
export function validarConta(
  nova: { id?: string | null; codigo_estruturado: string; nome: string },
  plano: Pick<ContaPlano, 'id' | 'codigo_estruturado' | 'nome'>[],
): string | null {
  if (!codigoValido(nova.codigo_estruturado)) return 'Código inválido: use números separados por ponto (ex.: 4.2.1.01).';
  if (!nova.nome.trim()) return 'Informe a descrição da conta.';
  const dup = contaDuplicada(nova, plano);
  if (dup) {
    const c = dup.conta;
    return dup.motivo === 'codigo'
      ? `Já existe a conta ${c.codigo_estruturado} — ${c.nome}. Use a conta existente.`
      : `Já existe a conta "${c.nome}" (${c.codigo_estruturado}). Use a conta existente.`;
  }
  return null;
}

const NATUREZAS_RECEBE: Natureza[] = ['RECEITA', 'RECEITA_FINANCEIRA', 'PASSIVO', 'PATRIMONIO_LIQUIDO', 'ATIVO'];
const NATUREZAS_PAGA: Natureza[] = ['DEDUCAO', 'CUSTO', 'DESPESA', 'DESPESA_FINANCEIRA', 'ATIVO', 'PASSIVO', 'PATRIMONIO_LIQUIDO'];

/**
 * Contas oferecidas num lancamento: so ANALITICAS, ativas, que o sistema nao
 * alimenta sozinho, e da natureza que combina com receber/pagar. Conta de
 * balanco (imobilizado, emprestimo, capital) entra nos dois lados, depois das
 * de resultado. A ja escolhida continua na lista.
 */
export function contasParaLancamento(
  plano: ContaPlano[],
  tipo: 'RECEITA' | 'DESPESA',
  atualId?: string | null,
): ContaPlano[] {
  const aceitas = tipo === 'RECEITA' ? NATUREZAS_RECEBE : NATUREZAS_PAGA;
  const peso = (c: ContaPlano) => (metaNatureza(naturezaDe(c))?.grupo === 'BALANCO' ? 1 : 0);
  return ordenarPlano(
    plano.filter((c) =>
      c.id === atualId ||
      (c.ativo && ehAnalitica(c) && !c.automatica && aceitas.includes(naturezaDe(c)))),
  ).sort((a, b) => peso(a) - peso(b));
}

/** Rotulo do seletor: "4.2.1.01 · Aluguel e Condomínio". */
export const rotuloConta = (c: Pick<ContaPlano, 'codigo_estruturado' | 'nome'>) => `${c.codigo_estruturado} · ${c.nome}`;

// ---------------------------------------------------------------------------
// DRE GERENCIAL (aba "DRE Gerencial Modelo" da planilha)
// ---------------------------------------------------------------------------
export interface LinhaDreValor {
  categoria_codigo: string;
  categoria_nome: string;
  grupo?: string | null;
  total: number;
}

export type TipoLinhaDre = 'secao' | 'grupo' | 'conta' | 'subtotal' | 'resultado';

export interface LinhaDreGerencial {
  chave: string;
  tipo: TipoLinhaDre;
  rotulo: string;
  codigo?: string;
  /** Com sinal: receita positiva, custo/despesa negativa. */
  valor: number;
  anterior?: number;
  /** % sobre a receita operacional bruta. */
  percentual: number;
  nivel: number;
}

interface SecaoDre { chave: string; rotulo: string; raiz: string; naturezas: Natureza[]; tipoAntigo?: string }

const SECOES: SecaoDre[] = [
  { chave: 'receita', rotulo: '(+) RECEITA OPERACIONAL BRUTA', raiz: '3.1', naturezas: ['RECEITA'], tipoAntigo: 'RECEITA' },
  { chave: 'deducoes', rotulo: '(-) DEDUÇÕES DA RECEITA BRUTA', raiz: '3.2', naturezas: ['DEDUCAO'] },
  { chave: 'custos', rotulo: '(-) CUSTOS OPERACIONAIS (CPV/CSV)', raiz: '4.1', naturezas: ['CUSTO'], tipoAntigo: 'CUSTO_VARIAVEL' },
  { chave: 'despesas', rotulo: '(-) DESPESAS OPERACIONAIS', raiz: '4.2', naturezas: ['DESPESA'], tipoAntigo: 'DESPESA_FIXA' },
  { chave: 'financeiro', rotulo: '(+/-) RESULTADO FINANCEIRO LÍQUIDO', raiz: '4.3', naturezas: ['RECEITA_FINANCEIRA', 'DESPESA_FINANCEIRA'] },
];

function secaoDaLinha(l: LinhaDreValor, plano: Map<string, ContaPlano>): SecaoDre | null {
  const conta = plano.get(l.categoria_codigo);
  const nat = conta
    ? naturezaDe(conta)
    : CODIGO_ANTIGO.test(l.categoria_codigo) ? null : naturezaPorCodigo(l.categoria_codigo);
  if (nat) return SECOES.find((s) => s.naturezas.includes(nat)) ?? null;
  // codigo que o plano nao conhece: cai pelo grupo antigo
  return SECOES.find((s) => s.tipoAntigo === l.grupo) ?? null;
}

/**
 * Monta a DRE na estrutura da planilha: receita bruta (por grupo sintetico),
 * deducoes, receita liquida, custos, lucro bruto, despesas operacionais (por
 * grupo), resultado operacional, resultado financeiro e lucro liquido.
 * Conta de balanco que chegar aqui e ignorada (o banco ja a tira).
 */
export function montarDreGerencial(
  planoLista: ContaPlano[],
  linhas: LinhaDreValor[],
  anteriores?: LinhaDreValor[],
): LinhaDreGerencial[] {
  const plano = new Map(planoLista.map((c) => [c.codigo_estruturado, c]));
  const codigos = planoLista.map((c) => c.codigo_estruturado);

  const agregar = (ls: LinhaDreValor[]) => {
    const porSecao = new Map<string, Map<string, { nome: string; total: number }>>();
    for (const l of ls) {
      const s = secaoDaLinha(l, plano);
      if (!s) continue;
      const m = porSecao.get(s.chave) ?? new Map();
      const atual = m.get(l.categoria_codigo);
      m.set(l.categoria_codigo, {
        nome: plano.get(l.categoria_codigo)?.nome ?? l.categoria_nome,
        total: somarMoeda(atual?.total ?? 0, Number(l.total)),
      });
      porSecao.set(s.chave, m);
    }
    return porSecao;
  };

  const atual = agregar(linhas);
  const ant = anteriores ? agregar(anteriores) : null;
  const total = (m: Map<string, Map<string, { total: number }>> | null, chave: string) =>
    m ? somarMoeda(...[...(m.get(chave)?.values() ?? [])].map((x) => x.total)) : undefined;

  const receitaBruta = total(atual, 'receita') ?? 0;
  const base = Math.abs(receitaBruta);
  const pct = (v: number) => (base ? arredondarMoeda((v / base) * 100) : 0);
  const out: LinhaDreGerencial[] = [];

  const empurrarSecao = (s: SecaoDre) => {
    const v = total(atual, s.chave) ?? 0;
    out.push({ chave: s.chave, tipo: 'secao', rotulo: s.rotulo, codigo: s.raiz, valor: v,
      anterior: total(ant, s.chave), percentual: pct(v), nivel: 0 });

    const contas = [...(atual.get(s.chave)?.entries() ?? [])];
    const contasAnt = ant?.get(s.chave);
    // grupo sintetico logo abaixo da raiz (ex.: 4.2.1 dentro de 4.2)
    const grupoDe = (cod: string) => {
      let g = cod;
      let p = codigoPai(g, codigos);
      while (p && p !== s.raiz) { g = p; p = codigoPai(g, codigos); }
      return p === s.raiz && g !== cod ? g : null;
    };
    const grupos = new Map<string | null, [string, { nome: string; total: number }][]>();
    for (const e of contas) {
      const g = grupoDe(e[0]);
      grupos.set(g, [...(grupos.get(g) ?? []), e]);
    }
    const chavesGrupo = [...grupos.keys()].sort((a, b) =>
      a === null ? -1 : b === null ? 1 : compararCodigos(a, b));
    for (const g of chavesGrupo) {
      const itens = (grupos.get(g) ?? []).sort((a, b) => compararCodigos(a[0], b[0]));
      const nivelLinha = g ? 2 : 1;
      if (g) {
        const vg = somarMoeda(...itens.map((i) => i[1].total));
        const vga = contasAnt
          ? somarMoeda(...[...contasAnt.entries()].filter(([c]) => grupoDe(c) === g).map(([, x]) => x.total))
          : undefined;
        out.push({ chave: `${s.chave}:${g}`, tipo: 'grupo', rotulo: plano.get(g)?.nome ?? g, codigo: g,
          valor: vg, anterior: vga, percentual: pct(vg), nivel: 1 });
      }
      for (const [cod, x] of itens) {
        out.push({ chave: `${s.chave}:${cod}`, tipo: 'conta', rotulo: x.nome, codigo: cod, valor: x.total,
          anterior: contasAnt ? contasAnt.get(cod)?.total ?? 0 : undefined, percentual: pct(x.total), nivel: nivelLinha });
      }
    }
  };

  const sub = (chave: string, rotulo: string, chaves: string[], tipo: TipoLinhaDre = 'subtotal') => {
    const v = somarMoeda(...chaves.map((c) => total(atual, c) ?? 0));
    const a = ant ? somarMoeda(...chaves.map((c) => total(ant, c) ?? 0)) : undefined;
    out.push({ chave, tipo, rotulo, valor: v, anterior: a, percentual: pct(v), nivel: 0 });
  };

  empurrarSecao(SECOES[0]);
  empurrarSecao(SECOES[1]);
  sub('receita_liquida', '(=) RECEITA OPERACIONAL LÍQUIDA', ['receita', 'deducoes']);
  empurrarSecao(SECOES[2]);
  sub('lucro_bruto', '(=) LUCRO BRUTO OPERACIONAL', ['receita', 'deducoes', 'custos']);
  empurrarSecao(SECOES[3]);
  sub('resultado_operacional', '(=) RESULTADO OPERACIONAL (EBITDA)', ['receita', 'deducoes', 'custos', 'despesas']);
  empurrarSecao(SECOES[4]);
  sub('lucro_liquido', '(=) LUCRO LÍQUIDO DO EXERCÍCIO', ['receita', 'deducoes', 'custos', 'despesas', 'financeiro'], 'resultado');
  return out;
}

/** Os numeros do topo da DRE, tirados da propria estrutura. */
export function indicadoresDre(linhas: LinhaDreGerencial[]) {
  const v = (chave: string) => linhas.find((l) => l.chave === chave)?.valor ?? 0;
  const receita = v('receita');
  const pct = (x: number) => (receita ? arredondarMoeda((x / Math.abs(receita)) * 100) : 0);
  return {
    receitaBruta: receita,
    receitaLiquida: v('receita_liquida'),
    lucroBruto: v('lucro_bruto'),
    margemBruta: pct(v('lucro_bruto')),
    resultadoOperacional: v('resultado_operacional'),
    margemOperacional: pct(v('resultado_operacional')),
    lucroLiquido: v('lucro_liquido'),
    margemLiquida: pct(v('lucro_liquido')),
  };
}

// ---------------------------------------------------------------------------
// BALANCETE DE VERIFICACAO
// ---------------------------------------------------------------------------
export interface SaldoContaBalancete {
  codigo: string;
  saldo_anterior: number;
  debitos: number;
  creditos: number;
  saldo_final: number;
}

export interface LinhaBalancete {
  codigo: string;
  nome: string;
  analitica: boolean;
  natureza: Natureza;
  profundidade: number;
  /** Devedor positivo, credor negativo. */
  saldoAnterior: number;
  debitos: number;
  creditos: number;
  saldoFinal: number;
  /** Conta que o plano nao conhece (veio do movimento). */
  foraDoPlano?: boolean;
}

/** "1.234,56 D" / "1.234,56 C": o lado do saldo, pela convencao contabil. */
export const ladoDoSaldo = (saldo: number): 'D' | 'C' | '' => (saldo > 0 ? 'D' : saldo < 0 ? 'C' : '');

/**
 * Monta o balancete: as analiticas com o que veio do banco e as sinteticas
 * somando as filhas pelo prefixo. Contas zeradas (sem saldo nem movimento)
 * saem, salvo `mostrarZeradas`.
 */
export function montarBalancete(
  planoLista: ContaPlano[],
  saldos: SaldoContaBalancete[],
  mostrarZeradas = false,
): { linhas: LinhaBalancete[]; totais: { debitos: number; creditos: number; devedor: number; credor: number } } {
  const plano = ordenarPlano(planoLista);
  const porCodigo = new Map(saldos.map((s) => [s.codigo, s]));
  const codigos = new Set(plano.map((c) => c.codigo_estruturado));
  const extras = saldos.filter((s) => !codigos.has(s.codigo));
  const todos = [...codigos, ...extras.map((e) => e.codigo)];

  const linhaDe = (codigo: string, nome: string, analitica: boolean, natureza: Natureza, fora = false): LinhaBalancete => {
    const filhos = analitica
      ? [porCodigo.get(codigo)].filter(Boolean) as SaldoContaBalancete[]
      : saldos.filter((s) => s.codigo.startsWith(`${codigo}.`));
    return {
      codigo, nome, analitica, natureza, foraDoPlano: fora,
      profundidade: profundidade(codigo, todos),
      saldoAnterior: somarMoeda(...filhos.map((s) => Number(s.saldo_anterior))),
      debitos: somarMoeda(...filhos.map((s) => Number(s.debitos))),
      creditos: somarMoeda(...filhos.map((s) => Number(s.creditos))),
      saldoFinal: somarMoeda(...filhos.map((s) => Number(s.saldo_final))),
    };
  };

  const linhas = [
    ...plano.map((c) => linhaDe(c.codigo_estruturado, c.nome, ehAnalitica(c), naturezaDe(c))),
    ...extras.map((e) => linhaDe(e.codigo, 'Conta fora do plano', true,
      naturezaPorCodigo(e.codigo) ?? 'DESPESA', true)),
  ]
    .filter((l) => mostrarZeradas || l.saldoAnterior || l.debitos || l.creditos || l.saldoFinal)
    .sort((a, b) => compararCodigos(a.codigo, b.codigo));

  const analiticas = saldos;
  return {
    linhas,
    totais: {
      debitos: somarMoeda(...analiticas.map((s) => Number(s.debitos))),
      creditos: somarMoeda(...analiticas.map((s) => Number(s.creditos))),
      devedor: somarMoeda(...analiticas.filter((s) => Number(s.saldo_final) > 0).map((s) => Number(s.saldo_final))),
      credor: somarMoeda(...analiticas.filter((s) => Number(s.saldo_final) < 0).map((s) => -Number(s.saldo_final))),
    },
  };
}

// ---------------------------------------------------------------------------
// FLUXO DE CAIXA EVOLUTIVO (aba "Fluxo de Caixa Modelo" da planilha)
// ---------------------------------------------------------------------------
export type ClasseFluxo = 'CONTA_CORRENTE' | 'INVESTIMENTO' | 'DINHEIRO' | 'OUTROS';

export const CLASSES_FLUXO: { valor: ClasseFluxo; rotulo: string; conta: string }[] = [
  { valor: 'CONTA_CORRENTE', rotulo: 'Bancos Conta Corrente', conta: '1.1.1.02' },
  { valor: 'INVESTIMENTO', rotulo: 'Aplicações Financeiras', conta: '1.1.1.03' },
  { valor: 'DINHEIRO', rotulo: 'Caixas / Dinheiro', conta: '1.1.1.01' },
  { valor: 'OUTROS', rotulo: 'Outras Disponibilidades', conta: '1.1.1.04' },
];

export interface DadosFluxoEvolutivo {
  contas: { id: string; nome: string; classe: string; saldo_inicial: number; saldo_inicial_em: string | null; movimento_antes: number }[];
  por_conta: { dia: string; conta_id: string; valor: number }[];
  por_categoria: { dia: string; codigo: string | null; nome: string | null; entrada: number; saida: number }[];
}

export interface LinhaFluxo {
  chave: string;
  rotulo: string;
  tipo: 'secao' | 'saldo' | 'conta' | 'total' | 'entrada' | 'saida' | 'resultado';
  valores: number[];
  /** Total do periodo (entradas/saidas) ou ultimo valor (saldos). */
  total: number | null;
}

export function diasDoPeriodo(inicio: string, fim: string): string[] {
  const out: string[] = [];
  const d = new Date(`${inicio}T12:00:00Z`);
  const f = new Date(`${fim}T12:00:00Z`);
  while (d <= f && out.length < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * A grade do fluxo: SALDOS INICIAIS por classe de conta (o saldo no INICIO de
 * cada dia) com cada conta bancaria abaixo da sua classe, TOTAIS SALDOS, ENTRADAS por conta do plano, SAIDAS (negativas,
 * como na planilha) e o SALDO FINAL de cada dia. Transferencia entre contas
 * mexe nos saldos por classe e nao aparece como entrada nem saida.
 * O saldo inicial de implantacao da conta e o saldo no FIM do dia
 * `saldo_inicial_em`: ele passa a contar no dia seguinte.
 */
export function montarFluxoEvolutivo(dados: DadosFluxoEvolutivo, inicio: string, fim: string): { dias: string[]; linhas: LinhaFluxo[] } {
  const dias = diasDoPeriodo(inicio, fim);
  const idx = new Map(dias.map((d, i) => [d, i]));
  const n = dias.length;
  const zeros = () => Array<number>(n).fill(0);

  // saldo de cada conta no inicio de cada dia
  const movConta = new Map<string, number[]>();
  for (const m of dados.por_conta) {
    const i = idx.get(m.dia);
    if (i === undefined) continue;
    const arr = movConta.get(m.conta_id) ?? zeros();
    arr[i] = somarMoeda(arr[i], Number(m.valor));
    movConta.set(m.conta_id, arr);
  }
  const saldoClasse = new Map<ClasseFluxo, number[]>(CLASSES_FLUXO.map((c) => [c.valor, zeros()]));
  // cada conta bancaria tem a sua linha abaixo da classe (0153)
  const contasDaClasse = new Map<ClasseFluxo, { id: string; nome: string; valores: number[] }[]>();
  for (const c of [...dados.contas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))) {
    const classe = (CLASSES_FLUXO.some((x) => x.valor === c.classe) ? c.classe : 'OUTROS') as ClasseFluxo;
    const linha = saldoClasse.get(classe)!;
    const daConta = zeros();
    const mov = movConta.get(c.id) ?? zeros();
    let acumulado = Number(c.movimento_antes ?? 0);
    dias.forEach((dia, i) => {
      const implantado = !c.saldo_inicial_em || c.saldo_inicial_em < dia ? Number(c.saldo_inicial ?? 0) : 0;
      daConta[i] = somarMoeda(implantado, acumulado);
      linha[i] = somarMoeda(linha[i], daConta[i]);
      acumulado = somarMoeda(acumulado, mov[i]);
    });
    contasDaClasse.set(classe, [...(contasDaClasse.get(classe) ?? []), { id: c.id, nome: c.nome, valores: daConta }]);
  }

  // entradas e saidas por conta do plano
  type Acum = { rotulo: string; valores: number[] };
  const entradas = new Map<string, Acum>();
  const saidas = new Map<string, Acum>();
  for (const m of dados.por_categoria) {
    const i = idx.get(m.dia);
    if (i === undefined) continue;
    const chave = m.codigo ?? 'sem';
    const rotulo = m.codigo ? `${m.codigo} ${m.nome ?? ''}`.trim() : 'Sem plano de contas';
    if (Number(m.entrada)) {
      const a = entradas.get(chave) ?? { rotulo, valores: zeros() };
      a.valores[i] = somarMoeda(a.valores[i], Number(m.entrada));
      entradas.set(chave, a);
    }
    if (Number(m.saida)) {
      const a = saidas.get(chave) ?? { rotulo, valores: zeros() };
      a.valores[i] = somarMoeda(a.valores[i], -Number(m.saida));
      saidas.set(chave, a);
    }
  }
  const ordenadas = (m: Map<string, Acum>) =>
    [...m.entries()].sort(([a], [b]) => (a === 'sem' ? 1 : b === 'sem' ? -1 : compararCodigos(a, b)));
  const somaColunas = (ls: number[][]) => dias.map((_, i) => somarMoeda(...ls.map((l) => l[i])));
  const soma = (v: number[]) => somarMoeda(...v);

  const linhas: LinhaFluxo[] = [];
  linhas.push({ chave: 'saldos', rotulo: 'SALDOS INICIAIS', tipo: 'secao', valores: [], total: null });
  for (const c of CLASSES_FLUXO) {
    const v = saldoClasse.get(c.valor)!;
    linhas.push({ chave: `saldo:${c.valor}`, rotulo: c.conta ? `${c.conta} ${c.rotulo}` : c.rotulo, tipo: 'saldo', valores: v, total: v[0] ?? 0 });
    for (const conta of contasDaClasse.get(c.valor) ?? []) {
      linhas.push({ chave: `conta:${conta.id}`, rotulo: conta.nome, tipo: 'conta', valores: conta.valores, total: conta.valores[0] ?? 0 });
    }
  }
  const totalSaldos = somaColunas([...saldoClasse.values()]);
  linhas.push({ chave: 'totais_saldos', rotulo: 'TOTAIS SALDOS', tipo: 'total', valores: totalSaldos, total: totalSaldos[0] ?? 0 });

  linhas.push({ chave: 'entradas', rotulo: 'ENTRADAS (RECEITAS)', tipo: 'secao', valores: [], total: null });
  for (const [k, a] of ordenadas(entradas)) {
    linhas.push({ chave: `entrada:${k}`, rotulo: a.rotulo, tipo: 'entrada', valores: a.valores, total: soma(a.valores) });
  }
  const totalEntradas = somaColunas([...entradas.values()].map((a) => a.valores));
  linhas.push({ chave: 'totais_entradas', rotulo: 'TOTAIS ENTRADAS', tipo: 'total', valores: totalEntradas, total: soma(totalEntradas) });

  linhas.push({ chave: 'saidas', rotulo: 'SAÍDAS (DESPESAS E CUSTOS)', tipo: 'secao', valores: [], total: null });
  for (const [k, a] of ordenadas(saidas)) {
    linhas.push({ chave: `saida:${k}`, rotulo: a.rotulo, tipo: 'saida', valores: a.valores, total: soma(a.valores) });
  }
  const totalSaidas = somaColunas([...saidas.values()].map((a) => a.valores));
  linhas.push({ chave: 'totais_saidas', rotulo: 'TOTAIS SAÍDAS', tipo: 'total', valores: totalSaidas, total: soma(totalSaidas) });

  const resultadoDia = dias.map((_, i) => somarMoeda(totalEntradas[i], totalSaidas[i]));
  let acum = 0;
  const acumulado = resultadoDia.map((v) => (acum = somarMoeda(acum, v)));
  linhas.push({ chave: 'resultado_dia', rotulo: 'RESULTADO DO DIA (ENTRADAS + SAÍDAS)', tipo: 'resultado', valores: resultadoDia, total: soma(resultadoDia) });
  linhas.push({ chave: 'resultado_acumulado', rotulo: 'RESULTADO ACUMULADO NO PERÍODO', tipo: 'resultado', valores: acumulado, total: acumulado.at(-1) ?? 0 });
  const saldoFinal = dias.map((_, i) => somarMoeda(totalSaldos[i], resultadoDia[i]));
  linhas.push({ chave: 'saldo_final', rotulo: 'SALDO FINAL OPERACIONAL', tipo: 'resultado', valores: saldoFinal, total: saldoFinal.at(-1) ?? 0 });
  return { dias, linhas };
}
