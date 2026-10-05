import { describe, expect, it } from 'vitest';
import {
  urlMutual, cabecalhoMutual, extrairLista, extrairTotal, temProximaPagina,
  textoOuNulo, numeroOuNulo, dataLocalDeIso, tipoPessoaMutual,
  statusVeiculoDoContrato, statusTituloMutual, ehMensalidade, problemasDoObjeto,
  mesesDoPeriodoMutual, ehFilaOperacional, ehFunilDeVenda, statusDeTexto,
  gargaloDoFunil, coberturaDoFunil, teseDoConsultorSeSustenta, CHAVES_DOC_CONSULTOR,
  correnteVazia, situacaoDePara, filiaisPendentes, carteiraSemDePara,
  equipesPendentes, carteiraSemAgrupamento, equipesSemNome, porMacrorregiao,
  consolidacao,
  placaMutual, chassiMutual, renavamMutual, resumoDaCarga, recusasPorMotivo,
  filaAntesDoCutover, cutoverLiberado, tiposPendentes,
  planosPendentes, idsPara90Pct, amplitudeFipe, ENTIDADES_MUTUAL,
  mensagemDeFalhaDeLeitura, urlMutualCaminho, caminhoQueRespondeu, CANDIDATAS_PLANO,
  resumoDoCorpo, parametrosDoSwagger, veiculosPorPlano, listaDePlanos, somarDiagnosticoPlanos,
  caminhosDoSwagger, caminhoDeDetalhe, caminhoComId,
  chaveCategoria, tipoEfetivoDaCategoria, categoriasSemTipo, agruparCategoriasPorTipo,
  cotaDaCategoria,
} from './mutual';
import type { CategoriaExterna } from './mutual';
import type { LinhaCarga, TipoVeiculoExterno, PlanoExterno } from './mutual';
import type { PassoFunil, FilialMutual, EquipeVendas } from './mutual';

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

// ===========================================================================
// 0082 — a unidade pelo associado, e o de-para das filiais
// ===========================================================================
describe('correnteVazia', () => {
  const p = (passo: number, objetos: number, perdidos = 0): PassoFunil =>
    ({ passo, etapa: `e${passo}`, objetos, perdidos });

  it('corrente VAZIA: o primeiro salto morre inteiro', () => {
    // Foi o caso medido do `consultant`: 0 de 17.675 objetos.
    expect(correnteVazia([p(1, 3440), p(2, 0, 3440), p(3, 0)])).toBe(true);
  });

  it('corrente que VAZA nao e corrente vazia — sao tratamentos diferentes', () => {
    expect(correnteVazia([p(1, 3440), p(2, 3440), p(3, 3409, 31)])).toBe(false);
  });

  it('funil sem dado nenhum nao e "corrente vazia": nao ha o que concluir', () => {
    expect(correnteVazia([p(1, 0), p(2, 0)])).toBe(false);
    expect(correnteVazia([])).toBe(false);
  });
});

describe('situacaoDePara / filiaisPendentes', () => {
  const f = (id: string, nome: string, faturaveis: number,
             regional_id: string | null, palpite_id: string | null): FilialMutual =>
    ({ id_externo: id, nome, faturaveis, regional_id, palpite_id });

  it('PALPITE nao e VINCULADA — e a distincao que impede carregar por homonimia', () => {
    expect(situacaoDePara(f('5', 'APROVES', 10, null, 'uuid-palpite'))).toBe('palpite');
    expect(situacaoDePara(f('5', 'APROVES', 10, 'uuid-real', 'uuid-palpite'))).toBe('vinculada');
    expect(situacaoDePara(f('5', 'APROVES', 10, null, null))).toBe('sem_correspondencia');
  });

  it('a fila vem por VOLUME de carteira viva: a maior decisao primeiro', () => {
    const lista = [
      f('8', 'RONDONIA', 3, null, null),
      f('5', 'APROVES', 1200, null, 'p'),
      f('7', 'SUDESTE', 800, 'ja-vinculada', null),
      f('6', 'NORDESTE', 400, null, null),
    ];
    expect(filiaisPendentes(lista).map((x) => x.id_externo)).toEqual(['5', '6', '8']);
    expect(carteiraSemDePara(lista)).toBe(1603);
  });

  it('tudo vinculado: fila vazia e nenhuma carteira pendente', () => {
    expect(filiaisPendentes([f('5', 'A', 10, 'r', null)])).toEqual([]);
    expect(carteiraSemDePara([f('5', 'A', 10, 'r', null)])).toBe(0);
  });
});

// ===========================================================================
// 0083 — a equipe de vendas e o agrupamento
// ===========================================================================
describe('equipes de vendas (0083)', () => {
  const e = (id: string, nome: string | null, macro: string | null, fat: number,
             reg: string | null, capturada = true): EquipeVendas =>
    ({ id_externo: id, nome, macrorregiao: macro, faturaveis: fat,
       consultores: 0, regional_id: reg, capturada });

  const cenario: EquipeVendas[] = [
    e('4',  'RIBEIRAO A', 'Regional Sudeste', 863, 'rib'),
    e('21', 'RIBEIRAO B', 'SUDESTE',          733, 'rib'),
    e('3',  'CAPITAL A',  'Regional Sudeste', 479, null),
    e('23', 'CAPITAL B',  'SUDESTE',          366, null),
    e('5',  'NATAL',      'Regional Nordeste', 266, null),
    e('99', null,         'SUDESTE',            12, null, false),
  ];

  it('a fila vem por VOLUME e so com o que falta agrupar', () => {
    expect(equipesPendentes(cenario).map((x) => x.id_externo))
      .toEqual(['3', '23', '5', '99']);
    expect(carteiraSemAgrupamento(cenario)).toBe(479 + 366 + 266 + 12);
  });

  it('equipe COM carteira e SEM nome aparece — e ela que falta capturar', () => {
    expect(equipesSemNome(cenario).map((x) => x.id_externo)).toEqual(['99']);
    // ...e uma equipe nao capturada mas VAZIA nao vira tarefa de ninguem.
    expect(equipesSemNome([e('77', null, null, 0, null, false)])).toEqual([]);
  });

  it('a macrorregiao agrupa a leitura, ordenada pelo peso', () => {
    const grupos = porMacrorregiao(cenario);
    expect(grupos.map((g) => g.macrorregiao))
      .toEqual(['Regional Sudeste', 'SUDESTE', 'Regional Nordeste']);
    expect(grupos[0].faturaveis).toBe(863 + 479);
    expect(grupos[1].equipes.map((x) => x.id_externo)).toEqual(['21', '23', '99']);
  });

  it('macrorregiao ausente vira um grupo proprio, nao some', () => {
    const grupos = porMacrorregiao([e('1', 'X', null, 5, null)]);
    expect(grupos[0].macrorregiao).toBe('(sem macrorregiao)');
  });

  it('VARIAS equipes numa regional so — a consolidacao que o usuario quer', () => {
    const c = consolidacao(cenario);
    expect(c.get('rib')).toBe(2);
    expect(c.size).toBe(1);
  });
});

// ============================================================================
// 0084 — A CARGA
// ============================================================================
describe('saneamento da carga (espelho do SQL da 0084)', () => {
  it('a placa sai alfanumerica em caixa alta, nos dois padroes', () => {
    expect(placaMutual('aaa-1a11')).toBe('AAA1A11');
    expect(placaMutual('ABC 1234')).toBe('ABC1234');
  });

  it('placa fora do padrao e vazia dao null — nao string vazia', () => {
    expect(placaMutual('ABC')).toBeNull();
    expect(placaMutual('')).toBeNull();
    expect(placaMutual(null)).toBeNull();
    expect(placaMutual('12345678')).toBeNull();
  });

  it('o chassi vale so com 17 alfanumericos', () => {
    expect(chassiMutual('9bwzzz377vt000001')).toBe('9BWZZZ377VT000001');
    expect(chassiMutual('000')).toBeNull();
    expect(chassiMutual('')).toBeNull();
  });

  // O placeholder da base real: se ele passasse, as 3 linhas colidiriam
  // entre si no unique e a carga pararia no meio.
  it('renavam placeholder vira null, nunca zero-string', () => {
    expect(renavamMutual('00328938998')).toBe('00328938998');
    expect(renavamMutual('0')).toBeNull();
    expect(renavamMutual('000000000000')).toBeNull();
    expect(renavamMutual('00000000000')).toBeNull();
    expect(renavamMutual('2012')).toBeNull();
  });
});

const linha = (over: Partial<LinhaCarga> = {}): LinhaCarga => ({
  acao: 'CRIAR', problema: null, id_pessoa: 'P1',
  valor_mensalidade: 189.9, dia_vencimento: 15,
  tipo_veiculo_id: 't1', plano_id: 'p1', ativacao_estimada: false,
  ...over,
});

describe('resumoDaCarga', () => {
  // Foi um bug real da 0084: contar linhas em vez de pessoas previa 2
  // associados para 2 veiculos do mesmo dono, e a execucao estourava no
  // unique de cpf_cnpj.
  it('conta ASSOCIADO por pessoa, nao por linha', () => {
    const r = resumoDaCarga([linha(), linha(), linha({ id_pessoa: 'P2' })]);
    expect(r.criar).toBe(3);
    expect(r.associados).toBe(2);
  });

  it('a recusada nao entra em nenhuma das contas de entrada', () => {
    const r = resumoDaCarga([
      linha(),
      linha({ acao: 'RECUSADO', problema: 'SEM PLACA (0 km...)', id_pessoa: 'P9' }),
    ]);
    expect(r.criar).toBe(1);
    expect(r.recusadas).toBe(1);
    expect(r.associados).toBe(1);
  });
});

describe('recusasPorMotivo', () => {
  // O texto do banco nomeia a placa e o chassi da linha, entao agrupar pelo
  // texto cru daria uma familia por linha — fila que ninguem trabalha.
  it('agrupa por FAMILIA e ordena por volume', () => {
    const l = [
      linha({ problema: 'SEM PLACA (0 km ou placa fora do padrao)... Chassi: AAA' }),
      linha({ problema: 'SEM PLACA (0 km ou placa fora do padrao)... Chassi: BBB' }),
      linha({ problema: 'CPF/CNPJ invalido (11111111111) — o banco recusa' }),
      linha(),
    ];
    expect(recusasPorMotivo(l)).toEqual([
      { motivo: 'Sem placa (0 km)', quantidade: 2 },
      { motivo: 'CPF/CNPJ invalido', quantidade: 1 },
    ]);
  });

  it('colisao de placa e de chassi caem na mesma familia', () => {
    const l = [
      linha({ problema: 'Placa AAA1A11 ja cadastrada em outro veiculo do SCar' }),
      linha({ problema: 'Chassi 9BW ja cadastrado em outro veiculo do SCar' }),
    ];
    expect(recusasPorMotivo(l)).toEqual([
      { motivo: 'Ja cadastrado em outro veiculo', quantidade: 2 },
    ]);
  });
});

describe('filaAntesDoCutover', () => {
  // Estes campos NAO bloqueiam a carga: com cobranca_externa ligada o
  // veiculo nao e faturado aqui, e ficar fora da base seria pior.
  it('conta o que falta para faturar AQUI, so entre as que entram', () => {
    const f = filaAntesDoCutover([
      linha({ valor_mensalidade: null }),
      linha({ dia_vencimento: null, plano_id: null }),
      linha({ ativacao_estimada: true }),
      linha({ problema: 'SEM PLACA ...', valor_mensalidade: null }),
    ]);
    expect(f.semValor).toBe(1);
    expect(f.semDia).toBe(1);
    expect(f.semPlano).toBe(1);
    expect(f.ativacaoEstimada).toBe(1);
  });

  it('o cutover fica bloqueado enquanto falta valor ou dia', () => {
    expect(cutoverLiberado([linha()])).toBe(true);
    expect(cutoverLiberado([linha(), linha({ valor_mensalidade: null })])).toBe(false);
    expect(cutoverLiberado([linha(), linha({ dia_vencimento: null })])).toBe(false);
    // Tipo e plano ausentes nao bloqueiam a CARGA nem o cutover do boleto:
    // quem decide o valor cobrado e o override, ja carimbado.
    expect(cutoverLiberado([linha({ plano_id: null, tipo_veiculo_id: null })])).toBe(true);
  });
});

describe('tiposPendentes', () => {
  const t = (o: Partial<TipoVeiculoExterno>): TipoVeiculoExterno => ({
    id_externo: '1', nome: 'CARRO', capturado: true, faturaveis: 10,
    destino_id: null, ...o,
  });

  it('so os sem de-para, com carteira, do mais pesado para o mais leve', () => {
    const r = tiposPendentes([
      t({ id_externo: '1', faturaveis: 10 }),
      t({ id_externo: '2', faturaveis: 90 }),
      t({ id_externo: '3', faturaveis: 50, destino_id: 'tv1' }),
      t({ id_externo: '4', faturaveis: 0 }),
    ]);
    expect(r.map((x) => x.id_externo)).toEqual(['2', '1']);
  });
});

// ---------------------------------------------------------------------------
// De-para do PLANO (0085)
// ---------------------------------------------------------------------------
const plano = (o: Partial<PlanoExterno>): PlanoExterno => ({
  id_externo: '48', nome: null, capturado: false, veiculos: 10, faturaveis: 10,
  cobertura_acumulada: null, mensalidade_mediana: null,
  fipe_min: null, fipe_max: null, tipos: null,
  destino_id: null, plano_nome: null, ...o,
});

describe('planosPendentes', () => {
  it('so os sem de-para, com carteira, do mais pesado para o mais leve', () => {
    const r = planosPendentes([
      plano({ id_externo: '41', faturaveis: 44 }),
      plano({ id_externo: '48', faturaveis: 114 }),
      plano({ id_externo: '88', faturaveis: 110, destino_id: 'p1' }),
      plano({ id_externo: '99', faturaveis: 0 }),
    ]);
    expect(r.map((x) => x.id_externo)).toEqual(['48', '41']);
  });
});

describe('idsPara90Pct', () => {
  it('conta quantos ids do topo bastam para cobrir 90% dos faturaveis', () => {
    // 90 + 5 + 3 + 2 = 100. O primeiro ja cobre 90%.
    expect(idsPara90Pct([
      plano({ id_externo: 'a', faturaveis: 90 }),
      plano({ id_externo: 'b', faturaveis: 5 }),
      plano({ id_externo: 'c', faturaveis: 3 }),
      plano({ id_externo: 'd', faturaveis: 2 }),
    ])).toBe(1);
  });

  it('nao depende da ordem em que a RPC devolveu', () => {
    const fora = [
      plano({ id_externo: 'd', faturaveis: 2 }),
      plano({ id_externo: 'a', faturaveis: 90 }),
      plano({ id_externo: 'c', faturaveis: 3 }),
      plano({ id_externo: 'b', faturaveis: 5 }),
    ];
    expect(idsPara90Pct(fora)).toBe(1);
  });

  it('carteira repartida miudo exige MAIS decisoes — e e esse o numero que decide', () => {
    // 10 ids de 10 cada: 9 cobrem 90%.
    const dez = Array.from({ length: 10 }, (_, i) =>
      plano({ id_externo: String(i), faturaveis: 10 }));
    expect(idsPara90Pct(dez)).toBe(9);
  });

  it('ignora os ids SEM carteira — eles nao sao decisao', () => {
    expect(idsPara90Pct([
      plano({ id_externo: 'a', faturaveis: 100 }),
      plano({ id_externo: 'b', faturaveis: 0 }),
      plano({ id_externo: 'c', faturaveis: 0 }),
    ])).toBe(1);
  });

  it('lista vazia (ou sem nenhum faturavel) e ZERO, nao divisao por zero', () => {
    expect(idsPara90Pct([])).toBe(0);
    expect(idsPara90Pct([plano({ faturaveis: 0 })])).toBe(0);
  });

  it('o alvo e parametro: 100% exige todos os ids com carteira', () => {
    const quatro = [
      plano({ id_externo: 'a', faturaveis: 90 }),
      plano({ id_externo: 'b', faturaveis: 5 }),
      plano({ id_externo: 'c', faturaveis: 3 }),
      plano({ id_externo: 'd', faturaveis: 2 }),
    ];
    expect(idsPara90Pct(quatro, 100)).toBe(4);
  });
});

describe('amplitudeFipe', () => {
  it('a faixa larga e o sinal de plano generico — foi o que desmentiu a hipotese de faixa de preco', () => {
    // O id 48 medido na base: de R$ 100 a R$ 111.140 de FIPE.
    expect(amplitudeFipe(plano({ fipe_min: 100, fipe_max: 111_140 }))).toBeCloseTo(1111.4, 1);
  });
  it('faixa estreita devolve numero pequeno', () => {
    expect(amplitudeFipe(plano({ fipe_min: 50_000, fipe_max: 60_000 }))).toBeCloseTo(1.2, 5);
  });
  it('sem dado nao inventa amplitude (e nao divide por zero)', () => {
    expect(amplitudeFipe(plano({ fipe_min: null, fipe_max: 100 }))).toBeNull();
    expect(amplitudeFipe(plano({ fipe_min: 100, fipe_max: null }))).toBeNull();
    expect(amplitudeFipe(plano({ fipe_min: 0, fipe_max: 100 }))).toBeNull();
  });
});

describe('ENTIDADES_MUTUAL — a allow-list do banco e a do cliente andam JUNTAS', () => {
  it('PLAN existe e termina com barra (a API e Django)', () => {
    expect(ENTIDADES_MUTUAL.PLAN.endsWith('/')).toBe(true);
    expect(urlMutual(BASE, 'PLAN')).toBe(`${BASE}/public_api/v2${ENTIDADES_MUTUAL.PLAN}`);
  });

  it('as 15 entidades da `chk_mutual_entidade` estao TODAS aqui', () => {
    // 🔴 Guarda contra o erro que a suite 0085 pegou no banco: redigitar uma
    // allow-list derruba em SILENCIO o que se esquecer (foi `CONTRACT`, que
    // guarda o dia de vencimento e a sales_team_id). Vale dos dois lados.
    const noBanco = [
      'CONTRACT_OBJECT', 'CONTRACT', 'PERSON', 'ADDRESS', 'INVOICE', 'EVENT',
      'REGIONAL', 'SALE_TEAM', 'CONSULTANT', 'PLAN',
      'VEHICLE_TYPE', 'VEHICLE_COLOR', 'VEHICLE_CATEGORY', 'VEHICLE_USE_TYPE', 'EVENT_TYPE',
    ];
    expect(Object.keys(ENTIDADES_MUTUAL).sort()).toEqual([...noBanco].sort());
  });
});

describe('mensagemDeFalhaDeLeitura — erro de leitura nunca vira estado vazio', () => {
  it('traduz o estouro do statement_timeout para algo que a pessoa possa fazer', () => {
    const m = mensagemDeFalhaDeLeitura(
      new Error('canceling statement due to statement timeout'));
    expect(m).toContain('tempo limite');
    // A mensagem tem de dizer que NAO e falta de dado: foi essa confusao que
    // fez a tela mandar "Puxe Equipes de vendas" com 52 equipes capturadas.
    expect(m).toContain('Nao e falta de dado');
    expect(m).toContain('uma por vez');
  });

  it('reconhece o codigo 57014 e a grafia curta', () => {
    expect(mensagemDeFalhaDeLeitura({ code: '57014', message: 'statement timeout' }))
      .toContain('tempo limite');
    expect(mensagemDeFalhaDeLeitura(new Error('57014'))).toContain('tempo limite');
  });

  it('separa falta de permissao de falta de migration', () => {
    expect(mensagemDeFalhaDeLeitura(new Error('Somente a equipe pode ler o diagnostico')))
      .toContain('so para a equipe');
    expect(mensagemDeFalhaDeLeitura(new Error('permission denied for function x')))
      .toContain('Sem permissao');
    expect(mensagemDeFalhaDeLeitura(
      new Error('Could not find the function public.mutual_x in the schema cache')))
      .toContain('falta rodar a migration');
  });

  it('erro desconhecido passa o texto do banco, nunca uma frase inventada', () => {
    expect(mensagemDeFalhaDeLeitura(new Error('deu pau no 42P01'))).toBe('deu pau no 42P01');
    expect(mensagemDeFalhaDeLeitura(null)).toContain('nao disse por que');
    expect(mensagemDeFalhaDeLeitura(undefined)).toContain('nao disse por que');
  });
});

describe('urlMutualCaminho — o provador de caminho', () => {
  it('mantem a barra final obrigatoria (Django APPEND_SLASH devolve 301 sem ela)', () => {
    expect(urlMutualCaminho('https://x.com', '/plan/'))
      .toBe('https://x.com/public_api/v2/plan/');
    expect(urlMutualCaminho('https://x.com', 'plan'))
      .toBe('https://x.com/public_api/v2/plan/');
    expect(urlMutualCaminho('https://x.com/', '//contract/plan'))
      .toBe('https://x.com/public_api/v2/contract/plan/');
  });

  it('monta a query sem deixar parametro vazio entrar', () => {
    expect(urlMutualCaminho('https://x.com', '/plan/', { page: 1, page_size: 1, nada: '' }))
      .toBe('https://x.com/public_api/v2/plan/?page=1&page_size=1');
  });

  it('e o mesmo resultado de urlMutual para uma entidade conhecida', () => {
    expect(urlMutualCaminho('https://x.com', ENTIDADES_MUTUAL.PERSON))
      .toBe(urlMutual('https://x.com', 'PERSON'));
  });
});

describe('caminhoQueRespondeu — 200 com zero registro CONTA como existir', () => {
  it('escolhe a primeira candidata 2xx, mesmo sem registro nenhum', () => {
    const r = caminhoQueRespondeu([
      { caminho: '/contract/plan/', http: 404, registros: null },
      { caminho: '/plan/', http: 200, registros: 0 },
      { caminho: '/association/plan/', http: 200, registros: 7 },
    ]);
    // Dominio vazio e um resultado legitimo ("existe e nao tem nada"); 404 e
    // "este caminho nao existe". Confundir os dois foi o erro da 0085.
    expect(r?.caminho).toBe('/plan/');
  });

  it('301 do APPEND_SLASH nao conta como achado', () => {
    expect(caminhoQueRespondeu([{ caminho: '/plan', http: 301, registros: null }])).toBeNull();
  });

  it('devolve null quando nenhuma respondeu', () => {
    expect(caminhoQueRespondeu([])).toBeNull();
    expect(caminhoQueRespondeu([
      { caminho: '/a/', http: 404, registros: null },
      { caminho: '/b/', http: null, registros: null, erro: 'timeout' },
    ])).toBeNull();
  });

  it('a lista de candidatas comeca pelo caminho do swagger, que e o da entidade', () => {
    // O provador tem de confirmar PRIMEIRO o caminho em uso — senao ele aceita
    // outro e a tela diz "use este" para um endpoint que a captura nao chama.
    expect(CANDIDATAS_PLANO[0]).toBe('/quotation/plan/');
    expect(CANDIDATAS_PLANO[0]).toBe(ENTIDADES_MUTUAL.PLAN);
    expect(new Set(CANDIDATAS_PLANO).size).toBe(CANDIDATAS_PLANO.length);
    for (const c of CANDIDATAS_PLANO) expect(c).toMatch(/^\/[\w/_-]*\/$/);
  });
});

describe('resumoDoCorpo — o motivo da recusa do Mutual', () => {
  it('erro de validacao do Django REST vira "campo: mensagem"', () => {
    expect(resumoDoCorpo('{"vehicle_type":["Este campo e obrigatorio."],"fipe_value":["Obrigatorio."]}'))
      .toBe('vehicle_type: Este campo e obrigatorio.; fipe_value: Obrigatorio.');
  });
  it('detail simples', () => {
    expect(resumoDoCorpo('{"detail":"Parametro invalido"}')).toBe('detail: Parametro invalido');
  });
  it('HTML vira texto puro e espaco nao se acumula', () => {
    expect(resumoDoCorpo('<html><body><h1>Bad   Request</h1>\n<p>(400)</p></body></html>'))
      .toBe('Bad Request (400)');
  });
  it('vazio e vazio; longo e truncado', () => {
    expect(resumoDoCorpo('')).toBe('');
    const r = resumoDoCorpo('x'.repeat(1000), 50);
    expect(r).toHaveLength(50);
    expect(r.endsWith('…')).toBe(true);
  });
});

describe('parametrosDoSwagger — o que o contrato declara para o GET', () => {
  const swagger = {
    basePath: '/public_api/v2',
    paths: {
      '/quotation/plan/': {
        parameters: [{ name: 'page', in: 'query', type: 'integer' }],
        get: { parameters: [
          { name: 'vehicle_type', in: 'query', required: true, type: 'integer', description: 'tipo' },
          { name: 'page_size', in: 'query', type: 'integer' },
        ] },
      },
      '/vehicle/type/': { get: {} },
    },
  };
  it('junta os do caminho com os da operacao e marca o obrigatorio', () => {
    const p = parametrosDoSwagger(swagger, '/quotation/plan/');
    expect(p?.map((x) => x.nome)).toEqual(['page', 'vehicle_type', 'page_size']);
    expect(p?.find((x) => x.nome === 'vehicle_type')).toMatchObject({ obrigatorio: true, tipo: 'integer', em: 'query' });
    expect(p?.find((x) => x.nome === 'page')?.obrigatorio).toBe(false);
  });
  it('casa com ou sem barra e com o basePath na chave', () => {
    expect(parametrosDoSwagger(swagger, 'quotation/plan')).not.toBeNull();
    const comBase = { basePath: '/public_api/v2', paths: { '/public_api/v2/quotation/plan/': { get: {} } } };
    expect(parametrosDoSwagger(comBase, '/quotation/plan/')).toEqual([]);
  });
  it('caminho fora do contrato e null; caminho sem parametro e []', () => {
    expect(parametrosDoSwagger(swagger, '/plan/')).toBeNull();
    expect(parametrosDoSwagger(swagger, '/vehicle/type/')).toEqual([]);
    expect(parametrosDoSwagger(null, '/x/')).toBeNull();
  });
});

describe('swagger: caminhos de plano e o detalhe por id', () => {
  const sw = { basePath: '/public_api/v2', paths: {
    '/public_api/v2/quotation/plan/': { get: {} },
    '/public_api/v2/quotation/plan/{id}/': { get: {}, parameters: [] },
    '/public_api/v2/contract/contract_object/': { get: {} },
    '/public_api/v2/quotation/plan_product/': { get: {}, post: {} },
  } };
  it('lista so os caminhos que contem o filtro, sem o basePath', () => {
    expect(caminhosDoSwagger(sw, 'plan').map((x) => x.caminho)).toEqual(
      ['/quotation/plan/', '/quotation/plan/{id}/', '/quotation/plan_product/']);
    expect(caminhosDoSwagger(sw, 'plan')[2].metodos).toEqual(['get', 'post']);
    expect(caminhosDoSwagger(null, 'plan')).toEqual([]);
  });
  it('acha o detalhe declarado e nao inventa quando nao ha', () => {
    expect(caminhoDeDetalhe(sw, '/quotation/plan/')).toBe('/quotation/plan/{id}/');
    expect(caminhoDeDetalhe(sw, '/contract/contract_object/')).toBeNull();
    expect(caminhoComId('/quotation/plan/{id}/', '48')).toBe('/quotation/plan/48/');
  });
});

describe('captura de planos por veiculo (/quotation/plan/ exige vehicle_id)', () => {
  it('um veiculo por plano, mais pesado primeiro, preferindo ATIVO e o mais recente', () => {
    const r = veiculosPorPlano([
      { plan_id: '41', vehicle_id: '7', status: 'INATIVO' },
      { plan_id: '48', vehicle_id: '10', status: 'INATIVO' },
      { plan_id: '48', vehicle_id: '9', status: 'ATIVO' },
      { plan_id: '48', vehicle_id: '3', status: 'ATIVO' },
      { plan_id: '41', vehicle_id: '12', status: 'INATIVO' },
      { plan_id: '9', vehicle_id: '2', status: 'ATIVO' },
      { plan_id: '9', vehicle_id: null, status: 'ATIVO' },
      { plan_id: '', vehicle_id: '5', status: 'ATIVO' },
      { plan_id: '77', vehicle_id: null, status: null },
    ]);
    expect(r).toEqual([
      { plan_id: '48', vehicle_id: '9', peso: 3, reservas: ['3', '10'] }, // ativo vence o id maior inativo
      { plan_id: '9', vehicle_id: '2', peso: 2, reservas: [] },   // empate de peso: id numerico (9 < 41)
      { plan_id: '41', vehicle_id: '12', peso: 2, reservas: ['7'] }, // sem ativo: o mais recente
    ]);                                              // 77 sem veiculo fica de fora
  });

  it('listaDePlanos aceita lista, envelope DRF, outra chave e objeto unico', () => {
    expect(listaDePlanos([{ id: 1 }])).toEqual([{ id: 1 }]);
    expect(listaDePlanos({ results: [{ id: 2 }] })).toEqual([{ id: 2 }]);
    expect(listaDePlanos({ total: 1, plans: [{ id: 3 }] })).toEqual([{ id: 3 }]);
    expect(listaDePlanos({ id: 4, name: 'OURO' })).toEqual([{ id: 4, name: 'OURO' }]);
    expect(listaDePlanos({ detail: 'nada' })).toEqual([]);
    expect(listaDePlanos(null)).toEqual([]);
  });

  it('somarDiagnosticoPlanos acumula blocos sem perder o primeiro formato visto', () => {
    const a = { planos_nos_contratos: 109, ja_capturados: 0, consultados: 15, recebidos: 30,
      sem_id: 0, chaves: ['id', 'name'], recusas: [{ vehicle_id: '1', http: 400, detalhe: 'x' }] };
    const b = { ...a, ja_capturados: 20, consultados: 3, recebidos: 6, chaves: ['outra'], recusas: [] };
    const s = somarDiagnosticoPlanos(somarDiagnosticoPlanos(undefined, a), b);
    expect(s).toMatchObject({ planos_nos_contratos: 109, ja_capturados: 20, consultados: 18,
      recebidos: 36, chaves: ['id', 'name'] });
    expect(s.recusas).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 0087 — de-para por CATEGORIA
// ---------------------------------------------------------------------------
const cat = (o: Partial<CategoriaExterna> & { chave: string }): CategoriaExterna => ({
  categoria_nome: null, tipo_mutual: 'CARRO', faturaveis: 0, veiculos: 0,
  destino_id: null, reserva_id: null, ...o,
});

describe('chaveCategoria (espelho de mutual_chave_categoria)', () => {
  it('e o PAR categoria/tipo — PASSEIO carro e PASSEIO moto sao duas chaves', () => {
    expect(chaveCategoria('26', '1')).toBe('26/1');
    expect(chaveCategoria('26', '2')).toBe('26/2');
  });
  it('tipo vazio vira ? e categoria vazia nao tem chave', () => {
    expect(chaveCategoria(' 26 ', '')).toBe('26/?');
    expect(chaveCategoria('', '1')).toBeNull();
    expect(chaveCategoria(null, '1')).toBeNull();
  });
});

describe('tipoEfetivoDaCategoria', () => {
  it('a categoria manda, o tipo e reserva, sem os dois e nulo', () => {
    expect(tipoEfetivoDaCategoria({ destino_id: 'pickup', reserva_id: 'passeio' })).toBe('pickup');
    expect(tipoEfetivoDaCategoria({ destino_id: null, reserva_id: 'passeio' })).toBe('passeio');
    expect(tipoEfetivoDaCategoria({ destino_id: null, reserva_id: null })).toBeNull();
  });
});

describe('categoriasSemTipo', () => {
  it('so conta quem entraria SEM tipo e tem carteira — reserva nao e pendencia', () => {
    const r = categoriasSemTipo([
      cat({ chave: '21/1', faturaveis: 200, reserva_id: 'passeio' }),
      cat({ chave: '5/3', faturaveis: 4 }),
      cat({ chave: '33/3', faturaveis: 9 }),
      cat({ chave: '99/1', faturaveis: 0 }),
      cat({ chave: '24/1', faturaveis: 30, destino_id: 'pickup' }),
    ]);
    expect(r.map((c) => c.chave)).toEqual(['33/3', '5/3']);
  });
});

describe('agruparCategoriasPorTipo', () => {
  it('agrupa pelo tipo do Mutual, grupos e itens pelo peso', () => {
    const g = agruparCategoriasPorTipo([
      cat({ chave: '5/3', tipo_mutual: 'CAMINHAO', faturaveis: 4 }),
      cat({ chave: '21/1', faturaveis: 206 }),
      cat({ chave: '8/2', tipo_mutual: 'MOTO', faturaveis: 63 }),
      cat({ chave: '24/1', faturaveis: 29 }),
      cat({ chave: '26/2', tipo_mutual: 'MOTO', faturaveis: 10 }),
      cat({ chave: '7/?', tipo_mutual: null, faturaveis: 1 }),
    ]);
    expect(g.map((x) => x.tipo)).toEqual(['CARRO', 'MOTO', 'CAMINHAO', 'SEM TIPO NO MUTUAL']);
    expect(g[0].faturaveis).toBe(235);
    expect(g[0].itens.map((i) => i.chave)).toEqual(['21/1', '24/1']);
    expect(g[1].itens.map((i) => i.chave)).toEqual(['8/2', '26/2']);
  });
});

describe('cotaDaCategoria', () => {
  it('le a cota do nome pelo parser da 0016', () => {
    expect(cotaDaCategoria('V5 / automóvel comum')).toEqual({ codigo: 'V5', especial: false });
    expect(cotaDaCategoria('Especial v10 pickups/vans/utilitários')).toEqual({ codigo: 'V10', especial: true });
    expect(cotaDaCategoria('ESPECIAL V15 PICKUPS/VANS/UTILITáRIOS')).toEqual({ codigo: 'V15', especial: true });
  });
  it('categoria sem V-numero nao inventa cota', () => {
    expect(cotaDaCategoria('PASSEIO')).toBeNull();
    expect(cotaDaCategoria('Caminhão Leve')).toBeNull();
    expect(cotaDaCategoria(null)).toBeNull();
  });
});
