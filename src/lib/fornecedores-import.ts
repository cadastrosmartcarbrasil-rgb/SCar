// ---------------------------------------------------------------------------
// Importacao de FORNECEDORES por planilha (25/10/2026).
//
// Parte da lista ja esta cadastrada, entao a regra que manda e NAO DUPLICAR:
//  1. CPF/CNPJ (so digitos) e a chave — `fornecedores.documento` e unique.
//  2. Sem documento, casa pelo NOME (razao social ou fantasia, sem acento nem
//     pontuacao) com um cadastro que tambem nao tem documento ou tem o mesmo.
//  3. Repetido dentro da propria planilha e barrado, nomeando a linha irma.
// O que ja existe NUNCA e sobrescrito: no maximo o que esta VAZIO no cadastro
// e completado, e as marcas (prestador 24h, rastreadora) so sao acrescentadas.
//
// Modelo herdado de `vendedores-import.ts`/`precificacao-import.ts`: a ordem das
// colunas nao importa, erro de formula do Excel bloqueia, e a previa mostra o
// que entra / o que completa / o que fica de fora ANTES de gravar.
// ---------------------------------------------------------------------------

import { normalizarCabecalho, matrizDeCsv, ehErroExcel } from './precificacao-import';
import { validarCPF, validarCNPJ } from './documento';
import { parseMoedaBR } from './money';

export { matrizDeCsv };

/** As colunas do modelo, na ordem em que a planilha nasce. */
export const COLUNAS_FORNECEDOR: { campo: string; titulo: string; ajuda: string; exemplo: string; largura: number }[] = [
  { campo: 'documento', titulo: 'CNPJ/CPF', ajuda: 'Só números ou com pontuação. É ele que evita cadastrar a mesma empresa duas vezes.', exemplo: '11.222.333/0001-81', largura: 22 },
  { campo: 'razao_social', titulo: 'RAZAO SOCIAL', ajuda: 'OBRIGATÓRIO. Nome da empresa (ou da pessoa, se for CPF).', exemplo: 'AUTO SOCORRO EXEMPLO LTDA', largura: 36 },
  { campo: 'nome_fantasia', titulo: 'NOME FANTASIA', ajuda: 'Como a equipe conhece o fornecedor.', exemplo: 'GUINCHO EXEMPLO', largura: 26 },
  { campo: 'prestador', titulo: 'PRESTADOR 24H', ajuda: 'SIM se presta serviço na Assistência 24h (guincho, chaveiro...). Vazio = NÃO.', exemplo: 'SIM', largura: 15 },
  { campo: 'rastreadora', titulo: 'RASTREADORA', ajuda: 'SIM se é empresa de rastreamento. Vazio = NÃO.', exemplo: 'NAO', largura: 13 },
  { campo: 'contato', titulo: 'CONTATO', ajuda: 'Nome da pessoa de contato.', exemplo: 'JOAO', largura: 18 },
  { campo: 'telefone', titulo: 'TELEFONE', ajuda: 'Com DDD.', exemplo: '(65) 3333-4444', largura: 16 },
  { campo: 'whatsapp', titulo: 'WHATSAPP', ajuda: 'Com DDD.', exemplo: '(65) 99999-0000', largura: 16 },
  { campo: 'email', titulo: 'EMAIL', ajuda: '', exemplo: 'contato@exemplo.com.br', largura: 28 },
  { campo: 'cep', titulo: 'CEP', ajuda: '', exemplo: '78000-000', largura: 11 },
  { campo: 'logradouro', titulo: 'LOGRADOURO', ajuda: 'Rua, avenida...', exemplo: 'AV. EXEMPLO', largura: 28 },
  { campo: 'numero', titulo: 'NUMERO', ajuda: '', exemplo: '100', largura: 9 },
  { campo: 'complemento', titulo: 'COMPLEMENTO', ajuda: '', exemplo: 'SALA 2', largura: 14 },
  { campo: 'bairro', titulo: 'BAIRRO', ajuda: '', exemplo: 'CENTRO', largura: 18 },
  { campo: 'cidade', titulo: 'CIDADE', ajuda: '', exemplo: 'CUIABA', largura: 18 },
  { campo: 'uf', titulo: 'UF', ajuda: 'Sigla do estado.', exemplo: 'MT', largura: 6 },
  { campo: 'chave_pix', titulo: 'CHAVE PIX', ajuda: 'Como está no banco (e-mail, CNPJ, telefone ou chave aleatória).', exemplo: '11222333000181', largura: 24 },
  { campo: 'cobertura', titulo: 'COBERTURA', ajuda: 'Prestador 24h: cidades/região que atende.', exemplo: 'CUIABA E VARZEA GRANDE', largura: 26 },
  { campo: 'plataforma_url', titulo: 'PLATAFORMA (URL)', ajuda: 'Rastreadora: endereço da plataforma.', exemplo: '', largura: 24 },
  { campo: 'custo', titulo: 'CUSTO MENSAL EQUIPAMENTO', ajuda: 'Rastreadora: valor por equipamento/mês (ex.: 25,00).', exemplo: '', largura: 14 },
  { campo: 'observacoes', titulo: 'OBSERVACOES', ajuda: '', exemplo: '', largura: 30 },
  { campo: 'ativo', titulo: 'ATIVO', ajuda: 'NAO para cadastrar como inativo. Vazio = SIM.', exemplo: 'SIM', largura: 8 },
];

const exemploDe = (campo: string) => COLUNAS_FORNECEDOR.find((c) => c.campo === campo)?.exemplo ?? '';
const EXEMPLO_RAZAO = exemploDe('razao_social');
const EXEMPLO_DOC = exemploDe('documento').replace(/\D/g, '');

/** Cabecalhos aceitos por campo (normalizados: sem acento, caixa alta). */
const SINONIMOS: Record<string, string[]> = {
  documento: ['CNPJ/CPF', 'CPF/CNPJ', 'CNPJ', 'CPF', 'DOCUMENTO'],
  razao_social: ['RAZAO SOCIAL', 'RAZAO', 'NOME', 'NOME EMPRESARIAL', 'FORNECEDOR', 'EMPRESA'],
  nome_fantasia: ['NOME FANTASIA', 'FANTASIA', 'APELIDO'],
  prestador: ['PRESTADOR 24H', 'PRESTADOR', 'ASSISTENCIA 24H', 'PRESTADOR 24 HORAS'],
  rastreadora: ['RASTREADORA', 'EMPRESA DE RASTREAMENTO', 'RASTREAMENTO'],
  contato: ['CONTATO', 'RESPONSAVEL', 'NOME DO CONTATO'],
  telefone: ['TELEFONE', 'FONE', 'CELULAR'],
  whatsapp: ['WHATSAPP', 'WHATS', 'ZAP'],
  email: ['EMAIL', 'E-MAIL'],
  cep: ['CEP'],
  logradouro: ['LOGRADOURO', 'ENDERECO', 'RUA'],
  numero: ['NUMERO', 'NO', 'N'],
  complemento: ['COMPLEMENTO'],
  bairro: ['BAIRRO'],
  cidade: ['CIDADE', 'MUNICIPIO'],
  uf: ['UF', 'ESTADO'],
  chave_pix: ['CHAVE PIX', 'PIX'],
  cobertura: ['COBERTURA', 'AREA DE ATENDIMENTO', 'REGIAO'],
  plataforma_url: ['PLATAFORMA (URL)', 'PLATAFORMA', 'URL', 'SITE'],
  custo: ['CUSTO MENSAL EQUIPAMENTO', 'CUSTO MENSAL', 'CUSTO EQUIPAMENTO', 'CUSTO'],
  observacoes: ['OBSERVACOES', 'OBSERVACAO', 'OBS'],
  ativo: ['ATIVO', 'SITUACAO', 'STATUS'],
};

export interface EnderecoImportado {
  cep?: string; logradouro?: string; numero?: string; complemento?: string;
  bairro?: string; cidade?: string; uf?: string;
}

export interface FornecedorImportado {
  /** Linha no Excel como o operador ve (o cabecalho e a 1). */
  linha: number;
  documento: string | null;
  tipo_pessoa: 'PF' | 'PJ';
  razao_social: string;
  nome_fantasia: string | null;
  prestador_assistencia: boolean;
  empresa_rastreamento: boolean;
  contato: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  endereco: EnderecoImportado;
  chave_pix: string | null;
  cobertura: string | null;
  plataforma_url: string | null;
  custo_mensal_equipamento: number | null;
  observacoes: string | null;
  ativo: boolean;
  /** Documento com digito errado: a linha nao entra (o banco recusa). */
  documento_invalido: boolean;
  avisos: string[];
}

export interface LeituraPlanilhaFornecedores {
  linhas: FornecedorImportado[];
  erros: string[];
  avisos: string[];
  colunasIgnoradas: string[];
}

const texto = (v: string | undefined) => (v ?? '').trim();
const caixaAlta = (v: string | undefined) => texto(v).replace(/\s+/g, ' ').toUpperCase() || null;
const digitos = (v: string | undefined) => texto(v).replace(/\D/g, '');

/** SIM/NAO da planilha. Vazio devolve o padrao. */
export function simNao(v: string | undefined, padrao: boolean): boolean {
  const t = normalizarCabecalho(v ?? '');
  if (!t) return padrao;
  if (['SIM', 'S', 'X', 'YES', 'Y', '1', 'VERDADEIRO', 'TRUE', 'ATIVO'].includes(t)) return true;
  if (['NAO', 'N', 'NO', '0', 'FALSO', 'FALSE', 'INATIVO'].includes(t)) return false;
  return padrao;
}

/**
 * CPF/CNPJ da planilha -> so digitos. O Excel come o zero da frente quando a
 * celula e numero (CNPJ 01.234... vira 1234...): 12-13 digitos completa para
 * CNPJ e 9-10 para CPF, mas so se o resultado for valido.
 */
export function documentoDaPlanilha(v: string | undefined): { documento: string | null; tipo: 'PF' | 'PJ'; valido: boolean; completado: boolean } {
  const d = digitos(v);
  if (!d) return { documento: null, tipo: 'PJ', valido: true, completado: false };
  if (d.length === 14) return { documento: d, tipo: 'PJ', valido: validarCNPJ(d), completado: false };
  if (d.length === 11) {
    if (validarCPF(d)) return { documento: d, tipo: 'PF', valido: true, completado: false };
    // 11 digitos que nao e CPF pode ser CNPJ que perdeu 3 zeros
    const cnpj = d.padStart(14, '0');
    if (validarCNPJ(cnpj)) return { documento: cnpj, tipo: 'PJ', valido: true, completado: true };
    return { documento: d, tipo: 'PF', valido: false, completado: false };
  }
  if (d.length === 12 || d.length === 13) {
    const cnpj = d.padStart(14, '0');
    return { documento: cnpj, tipo: 'PJ', valido: validarCNPJ(cnpj), completado: true };
  }
  if (d.length === 9 || d.length === 10) {
    const cpf = d.padStart(11, '0');
    return { documento: cpf, tipo: 'PF', valido: validarCPF(cpf), completado: true };
  }
  return { documento: d, tipo: d.length > 11 ? 'PJ' : 'PF', valido: false, completado: false };
}

/** Le a matriz da planilha. Coluna a mais vira AVISO, nunca erro. */
export function interpretarPlanilhaFornecedores(matriz: string[][]): LeituraPlanilhaFornecedores {
  const erros: string[] = [];
  const avisos: string[] = [];
  const linhas: FornecedorImportado[] = [];

  if (!matriz.length) return { linhas, erros: ['A planilha está vazia.'], avisos, colunasIgnoradas: [] };

  const cabecalho = (matriz[0] ?? []).map(normalizarCabecalho);
  const indice: Record<string, number> = {};
  const usados = new Set<number>();
  for (const [campo, nomes] of Object.entries(SINONIMOS)) {
    const i = cabecalho.findIndex((c, j) => !usados.has(j) && nomes.includes(c));
    if (i >= 0) { indice[campo] = i; usados.add(i); }
  }
  const colunasIgnoradas = cabecalho.filter((c, i) => c && !usados.has(i));

  if (indice.razao_social === undefined) {
    return { linhas, erros: ['A planilha precisa de uma coluna RAZAO SOCIAL.'], avisos, colunasIgnoradas };
  }

  const campo = (l: string[], nome: string) => (indice[nome] === undefined ? '' : l[indice[nome]]);

  for (let i = 1; i < matriz.length; i++) {
    const l = matriz[i] ?? [];
    const numeroLinha = i + 1;
    const razao = caixaAlta(campo(l, 'razao_social'));
    const fantasia = caixaAlta(campo(l, 'nome_fantasia'));
    if (!razao && !fantasia && !digitos(campo(l, 'documento'))) continue; // linha em branco

    // A linha de exemplo do modelo nunca vira fornecedor, mesmo esquecida na planilha.
    if (razao === EXEMPLO_RAZAO && digitos(campo(l, 'documento')) === EXEMPLO_DOC) {
      avisos.push(`A linha ${numeroLinha} é o exemplo do modelo e foi ignorada.`);
      continue;
    }

    const celulaComErro = Object.keys(indice).find((k) => ehErroExcel(campo(l, k)));
    if (celulaComErro) {
      erros.push(`Linha ${numeroLinha}: a coluna ${celulaComErro.toUpperCase()} tem erro de fórmula do Excel ("${texto(campo(l, celulaComErro))}"). Corrija antes de importar.`);
      continue;
    }

    const avisosLinha: string[] = [];
    const doc = documentoDaPlanilha(campo(l, 'documento'));
    if (doc.completado && doc.valido) avisosLinha.push('documento completado com zero à esquerda (o Excel tinha cortado)');
    if (!doc.documento) avisosLinha.push('sem CNPJ/CPF — confere pelo nome para não duplicar');

    const custoTxt = texto(campo(l, 'custo'));
    const custo = custoTxt ? parseMoedaBR(custoTxt.replace(/R\$\s*/i, '')) : null;
    if (custoTxt && custo === null) avisosLinha.push(`custo mensal "${custoTxt}" não é um valor — ficou em branco`);

    const cepDig = digitos(campo(l, 'cep'));
    const endereco: EnderecoImportado = {};
    if (cepDig) endereco.cep = cepDig.length === 8 ? `${cepDig.slice(0, 5)}-${cepDig.slice(5)}` : cepDig;
    for (const k of ['logradouro', 'numero', 'complemento', 'bairro', 'cidade'] as const) {
      const v = caixaAlta(campo(l, k));
      if (v) endereco[k] = v;
    }
    const uf = caixaAlta(campo(l, 'uf'));
    if (uf) endereco.uf = uf.slice(0, 2);

    const email = texto(campo(l, 'email')).toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) avisosLinha.push(`e-mail "${email}" parece inválido`);

    linhas.push({
      linha: numeroLinha,
      documento: doc.documento,
      tipo_pessoa: doc.tipo,
      // sem razao social, a fantasia vira a razao (o campo e obrigatorio no banco)
      razao_social: razao ?? fantasia ?? '',
      nome_fantasia: razao ? fantasia : null,
      prestador_assistencia: simNao(campo(l, 'prestador'), false),
      empresa_rastreamento: simNao(campo(l, 'rastreadora'), false),
      contato: caixaAlta(campo(l, 'contato')),
      telefone: digitos(campo(l, 'telefone')) || null,
      whatsapp: digitos(campo(l, 'whatsapp')) || null,
      email,
      endereco,
      chave_pix: texto(campo(l, 'chave_pix')) || null,
      cobertura: caixaAlta(campo(l, 'cobertura')),
      plataforma_url: texto(campo(l, 'plataforma_url')) || null,
      custo_mensal_equipamento: custo,
      observacoes: texto(campo(l, 'observacoes')) || null,
      ativo: simNao(campo(l, 'ativo'), true),
      documento_invalido: !doc.valido,
      avisos: avisosLinha,
    });
  }

  if (!linhas.length && !erros.length) erros.push('A planilha não tem nenhuma linha com razão social preenchida.');
  if (colunasIgnoradas.length) {
    avisos.push(`Colunas ignoradas (não fazem parte do cadastro de fornecedor): ${colunasIgnoradas.join(', ')}.`);
  }
  return { linhas, erros, avisos, colunasIgnoradas };
}

/** Nome para comparar: sem acento, sem pontuacao e sem LTDA/ME/EIRELI/SA no fim. */
export function chaveNome(nome: string | null | undefined): string {
  return (nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\b(LTDA|ME|EPP|EIRELI|S A|SA|MEI|SS)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface FornecedorExistente {
  id: string;
  documento: string | null;
  razao_social: string;
  nome_fantasia: string | null;
  [campo: string]: unknown;
}

export type SituacaoFornecedor = 'NOVO' | 'JA_CADASTRADO' | 'BLOQUEADO';

export interface LinhaPreviaFornecedor extends FornecedorImportado {
  situacao: SituacaoFornecedor;
  motivo?: string;
  existente?: FornecedorExistente;
  /** Como casou com o cadastro: pelo documento ou pelo nome. */
  casouPor?: 'DOCUMENTO' | 'NOME';
  /** Campos que seriam completados no cadastro existente (so os vazios). */
  completa?: Record<string, unknown>;
}

export interface PreviaFornecedores {
  linhas: LinhaPreviaFornecedor[];
  novos: number;
  jaCadastrados: number;
  /** Ja cadastrados que ganhariam algum campo ao completar. */
  comComplemento: number;
  bloqueados: number;
}

const vazio = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '') ||
  (typeof v === 'number' && v === 0);

/**
 * O que a linha acrescenta a um cadastro existente SEM sobrescrever nada:
 * campo vazio no cadastro e preenchido; marca de tipo so passa de nao para sim;
 * no endereco, so entra se o cadastro nao tem endereco nenhum.
 */
export function camposParaCompletar(l: FornecedorImportado, e: FornecedorExistente): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const simples: [keyof FornecedorImportado, string][] = [
    ['documento', 'documento'], ['nome_fantasia', 'nome_fantasia'], ['contato', 'contato'],
    ['telefone', 'telefone'], ['whatsapp', 'whatsapp'], ['email', 'email'], ['chave_pix', 'chave_pix'],
    ['cobertura', 'cobertura'], ['plataforma_url', 'plataforma_url'], ['observacoes', 'observacoes'],
    ['custo_mensal_equipamento', 'custo_mensal_equipamento'],
  ];
  for (const [de, para] of simples) {
    const novo = l[de];
    if (!vazio(novo) && vazio(e[para])) out[para] = novo;
  }
  if (out.documento) out.tipo_pessoa = l.tipo_pessoa;
  if (l.prestador_assistencia && !e.prestador_assistencia) out.prestador_assistencia = true;
  if (l.empresa_rastreamento && !e.empresa_rastreamento) out.empresa_rastreamento = true;
  const endAtual = (e.endereco ?? {}) as Record<string, unknown>;
  const temEndereco = Object.values(endAtual).some((v) => !vazio(v));
  if (!temEndereco && Object.keys(l.endereco).length) out.endereco = l.endereco;
  return out;
}

/**
 * Monta a previa. Casa pelo DOCUMENTO; sem documento na linha, pelo NOME com
 * cadastro sem documento (ou com o mesmo). Nome igual com CNPJ diferente e
 * outra empresa (filial) e entra como NOVO, com aviso.
 */
export function montarPreviaFornecedores(
  linhas: FornecedorImportado[],
  existentes: FornecedorExistente[],
): PreviaFornecedores {
  const porDoc = new Map<string, FornecedorExistente>();
  const porNome = new Map<string, FornecedorExistente[]>();
  for (const e of existentes ?? []) {
    if (e.documento) porDoc.set(e.documento, e);
    for (const n of [e.razao_social, e.nome_fantasia]) {
      const k = chaveNome(n);
      if (!k) continue;
      const lista = porNome.get(k) ?? [];
      if (!lista.includes(e)) lista.push(e);
      porNome.set(k, lista);
    }
  }

  const docsVistos = new Map<string, number>();
  const nomesVistos = new Map<string, number>();

  const saida: LinhaPreviaFornecedor[] = linhas.map((l) => {
    if (!l.razao_social) {
      return { ...l, situacao: 'BLOQUEADO', motivo: 'Sem razão social nem nome fantasia.' };
    }
    if (l.documento_invalido) {
      return { ...l, situacao: 'BLOQUEADO', motivo: `CNPJ/CPF inválido (${l.documento}). Corrija ou apague o número para importar.` };
    }

    const nomes = [chaveNome(l.razao_social), chaveNome(l.nome_fantasia)].filter(Boolean);
    if (l.documento) {
      const irma = docsVistos.get(l.documento);
      if (irma) return { ...l, situacao: 'BLOQUEADO', motivo: `Repetido na própria planilha (mesmo CNPJ/CPF da linha ${irma}).` };
    } else {
      const irma = nomes.map((n) => nomesVistos.get(n)).find(Boolean);
      if (irma) return { ...l, situacao: 'BLOQUEADO', motivo: `Repetido na própria planilha (mesmo nome da linha ${irma}, sem CNPJ).` };
    }
    if (l.documento) docsVistos.set(l.documento, l.linha);
    for (const n of nomes) if (!nomesVistos.has(n)) nomesVistos.set(n, l.linha);

    // 1) pelo documento
    if (l.documento) {
      const e = porDoc.get(l.documento);
      if (e) {
        const completa = camposParaCompletar(l, e);
        return { ...l, situacao: 'JA_CADASTRADO', existente: e, casouPor: 'DOCUMENTO', completa };
      }
    }
    // 2) pelo nome (cadastro sem documento, ou linha sem documento)
    const candidatos = nomes.flatMap((n) => porNome.get(n) ?? []);
    const compativel = candidatos.find((e) => !l.documento || !e.documento || e.documento === l.documento);
    if (compativel) {
      const completa = camposParaCompletar(l, compativel);
      return { ...l, situacao: 'JA_CADASTRADO', existente: compativel, casouPor: 'NOME', completa };
    }
    const outraFilial = candidatos[0];
    if (outraFilial) {
      return { ...l, situacao: 'NOVO',
        avisos: [...l.avisos, `já existe "${outraFilial.razao_social}" com outro CNPJ — entra como fornecedor separado`] };
    }
    return { ...l, situacao: 'NOVO' };
  });

  const conta = (s: SituacaoFornecedor) => saida.filter((l) => l.situacao === s).length;
  return {
    linhas: saida,
    novos: conta('NOVO'),
    jaCadastrados: conta('JA_CADASTRADO'),
    comComplemento: saida.filter((l) => l.situacao === 'JA_CADASTRADO' && Object.keys(l.completa ?? {}).length > 0).length,
    bloqueados: conta('BLOQUEADO'),
  };
}

/** O registro que vai para o insert de um fornecedor NOVO. */
export function registroNovoFornecedor(l: FornecedorImportado) {
  return {
    tipo_pessoa: l.tipo_pessoa,
    documento: l.documento,
    razao_social: l.razao_social,
    nome_fantasia: l.nome_fantasia,
    contato: l.contato,
    telefone: l.telefone,
    whatsapp: l.whatsapp,
    email: l.email,
    endereco: l.endereco,
    chave_pix: l.chave_pix,
    cobertura: l.cobertura,
    plataforma_url: l.plataforma_url,
    custo_mensal_equipamento: l.custo_mensal_equipamento ?? 0,
    observacoes: l.observacoes,
    prestador_assistencia: l.prestador_assistencia,
    empresa_rastreamento: l.empresa_rastreamento,
    ativo: l.ativo,
  };
}
