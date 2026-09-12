import { describe, expect, it } from 'vitest';
import {
  ABAS_FECHAMENTO, ORDEM_CHECKLIST, adesaoEntraNoCaixa, agruparChecklist, margemRegional,
  pendencias, pendenciasPorAba, primeiraAbaPendente, progressoChecklist,
  ratearAdesao, validarComissaoVendedor, type ItemChecklist,
  conferirRegistroDaPlaca,
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

describe('conferirRegistroDaPlaca — a consulta no fechamento e CONFERENCIA', () => {
  // O registro real da placa OAW0838 (ver src/lib/fipe.test.ts).
  const doc = {
    chassi: '9BRBD3HE1K0445518', numeroMotor: 'M650484', cor: 'PRETA',
    anoFabricacao: 2019, anoModelo: 2019, marca: 'TOYOTA', modelo: 'COROLLA XEI 20FLEX',
  };

  it('preenche o que esta VAZIO — o caso do lead que veio sem ficha', () => {
    const r = conferirRegistroDaPlaca({ marca: 'TOYOTA' }, doc);
    expect(r.preencher.chassi).toBe('9BRBD3HE1K0445518');
    expect(r.preencher.numero_motor).toBe('M650484');
    expect(r.preencher.cor).toBe('PRETA');
    expect(r.preencher.ano_fabricacao).toBe(2019);
    expect(r.divergencias).toEqual([]);
  });

  it('campo IGUAL nao vira preenchimento nem divergencia', () => {
    const r = conferirRegistroDaPlaca(
      { chassi: '9BRBD3HE1K0445518', cor: 'PRETA', ano_fabricacao: 2019 }, doc,
    );
    expect(r.preencher.chassi).toBeUndefined();
    expect(r.divergencias.map((d) => d.campo)).not.toContain('chassi');
  });

  it('compara sem acento, pontuacao e caixa — senao toda consulta acusaria', () => {
    const r = conferirRegistroDaPlaca(
      { chassi: '9br-bd3he1.k0445518', cor: 'preta' }, doc,
    );
    expect(r.divergencias).toEqual([]);
  });

  it('campo DIFERENTE nao e sobrescrito: vira divergencia para decidir', () => {
    // Quem esta fechando leu o documento e digitou. Apagar em silencio troca um
    // erro por outro que ninguem ve.
    const r = conferirRegistroDaPlaca({ chassi: '9BWZZZ377VT004251' }, doc);
    expect(r.preencher.chassi).toBeUndefined();
    expect(r.divergencias).toHaveLength(1);
    expect(r.divergencias[0]).toMatchObject({
      campo: 'chassi', naFicha: '9BWZZZ377VT004251', noDocumento: '9BRBD3HE1K0445518',
    });
  });

  it('o MODELO comercial da FIPE nao briga com o abreviado do documento', () => {
    // "COROLLA XEI 2.0 FLEX 16V AUT." (FIPE) x "COROLLA XEI 20FLEX" (documento):
    // divergem como texto e sao o mesmo carro. Acusar isso seria ruido em toda
    // consulta, e ruido constante ensina a ignorar o aviso de verdade.
    const r = conferirRegistroDaPlaca({ modelo: 'COROLLA XEI 2.0 FLEX 16V AUT.' }, doc);
    expect(r.divergencias.map((d) => d.campo)).not.toContain('modelo');
  });

  it('mas modelo de OUTRO carro continua sendo divergencia', () => {
    const r = conferirRegistroDaPlaca({ modelo: 'GOL 1.0' }, doc);
    expect(r.divergencias.map((d) => d.campo)).toContain('modelo');
  });

  it('campo que o documento NAO trouxe nao mexe em nada', () => {
    const r = conferirRegistroDaPlaca({ cor: 'AZUL' }, { chassi: '9BR1' });
    expect(r.preencher.cor).toBeUndefined();
    expect(r.divergencias).toEqual([]);
    expect(r.preencher.chassi).toBe('9BR1');
  });

  it('sem registro nenhum a conferencia e vazia — nao limpa a ficha', () => {
    const r = conferirRegistroDaPlaca({ chassi: '9BR1', cor: 'AZUL' }, null);
    expect(r.preencher).toEqual({});
    expect(r.divergencias).toEqual([]);
  });

  it('o VALOR FIPE nunca entra na conferencia, nem vazio', () => {
    // A cotacao ja foi aceita e e `leads.valor_fipe` que vai para `veiculos`
    // (0034). Mexer nele aqui mudaria o FIPE do associado sem mudar o preco.
    const r = conferirRegistroDaPlaca({}, { ...doc } as never);
    expect(Object.keys(r.preencher)).not.toContain('valor_fipe');
    expect(Object.keys(r.preencher)).not.toContain('codigo_fipe');
  });
});
