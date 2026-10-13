// ---------------------------------------------------------------------------
// Consulta de CNPJ com MAIS DE UM provedor publico, normalizados num formato so.
//
// A BrasilAPI sozinha falhava em producao (bloqueio/limite para IP de
// datacenter, sem nenhum aviso na tela). A rota /api/cnpj tenta, em ordem,
// BrasilAPI -> CNPJ.ws (publica) -> ReceitaWS e devolve o primeiro que achar.
// Aqui ficam so as leituras puras de cada resposta (testadas).
// ---------------------------------------------------------------------------

export interface EnderecoCnpj {
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}

export interface CnpjNormalizado {
  razao_social: string | null;
  nome_fantasia: string | null;
  situacao_cadastral: string | null;
  cnae_principal: string | null;
  email: string | null;
  telefone: string | null;
  endereco: EnderecoCnpj;
}

type Obj = Record<string, unknown>;
const txt = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};
const digitos = (v: unknown): string | null => {
  const s = String(v ?? '').replace(/\D/g, '');
  return s ? s : null;
};
const juntar = (...partes: unknown[]): string | null => txt(partes.map(txt).filter(Boolean).join(' '));
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});

/** https://brasilapi.com.br/api/cnpj/v1/{cnpj} */
export function deBrasilApi(d: Obj): CnpjNormalizado | null {
  if (!txt(d.razao_social)) return null;
  return {
    razao_social: txt(d.razao_social),
    nome_fantasia: txt(d.nome_fantasia),
    situacao_cadastral: txt(d.descricao_situacao_cadastral),
    cnae_principal: d.cnae_fiscal_descricao ? juntar(d.cnae_fiscal, '-', d.cnae_fiscal_descricao) : null,
    email: txt(d.email),
    telefone: digitos(d.ddd_telefone_1),
    endereco: {
      cep: digitos(d.cep),
      logradouro: juntar(d.descricao_tipo_de_logradouro, d.logradouro),
      numero: txt(d.numero),
      complemento: txt(d.complemento),
      bairro: txt(d.bairro),
      cidade: txt(d.municipio),
      uf: txt(d.uf),
    },
  };
}

/** https://publica.cnpj.ws/cnpj/{cnpj} — os dados ficam em `estabelecimento`. */
export function deCnpjWs(d: Obj): CnpjNormalizado | null {
  if (!txt(d.razao_social)) return null;
  const e = obj(d.estabelecimento);
  const ativ = obj(e.atividade_principal);
  return {
    razao_social: txt(d.razao_social),
    nome_fantasia: txt(e.nome_fantasia),
    situacao_cadastral: txt(e.situacao_cadastral),
    cnae_principal: ativ.descricao ? juntar(ativ.subclasse ?? ativ.id, '-', ativ.descricao) : null,
    email: txt(e.email),
    telefone: digitos(`${e.ddd1 ?? ''}${e.telefone1 ?? ''}`),
    endereco: {
      cep: digitos(e.cep),
      logradouro: juntar(e.tipo_logradouro, e.logradouro),
      numero: txt(e.numero),
      complemento: txt(e.complemento),
      bairro: txt(e.bairro),
      cidade: txt(obj(e.cidade).nome),
      uf: txt(obj(e.estado).sigla),
    },
  };
}

/** https://receitaws.com.br/v1/cnpj/{cnpj} — erro vem com status "ERROR" e HTTP 200. */
export function deReceitaWs(d: Obj): CnpjNormalizado | null {
  if (String(d.status ?? '').toUpperCase() === 'ERROR' || !txt(d.nome)) return null;
  const ativ = obj(Array.isArray(d.atividade_principal) ? d.atividade_principal[0] : null);
  const tel = txt(d.telefone);
  return {
    razao_social: txt(d.nome),
    nome_fantasia: txt(d.fantasia),
    situacao_cadastral: txt(d.situacao),
    cnae_principal: ativ.text ? juntar(ativ.code, '-', ativ.text) : null,
    email: txt(d.email),
    // pode vir "(65) 3333-4444 / (65) 9999-8888": fica o primeiro
    telefone: tel ? digitos(tel.split('/')[0]) : null,
    endereco: {
      cep: digitos(d.cep),
      logradouro: txt(d.logradouro),
      numero: txt(d.numero),
      complemento: txt(d.complemento),
      bairro: txt(d.bairro),
      cidade: txt(d.municipio),
      uf: txt(d.uf),
    },
  };
}

export const PROVEDORES_CNPJ = [
  { nome: 'BrasilAPI', url: (c: string) => `https://brasilapi.com.br/api/cnpj/v1/${c}`, ler: deBrasilApi },
  { nome: 'CNPJ.ws', url: (c: string) => `https://publica.cnpj.ws/cnpj/${c}`, ler: deCnpjWs },
  { nome: 'ReceitaWS', url: (c: string) => `https://receitaws.com.br/v1/cnpj/${c}`, ler: deReceitaWs },
] as const;
