import { describe, expect, it } from 'vitest';
import {
  ABAS_FECHAMENTO, ORDEM_CHECKLIST, adesaoEntraNoCaixa, agruparChecklist, margemRegional,
  pendencias, pendenciasPorAba, primeiraAbaPendente, progressoChecklist,
  ratearAdesao, validarComissaoVendedor, type ItemChecklist,
} from './vendas';

describe('teto de comissao (regional -> vendedor)', () => {
  const regional = { adesao: 1.0, recorrente: 0.15 };

  it('aceita o vendedor dentro do teto', () => {
    expect(validarComissaoVendedor({ adesao: 1.0, recorrente: 0.05 }, regional).ok).toBe(true);
    expect(validarComissaoVendedor({ adesao: 0, recorrente: 0.15 }, regional).ok).toBe(true);
  });

  it('recusa recorrencia acima da regional', () => {
    const r = validarComissaoVendedor({ adesao: 1.0, recorrente: 0.20 }, regional);
    expect(r.ok).toBe(false);
    expect(r.erros[0]).toContain('20%');
    expect(r.erros[0]).toContain('15%');
  });

  it('recusa adesao acima da regional', () => {
    const r = validarComissaoVendedor({ adesao: 1.0, recorrente: 0 }, { adesao: 0.5, recorrente: 0.15 });
    expect(r.ok).toBe(false);
    expect(r.erros[0]).toContain('Adesao');
  });

  it('recusa comissao negativa', () => {
    expect(validarComissaoVendedor({ adesao: -0.1, recorrente: 0 }, regional).ok).toBe(false);
  });

  it('tolera arredondamento na casa decimal', () => {
    expect(validarComissaoVendedor({ adesao: 0.15, recorrente: 0.15 }, { adesao: 0.15, recorrente: 0.15 }).ok).toBe(true);
  });

  it('mostra o que sobra para a regional (em fracao, como o banco guarda)', () => {
    expect(margemRegional({ adesao: 1.0, recorrente: 0.05 }, regional)).toEqual({ adesao: 0, recorrente: 0.1 });
  });

  it('preserva meio ponto percentual (15,5% nao vira 16%)', () => {
    expect(margemRegional({ adesao: 0, recorrente: 0.05 }, { adesao: 0, recorrente: 0.155 }).recorrente).toBe(0.105);
  });
});

describe('adesao', () => {
  it('recebida pelo vendedor NAO entra no caixa', () => {
    expect(adesaoEntraNoCaixa('VENDEDOR_NA_HORA')).toBe(false);
    const r = ratearAdesao(500, 'VENDEDOR_NA_HORA', 1.0);
    expect(r).toMatchObject({ valor: 500, vendedor: 500, associacao: 0, entraNoCaixa: false });
    expect(r.resumo).toContain('nada entra');
  });

  it('boleto/PIX/cartao entram no caixa', () => {
    (['BOLETO', 'PIX', 'CARTAO'] as const).forEach((f) => expect(adesaoEntraNoCaixa(f)).toBe(true));
  });

  it('rateia entre vendedor e associacao quando passa pela nossa conta', () => {
    const r = ratearAdesao(500, 'BOLETO', 1.0);
    expect(r).toMatchObject({ vendedor: 500, associacao: 0, entraNoCaixa: true });

    const meio = ratearAdesao(500, 'BOLETO', 0.6);
    expect(meio.vendedor).toBe(300);
    expect(meio.associacao).toBe(200);
  });

  it('sem forma definida trata como fora do caixa', () => {
    expect(adesaoEntraNoCaixa(null)).toBe(false);
  });
});

describe('checklist', () => {
  const itens: ItemChecklist[] = [
    { item: 'CPF/CNPJ valido', grupo: 'Associado', ok: true, detalhe: '111...' },
    { item: 'Endereco completo', grupo: 'Associado', ok: false, detalhe: 'nao informado' },
    { item: 'Chassi', grupo: 'Veiculo', ok: true, detalhe: '9BW...' },
    { item: 'Fotos da vistoria', grupo: 'Documentos', ok: false, detalhe: '2 foto(s)' },
    { item: 'Plano contratado', grupo: 'Venda', ok: true, detalhe: 'Prata' },
  ];

  it('agrupa na ordem da rota e conta o que falta', () => {
    const g = agruparChecklist(itens);
    expect(g.map((x) => x.grupo)).toEqual(['Associado', 'Veiculo', 'Documentos', 'Venda']);
    expect(g[0]).toMatchObject({ concluidos: 1, total: 2, completo: false });
    expect(g[1].completo).toBe(true);
  });

  it('calcula o progresso', () => {
    expect(progressoChecklist(itens)).toEqual({ concluidos: 3, total: 5, percentual: 60 });
    expect(progressoChecklist([])).toEqual({ concluidos: 0, total: 0, percentual: 0 });
  });

  it('lista as pendencias pelo nome do item', () => {
    expect(pendencias(itens)).toEqual(['Endereco completo', 'Fotos da vistoria']);
  });

  it('grupo desconhecido vai para o fim', () => {
    const g = agruparChecklist([...itens, { item: 'X', grupo: 'Outro', ok: true, detalhe: null }]);
    expect(g[g.length - 1].grupo).toBe('Outro');
  });
});

describe('abas do fechamento', () => {
  const itens = [
    { item: 'CPF/CNPJ valido', grupo: 'Associado', ok: true, detalhe: null },
    { item: 'E-mail', grupo: 'Associado', ok: false, detalhe: null },
    { item: 'Chassi', grupo: 'Veiculo', ok: false, detalhe: null },
    { item: 'Renavam', grupo: 'Veiculo', ok: false, detalhe: null },
    { item: 'Fotos da vistoria', grupo: 'Documentos', ok: false, detalhe: null },
    { item: 'Vendedor responsavel', grupo: 'Venda', ok: true, detalhe: null },
  ];

  it('cada grupo do checklist tem uma aba', () => {
    ORDEM_CHECKLIST.forEach((g) => {
      expect(ABAS_FECHAMENTO.some((a) => a.grupo === g)).toBe(true);
    });
  });

  it('conta as pendencias de cada aba', () => {
    expect(pendenciasPorAba(itens)).toEqual({
      associado: 1, veiculo: 2, vistoria: 1, adesao: 0,
    });
  });

  it('grupo desconhecido nao some da tela', () => {
    const conta = pendenciasPorAba([{ item: 'X', grupo: 'Marte', ok: false, detalhe: null }]);
    expect(conta.associado).toBe(1);
  });

  it('aponta onde o trabalho continua, na ordem da ficha', () => {
    expect(primeiraAbaPendente(itens)).toBe('associado');
    expect(primeiraAbaPendente(itens.filter((i) => i.grupo !== 'Associado'))).toBe('veiculo');
    expect(primeiraAbaPendente(itens.map((i) => ({ ...i, ok: true })))).toBeNull();
  });

  it('ficha vazia nao aponta aba nenhuma', () => {
    expect(primeiraAbaPendente([])).toBeNull();
    expect(pendenciasPorAba([])).toEqual({ associado: 0, veiculo: 0, vistoria: 0, adesao: 0 });
  });
});
