import { describe, expect, it } from 'vitest';
import {
  urlMutual, cabecalhoMutual, extrairLista, extrairTotal, temProximaPagina,
  textoOuNulo, numeroOuNulo, dataLocalDeIso, tipoPessoaMutual,
  statusVeiculoDoContrato, statusTituloMutual, ehMensalidade, problemasDoObjeto,
  mesesDoPeriodoMutual, ehFilaOperacional, ehFunilDeVenda, statusDeTexto,
  gargaloDoFunil, coberturaDoFunil, teseDoConsultorSeSustenta, CHAVES_DOC_CONSULTOR,
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
  // DECISAO DO USUARIO (09/09/2026): "quem esta em Indenizado, Indenizacao,
  // Inativo/pago NAO vamos gerar mensalidades". `em_evento` E faturavel
  // (veiculo_faturavel, 0024), entao os tres tem de ser `inativo` — senao 26
  // veiculos ja indenizados voltariam a receber boleto todo mes.
  it('INDENIZADO e suas grafias NAO faturam', () => {
    expect(statusVeiculoDoContrato('INDENIZADO')).toBe('inativo');
    expect(statusVeiculoDoContrato('INDENIZACAO')).toBe('inativo');
    expect(statusVeiculoDoContrato('INDENIZAÇAO')).toBe('inativo');
    expect(statusVeiculoDoContrato('INDENIZAÇÃO')).toBe('inativo');
  });
  it('INATIVO/PAGO e inativo', () => {
    expect(statusVeiculoDoContrato('INATIVO/PAGO')).toBe('inativo');
  });
  // A distincao que sustenta a decisao: sinistro EM ANDAMENTO nao e indenizacao
  // paga. O associado do sinistro segue na casa e segue pagando.
  it('SINISTRADO continua faturando (em_evento), ao contrario de INDENIZADO', () => {
    expect(statusVeiculoDoContrato('SINISTRADO')).toBe('em_evento');
    expect(statusVeiculoDoContrato('INDENIZADO')).toBe('inativo');
  });
  // DE FORA de proposito: sem par obvio, pode ser associado renegociando divida
  // (entra e fatura) ou contrato encerrado (entra como historico). Errar manda
  // boleto para quem nao devia, ou tira da base quem ainda paga.
  it('DIFICULDADE FINANCEIRA continua sem mapeamento ate o usuario decidir', () => {
    expect(statusVeiculoDoContrato('DIFICULDADE FINANCEIRA')).toBeNull();
  });
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

// ---------------------------------------------------------------------------
// 0071 — o status do VEICULO, e nao o do associado
// ---------------------------------------------------------------------------
describe('statusVeiculoDoContrato — a disputa contrato x objeto', () => {
  it('O CASO REAL: associado ATIVO (tem outro carro), ESTE veiculo encerrado', () => {
    // O contrato do Mutual guarda varios veiculos, entao `contract_status` fala
    // do ASSOCIADO. Ate a 0071 este veiculo entrava como faturavel e ia para os
    // bloqueios cobrando valor e dia que um contrato encerrado nao tem.
    expect(statusVeiculoDoContrato('ATIVO', 'INATIVO')).toBe('inativo');
  });

  it('mas o objeto NAO ressuscita: contrato cancelado e veiculo sem cobertura', () => {
    expect(statusVeiculoDoContrato('CANCELADO', 'ATIVO')).toBe('inativo');
    expect(statusVeiculoDoContrato('EXPIRADO', 'ATIVO')).toBe('inativo');
  });

  it('vence sempre o MENOS VIVO dos dois', () => {
    expect(statusVeiculoDoContrato('ATIVO', 'SUSPENSO')).toBe('suspenso');
    expect(statusVeiculoDoContrato('SUSPENSO', 'ATIVO')).toBe('suspenso');
    // sinistro em andamento nao e apagado por um "ATIVO" generico do objeto
    expect(statusVeiculoDoContrato('SINISTRADO', 'ATIVO')).toBe('em_evento');
  });

  it('objeto sem status: o contrato manda, como era antes da 0071', () => {
    expect(statusVeiculoDoContrato('ATIVO')).toBe('ativo');
    expect(statusVeiculoDoContrato('ATIVO', null)).toBe('ativo');
    expect(statusVeiculoDoContrato('ATIVO', '')).toBe('ativo');
  });

  it('vocabulario desconhecido no objeto NAO apaga a classificacao do contrato', () => {
    expect(statusVeiculoDoContrato('ATIVO', 'PALAVRA NOVA')).toBe('ativo');
  });

  it('...mas desconhecido no CONTRATO nao entra, mesmo com objeto conhecido', () => {
    // A assimetria e deliberada: vocabulario novo no contrato e DECISAO
    // PENDENTE (0063). Deixar o objeto resgatar a linha faria o veiculo entrar
    // com classificacao adivinhada, em silencio — o oposto do que a trava quer.
    expect(statusVeiculoDoContrato('PALAVRA NOVA', 'INATIVO')).toBeNull();
    expect(statusVeiculoDoContrato('PALAVRA NOVA', 'ATIVO')).toBeNull();
  });

  it('funil de venda no CONTRATO descarta, aconteca o que acontecer no objeto', () => {
    // Venda nova nasce no SCar (hotlink/CRM) — o objeto nao reabre essa decisao.
    expect(statusVeiculoDoContrato('AGUARDANDO_ACEITE', 'ATIVO')).toBeNull();
    expect(statusVeiculoDoContrato('CRIADO', 'INATIVO')).toBeNull();
    expect(ehFunilDeVenda('AUTORIZADO')).toBe(true);
    expect(ehFunilDeVenda('ATIVO')).toBe(false);
  });

  it('nenhum dos dois reconhecido = nao importar', () => {
    expect(statusVeiculoDoContrato('PALAVRA NOVA', 'OUTRA NOVA')).toBeNull();
  });

  it('statusDeTexto le UMA palavra e nao sabe de disputa', () => {
    expect(statusDeTexto('INADIMPLENTE')).toBe('ativo');
    expect(statusDeTexto('indenizado')).toBe('inativo');
    expect(statusDeTexto('')).toBeNull();
    expect(statusDeTexto(null)).toBeNull();
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

  // 0071: sem placa nao e uma coisa so.
  it('sem placa mas COM chassi e 0 km — fila operacional, nao dado sujo', () => {
    const p = problemasDoObjeto({
      ...bom, vehicle_data: { vehicle_plate: null, vehicle_chassi: '9BW111' },
    });
    expect(p).toContain('PLACA_PENDENTE_0KM');
    expect(p).not.toContain('SEM_PLACA_NEM_CHASSI');
    expect(ehFilaOperacional('PLACA_PENDENTE_0KM')).toBe(true);
  });

  it('sem placa E sem chassi nao tem identidade nenhuma', () => {
    const p = problemasDoObjeto({ ...bom, vehicle_data: { vehicle_plate: null } });
    expect(p).toContain('SEM_PLACA_NEM_CHASSI');
    expect(ehFilaOperacional('SEM_PLACA_NEM_CHASSI')).toBe(false);
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

describe('a unidade pelo CONSULTOR — o funil (0073)', () => {
  const funil = (...pares: [number, number][]) =>
    pares.map(([objetos, perdidos], i) => ({
      passo: i + 1, etapa: `p${i + 1}`, objetos, perdidos,
    }));

  it('o gargalo e o degrau que mais PERDE, nao o ultimo', () => {
    // 1000 -> 990 -> 500 -> 480: o buraco esta no salto 3, e e la que a
    // operacao tem de mexer. O total final ("48%") nao diz o que fazer.
    const f = funil([1000, 0], [990, 10], [500, 490], [480, 20]);
    expect(gargaloDoFunil(f)?.passo).toBe(3);
  });

  it('o primeiro degrau nunca e o gargalo — ele e a base, nao uma perda', () => {
    const f = funil([1000, 0], [999, 1]);
    expect(gargaloDoFunil(f)?.passo).toBe(2);
  });

  it('sem perda nenhuma nao ha gargalo', () => {
    expect(gargaloDoFunil(funil([10, 0], [10, 0]))).toBeNull();
  });

  it('a cobertura mede o FIM contra o COMECO', () => {
    expect(coberturaDoFunil(funil([1000, 0], [990, 10], [950, 40]))).toBeCloseTo(0.95);
    expect(coberturaDoFunil([])).toBe(0);
    expect(coberturaDoFunil(funil([0, 0]))).toBe(0);
  });

  it('a tese so passa com cobertura alta — abaixo disso o resto vira trabalho manual', () => {
    expect(teseDoConsultorSeSustenta(funil([1000, 0], [940, 60]))).toBe(false); // 94%
    expect(teseDoConsultorSeSustenta(funil([1000, 0], [950, 50]))).toBe(true);  // 95% passa raspando
    expect(teseDoConsultorSeSustenta(funil([1000, 0], [800, 200]), 0.8)).toBe(true);
  });

  it('as chaves candidatas do consultor incluem as duas grafias de CPF', () => {
    // Nao chutar UMA chave e a licao das duas rodadas perdidas neste modulo.
    expect(CHAVES_DOC_CONSULTOR).toContain('cpf_cnpj');
    expect(CHAVES_DOC_CONSULTOR).toContain('cpf');
  });
});
