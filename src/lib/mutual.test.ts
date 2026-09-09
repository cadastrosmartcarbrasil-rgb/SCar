import { describe, expect, it } from 'vitest';
import {
  urlMutual, cabecalhoMutual, extrairLista, extrairTotal, temProximaPagina,
  textoOuNulo, numeroOuNulo, dataLocalDeIso, tipoPessoaMutual,
  statusVeiculoDoContrato, statusTituloMutual, ehMensalidade, problemasDoObjeto,
  mesesDoPeriodoMutual,
} from './mutual';

const BASE = 'https://smartcar-api.mutualignit.com.br';

describe('urlMutual', () => {
  it('SEMPRE termina o caminho com barra (a API e Django e devolve 301 sem ela)', () => {
    expect(urlMutual(BASE, 'PERSON')).toBe(`${BASE}/public_api/v2/person/`);
    expect(urlMutual(BASE, 'CONTRACT_OBJECT'))
      .toBe(`${BASE}/public_api/v2/contract/contract_object/nested/`);
  });
  it('tolera barra sobrando na base', () => {
    expect(urlMutual(`${BASE}///`, 'PERSON')).toBe(`${BASE}/public_api/v2/person/`);
  });
  it('a query entra depois da barra, nao no lugar dela', () => {
    expect(urlMutual(BASE, 'INVOICE', { page: 2, page_size: 500 }))
      .toBe(`${BASE}/public_api/v2/invoice/?page=2&page_size=500`);
  });
  it('descarta parametro vazio/nulo em vez de mandar chave sem valor', () => {
    expect(urlMutual(BASE, 'INVOICE', { page: 1, updated_at__gte: '', contract_id: null }))
      .toBe(`${BASE}/public_api/v2/invoice/?page=1`);
  });
});

describe('cabecalhoMutual', () => {
  it('o prefixo Bearer FAZ PARTE do valor (esta escrito no contrato)', () => {
    expect(cabecalhoMutual('abc123').Authorization).toBe('Bearer abc123');
  });
});

describe('envelope de resposta', () => {
  const drf = { count: 1234, next: 'http://x/?page=2', previous: null, results: [{ id: 1 }, { id: 2 }] };
  it('le o envelope do DRF', () => {
    expect(extrairLista(drf)).toHaveLength(2);
    expect(extrairTotal(drf)).toBe(1234);
    expect(temProximaPagina(drf, 500)).toBe(true);
  });
  it('le tambem o array cru (nem todo endpoint tem envelope)', () => {
    expect(extrairLista([{ id: 9 }])).toHaveLength(1);
    expect(extrairTotal([{ id: 9 }])).toBeNull();
  });
  it('sem envelope, pagina cheia significa que ha proxima', () => {
    expect(temProximaPagina([{ id: 1 }, { id: 2 }], 2)).toBe(true);
    expect(temProximaPagina([{ id: 1 }], 2)).toBe(false);
  });
  it('next nulo encerra mesmo com pagina cheia', () => {
    expect(temProximaPagina({ next: null, results: [1, 2] }, 2)).toBe(false);
  });
  it('nao explode com lixo', () => {
    expect(extrairLista(null)).toEqual([]);
    expect(extrairLista('erro')).toEqual([]);
  });
});

describe('textoOuNulo — vazio TEM de virar NULL', () => {
  it('string vazia e so-espacos viram null', () => {
    // chassi/renavam sao UNIQUE NULAVEIS: duas linhas com '' colidem (0051).
    expect(textoOuNulo('')).toBeNull();
    expect(textoOuNulo('   ')).toBeNull();
    expect(textoOuNulo(null)).toBeNull();
    expect(textoOuNulo(undefined)).toBeNull();
  });
  it('preserva o conteudo, sem as bordas', () => {
    expect(textoOuNulo('  ABC1D23  ')).toBe('ABC1D23');
  });
});

describe('numeroOuNulo', () => {
  it('le o decimal em string que a API devolve', () => {
    expect(numeroOuNulo('1234.56')).toBe(1234.56);
    expect(numeroOuNulo('0.00')).toBe(0);
  });
  it('vazio e lixo viram null, nao zero', () => {
    expect(numeroOuNulo('')).toBeNull();
    expect(numeroOuNulo('abc')).toBeNull();
    expect(numeroOuNulo(null)).toBeNull();
  });
});

describe('dataLocalDeIso — o fuso ANTES do corte', () => {
  it('21h em Brasilia nao vira o dia seguinte', () => {
    // 2024-03-10T23:30Z = 20:30 de 10/03 em Sao Paulo. Cortar a string daria 10,
    // mas o caso perigoso e o contrario: 02:00Z do dia 11 = 23:00 do dia 10.
    expect(dataLocalDeIso('2024-03-11T02:00:00Z')).toBe('2024-03-10');
  });
  it('data normal do meio do dia nao muda', () => {
    expect(dataLocalDeIso('2019-08-24T14:15:22Z')).toBe('2019-08-24');
  });
  it('respeita fuso diferente (Cuiaba e UTC-4)', () => {
    expect(dataLocalDeIso('2024-06-11T02:00:00Z', 'America/Cuiaba')).toBe('2024-06-10');
  });
  it('vazio e data invalida viram null', () => {
    expect(dataLocalDeIso(null)).toBeNull();
    expect(dataLocalDeIso('')).toBeNull();
    expect(dataLocalDeIso('nao e data')).toBeNull();
  });
});

describe('tipoPessoaMutual', () => {
  it('traduz "1"/"2", que e como o Mutual manda', () => {
    expect(tipoPessoaMutual('1')).toBe('PF');
    expect(tipoPessoaMutual('2')).toBe('PJ');
  });
  it('nao inventa PF quando o campo vem vazio', () => {
    expect(tipoPessoaMutual(null)).toBeNull();
    expect(tipoPessoaMutual('PF')).toBeNull();
  });
});

describe('statusVeiculoDoContrato', () => {
  it('mapeia os estados de base', () => {
    expect(statusVeiculoDoContrato('ATIVO')).toBe('ativo');
    expect(statusVeiculoDoContrato('SUSPENSO')).toBe('suspenso');
    expect(statusVeiculoDoContrato('PENDENTE_VISTORIA')).toBe('vistoria_pendente');
    expect(statusVeiculoDoContrato('SINISTRADO')).toBe('em_evento');
    expect(statusVeiculoDoContrato('INDENIZADO')).toBe('em_evento');
    expect(statusVeiculoDoContrato('CANCELADO')).toBe('inativo');
    expect(statusVeiculoDoContrato('CANCELADO_TROCA_TITULARIDADE')).toBe('inativo');
  });
  it('INADIMPLENTE segue ATIVO — a trava do SCar vem dos titulos, nao do cadastro', () => {
    expect(statusVeiculoDoContrato('INADIMPLENTE')).toBe('ativo');
  });
  it('funil de venda NAO e importado (venda nova nasce no SCar)', () => {
    for (const s of ['CRIADO', 'GERADO_PENDENCIA', 'AGUARDANDO_ACEITE', 'PENDENTE_ANALISE',
      'AUTORIZADO', 'LINK_PAGAMENTO_ENVIADO', 'PAGAMENTO_GERADO', 'PENDENTE',
      'NEGOCIACAO_PERDIDA', 'REATIVACAO']) {
      expect(statusVeiculoDoContrato(s)).toBeNull();
    }
  });
  it('objeto REMOVIDO sai da base mesmo com contrato ativo', () => {
    expect(statusVeiculoDoContrato('ATIVO', 'REMOVIDO')).toBe('inativo');
  });
  it('status desconhecido nao entra por engano', () => {
    expect(statusVeiculoDoContrato('COISA_NOVA')).toBeNull();
    expect(statusVeiculoDoContrato(null)).toBeNull();
  });
  // O enum do swagger NAO e exaustivo: este apareceu so na primeira leitura da
  // base real (09/09/2026). Antes da 0063 ele caia no `null` e era contado como
  // funil de venda — o lugar errado, porque e contrato ENCERRANDO.
  it('AGUARDADO A RETIRADA DO RASTREADOR (visto em producao) vira inativo', () => {
    expect(statusVeiculoDoContrato('AGUARDADO A RETIRADA DO RASTREADOR')).toBe('inativo');
    expect(statusVeiculoDoContrato('aguardado a retirada do rastreador')).toBe('inativo');
  });
});

describe('statusTituloMutual', () => {
  it('as 4 familias', () => {
    expect(statusTituloMutual('SUCCEEDED')).toBe('pago');
    expect(statusTituloMutual('SUCCEEDED_PENDING')).toBe('pago');
    expect(statusTituloMutual('OVERDUE')).toBe('vencido');
    expect(statusTituloMutual('CANCELED_RECURRENCE')).toBe('cancelado');
    expect(statusTituloMutual('FAILED')).toBe('cancelado');
    expect(statusTituloMutual('PENDING')).toBe('pendente');
    expect(statusTituloMutual('CREATED')).toBe('pendente');
  });
});

describe('ehMensalidade', () => {
  it('so mensalidade e pro-rata contam', () => {
    expect(ehMensalidade('MONTHLY_PAYMENT')).toBe(true);
    expect(ehMensalidade('PRO_RATA')).toBe(true);
    expect(ehMensalidade('ACCESSION_MONTHLY_PAYMENT')).toBe(true);
  });
  it('adesao, comissao, repasse e multa de rastreador NAO sao mensalidade', () => {
    for (const t of ['ACCESSION', 'COMISSAO', 'REPASSE', 'TRACKER_FINE',
      'REINSPECTION', 'PARTICIPATION_FEE', 'FINANCIAL_AGREEMENT']) {
      expect(ehMensalidade(t)).toBe(false);
    }
  });
});

describe('problemasDoObjeto', () => {
  const bom = {
    contract_status: 'ATIVO',
    status: 'ATIVO',
    final_total_value: '189.90',
    due_day: '10',
    first_activation_date: '2021-05-03T12:00:00Z',
    vehicle_data: { vehicle_plate: 'ABC1D23', vehicle_chassi: '9BW', vehicle_renavam: '123' },
    person_data: { person_cpf_cnpj: '52998224725', person_name: 'JOAO DA SILVA' },
  };

  it('linha completa nao tem impedimento', () => {
    expect(problemasDoObjeto(bom)).toEqual([]);
  });

  it('R$ 0,00 E problema — cortesia importada com zero volta a ser cobrada', () => {
    // valor_mensalidade_veiculo (0024) so respeita o override quando > 0;
    // com 0 ele cai no cotar_plano e o associado isento recebe boleto.
    expect(problemasDoObjeto({ ...bom, final_total_value: '0.00' }))
      .toContain('SEM_VALOR_COBRADO');
  });

  it('sem data de ativacao — senao o trigger carimba HOJE', () => {
    expect(problemasDoObjeto({ ...bom, first_activation_date: null }))
      .toContain('SEM_DATA_ATIVACAO');
  });

  it('sem dia de vencimento — senao cai no padrao legado (dia 10 do mes seguinte)', () => {
    expect(problemasDoObjeto({ ...bom, due_day: '' })).toContain('SEM_DIA_VENCIMENTO');
  });

  it('sem CPF e sem nome (os dois sao x-nullable no contrato do Mutual)', () => {
    const p = problemasDoObjeto({ ...bom, person_data: { person_cpf_cnpj: '', person_name: null } });
    expect(p).toContain('SEM_CPF');
    expect(p).toContain('SEM_NOME');
  });

  it('sem placa', () => {
    expect(problemasDoObjeto({ ...bom, vehicle_data: { vehicle_plate: null } }))
      .toContain('SEM_PLACA');
  });

  it('objeto em funil de venda nao e conferido — ele nem seria importado', () => {
    expect(problemasDoObjeto({ ...bom, contract_status: 'AGUARDANDO_ACEITE',
      final_total_value: null, due_day: null })).toEqual([]);
  });

  it('acumula todos os motivos, nao para no primeiro', () => {
    expect(problemasDoObjeto({ contract_status: 'ATIVO' }).length).toBeGreaterThanOrEqual(5);
  });
});

describe('mesesDoPeriodoMutual', () => {
  it('aceita o codigo do contrato e o rotulo da tela', () => {
    expect(mesesDoPeriodoMutual('1')).toBe(1);
    expect(mesesDoPeriodoMutual(6)).toBe(6);
    expect(mesesDoPeriodoMutual('SEMESTRAL')).toBe(6);
    expect(mesesDoPeriodoMutual('Anual')).toBe(12);
  });
  it('vocabulario desconhecido nao vira 1 por engano', () => {
    // Assumir "mensal" no escuro e o caminho para cobrar 6x a mais: o periodo
    // desconhecido tem de aparecer como desconhecido.
    expect(mesesDoPeriodoMutual('QUINZENAL')).toBeNull();
    expect(mesesDoPeriodoMutual('')).toBeNull();
    expect(mesesDoPeriodoMutual(null)).toBeNull();
  });
});
