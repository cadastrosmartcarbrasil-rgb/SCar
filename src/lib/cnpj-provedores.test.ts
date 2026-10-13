import { describe, it, expect } from 'vitest';
import { deBrasilApi, deCnpjWs, deReceitaWs } from './cnpj-provedores';

describe('deBrasilApi', () => {
  it('le o formato da BrasilAPI', () => {
    const r = deBrasilApi({
      razao_social: 'JOSE TRANSPORTES LTDA', nome_fantasia: 'GUINCHO DO ZE',
      descricao_situacao_cadastral: 'ATIVA', cnae_fiscal: 5229002, cnae_fiscal_descricao: 'Reboque',
      ddd_telefone_1: '6533334444', cep: '78000000', descricao_tipo_de_logradouro: 'RUA',
      logradouro: 'A', numero: '10', bairro: 'CENTRO', municipio: 'CUIABA', uf: 'MT',
    })!;
    expect(r.nome_fantasia).toBe('GUINCHO DO ZE');
    expect(r.cnae_principal).toBe('5229002 - Reboque');
    expect(r.endereco).toMatchObject({ logradouro: 'RUA A', cidade: 'CUIABA', uf: 'MT', cep: '78000000' });
  });
  it('sem razao social = nao achou', () => {
    expect(deBrasilApi({ message: 'CNPJ nao encontrado' })).toBeNull();
  });
});

describe('deCnpjWs', () => {
  it('le os dados de dentro de estabelecimento', () => {
    const r = deCnpjWs({
      razao_social: 'JOSE TRANSPORTES LTDA',
      estabelecimento: {
        nome_fantasia: 'GUINCHO DO ZE', situacao_cadastral: 'Ativa',
        atividade_principal: { subclasse: '5229002', descricao: 'Reboque' },
        ddd1: '65', telefone1: '33334444', cep: '78000000', tipo_logradouro: 'Rua', logradouro: 'A',
        numero: '10', bairro: 'Centro', cidade: { nome: 'Cuiabá' }, estado: { sigla: 'MT' },
      },
    })!;
    expect(r.telefone).toBe('6533334444');
    expect(r.endereco).toMatchObject({ cidade: 'Cuiabá', uf: 'MT', logradouro: 'Rua A' });
    expect(r.cnae_principal).toBe('5229002 - Reboque');
  });
});

describe('deReceitaWs', () => {
  it('le o formato da ReceitaWS e fica com o primeiro telefone', () => {
    const r = deReceitaWs({
      status: 'OK', nome: 'JOSE TRANSPORTES LTDA', fantasia: 'GUINCHO DO ZE', situacao: 'ATIVA',
      atividade_principal: [{ code: '52.29-0-02', text: 'Reboque' }], telefone: '(65) 3333-4444 / (65) 9999-8888',
      cep: '78.000-000', logradouro: 'RUA A', numero: '10', bairro: 'CENTRO', municipio: 'CUIABA', uf: 'MT',
    })!;
    expect(r.telefone).toBe('6533334444');
    expect(r.endereco.cep).toBe('78000000');
  });
  it('status ERROR com HTTP 200 = nao achou', () => {
    expect(deReceitaWs({ status: 'ERROR', message: 'CNPJ inválido' })).toBeNull();
  });
});
