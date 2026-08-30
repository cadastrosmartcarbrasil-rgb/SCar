import { describe, expect, it } from 'vitest';
import {
  compararTabelas, gerarModeloCsv, interpretarPlanilha, matrizDeCsv, normalizarCabecalho,
  type BandaImportada, type ProdutoColuna,
} from './precificacao-import';

const PRODUTOS: ProdutoColuna[] = [
  { id: 'p-casco', nome: 'Protecao Casco' },
  { id: 'p-admin', nome: 'Taxa Administrativa' },
];

const CABECALHO = 'FIPE_MINIMO;FIPE_MAXIMO;PARTICIPACAO;PARTICIPACAO_TIPO;ADESAO;Protecao Casco;Taxa Administrativa';

describe('matrizDeCsv', () => {
  it('usa ";" (padrao do Excel BR)', () => {
    expect(matrizDeCsv('a;b;c\n1;2;3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });
  it('cai para "," quando o arquivo veio assim', () => {
    expect(matrizDeCsv('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });
  it('respeita campo entre aspas com o separador dentro', () => {
    expect(matrizDeCsv('nome;valor\n"Casco; Total";10')).toEqual([['nome', 'valor'], ['Casco; Total', '10']]);
  });
  it('descarta BOM e linhas em branco', () => {
    expect(matrizDeCsv('﻿a;b\n\n1;2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('normalizarCabecalho', () => {
  it('ignora acento, caixa e espaco duplo', () => {
    expect(normalizarCabecalho(' Proteção   Casco ')).toBe('PROTECAO CASCO');
    expect(normalizarCabecalho('fipe_minimo')).toBe('FIPE_MINIMO');
  });
});

describe('interpretarPlanilha', () => {
  it('le uma tabela valida com valores em formato BR', () => {
    const csv = `${CABECALHO}
0;35000;1500;VALOR;250;89,90;35,00
35000,01;40000;1800;VALOR;250;99,90;35,00`;
    const r = interpretarPlanilha(matrizDeCsv(csv), PRODUTOS);
    expect(r.erros).toEqual([]);
    expect(r.bandas).toHaveLength(2);
    expect(r.bandas[0]).toMatchObject({
      fipe_minimo: 0, fipe_maximo: 35000, participacao_tipo: 'VALOR', participacao_valor: 1500, adesao: 250,
    });
    expect(r.bandas[0].valores).toEqual({ 'p-casco': 89.9, 'p-admin': 35 });
    expect(r.bandas[1].fipe_minimo).toBe(35000.01);
  });

  it('aceita participacao percentual', () => {
    const csv = `${CABECALHO}\n40000,01;60000;4;PERCENTUAL;350;129,90;35,00`;
    const r = interpretarPlanilha(matrizDeCsv(csv), PRODUTOS);
    expect(r.bandas[0].participacao_tipo).toBe('PERCENTUAL');
    expect(r.bandas[0].participacao_valor).toBe(4);
  });

  it('casa a coluna do produto mesmo com acento e caixa diferentes', () => {
    const csv = 'FIPE_MINIMO;FIPE_MAXIMO;proteção casco\n0;1000;50';
    const r = interpretarPlanilha(matrizDeCsv(csv), PRODUTOS);
    expect(r.bandas[0].valores['p-casco']).toBe(50);
  });

  it('BLOQUEIA faixas sobrepostas apontando as linhas do Excel', () => {
    const csv = `${CABECALHO}
0;40000;1500;VALOR;250;89,90;35,00
35000;60000;1800;VALOR;250;99,90;35,00`;
    const r = interpretarPlanilha(matrizDeCsv(csv), PRODUTOS);
    expect(r.erros).toHaveLength(1);
    expect(r.erros[0]).toContain('linha 3');
    expect(r.erros[0]).toContain('linha 2');
  });

  it('explica o limite compartilhado e sugere o centavo seguinte', () => {
    const csv = `${CABECALHO}
190000,01;200000;6;PERCENTUAL;500;45,00;465,00
200000;210000;6;PERCENTUAL;500;45,00;500,00`;
    const r = interpretarPlanilha(matrizDeCsv(csv), PRODUTOS);
    expect(r.erros).toHaveLength(1);
    expect(r.erros[0]).toContain('linha 3');
    expect(r.erros[0]).toContain('200.000,01');
  });

  it('pega faixa contida dentro de outra, mesmo nao sendo vizinhas na ordem', () => {
    const csv = `${CABECALHO}
0;100000;1500;VALOR;250;89,90;35,00
120000,01;130000;1500;VALOR;250;89,90;35,00
50000;60000;1800;VALOR;250;99,90;35,00`;
    const r = interpretarPlanilha(matrizDeCsv(csv), PRODUTOS);
    expect(r.erros.some((e) => e.includes('invade'))).toBe(true);
  });

  it('BLOQUEIA celula com erro de formula do Excel em vez de gravar R$ 0,00', () => {
    // CABECALHO = ...;Protecao Casco;Taxa Administrativa
    const csv = `${CABECALHO}\n0;60000;6;PERCENTUAL;500;#VALOR!;35,00`;
    const r = interpretarPlanilha(matrizDeCsv(csv), PRODUTOS);
    expect(r.bandas).toHaveLength(0);
    expect(r.erros[0]).toContain('Linha 2');
    expect(r.erros[0]).toContain('Protecao Casco');
    expect(r.erros[0]).toContain('#VALOR!');
  });

  it('reconhece as variacoes de erro do Excel (PT e EN)', () => {
    ['#N/D', '#REF!', '#DIV/0!', '#VALUE!', '#NOME?', '#NÚM!'].forEach((err) => {
      const r = interpretarPlanilha(matrizDeCsv(`${CABECALHO}\n0;60000;6;PERCENTUAL;500;${err};35,00`), PRODUTOS);
      expect(r.erros.length, `deveria bloquear ${err}`).toBeGreaterThan(0);
    });
  });

  it('AVISA (nao bloqueia) buraco entre faixas', () => {
    const csv = `${CABECALHO}
0;35000;1500;VALOR;250;89,90;35,00
50000;60000;1800;VALOR;250;99,90;35,00`;
    const r = interpretarPlanilha(matrizDeCsv(csv), PRODUTOS);
    expect(r.erros).toEqual([]);
    expect(r.avisos.some((a) => a.includes('Buraco'))).toBe(true);
  });

  it('bloqueia maximo menor que o minimo, apontando a linha do Excel', () => {
    const csv = `${CABECALHO}\n40000;10000;1500;VALOR;250;89,90;35,00`;
    const r = interpretarPlanilha(matrizDeCsv(csv), PRODUTOS);
    expect(r.erros[0]).toContain('Linha 2');
  });

  it('exige as colunas de faixa FIPE', () => {
    const r = interpretarPlanilha(matrizDeCsv('PARTICIPACAO;ADESAO\n1500;250'), PRODUTOS);
    expect(r.erros.some((e) => e.includes('FIPE_MINIMO'))).toBe(true);
    expect(r.bandas).toEqual([]);
  });

  it('relata coluna desconhecida e produto ausente sem travar a importacao', () => {
    const csv = 'FIPE_MINIMO;FIPE_MAXIMO;Protecao Casco;Coluna Estranha\n0;1000;50;9';
    const r = interpretarPlanilha(matrizDeCsv(csv), PRODUTOS);
    expect(r.erros).toEqual([]);
    expect(r.colunasIgnoradas).toEqual(['Coluna Estranha']);
    expect(r.produtosAusentes).toEqual(['Taxa Administrativa']);
    expect(r.bandas[0].valores['p-admin']).toBeUndefined();
  });

  it('recusa planilha so com cabecalho', () => {
    const r = interpretarPlanilha(matrizDeCsv(CABECALHO), PRODUTOS);
    expect(r.erros).toHaveLength(1);
  });

  it('ordena as faixas por FIPE minimo', () => {
    const csv = `${CABECALHO}
40000,01;60000;1800;VALOR;350;129,90;35,00
0;35000;1500;VALOR;250;89,90;35,00`;
    const r = interpretarPlanilha(matrizDeCsv(csv), PRODUTOS);
    expect(r.bandas.map((b) => b.fipe_minimo)).toEqual([0, 40000.01]);
  });
});

describe('gerarModeloCsv', () => {
  it('gera cabecalho com uma coluna por produto', () => {
    const linhas = gerarModeloCsv(PRODUTOS).split('\r\n');
    expect(linhas[0]).toBe(CABECALHO);
  });
  it('ida e volta: o modelo preenchido e relido sem perda', () => {
    const bandas: BandaImportada[] = [{
      fipe_minimo: 0, fipe_maximo: 35000, participacao_tipo: 'VALOR',
      participacao_valor: 1500, adesao: 250, valores: { 'p-casco': 89.9, 'p-admin': 35 },
    }];
    const r = interpretarPlanilha(matrizDeCsv(gerarModeloCsv(PRODUTOS, bandas)), PRODUTOS);
    expect(r.erros).toEqual([]);
    expect(r.bandas[0]).toEqual({ ...bandas[0], linha: 2 });
  });
});

describe('compararTabelas', () => {
  const base: BandaImportada = {
    fipe_minimo: 0, fipe_maximo: 35000, participacao_tipo: 'VALOR',
    participacao_valor: 1500, adesao: 250, valores: { 'p-casco': 89.9, 'p-admin': 35 },
  };

  it('detecta faixa adicionada, removida e alterada', () => {
    const atual = [base, { ...base, fipe_minimo: 35000.01, fipe_maximo: 40000 }];
    const nova = [
      { ...base, valores: { ...base.valores, 'p-casco': 99.9 } },   // alterada
      { ...base, fipe_minimo: 40000.01, fipe_maximo: 60000 },        // adicionada
    ];
    const d = compararTabelas(atual, nova, PRODUTOS);
    expect(d.alteradas).toHaveLength(1);
    expect(d.alteradas[0].depois.valores['p-casco']).toBe(99.9);
    expect(d.adicionadas.map((b) => b.fipe_minimo)).toEqual([40000.01]);
    expect(d.removidas.map((b) => b.fipe_minimo)).toEqual([35000.01]);
    expect(d.inalteradas).toBe(0);
  });

  it('nao acusa mudanca quando nada mudou', () => {
    const d = compararTabelas([base], [{ ...base }], PRODUTOS);
    expect(d).toMatchObject({ adicionadas: [], removidas: [], alteradas: [], inalteradas: 1 });
  });
});
