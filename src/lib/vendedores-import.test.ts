import { describe, it, expect } from 'vitest';
import {
  interpretarPlanilhaVendedores,
  agruparRegionais,
  montarPrevia,
  casarRegional,
  chaveRegional,
  chaveDoVendedor,
  ativoNaOrigem,
  percentual,
  gerarModeloCsvVendedores,
  CABECALHO_MODELO,
  type VendedorImportado,
} from './vendedores-import';

const REGIONAIS = [
  { id: 'r-natal', nome: 'GRANDE NATAL' },
  { id: 'r-rib', nome: 'RIBEIRÃO PRETO' },
  { id: 'r-sp', nome: 'SÃO PAULO 1' },
  { id: 'r-matriz', nome: 'SMART CAR MATRIZ' },
];

// Cabecalho igual ao do relatorio do Mutual, na ordem em que ele exporta.
const CAB = ['Nome', 'Email', 'Cpf/Cnpj consultor', 'Telefone', 'Rua', 'Nº', 'Bairro',
             'Cidade', 'Estado', 'CEP', 'Data cadastro', 'Status', 'Nome Regional'];
const linhaMutual = (nome: string, cpf: string, reg: string, extra: Partial<{email:string;tel:string;cidade:string;uf:string;status:string}> = {}) =>
  [nome, extra.email ?? '', cpf, extra.tel ?? '', 'rua', '01', 'bairro',
   extra.cidade ?? 'CUIABA', extra.uf ?? 'MT', '78000000', '08/09/2026 09:56:02',
   extra.status ?? 'Ativo', reg];

describe('chaveRegional / casarRegional', () => {
  it('casa ignorando acento, caixa e pontuacao', () => {
    expect(casarRegional('ribeirao preto', REGIONAIS)).toBe('r-rib');
    expect(casarRegional('  SÃO PAULO 1 ', REGIONAIS)).toBe('r-sp');
    expect(casarRegional('Smart-Car Matriz', REGIONAIS)).toBe('r-matriz');
  });

  it('nome que NAO existe devolve null — e null bloqueia a linha', () => {
    // Nunca pode virar "matriz": neste sistema regional_id nulo E a matriz.
    expect(casarRegional('Regional Sudeste', REGIONAIS)).toBeNull();
    expect(casarRegional('', REGIONAIS)).toBeNull();
  });

  it('chaveRegional colapsa espacos e simbolos', () => {
    expect(chaveRegional('Regional Cuiabá - MT | Matriz')).toBe('REGIONAL CUIABA MT MATRIZ');
  });
});

describe('ativoNaOrigem / percentual', () => {
  it('so a palavra ATIVO conta', () => {
    expect(ativoNaOrigem('Ativo')).toBe(true);
    expect(ativoNaOrigem('ATIVO')).toBe(true);
    expect(ativoNaOrigem('Inativo')).toBe(false);
    expect(ativoNaOrigem('')).toBe(false);
    expect(ativoNaOrigem(undefined)).toBe(false);
  });

  it('percentual em formato BR', () => {
    expect(percentual('15,5')).toBe(15.5);
    expect(percentual('10')).toBe(10);
    expect(percentual('7%')).toBe(7);
    expect(percentual('')).toBeNull();
    expect(percentual('abc')).toBeNull();
  });
});

describe('interpretarPlanilhaVendedores', () => {
  it('le o relatorio do Mutual com a ordem de colunas dele', () => {
    const r = interpretarPlanilhaVendedores([
      CAB,
      linhaMutual('Larissa da Conceicao', '12420057570', 'GRANDE NATAL',
        { email: 'larissa@gmail.com', tel: '(84) 99166-4377', cidade: 'Parnamirim', uf: 'RN' }),
    ]);
    expect(r.erros).toEqual([]);
    expect(r.linhas).toHaveLength(1);
    const v = r.linhas[0];
    expect(v.nome).toBe('Larissa da Conceicao');
    expect(v.documento).toBe('12420057570');
    expect(v.email).toBe('larissa@gmail.com');
    expect(v.uf).toBe('RN');
    expect(v.regional_texto).toBe('GRANDE NATAL');
    expect(v.ativo_na_origem).toBe(true);
    expect(v.linha).toBe(2); // o cabecalho e a linha 1 no Excel
  });

  it('coluna a mais vira AVISO, nunca erro', () => {
    // Relatorio de sistema sempre traz coluna que o cadastro nao usa.
    const r = interpretarPlanilhaVendedores([CAB, linhaMutual('A', '52998224725', 'GRANDE NATAL')]);
    expect(r.erros).toEqual([]);
    expect(r.colunasIgnoradas).toContain('RUA');
    expect(r.avisos.join(' ')).toContain('Colunas ignoradas');
  });

  it('sem coluna NOME ou REGIONAL, recusa a planilha inteira', () => {
    expect(interpretarPlanilhaVendedores([['EMAIL'], ['x@y.com']]).erros.join(' '))
      .toContain('coluna NOME');
    expect(interpretarPlanilhaVendedores([['NOME'], ['MARIA']]).erros.join(' '))
      .toContain('coluna REGIONAL');
  });

  it('erro de formula do Excel BLOQUEIA a linha, nao entra como vazio', () => {
    // Gotcha da 0013: celula com #N/D passando como vazia grava lixo em silencio.
    const r = interpretarPlanilhaVendedores([
      ['NOME', 'REGIONAL', 'CPF'],
      ['MARIA', 'GRANDE NATAL', '#N/D'],
    ]);
    expect(r.linhas).toHaveLength(0);
    expect(r.erros.join(' ')).toContain('erro de formula');
    expect(r.erros.join(' ')).toContain('Linha 2');
  });

  it('CPF invalido é AVISO, nao erro — o dado da origem entra para reconciliar', () => {
    const r = interpretarPlanilhaVendedores([CAB, linhaMutual('B', '11111111111', 'GRANDE NATAL')]);
    expect(r.erros).toEqual([]);
    expect(r.linhas[0].avisos.join(' ')).toContain('CPF invalido');
    expect(r.linhas[0].documento).toBe('11111111111');
  });

  it('avisa quando falta contato — 2 de cada 3 linhas do Mutual vem assim', () => {
    const r = interpretarPlanilhaVendedores([CAB, linhaMutual('C', '52998224725', 'GRANDE NATAL')]);
    const a = r.linhas[0].avisos.join(' ');
    expect(a).toContain('sem e-mail');
    expect(a).toContain('sem telefone');
  });

  it('comissao fora de 0-100 bloqueia a linha', () => {
    const r = interpretarPlanilhaVendedores([
      ['NOME', 'REGIONAL', 'COMISSAO ADESAO'],
      ['MARIA', 'GRANDE NATAL', '150'],
    ]);
    expect(r.erros.join(' ')).toContain('fora de 0-100');
    expect(r.linhas).toHaveLength(0);
  });

  it('linha em branco no meio da planilha e ignorada, nao vira erro', () => {
    const r = interpretarPlanilhaVendedores([
      ['NOME', 'REGIONAL'], ['MARIA', 'GRANDE NATAL'], ['', ''], ['JOAO', 'GRANDE NATAL'],
    ]);
    expect(r.erros).toEqual([]);
    expect(r.linhas.map((l) => l.nome)).toEqual(['MARIA', 'JOAO']);
  });
});

describe('agruparRegionais', () => {
  it('agrupa por nome distinto e mostra as cidades do grupo', () => {
    // 379 linhas com 8 nomes sao 8 decisoes, nao 379. E as cidades sao o que
    // denuncia grupo que nao e unidade, e sim balde.
    const { linhas } = interpretarPlanilhaVendedores([
      CAB,
      linhaMutual('A', '52998224725', 'Regional Sudeste', { cidade: 'Suzano', uf: 'SP' }),
      linhaMutual('B', '12420057570', 'Regional Sudeste', { cidade: 'Ribeirao Preto', uf: 'SP' }),
      linhaMutual('C', '70442124414', 'GRANDE NATAL', { cidade: 'Parnamirim', uf: 'RN' }),
    ]);
    const g = agruparRegionais(linhas, REGIONAIS);
    expect(g).toHaveLength(2);
    expect(g[0].texto).toBe('Regional Sudeste');
    expect(g[0].quantidade).toBe(2);
    expect(g[0].regional_id).toBeNull();          // nao casa: precisa de decisao
    expect(g[0].cidades).toEqual(['Suzano/SP', 'Ribeirao Preto/SP']);
    expect(g[1].regional_id).toBe('r-natal');     // casou sozinho
  });
});

describe('montarPrevia', () => {
  const base = (over: Partial<VendedorImportado> = {}): VendedorImportado => ({
    linha: 2, nome: 'MARIA', email: 'maria@x.com', documento: '52998224725',
    telefone: null, regional_texto: 'GRANDE NATAL', regional_id: null,
    ativo_na_origem: true, cidade: null, uf: null, cadastro_origem: null, codigo: null,
    comissao_adesao: null, comissao_recorrente: null, banco: null, agencia: null,
    conta: null, chave_pix: null, avisos: [], ...over,
  });
  const DE_PARA = { 'GRANDE NATAL': 'r-natal' };

  it('novo entra; quem ja existe (mesmo CPF) ATUALIZA em vez de duplicar', () => {
    const p = montarPrevia([base()], DE_PARA,
      [{ id: 'v1', nome: 'MARIA ANTIGA', documento: '52998224725', email: null }]);
    expect(p.atualiza).toBe(1);
    expect(p.novos).toBe(0);
    expect(p.linhas[0].existente?.id).toBe('v1');
  });

  it('casa pelo E-MAIL quando nao ha documento', () => {
    const p = montarPrevia([base({ documento: null })], DE_PARA,
      [{ id: 'v2', nome: 'M', documento: null, email: 'MARIA@X.COM' }]);
    expect(p.atualiza).toBe(1);
  });

  it('regional nao mapeada BLOQUEIA — nunca cai na matriz', () => {
    const p = montarPrevia([base({ regional_texto: 'Regional Sudeste' })], DE_PARA, []);
    expect(p.bloqueados).toBe(1);
    expect(p.linhas[0].regional_id).toBeNull();
    expect(p.linhas[0].motivo).toContain('nao esta mapeada');
  });

  it('sem CPF e sem e-mail BLOQUEIA — reimportar duplicaria a pessoa', () => {
    const p = montarPrevia([base({ documento: null, email: null })], DE_PARA, []);
    expect(p.bloqueados).toBe(1);
    expect(p.linhas[0].motivo).toContain('nao ha como reconhecer');
  });

  it('repetido DENTRO da planilha bloqueia a segunda e aponta a linha irma', () => {
    const p = montarPrevia(
      [base({ linha: 2 }), base({ linha: 9, nome: 'MARIA DE NOVO' })], DE_PARA, []);
    expect(p.novos).toBe(1);
    expect(p.bloqueados).toBe(1);
    expect(p.linhas[1].motivo).toContain('linha 2');
  });

  it('conta quantos ficariam ativos se a origem for respeitada', () => {
    const p = montarPrevia(
      [base({ ativo_na_origem: true }),
       base({ linha: 3, documento: '12420057570', ativo_na_origem: false })],
      DE_PARA, []);
    expect(p.ativosNaOrigem).toBe(1);
  });

  it('bloqueado nao conta como ativo', () => {
    const p = montarPrevia(
      [base({ regional_texto: 'NAO EXISTE', ativo_na_origem: true })], DE_PARA, []);
    expect(p.ativosNaOrigem).toBe(0);
  });
});

describe('gerarModeloCsvVendedores', () => {
  it('traz o cabecalho e usa uma unidade real como exemplo', () => {
    const csv = gerarModeloCsvVendedores(REGIONAIS);
    expect(csv.split('\r\n')[0]).toBe(CABECALHO_MODELO.join(';'));
    expect(csv).toContain('GRANDE NATAL');
  });

  it('aguenta lista de regionais vazia', () => {
    expect(gerarModeloCsvVendedores([])).toContain('NOME EXATO DA UNIDADE');
  });
});

describe('montarPrevia — travas que o banco tambem tem', () => {
  // A RPC `importar_vendedores` (0069) e ATOMICA: uma linha recusada pelo banco
  // derruba a carga inteira. Barrar aqui vira "3 linhas ficaram de fora, e por
  // isto" em vez de "a importacao falhou".
  const REGS = [
    { id: 'r-natal', nome: 'GRANDE NATAL', ativo: true, teto_adesao: 20, teto_recorrente: 15 },
    { id: 'r-morta', nome: 'UNIDADE ENCERRADA', ativo: false, teto_adesao: 20, teto_recorrente: 15 },
  ];
  const linha = (over: Partial<VendedorImportado> = {}): VendedorImportado => ({
    linha: 2, nome: 'MARIA', email: null, documento: '52998224725', telefone: null,
    regional_texto: 'GRANDE NATAL', regional_id: null, ativo_na_origem: false,
    cidade: null, uf: null, cadastro_origem: null, codigo: null,
    comissao_adesao: null, comissao_recorrente: null, banco: null, agencia: null,
    conta: null, chave_pix: null, avisos: [], ...over,
  });
  const DE_PARA = { 'GRANDE NATAL': 'r-natal', 'UNIDADE ENCERRADA': 'r-morta' };

  it('comissao acima do teto da franquia bloqueia a linha, nao a carga', () => {
    const p = montarPrevia([linha({ comissao_adesao: 25 })], DE_PARA, [], REGS);
    expect(p.bloqueados).toBe(1);
    expect(p.linhas[0].motivo).toContain('acima do teto');
  });

  it('comissao DENTRO do teto passa', () => {
    const p = montarPrevia([linha({ comissao_adesao: 20, comissao_recorrente: 15 })], DE_PARA, [], REGS);
    expect(p.novos).toBe(1);
  });

  it('unidade inativa recusa vendedor ATIVO...', () => {
    const p = montarPrevia(
      [linha({ regional_texto: 'UNIDADE ENCERRADA', ativo_na_origem: true })], DE_PARA, [], REGS);
    expect(p.bloqueados).toBe(1);
    expect(p.linhas[0].motivo).toContain('INATIVA');
  });

  it('...mas aceita vendedor inativo, como o banco (0067)', () => {
    const p = montarPrevia(
      [linha({ regional_texto: 'UNIDADE ENCERRADA', ativo_na_origem: false })], DE_PARA, [], REGS);
    expect(p.novos).toBe(1);
  });

  it('sem a lista de regionais, nao inventa trava', () => {
    const p = montarPrevia([linha({ comissao_adesao: 99 })], DE_PARA, []);
    expect(p.novos).toBe(1);
  });
});
