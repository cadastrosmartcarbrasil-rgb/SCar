// ---------------------------------------------------------------------------
// Importacao de VENDEDORES por planilha.
//
// Por que planilha e nao API: metade do cadastro (comissao, banco, PIX, prazo)
// NAO existe no sistema de origem — e acordo comercial, digitado de qualquer
// jeito. E o volume e de centenas, nao de milhares: nao ha escala que pague
// uma integracao.
//
// A REGRA DE SEGURANCA QUE NAO SE NEGOCIA: nome de regional que nao casa com
// uma unidade cadastrada BLOQUEIA a linha. Nunca "cai na matriz" — neste
// sistema `regional_id is null` significa MATRIZ (0067), entao um de-para
// silencioso jogaria a equipe inteira de uma franquia para dentro da matriz,
// atravessando RLS e `escopo_regional()`.
//
// Modelo de UX herdado de `precificacao-import.ts`: erro aponta LINHA e COLUNA,
// erro de formula do Excel bloqueia em vez de gravar vazio, e a previa mostra
// o que entra / o que muda / o que fica de fora ANTES de gravar.
// ---------------------------------------------------------------------------

import { normalizarCabecalho, matrizDeCsv, ehErroExcel } from './precificacao-import';
import { validarCPF, validarCNPJ } from './documento';

export { matrizDeCsv };

/** Cabecalhos aceitos por campo (normalizados: sem acento, caixa alta). */
const SINONIMOS: Record<string, string[]> = {
  nome: ['NOME', 'NOME COMPLETO', 'CONSULTOR', 'VENDEDOR'],
  email: ['EMAIL', 'E-MAIL'],
  documento: ['CPF/CNPJ CONSULTOR', 'CPF/CNPJ', 'CPF', 'CNPJ', 'DOCUMENTO'],
  telefone: ['TELEFONE', 'CELULAR', 'FONE', 'WHATSAPP'],
  regional: ['REGIONAL', 'NOME REGIONAL', 'UNIDADE', 'FRANQUIA'],
  status: ['STATUS', 'SITUACAO'],
  cidade: ['CIDADE', 'MUNICIPIO'],
  uf: ['ESTADO', 'UF'],
  cadastro: ['DATA CADASTRO', 'CADASTRO', 'DATA DE CADASTRO'],
  // opcionais — nao vem do Mutual, entram quando a equipe preenche
  codigo: ['CODIGO', 'CODIGO HOTLINK', 'HOTLINK'],
  comissao_adesao: ['COMISSAO ADESAO', 'COMISSAO DE ADESAO', '% ADESAO'],
  comissao_recorrente: ['COMISSAO RECORRENTE', 'COMISSAO RECORRENCIA', '% RECORRENTE'],
  banco: ['BANCO'],
  agencia: ['AGENCIA'],
  conta: ['CONTA'],
  chave_pix: ['CHAVE PIX', 'PIX'],
};

export interface VendedorImportado {
  /** Linha no Excel como o operador ve (o cabecalho e a 1). */
  linha: number;
  nome: string;
  email: string | null;
  documento: string | null;
  telefone: string | null;
  /** O texto CRU da planilha — e a chave do de-para. */
  regional_texto: string;
  /** Resolvido pelo de-para; null = ainda nao mapeado (linha bloqueada). */
  regional_id: string | null;
  ativo_na_origem: boolean;
  cidade: string | null;
  uf: string | null;
  cadastro_origem: string | null;
  codigo: string | null;
  comissao_adesao: number | null;
  comissao_recorrente: number | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  chave_pix: string | null;
  /** Problemas que NAO impedem a importacao (documento invalido, sem contato). */
  avisos: string[];
}

export interface LeituraPlanilha {
  linhas: VendedorImportado[];
  erros: string[];
  avisos: string[];
  /** Cabecalhos que a planilha trouxe e o importador nao reconhece. */
  colunasIgnoradas: string[];
}

const texto = (v: string | undefined) => (v ?? '').trim();
const soDigitos = (v: string | undefined) => texto(v).replace(/\D/g, '');
const ouNulo = (v: string | undefined) => texto(v) || null;

/** Percentual em formato BR ("15,5" ou "15.5") -> 15.5. Vazio -> null. */
export function percentual(v: string | undefined): number | null {
  const t = texto(v).replace('%', '').trim();
  if (!t) return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** A unidade como a tela conhece: nome para casar, teto para validar. */
export interface RegionalAlvo {
  id: string;
  nome: string;
  ativo?: boolean | null;
  /** Teto da franquia em PERCENTUAL (0034: o vendedor nunca passa a regional). */
  teto_adesao?: number | null;
  teto_recorrente?: number | null;
}

/** Normaliza para casar nome de regional: sem acento, sem pontuacao, caixa alta. */
export function chaveRegional(nome: string): string {
  return (nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Casa o texto da planilha com uma unidade cadastrada, pelo NOME.
 * Devolve null quando nao ha correspondencia exata — e null aqui significa
 * "bloqueia a linha", nunca "manda para a matriz".
 */
export function casarRegional(
  nomePlanilha: string,
  regionais: RegionalAlvo[],
): string | null {
  const alvo = chaveRegional(nomePlanilha);
  if (!alvo) return null;
  const achou = (regionais ?? []).find((r) => chaveRegional(r.nome) === alvo);
  return achou?.id ?? null;
}

/** O status da origem virou "ativo"? So a palavra ATIVO conta. */
export function ativoNaOrigem(status: string | undefined): boolean {
  return chaveRegional(status ?? '') === 'ATIVO';
}

/**
 * Le a matriz da planilha. A ordem das colunas nao importa e o nome casa sem
 * acento/caixa; o que ela nao reconhece vira AVISO, nunca erro — planilha de
 * relatorio sempre traz coluna a mais.
 */
export function interpretarPlanilhaVendedores(matriz: string[][]): LeituraPlanilha {
  const erros: string[] = [];
  const avisos: string[] = [];
  const linhas: VendedorImportado[] = [];

  if (!matriz.length) {
    return { linhas, erros: ['A planilha esta vazia.'], avisos, colunasIgnoradas: [] };
  }

  const cabecalho = (matriz[0] ?? []).map(normalizarCabecalho);
  const indice: Record<string, number> = {};
  const usados = new Set<number>();

  for (const [campo, nomes] of Object.entries(SINONIMOS)) {
    const i = cabecalho.findIndex((c) => nomes.includes(c));
    if (i >= 0) { indice[campo] = i; usados.add(i); }
  }

  const colunasIgnoradas = cabecalho.filter((c, i) => c && !usados.has(i));

  if (indice.nome === undefined) {
    erros.push('A planilha precisa de uma coluna NOME.');
  }
  if (indice.regional === undefined) {
    erros.push('A planilha precisa de uma coluna REGIONAL (ou "Nome Regional") — e ela que diz a que unidade cada vendedor pertence.');
  }
  if (erros.length) return { linhas, erros, avisos, colunasIgnoradas };

  const campo = (linha: string[], nome: string) =>
    indice[nome] === undefined ? '' : linha[indice[nome]];

  for (let i = 1; i < matriz.length; i++) {
    const l = matriz[i] ?? [];
    const numeroLinha = i + 1;
    const nome = texto(campo(l, 'nome'));
    if (!nome) continue; // linha em branco no meio da planilha nao e erro

    // Erro de formula do Excel nunca pode passar como vazio (gotcha da 0013).
    const celulaComErro = Object.keys(indice).find((k) => ehErroExcel(campo(l, k)));
    if (celulaComErro) {
      erros.push(`Linha ${numeroLinha}: a coluna ${celulaComErro.toUpperCase()} tem erro de formula do Excel ("${texto(campo(l, celulaComErro))}"). Corrija na planilha antes de importar.`);
      continue;
    }

    const doc = soDigitos(campo(l, 'documento'));
    const avisosLinha: string[] = [];

    if (doc && doc.length === 11 && !validarCPF(doc)) {
      avisosLinha.push('CPF invalido (entra como veio, para reconciliar com a origem)');
    } else if (doc && doc.length === 14 && !validarCNPJ(doc)) {
      avisosLinha.push('CNPJ invalido (entra como veio, para reconciliar com a origem)');
    } else if (doc && doc.length !== 11 && doc.length !== 14) {
      avisosLinha.push(`documento com ${doc.length} digitos (nao e CPF nem CNPJ)`);
    }
    if (!doc) avisosLinha.push('sem CPF/CNPJ — a reimportacao vai casar pelo e-mail');
    if (!texto(campo(l, 'email'))) avisosLinha.push('sem e-mail (nao da para criar acesso ao portal)');
    if (!texto(campo(l, 'telefone'))) avisosLinha.push('sem telefone');

    const cAdesao = percentual(campo(l, 'comissao_adesao'));
    const cRecorrente = percentual(campo(l, 'comissao_recorrente'));
    if (cAdesao !== null && (cAdesao < 0 || cAdesao > 100)) {
      erros.push(`Linha ${numeroLinha}: comissao de adesao fora de 0-100% (${cAdesao}).`);
      continue;
    }
    if (cRecorrente !== null && (cRecorrente < 0 || cRecorrente > 100)) {
      erros.push(`Linha ${numeroLinha}: comissao recorrente fora de 0-100% (${cRecorrente}).`);
      continue;
    }

    linhas.push({
      linha: numeroLinha,
      nome,
      email: ouNulo(campo(l, 'email'))?.toLowerCase() ?? null,
      documento: doc || null,
      telefone: ouNulo(campo(l, 'telefone')),
      regional_texto: texto(campo(l, 'regional')),
      regional_id: null,
      ativo_na_origem: ativoNaOrigem(campo(l, 'status')),
      cidade: ouNulo(campo(l, 'cidade')),
      uf: ouNulo(campo(l, 'uf'))?.toUpperCase() ?? null,
      cadastro_origem: ouNulo(campo(l, 'cadastro')),
      codigo: ouNulo(campo(l, 'codigo'))?.toUpperCase() ?? null,
      comissao_adesao: cAdesao,
      comissao_recorrente: cRecorrente,
      banco: ouNulo(campo(l, 'banco')),
      agencia: ouNulo(campo(l, 'agencia')),
      conta: ouNulo(campo(l, 'conta')),
      chave_pix: ouNulo(campo(l, 'chave_pix')),
      avisos: avisosLinha,
    });
  }

  if (!linhas.length && !erros.length) erros.push('A planilha nao tem nenhuma linha com nome preenchido.');

  if (colunasIgnoradas.length) {
    avisos.push(`Colunas ignoradas (nao fazem parte do cadastro de vendedor): ${colunasIgnoradas.join(', ')}.`);
  }

  return { linhas, erros, avisos, colunasIgnoradas };
}

export interface GrupoRegional {
  /** O texto como veio da planilha. */
  texto: string;
  quantidade: number;
  /** Casou sozinho com uma unidade cadastrada? */
  regional_id: string | null;
  /** As cidades que aparecem nesse grupo — e o que revela grupo mal formado. */
  cidades: string[];
}

/**
 * Agrupa as linhas pelo texto da regional e tenta casar cada grupo.
 *
 * O de-para e por NOME DISTINTO, nao por linha: 379 linhas com 8 nomes sao
 * 8 decisoes, nao 379. As cidades vao junto de proposito — um grupo que
 * espalha por dez cidades de tres estados nao e uma unidade, e um balde, e
 * quem decide precisa ver isso antes de mapear.
 */
export function agruparRegionais(
  linhas: VendedorImportado[],
  regionais: RegionalAlvo[],
): GrupoRegional[] {
  const mapa = new Map<string, GrupoRegional>();
  for (const l of linhas) {
    const k = chaveRegional(l.regional_texto);
    let g = mapa.get(k);
    if (!g) {
      g = {
        texto: l.regional_texto || '(sem regional na planilha)',
        quantidade: 0,
        regional_id: casarRegional(l.regional_texto, regionais),
        cidades: [],
      };
      mapa.set(k, g);
    }
    g.quantidade += 1;
    const cidade = [l.cidade, l.uf].filter(Boolean).join('/');
    if (cidade && !g.cidades.includes(cidade)) g.cidades.push(cidade);
  }
  return [...mapa.values()].sort((a, b) => b.quantidade - a.quantidade);
}

export interface VendedorExistente {
  id: string;
  nome: string;
  documento: string | null;
  email: string | null;
}

export type SituacaoLinha = 'NOVO' | 'ATUALIZA' | 'BLOQUEADO';

export interface LinhaPrevia extends VendedorImportado {
  situacao: SituacaoLinha;
  /** Preenchido quando a linha e BLOQUEADO. */
  motivo?: string;
  /** Preenchido quando a linha e ATUALIZA. */
  existente?: VendedorExistente;
}

export interface Previa {
  linhas: LinhaPrevia[];
  novos: number;
  atualiza: number;
  bloqueados: number;
  /** Quantos ficariam ATIVOS se a origem for respeitada. */
  ativosNaOrigem: number;
}

/** A chave de idempotencia: documento primeiro, e-mail como reserva. */
export function chaveDoVendedor(v: { documento: string | null; email: string | null }): string | null {
  if (v.documento) return `D:${v.documento}`;
  if (v.email) return `E:${v.email.toLowerCase()}`;
  return null;
}

/**
 * Monta a previa. `dePara` mapeia a CHAVE do texto da regional (`chaveRegional`)
 * para o id da unidade — e o que a tela preenche.
 *
 * As validacoes de TETO e de UNIDADE ATIVA vivem aqui de proposito: a RPC
 * `importar_vendedores` (0069) e ATOMICA, entao uma linha recusada pelo banco
 * derruba a carga inteira. Barrar na previa transforma "a importacao falhou"
 * em "estas 3 linhas ficaram de fora, e por isto".
 */
export function montarPrevia(
  linhas: VendedorImportado[],
  dePara: Record<string, string | null>,
  existentes: VendedorExistente[],
  regionais: RegionalAlvo[] = [],
): Previa {
  const porId = new Map((regionais ?? []).map((r) => [r.id, r]));
  const porChave = new Map<string, VendedorExistente>();
  for (const e of existentes ?? []) {
    const k = chaveDoVendedor(e);
    if (k && !porChave.has(k)) porChave.set(k, e);
  }

  // Duplicidade DENTRO da propria planilha: a segunda ocorrencia sobrescreveria
  // a primeira em silencio, entao ela e barrada e nomeia a linha irma.
  const vistas = new Map<string, number>();

  const saida: LinhaPrevia[] = linhas.map((l) => {
    const regionalId = dePara[chaveRegional(l.regional_texto)] ?? null;
    const chave = chaveDoVendedor(l);

    if (!regionalId) {
      return { ...l, regional_id: null, situacao: 'BLOQUEADO',
        motivo: `A unidade "${l.regional_texto || '(vazio)'}" nao esta mapeada para nenhuma regional cadastrada.` };
    }
    if (!chave) {
      return { ...l, regional_id: regionalId, situacao: 'BLOQUEADO',
        motivo: 'Sem CPF/CNPJ e sem e-mail: nao ha como reconhecer esta pessoa numa reimportacao.' };
    }
    const irma = vistas.get(chave);
    if (irma) {
      return { ...l, regional_id: regionalId, situacao: 'BLOQUEADO',
        motivo: `Repetido na propria planilha (mesma pessoa da linha ${irma}).` };
    }

    const unidade = porId.get(regionalId);
    // Unidade inativa so barra quem entraria ATIVO — e o espelho exato do
    // `fn_vendedor_regional_ativa` (0067), que so recusa vendedor ativo.
    if (unidade && unidade.ativo === false && l.ativo_na_origem) {
      return { ...l, regional_id: regionalId, situacao: 'BLOQUEADO',
        motivo: `A unidade "${unidade.nome}" esta INATIVA e nao recebe vendedor ativo.` };
    }
    const teto = (valor: number | null, limite: number | null | undefined, qual: string) =>
      valor !== null && limite != null && valor > limite
        ? `Comissao de ${qual} (${valor}%) acima do teto da franquia (${limite}%).`
        : null;
    const furou =
      teto(l.comissao_adesao, unidade?.teto_adesao, 'adesao') ??
      teto(l.comissao_recorrente, unidade?.teto_recorrente, 'recorrencia');
    if (furou) {
      return { ...l, regional_id: regionalId, situacao: 'BLOQUEADO', motivo: furou };
    }

    vistas.set(chave, l.linha);

    const existente = porChave.get(chave);
    return existente
      ? { ...l, regional_id: regionalId, situacao: 'ATUALIZA', existente }
      : { ...l, regional_id: regionalId, situacao: 'NOVO' };
  });

  const conta = (s: SituacaoLinha) => saida.filter((l) => l.situacao === s).length;
  return {
    linhas: saida,
    novos: conta('NOVO'),
    atualiza: conta('ATUALIZA'),
    bloqueados: conta('BLOQUEADO'),
    ativosNaOrigem: saida.filter((l) => l.situacao !== 'BLOQUEADO' && l.ativo_na_origem).length,
  };
}

export const CABECALHO_MODELO = [
  'NOME', 'CPF/CNPJ', 'EMAIL', 'TELEFONE', 'REGIONAL', 'STATUS',
  'CIDADE', 'ESTADO', 'DATA CADASTRO',
  'CODIGO', 'COMISSAO ADESAO', 'COMISSAO RECORRENTE',
  'BANCO', 'AGENCIA', 'CONTA', 'CHAVE PIX',
];

/** Modelo CSV com as unidades cadastradas como exemplo na coluna REGIONAL. */
export function gerarModeloCsvVendedores(regionais: { nome: string }[]): string {
  const exemplo = (regionais ?? [])[0]?.nome ?? 'NOME EXATO DA UNIDADE';
  const linhas = [
    CABECALHO_MODELO,
    ['MARIA DA SILVA', '529.982.247-25', 'maria@exemplo.com.br', '(65) 99999-0000',
     exemplo, 'Ativo', 'CUIABA', 'MT', '01/03/2024', '', '10', '5', '', '', '', ''],
  ];
  return linhas.map((l) => l.join(';')).join('\r\n');
}
