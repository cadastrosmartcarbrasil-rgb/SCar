import { describe, it, expect } from 'vitest';
import {
  CAMPOS_TERMO, MARCA_PROTOCOLO, EM_BRANCO, valoresDoTermo, blocosDoTermo, renderizarTermo,
  camposDoTexto, dataCurta, dataDaEmissao, termoServeParaVeiculo, type FontesTermo,
} from './termos';

const fontes = (extra: Partial<FontesTermo> = {}): FontesTermo => ({
  cliente: {
    nome_razao_social: 'JOAO DA SILVA', cpf_cnpj: '52998224725', tipo_pessoa: 'PF', rg_ie: null,
    data_nascimento: '1980-05-03', celular: '65999998888', email: 'j@x.com',
    endereco: { logradouro: 'RUA A', numero: '10', bairro: 'CENTRO', cidade: 'CUIABA', uf: 'MT', cep: '78000000' },
  },
  veiculo: {
    placa: 'ABC1D23', marca: 'FIAT', modelo: 'UNO', ano_fabricacao: 2019, ano_modelo: 2020,
    valor_fipe: 45000, uso: 'passeio', alienado: false, dia_vencimento: 10,
  },
  tipoVeiculo: 'Passeio',
  plano: { nome: 'OURO' },
  mensalidade: 189.9,
  coberturas: [
    { produto_id: '1', nome: 'Protecao Casco', valor: 0, origem: 'PLANO', tem_limite: false, quantidade_limite: null,
      janela_dias: null, usados: 0, elegivel: true, ultimo_uso: null, categoria: 'CASCO' },
    { produto_id: '2', nome: 'Vidros', valor: 15, origem: 'AVULSO', tem_limite: true, quantidade_limite: 1,
      janela_dias: 365, usados: 0, elegivel: true, ultimo_uso: null, categoria: 'VIDROS' },
  ],
  empresa: { razao_social: 'SMART CAR BRASIL PROTECAO PATRIMONIAL MUTUALISTA', endereco: { cidade: 'CUIABA' } },
  emissao: { em: new Date('2026-10-19T15:00:00Z'), por: 'ANA' },
  ...extra,
});

describe('catalogo de campos', () => {
  it('chaves unicas e todo campo tem valor ou bloco', () => {
    const chaves = CAMPOS_TERMO.map((c) => c.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    const v = valoresDoTermo(fontes());
    const b = blocosDoTermo(fontes());
    for (const c of CAMPOS_TERMO) {
      expect(c.tipo === 'bloco' ? c.chave in b : c.chave in v).toBe(true);
    }
  });
});

describe('valoresDoTermo', () => {
  it('formata documento, telefone, endereco, moeda e anos', () => {
    const v = valoresDoTermo(fontes());
    expect(v['associado.cpf_cnpj']).toBe('529.982.247-25');
    expect(v['associado.celular']).toBe('(65) 99999-8888');
    expect(v['associado.data_nascimento']).toBe('03/05/1980');
    expect(v['associado.endereco']).toBe('RUA A, 10 - CENTRO - CUIABA/MT - CEP 78000-000');
    expect(v['veiculo.ano_fab_modelo']).toBe('2019/2020');
    expect(v['veiculo.valor_fipe']).toMatch(/45\.000,00/);
    expect(v['plano.dia_vencimento']).toBe('Dia 10');
    expect(v['emissao.protocolo']).toBe(MARCA_PROTOCOLO);
  });

  it('rastreador: o equipamento do parque vence a ficha, com o status numerado', () => {
    const v = valoresDoTermo(fontes({
      veiculo: { placa: 'ABC1D23', rastreador_imei: '111111111111111' },
      rastreador: { imei: '359999999999999', status: 'ATIVO', unidade: 'GRANDE NATAL' },
    }));
    expect(v['veiculo.rastreador_imei']).toBe('359999999999999');
    expect(v['veiculo.rastreador_status']).toBe('2 - Ativo / Instalado');
    expect(v['veiculo.rastreador_unidade']).toBe('GRANDE NATAL');
    const sem = valoresDoTermo(fontes({ veiculo: { placa: 'ABC1D23', rastreador_imei: '111111111111111' } }));
    expect(sem['veiculo.rastreador_imei']).toBe('111111111111111');
    expect(sem['veiculo.rastreador_status']).toBe('');
  });

  it('marcas de cobertura e de uso', () => {
    const v = valoresDoTermo(fontes());
    expect(v['coberturas.marca_casco']).toBe('☒');
    expect(v['coberturas.marca_vidros']).toBe('☒');
    expect(v['coberturas.marca_terceiros']).toBe('☐');
    expect(v['veiculo.marca_uso_particular']).toBe('☒');
    expect(v['veiculo.marca_uso_trabalho']).toBe('☐');
    expect(v['veiculo.marca_moto']).toBe('☐');
  });

  it('data da emissao em Sao Paulo, por extenso e com a cidade', () => {
    const v = valoresDoTermo(fontes({ emissao: { em: new Date('2026-10-20T01:30:00Z') } }));
    // 01:30 UTC de 20/10 ainda e 19/10 em Sao Paulo
    expect(v['emissao.data']).toBe('19/10/2026');
    expect(v['emissao.cidade_data']).toBe('CUIABA, 19 de outubro de 2026');
  });

  it('PJ preenche o bloco de pessoa juridica', () => {
    const v = valoresDoTermo(fontes({
      cliente: { nome_razao_social: 'EMPRESA X', cpf_cnpj: '11222333000181', tipo_pessoa: 'PJ' },
    }));
    expect(v['associado.pj_cnpj']).toBe('11.222.333/0001-81');
    expect(v['associado.tipo_pessoa']).toBe('Pessoa jurídica');
  });
});

describe('renderizarTermo', () => {
  it('troca os campos, escapa HTML e lista os vazios (sem os opcionais)', () => {
    const html = '<p>Eu, <span data-campo="associado.nome" class="campo">«Nome»</span>, RG '
      + '<span data-campo="associado.rg">«RG»</span>, compl. <span data-campo="associado.complemento">x</span></p>';
    const r = renderizarTermo(html, { ...valoresDoTermo(fontes()), 'associado.nome': 'A <B>' });
    expect(r.html).toContain('A &lt;B&gt;');
    expect(r.html).toContain(EM_BRANCO);
    expect(r.vazios).toEqual(['associado.rg']);
  });

  it('mantem a marca do protocolo e monta o bloco da tabela', () => {
    const f = fontes();
    const html = '<p>Protocolo <span data-campo="emissao.protocolo">x</span></p><div data-campo="coberturas.tabela">t</div>';
    const r = renderizarTermo(html, valoresDoTermo(f), blocosDoTermo(f));
    expect(r.html).toContain(MARCA_PROTOCOLO);
    expect(r.html).toContain('<table');
    expect(r.html).toContain('1 uso a cada 12 meses');
    expect(r.vazios).toEqual([]);
  });

  it('campo fora do catalogo vira linha em branco e e avisado', () => {
    const r = renderizarTermo('<span data-campo="xpto.campo">x</span>', {});
    expect(r.html).toBe(EM_BRANCO);
    expect(r.desconhecidos).toEqual(['xpto.campo']);
  });

  it('camposDoTexto lista as chaves sem repetir', () => {
    expect(camposDoTexto('<span data-campo="a.b">1</span><span data-campo="a.b">2</span><div data-campo="c.d"></div>'))
      .toEqual(['a.b', 'c.d']);
  });
});

describe('datas e filtro do modelo', () => {
  it('dataCurta nao passa por fuso', () => {
    expect(dataCurta('2025-11-28')).toBe('28/11/2025');
    expect(dataCurta(null)).toBe('');
    expect(dataDaEmissao(new Date('2026-01-01T12:00:00Z')).extenso).toBe('1 de janeiro de 2026');
  });

  it('termoServeParaVeiculo: lista vazia vale para todos', () => {
    const v = { plano_protecao_id: 'p1', tipo_veiculo_id: 't1', uso: 'passeio', regional_id: 'r1' };
    expect(termoServeParaVeiculo({}, v)).toBe(true);
    expect(termoServeParaVeiculo({ plano_ids: ['p1', 'p2'] }, v)).toBe(true);
    expect(termoServeParaVeiculo({ plano_ids: ['p2'] }, v)).toBe(false);
    expect(termoServeParaVeiculo({ usos: ['app'] }, v)).toBe(false);
    expect(termoServeParaVeiculo({ tipo_veiculo_ids: ['t1'] }, null)).toBe(false);
    expect(termoServeParaVeiculo({}, null)).toBe(true);
  });
});

import { limparHtmlDoWord } from './termos-word';

describe('limparHtmlDoWord', () => {
  it('caixinha (imagem minuscula) e simbolo viram ☐; figura grande fica', () => {
    const grande = 'A'.repeat(5000);
    const html = `<p><img src="data:image/png;base64,iVBOR"> NACIONAL  MOTO</p>`
      + `<p><img alt="logo" src="data:image/png;base64,${grande}" /></p><p></p><p></p><p></p>`;
    const r = limparHtmlDoWord(html);
    expect(r).toContain('<p>☐ NACIONAL ☐ MOTO</p>');
    expect(r).toContain(grande);
    expect(r.match(/<p><\/p>/g)?.length).toBe(1);
  });
});

import { alinharColunasDasTabelas, precisaEspaco } from './termos';

describe('layout do termo', () => {
  it('poe espaco entre o rotulo e o valor colado', () => {
    const r = renderizarTermo('<p><strong>Vencimento:</strong><span data-campo="emissao.data">x</span></p>', { 'emissao.data': '19/10/2026' });
    expect(r.html).toContain('</strong> 19/10/2026');
    const r2 = renderizarTermo('<p>Data: <span data-campo="emissao.data">x</span></p>', { 'emissao.data': '19/10/2026' });
    expect(r2.html).toContain('Data: 19/10/2026');
  });
  it('nao poe espaco no inicio da celula/paragrafo nem depois de parentese', () => {
    expect(precisaEspaco('<td><p>')).toBe(false);
    expect(precisaEspaco('texto (')).toBe(false);
    expect(precisaEspaco('Placa:<strong>')).toBe(true);
    expect(precisaEspaco('Placa:&nbsp;')).toBe(false);
  });
  it('estica a ultima celula das linhas curtas (titulo mesclado do Word)', () => {
    const t = '<table><tr><td colspan="4">T</td></tr><tr><td colspan="2">a</td><td>b</td><td>c</td><td>d</td></tr></table>';
    expect(alinharColunasDasTabelas(t)).toContain('<td colspan="5">T</td>');
    const ok = '<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>';
    expect(alinharColunasDasTabelas(ok)).toBe(ok);
    expect(alinharColunasDasTabelas('<table><tr><td><p><strong><br /></strong>☐ X</p></td></tr></table>'))
      .toBe('<table><tr><td><p>☐ X</p></td></tr></table>');
  });
});

import { validarPdfTermo, tamanhoArquivo, PDF_TERMO_MAX_BYTES } from './termos';

describe('PDF original do documento geral (0166)', () => {
  const ok = { nome: 'Regimento.pdf', bytes: 2048, cabecalho: '%PDF-1.7', escopo: 'GERAL' };
  it('aceita PDF em documento geral', () => {
    expect(validarPdfTermo(ok)).toBeNull();
  });
  it('recusa termo por associado', () => {
    expect(validarPdfTermo({ ...ok, escopo: 'ASSOCIADO' })).toMatch(/Geral/);
  });
  it('recusa o que nao e PDF, vazio e acima do teto', () => {
    expect(validarPdfTermo({ ...ok, cabecalho: 'PK\u0003\u0004' })).toMatch(/não é um PDF/);
    expect(validarPdfTermo({ ...ok, bytes: 0 })).toMatch(/vazio/);
    expect(validarPdfTermo({ ...ok, bytes: PDF_TERMO_MAX_BYTES + 1 })).toMatch(/20 MB/);
  });
  it('tamanho legivel', () => {
    expect(tamanhoArquivo(830 * 1024)).toBe('830 KB');
    expect(tamanhoArquivo(2.4 * 1024 * 1024)).toBe('2,4 MB');
    expect(tamanhoArquivo(null)).toBe('—');
  });
});
