import { describe, expect, it } from 'vitest';
import {
  interpretarPlanilhaFornecedores, montarPreviaFornecedores, documentoDaPlanilha, chaveNome,
  camposParaCompletar, simNao, registroNovoFornecedor, COLUNAS_FORNECEDOR, type FornecedorExistente,
} from './fornecedores-import';

const CAB = COLUNAS_FORNECEDOR.map((c) => c.titulo);
const linha = (v: Record<string, string>) => COLUNAS_FORNECEDOR.map((c) => v[c.campo] ?? '');

describe('documentoDaPlanilha', () => {
  it('CNPJ com pontuacao e valido', () => {
    expect(documentoDaPlanilha('11.222.333/0001-81')).toEqual({ documento: '11222333000181', tipo: 'PJ', valido: true, completado: false });
  });
  it('completa o zero que o Excel cortou', () => {
    // 01.234.567/0001-95 virou numero 1234567000195
    const cnpj = '01234567000195';
    const r = documentoDaPlanilha(cnpj.replace(/^0/, ''));
    expect(r.documento).toBe(cnpj);
    expect(r.completado).toBe(true);
  });
  it('CPF e CPF invalido', () => {
    expect(documentoDaPlanilha('529.982.247-25')).toMatchObject({ tipo: 'PF', valido: true });
    expect(documentoDaPlanilha('111.222.333-44').valido).toBe(false);
  });
  it('vazio e nulo e valido', () => {
    expect(documentoDaPlanilha('')).toMatchObject({ documento: null, valido: true });
  });
});

describe('simNao e chaveNome', () => {
  it('le SIM/NAO com padrao', () => {
    expect(simNao('sim', false)).toBe(true);
    expect(simNao('Não', true)).toBe(false);
    expect(simNao('', true)).toBe(true);
    expect(simNao('X', false)).toBe(true);
  });
  it('ignora acento, pontuacao e o tipo societario', () => {
    expect(chaveNome('Auto Socorro São José Ltda.')).toBe(chaveNome('AUTO SOCORRO SAO JOSE'));
    expect(chaveNome('Guincho Exemplo - ME')).toBe('GUINCHO EXEMPLO');
  });
});

describe('interpretarPlanilhaFornecedores', () => {
  it('le o modelo (ordem livre) e normaliza', () => {
    const r = interpretarPlanilhaFornecedores([
      CAB,
      linha({ documento: '45.723.174/0001-10', razao_social: 'auto socorro teste ltda', prestador: 'sim',
        telefone: '(65) 3333-4444', email: 'Contato@Exemplo.com.br', cep: '78000000', uf: 'mt', ativo: '' }),
      linha({}),
    ]);
    expect(r.erros).toEqual([]);
    expect(r.linhas).toHaveLength(1);
    const l = r.linhas[0];
    expect(l.razao_social).toBe('AUTO SOCORRO TESTE LTDA');
    expect(l.prestador_assistencia).toBe(true);
    expect(l.empresa_rastreamento).toBe(false);
    expect(l.telefone).toBe('6533334444');
    expect(l.email).toBe('contato@exemplo.com.br');
    expect(l.endereco).toEqual({ cep: '78000-000', uf: 'MT' });
    expect(l.ativo).toBe(true);
    expect(l.linha).toBe(2);
  });
  it('a linha de exemplo do modelo e ignorada', () => {
    const ex = Object.fromEntries(COLUNAS_FORNECEDOR.map((c) => [c.campo, c.exemplo]));
    const r = interpretarPlanilhaFornecedores([CAB, linha(ex), linha({ razao_social: 'REAL' })]);
    expect(r.linhas.map((l) => l.razao_social)).toEqual(['REAL']);
    expect(r.avisos.join()).toMatch(/exemplo/);
  });
  it('sem coluna RAZAO SOCIAL e erro', () => {
    expect(interpretarPlanilhaFornecedores([['CNPJ'], ['11222333000181']]).erros[0]).toMatch(/RAZAO SOCIAL/);
  });
  it('erro de formula bloqueia a linha', () => {
    const r = interpretarPlanilhaFornecedores([['RAZAO SOCIAL', 'TELEFONE'], ['X', '#N/D']]);
    expect(r.erros[0]).toMatch(/Linha 2/);
  });
  it('sem razao social, a fantasia vira a razao', () => {
    const r = interpretarPlanilhaFornecedores([['RAZAO SOCIAL', 'NOME FANTASIA'], ['', 'Chaveiro Rapido']]);
    expect(r.linhas[0]).toMatchObject({ razao_social: 'CHAVEIRO RAPIDO', nome_fantasia: null });
  });
});

const existentes: FornecedorExistente[] = [
  { id: 'a', documento: '11222333000181', razao_social: 'AUTO SOCORRO EXEMPLO LTDA', nome_fantasia: null,
    telefone: '6533334444', email: null, endereco: {}, prestador_assistencia: false },
  { id: 'b', documento: null, razao_social: 'OFICINA DO ZE', nome_fantasia: 'ZE MECANICA', endereco: { cidade: 'CUIABA' } },
  { id: 'c', documento: '45723174000110', razao_social: 'PECAS BRASIL LTDA', nome_fantasia: null, endereco: {} },
];

function ler(linhas: Record<string, string>[]) {
  return interpretarPlanilhaFornecedores([CAB, ...linhas.map(linha)]).linhas;
}

describe('montarPreviaFornecedores', () => {
  it('casa pelo CNPJ e so completa o vazio, nunca sobrescreve', () => {
    const p = montarPreviaFornecedores(ler([
      { documento: '11222333000181', razao_social: 'OUTRO NOME', telefone: '65999990000', email: 'a@b.com', prestador: 'SIM' },
    ]), existentes);
    const l = p.linhas[0];
    expect(l.situacao).toBe('JA_CADASTRADO');
    expect(l.casouPor).toBe('DOCUMENTO');
    expect(l.completa).toEqual({ email: 'a@b.com', prestador_assistencia: true });
  });
  it('sem CNPJ casa pelo nome (fantasia) e completa o CNPJ do cadastro sem documento', () => {
    const p = montarPreviaFornecedores(ler([
      { documento: '11.444.777/0001-61', razao_social: 'Zé Mecânica' },
    ]), existentes);
    expect(p.linhas[0]).toMatchObject({ situacao: 'JA_CADASTRADO', casouPor: 'NOME' });
    expect(p.linhas[0].completa).toMatchObject({ documento: '11444777000161', tipo_pessoa: 'PJ' });
  });
  it('mesmo nome com CNPJ diferente e outra empresa: entra como novo, com aviso', () => {
    const p = montarPreviaFornecedores(ler([
      { documento: '11.444.777/0001-61', razao_social: 'Pecas Brasil Ltda' },
    ]), existentes);
    expect(p.linhas[0].situacao).toBe('NOVO');
    expect(p.linhas[0].avisos.join()).toMatch(/outro CNPJ/);
  });
  it('repetido na planilha e CNPJ invalido ficam de fora', () => {
    const p = montarPreviaFornecedores(ler([
      { documento: '06.990.590/0001-23', razao_social: 'NOVA A' },
      { documento: '06990590000123', razao_social: 'NOVA A DE NOVO' },
      { razao_social: 'SEM DOC' },
      { razao_social: 'sem doc ltda' },
      { documento: '11.222.333/0001-00', razao_social: 'DIGITO ERRADO' },
    ]), existentes);
    expect(p.linhas.map((l) => l.situacao)).toEqual(['NOVO', 'BLOQUEADO', 'NOVO', 'BLOQUEADO', 'BLOQUEADO']);
    expect(p.linhas[1].motivo).toMatch(/linha 2/);
    expect(p.linhas[3].motivo).toMatch(/linha 4/);
    expect(p.novos).toBe(2);
    expect(p.bloqueados).toBe(3);
  });
  it('endereco so entra quando o cadastro nao tem nenhum', () => {
    const l = ler([{ razao_social: 'X', cidade: 'Natal', uf: 'RN' }])[0];
    expect(camposParaCompletar(l, existentes[1])).not.toHaveProperty('endereco');
    expect(camposParaCompletar(l, existentes[2])).toHaveProperty('endereco');
  });
  it('registro novo tem custo 0 quando vazio', () => {
    const l = ler([{ razao_social: 'X', rastreadora: 'sim', custo: '25,90' }])[0];
    expect(registroNovoFornecedor(l)).toMatchObject({ empresa_rastreamento: true, custo_mensal_equipamento: 25.9, documento: null });
    expect(registroNovoFornecedor(ler([{ razao_social: 'Y' }])[0]).custo_mensal_equipamento).toBe(0);
  });
});
