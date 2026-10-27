import { describe, expect, it } from 'vitest';
import {
  codigoPai, compararCodigos, contaDuplicada, contasParaLancamento, indicadoresDre, ladoDoSaldo,
  montarBalancete, montarDreGerencial, montarFluxoEvolutivo, naturezaDe, naturezaPorCodigo,
  profundidade, validarConta, type ContaPlano,
} from './plano-contas';

let seq = 0;
const conta = (codigo: string, nome: string, extra: Partial<ContaPlano> = {}): ContaPlano => ({
  id: `c${++seq}`, codigo_estruturado: codigo, nome, ativo: true,
  analitica: codigo.split('.').length === 4, natureza: naturezaPorCodigo(codigo), ...extra,
});

const PLANO: ContaPlano[] = [
  conta('1', 'ATIVO'), conta('1.1', 'ATIVO CIRCULANTE'), conta('1.1.1', 'Disponibilidades'),
  conta('1.1.1.02', 'Banco', { automatica: true }), conta('1.2.1', 'Imobilizado'), conta('1.2.1.01', 'Equipamentos de TI'),
  conta('2', 'PASSIVO E PL'), conta('2.1.1.01', 'Fornecedores a Pagar', { automatica: true }),
  conta('3', 'RECEITAS'), conta('3.1', 'RECEITA OPERACIONAL BRUTA'),
  conta('3.1.1', 'Receita com Serviços / Mensalidades'), conta('3.1.1.01', 'Recebimentos Mensalidade'),
  conta('3.1.2', 'Receita com Vendas de Produtos'), conta('3.1.2.01', 'Venda de Mercadorias'),
  conta('3.2', 'DEDUÇÕES'), conta('3.2.1.01', 'Impostos sobre Vendas'),
  conta('4', 'CUSTOS E DESPESAS'), conta('4.1', 'CUSTOS OPERACIONAIS'), conta('4.1.1.01', 'CMV'),
  conta('4.2', 'DESPESAS OPERACIONAIS'), conta('4.2.1', 'Despesas Administrativas'),
  conta('4.2.1.01', 'Aluguel e Condomínio'), conta('4.2.2', 'Despesas com Pessoal'), conta('4.2.2.02', 'Salários'),
  conta('4.3', 'RESULTADO FINANCEIRO'), conta('4.3.1.01', 'Receitas Financeiras'), conta('4.3.2.01', 'Despesas Financeiras'),
];

describe('plano de contas', () => {
  it('natureza pelo codigo (espelho do SQL)', () => {
    expect(naturezaPorCodigo('1.2.1.01')).toBe('ATIVO');
    expect(naturezaPorCodigo('2.2.1.01')).toBe('PATRIMONIO_LIQUIDO');
    expect(naturezaPorCodigo('2.1.3.01')).toBe('PASSIVO');
    expect(naturezaPorCodigo('3.2.1.01')).toBe('DEDUCAO');
    expect(naturezaPorCodigo('3.1')).toBe('RECEITA');
    expect(naturezaPorCodigo('4.1.4.02')).toBe('CUSTO');
    expect(naturezaPorCodigo('4.3')).toBe('RESULTADO_FINANCEIRO');
    expect(naturezaPorCodigo('4.3.1.01')).toBe('RECEITA_FINANCEIRA');
    expect(naturezaPorCodigo('4.3.2.01')).toBe('DESPESA_FINANCEIRA');
    expect(naturezaPorCodigo('4.2.1.01')).toBe('DESPESA');
    expect(naturezaPorCodigo('9.1')).toBeNull();
  });

  it('codigo antigo (x.y.zz) segue o tipo, nao o primeiro digito', () => {
    expect(naturezaDe({ codigo_estruturado: '1.9.01', tipo: 'RECEITA' })).toBe('RECEITA');
    expect(naturezaDe({ codigo_estruturado: '3.1.09', tipo: 'CUSTO_VARIAVEL' })).toBe('CUSTO');
  });

  it('ordena por segmento numerico e acha a mae pelo prefixo', () => {
    expect(compararCodigos('1.10', '1.9')).toBeGreaterThan(0);
    const cods = PLANO.map((c) => c.codigo_estruturado);
    expect(codigoPai('4.2.1.01', cods)).toBe('4.2.1');
    expect(codigoPai('3.2.1.01', cods)).toBe('3.2'); // nao existe 3.2.1
    expect(codigoPai('4', cods)).toBeNull();
    expect(profundidade('4.2.1.01', cods)).toBe(3);
  });

  it('duplicidade por codigo ou pela descricao exata (sem acento/caixa)', () => {
    expect(contaDuplicada({ codigo_estruturado: '4.2.1.01', nome: 'x' }, PLANO)?.motivo).toBe('codigo');
    const d = contaDuplicada({ codigo_estruturado: '4.2.1.50', nome: '  ALUGUEL  e condominio ' }, PLANO);
    expect(d?.motivo).toBe('descricao');
    expect(d?.conta.codigo_estruturado).toBe('4.2.1.01');
    const propria = PLANO.find((c) => c.codigo_estruturado === '4.2.1.01')!;
    expect(contaDuplicada({ id: propria.id, codigo_estruturado: '4.2.1.01', nome: propria.nome }, PLANO)).toBeNull();
    expect(validarConta({ codigo_estruturado: '4.2.x', nome: 'a' }, PLANO)).toMatch(/inválido/);
    expect(validarConta({ codigo_estruturado: '4.2.1.08', nome: 'Seguros' }, PLANO)).toBeNull();
  });

  it('lancamento so em analitica, ativa e nao automatica, do lado certo', () => {
    const rec = contasParaLancamento(PLANO, 'RECEITA').map((c) => c.codigo_estruturado);
    expect(rec).toContain('3.1.1.01');
    expect(rec).toContain('4.3.1.01');
    expect(rec).not.toContain('3.1'); // sintetica
    expect(rec).not.toContain('1.1.1.02'); // automatica
    expect(rec).not.toContain('4.2.1.01');
    const desp = contasParaLancamento(PLANO, 'DESPESA').map((c) => c.codigo_estruturado);
    expect(desp).toContain('4.2.1.01');
    expect(desp).toContain('3.2.1.01');
    expect(desp.indexOf('1.2.1.01')).toBeGreaterThan(desp.indexOf('4.2.1.01')); // balanco depois
  });
});

describe('DRE gerencial', () => {
  const linhas = [
    { categoria_codigo: '3.1.1.01', categoria_nome: 'Mens', total: 110000 },
    { categoria_codigo: '3.1.2.01', categoria_nome: 'Vendas', total: 40000 },
    { categoria_codigo: '3.2.1.01', categoria_nome: 'DAS', total: -9000 },
    { categoria_codigo: '4.1.1.01', categoria_nome: 'CMV', total: -35000 },
    { categoria_codigo: '4.2.1.01', categoria_nome: 'Aluguel', total: -18000 },
    { categoria_codigo: '4.2.2.02', categoria_nome: 'Sal', total: -20000 },
    { categoria_codigo: '4.3.1.01', categoria_nome: 'RF', total: 500 },
    { categoria_codigo: '4.3.2.01', categoria_nome: 'DF', total: -2000 },
    { categoria_codigo: '1.2.1.01', categoria_nome: 'TI', total: -3000 }, // balanco: fica fora
  ];

  it('reproduz o modelo da planilha', () => {
    const dre = montarDreGerencial(PLANO, linhas);
    const v = (k: string) => dre.find((l) => l.chave === k)?.valor;
    expect(v('receita')).toBe(150000);
    expect(v('receita:3.1.1')).toBe(110000);
    expect(v('receita:3.1.2')).toBe(40000);
    expect(v('deducoes')).toBe(-9000);
    expect(v('receita_liquida')).toBe(141000);
    expect(v('custos')).toBe(-35000);
    expect(v('lucro_bruto')).toBe(106000);
    expect(v('despesas')).toBe(-38000);
    expect(v('resultado_operacional')).toBe(68000);
    expect(v('financeiro')).toBe(-1500);
    expect(v('lucro_liquido')).toBe(66500);
    expect(dre.find((l) => l.chave === 'deducoes')?.percentual).toBe(-6);
    expect(dre.some((l) => l.codigo === '1.2.1.01')).toBe(false);
    const ind = indicadoresDre(dre);
    expect(ind.lucroLiquido).toBe(66500);
    expect(ind.margemBruta).toBeCloseTo(70.67, 2);
  });

  it('codigo fora do plano cai pelo grupo antigo; comparativo por conta', () => {
    const dre = montarDreGerencial(PLANO,
      [{ categoria_codigo: '1.9.77', categoria_nome: 'Receita velha', grupo: 'RECEITA', total: 10 }],
      [{ categoria_codigo: '1.9.77', categoria_nome: 'Receita velha', grupo: 'RECEITA', total: 5 }]);
    const linha = dre.find((l) => l.codigo === '1.9.77');
    expect(linha?.valor).toBe(10);
    expect(linha?.anterior).toBe(5);
    expect(dre.find((l) => l.chave === 'lucro_liquido')?.anterior).toBe(5);
  });
});

describe('balancete', () => {
  it('soma as sinteticas pelo prefixo e mostra os totais', () => {
    const { linhas, totais } = montarBalancete(PLANO, [
      { codigo: '1.1.1.02', saldo_anterior: 1000, debitos: 500, creditos: 800, saldo_final: 700 },
      { codigo: '3.1.1.01', saldo_anterior: 0, debitos: 0, creditos: 500, saldo_final: -500 },
      { codigo: '4.2.1.01', saldo_anterior: 0, debitos: 600, creditos: 0, saldo_final: 600 },
      { codigo: '2.2.2.01', saldo_anterior: -1000, debitos: 0, creditos: 0, saldo_final: -1000 },
      { codigo: '2.1.1.01', saldo_anterior: 0, debitos: 600, creditos: 0, saldo_final: 0 },
    ]);
    expect(linhas.find((l) => l.codigo === '1')?.saldoFinal).toBe(700);
    expect(linhas.find((l) => l.codigo === '4.2')?.debitos).toBe(600);
    const fora = linhas.find((l) => l.codigo === '2.2.2.01');
    expect(fora?.foraDoPlano).toBe(true);
    expect(linhas.some((l) => l.codigo === '4.3')).toBe(false); // zerada sai
    expect(totais.debitos).toBe(1700);
    expect(totais.creditos).toBe(1300);
    expect(totais.devedor).toBe(1300);
    expect(totais.credor).toBe(1500);
    expect(ladoDoSaldo(-1)).toBe('C');
    expect(ladoDoSaldo(2)).toBe('D');
  });
});

describe('fluxo de caixa evolutivo', () => {
  it('saldo por classe no inicio de cada dia, entradas, saidas e saldo final', () => {
    const { dias, linhas } = montarFluxoEvolutivo({
      contas: [
        { id: 'b', nome: 'BANCO', classe: 'CONTA_CORRENTE', saldo_inicial: 1000, saldo_inicial_em: '2026-05-31', movimento_antes: 0 },
        { id: 'i', nome: 'APLIC', classe: 'INVESTIMENTO', saldo_inicial: 0, saldo_inicial_em: null, movimento_antes: 50 },
        { id: 'n', nome: 'NOVA', classe: 'OUTROS', saldo_inicial: 300, saldo_inicial_em: '2026-06-01', movimento_antes: 0 },
      ],
      por_conta: [
        { dia: '2026-06-01', conta_id: 'b', valor: 500 },
        { dia: '2026-06-02', conta_id: 'b', valor: -800 },
        { dia: '2026-06-02', conta_id: 'i', valor: 200 },
      ],
      por_categoria: [
        { dia: '2026-06-01', codigo: '3.1.1.01', nome: 'Mensalidade', entrada: 500, saida: 0 },
        { dia: '2026-06-02', codigo: '4.2.1.01', nome: 'Aluguel', entrada: 0, saida: 600 },
      ],
    }, '2026-06-01', '2026-06-03');
    expect(dias).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    const l = (k: string) => linhas.find((x) => x.chave === k)!;
    expect(l('saldo:CONTA_CORRENTE').valores).toEqual([1000, 1500, 700]);
    expect(l('saldo:INVESTIMENTO').valores).toEqual([50, 50, 250]);
    expect(l('saldo:OUTROS').valores).toEqual([0, 300, 300]); // implantada no fim de 01/06
    // cada conta bancaria logo abaixo da sua classe (0153)
    const iCc = linhas.findIndex((x) => x.chave === 'saldo:CONTA_CORRENTE');
    expect(linhas[iCc + 1]).toMatchObject({ chave: 'conta:b', rotulo: 'BANCO', tipo: 'conta' });
    expect(l('conta:b').valores).toEqual([1000, 1500, 700]);
    expect(l('conta:n').valores).toEqual([0, 300, 300]);
    expect(l('totais_saldos').valores).toEqual([1050, 1850, 1250]);
    expect(l('entrada:3.1.1.01').total).toBe(500);
    expect(l('saida:4.2.1.01').valores).toEqual([0, -600, 0]);
    expect(l('totais_saidas').total).toBe(-600);
    expect(l('resultado_acumulado').valores).toEqual([500, -100, -100]);
    expect(l('saldo_final').valores).toEqual([1550, 1250, 1250]);
  });
});
