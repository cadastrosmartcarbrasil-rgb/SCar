import { describe, it, expect } from 'vitest';
import {
  ESTEIRA,
  STATUS_LEAD,
  COLUNAS_KANBAN,
  proximoStatus,
  colunaDoLead,
  podeArrastar,
  podeSoltarEm,
  exigeMotivo,
  podeEditarCotacao,
  idsObrigatorios,
  selecaoValida,
  removeuObrigatorio,
  calcularDesconto,
  acoesDoLead,
  camposGravaveisDoLead,
  filtroBuscaLeads,
  leadCasaComBusca,
} from './crm';
import type { CotacaoItem, StatusLead } from '@/lib/database.types';

describe('esteira do CRM', () => {
  it('inclui Em Negociacao entre Proposta e Aprovado', () => {
    expect(ESTEIRA.indexOf('EM_NEGOCIACAO')).toBe(ESTEIRA.indexOf('PROPOSTA_ENVIADA') + 1);
    expect(proximoStatus('PROPOSTA_ENVIADA')).toBe('EM_NEGOCIACAO');
    expect(proximoStatus('EM_NEGOCIACAO')).toBe('APROVADO');
    expect(proximoStatus('ATIVO')).toBeNull();
  });
  it('todo status tem rotulo', () => {
    (['NOVO', 'ORCAMENTO_GERADO', 'PROPOSTA_ENVIADA', 'EM_NEGOCIACAO', 'APROVADO', 'EM_AUDITORIA', 'ATIVO', 'PERDIDO'] as StatusLead[])
      .forEach((s) => expect(STATUS_LEAD[s].label.length).toBeGreaterThan(0));
  });
});

describe('colunas do Kanban', () => {
  it('tem as 6 fases pedidas, na ordem do funil', () => {
    expect(COLUNAS_KANBAN.map((c) => c.id)).toEqual([
      'NOVO', 'ORCAMENTO_GERADO', 'PROPOSTA_ENVIADA', 'EM_NEGOCIACAO', 'APROVADO', 'PERDIDO',
    ]);
  });

  it('auditoria e ativo aparecem na coluna Aprovado', () => {
    expect(colunaDoLead('EM_AUDITORIA')).toBe('APROVADO');
    expect(colunaDoLead('ATIVO')).toBe('APROVADO');
    expect(colunaDoLead('EM_NEGOCIACAO')).toBe('EM_NEGOCIACAO');
  });

  it('card em auditoria/ativo nao pode ser arrastado', () => {
    expect(podeArrastar('EM_NEGOCIACAO')).toBe(true);
    expect(podeArrastar('EM_AUDITORIA')).toBe(false);
    expect(podeArrastar('ATIVO')).toBe(false);
  });

  it('soltar na propria coluna e no-op', () => {
    expect(podeSoltarEm('NOVO', 'NOVO')).toBe(false);
    expect(podeSoltarEm('NOVO', 'EM_NEGOCIACAO')).toBe(true);
    expect(podeSoltarEm('EM_AUDITORIA', 'NOVO')).toBe(false);
  });

  it('perder exige motivo', () => {
    expect(exigeMotivo('PERDIDO')).toBe(true);
    expect(exigeMotivo('EM_NEGOCIACAO')).toBe(false);
  });
});

describe('edicao da cotacao', () => {
  const itens: CotacaoItem[] = [
    { produto_id: 'p1', nome: 'Protecao Casco', valor: 90, obrigatorio: true },
    { produto_id: 'p2', nome: 'Taxa Administrativa', valor: 30, obrigatorio: true },
    { produto_id: 'p3', nome: 'Carro Reserva 10d', valor: 25, obrigatorio: false },
  ];

  it('so libera edicao antes da auditoria', () => {
    expect(podeEditarCotacao('NOVO')).toBe(true);
    expect(podeEditarCotacao('EM_NEGOCIACAO')).toBe(true);
    expect(podeEditarCotacao('APROVADO')).toBe(false);
    expect(podeEditarCotacao('EM_AUDITORIA')).toBe(false);
    expect(podeEditarCotacao('ATIVO')).toBe(false);
  });

  it('identifica os itens obrigatorios do plano', () => {
    expect(idsObrigatorios(itens)).toEqual(['p1', 'p2']);
  });

  it('a selecao sempre recompoe os obrigatorios', () => {
    expect(selecaoValida(['p3'], ['p1', 'p2']).sort()).toEqual(['p1', 'p2', 'p3']);
    // nao duplica quando o opcional ja veio junto
    expect(selecaoValida(['p1', 'p3'], ['p1', 'p2']).sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('detecta tentativa de remover obrigatorio', () => {
    expect(removeuObrigatorio(['p3'], ['p1', 'p2'])).toBe(true);
    expect(removeuObrigatorio(['p1', 'p2', 'p3'], ['p1', 'p2'])).toBe(false);
  });
});

describe('politica de desconto por regional', () => {
  it('dentro do limite nao exige aprovacao', () => {
    const r = calcularDesconto(200, 500, 5, 5);
    expect(r.dentroDoLimite).toBe(true);
    expect(r.exigeAprovacao).toBe(false);
    expect(r.descontoMensalidade).toBe(10);
    expect(r.mensalidadeFinal).toBe(190);
    expect(r.descontoAdesao).toBe(25);
    expect(r.adesaoFinal).toBe(475);
  });

  it('acima do limite exige alcada do gestor', () => {
    const r = calcularDesconto(200, 500, 12, 5);
    expect(r.exigeAprovacao).toBe(true);
    expect(r.mensalidadeFinal).toBe(176);
  });

  it('regional sem parametro nao aceita desconto nenhum', () => {
    expect(calcularDesconto(200, 0, 1, 0).exigeAprovacao).toBe(true);
    expect(calcularDesconto(200, 0, 0, 0).exigeAprovacao).toBe(false);
  });

  it('normaliza percentuais fora da faixa e arredonda em centavos', () => {
    expect(calcularDesconto(200, 0, -5, 10).percentual).toBe(0);
    expect(calcularDesconto(200, 0, 150, 10).percentual).toBe(100);
    expect(calcularDesconto(199.99, 0, 7.5, 10).descontoMensalidade).toBe(15);
  });
});

describe('acoesDoLead', () => {
  const destinos = (s: Parameters<typeof acoesDoLead>[0]) => acoesDoLead(s).map((a) => a.destino);

  it('oferece um caminho so: avancar, voltar e perder', () => {
    expect(destinos('PROPOSTA_ENVIADA')).toEqual(['EM_NEGOCIACAO', 'ORCAMENTO_GERADO', 'PERDIDO']);
  });

  it('alcanca Em Negociacao pela ficha (antes so existia arrastando)', () => {
    expect(destinos('PROPOSTA_ENVIADA')).toContain('EM_NEGOCIACAO');
  });

  it('nao oferece duas acoes para o mesmo destino', () => {
    (['NOVO', 'ORCAMENTO_GERADO', 'PROPOSTA_ENVIADA', 'EM_NEGOCIACAO', 'APROVADO'] as const)
      .forEach((s) => {
        const d = destinos(s);
        expect(new Set(d).size).toBe(d.length);
      });
  });

  it('lead novo nao tem para onde voltar', () => {
    expect(destinos('NOVO')).toEqual(['ORCAMENTO_GERADO', 'PERDIDO']);
  });

  it('para em Aprovado — quem passa disso e a Auditoria', () => {
    expect(destinos('APROVADO')).toEqual(['EM_NEGOCIACAO', 'PERDIDO']);
  });

  it('nada a fazer em auditoria ou na base ativa', () => {
    expect(acoesDoLead('EM_AUDITORIA')).toEqual([]);
    expect(acoesDoLead('ATIVO')).toEqual([]);
  });

  it('lead perdido so reabre', () => {
    expect(acoesDoLead('PERDIDO')).toEqual([
      { destino: 'NOVO', rotulo: 'Reabrir lead', intencao: 'reabrir' },
    ]);
  });

  it('so oferece destino que o banco aceita no funil', () => {
    const validos = ['NOVO', 'ORCAMENTO_GERADO', 'PROPOSTA_ENVIADA', 'EM_NEGOCIACAO', 'APROVADO', 'PERDIDO'];
    (['NOVO', 'ORCAMENTO_GERADO', 'PROPOSTA_ENVIADA', 'EM_NEGOCIACAO', 'APROVADO', 'PERDIDO'] as const)
      .forEach((s) => acoesDoLead(s).forEach((a) => expect(validos).toContain(a.destino)));
  });
});

describe('filtroBuscaLeads', () => {
  it('ignora termo curto demais — nao vale consultar', () => {
    expect(filtroBuscaLeads('')).toBeNull();
    expect(filtroBuscaLeads('j')).toBeNull();
    expect(filtroBuscaLeads('  ')).toBeNull();
  });

  it('busca nome, marca e modelo numa coluna so (0079)', () => {
    const f = filtroBuscaLeads('silva') ?? '';
    expect(f).toContain('busca_texto.ilike.*silva*');
    // nao sobra nenhuma condicao contra a coluna CRUA — era ela que trazia o
    // acento de volta
    expect(f).not.toContain('nome.ilike');
    expect(f).not.toContain('modelo.ilike');
  });

  it('🔴 O ACENTO DEIXA DE IMPORTAR: o termo chega ao banco normalizado', () => {
    // era o defeito: "JOÃO" ia cru para o `ilike` e nao achava "JOAO"
    expect(filtroBuscaLeads('JOÃO') ?? '').toContain('busca_texto.ilike.*joao*');
    expect(filtroBuscaLeads('conceição') ?? '').toContain('busca_texto.ilike.*conceicao*');
    // e as duas grafias produzem o MESMO filtro — que e o ponto
    expect(filtroBuscaLeads('JOÃO')).toBe(filtroBuscaLeads('joao'));
  });

  it('procura CPF e celular pelos digitos, com ou sem mascara', () => {
    const f = filtroBuscaLeads('111.444.777-35') ?? '';
    expect(f).toContain('busca_digitos.ilike.*11144477735*');
    // a coluna gerada ja e so digito, entao uma condicao responde pelos dois
    // campos — e acha tambem o lead gravado com mascara pelo <FechamentoVenda>
    expect(f).not.toContain('cpf_cnpj.ilike');
    expect(f).not.toContain('celular.ilike');
  });

  it('procura placa, com e sem separador', () => {
    expect(filtroBuscaLeads('ABC1D23') ?? '').toContain('busca_texto.ilike.*abc1d23*');
    // digitada com hifen, a forma alfanumerica entra como alternativa
    const f = filtroBuscaLeads('ABC-1D23') ?? '';
    expect(f).toContain('busca_texto.ilike.*abc1d23*');
  });

  it('nao repete a condicao quando o alfanumerico e igual ao termo', () => {
    const f = filtroBuscaLeads('silva') ?? '';
    expect(f.split(',').length).toBe(1);
  });

  it('neutraliza o que quebraria o filtro do PostgREST', () => {
    const f = filtroBuscaLeads('joao,(x)"') ?? '';
    // parenteses, aspas e a virgula do TERMO nao podem sobrar no filtro
    expect(f).not.toMatch(/[()"]/);
    expect(f).toContain('busca_texto.ilike.*joao x*');
    // so as virgulas SEPARADORAS sobram: aqui, texto + alfanumerico
    expect(f.split(',').length).toBe(2);
  });
});

describe('camposGravaveisDoLead — o que o banco mantem sozinho', () => {
  // Regressao: as colunas GERADAS da 0079 voltam no `select('*')` e o
  // <FechamentoVenda> reenvia a ficha inteira. Se elas passarem, o Postgres
  // recusa o update e o botao "Salvar ficha" quebra em producao.
  const fichaLida = {
    nome: 'JOÃO DA SILVA', celular: '65999998888', placa: 'ABC1D23',
    busca_texto: 'joao da silva abc1d23', busca_digitos: '65999998888',
    created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-20T00:00:00Z',
  };

  it('tira as colunas geradas e os carimbos de tempo', () => {
    const p = camposGravaveisDoLead(fichaLida) as Record<string, unknown>;
    expect('busca_texto' in p).toBe(false);
    expect('busca_digitos' in p).toBe(false);
    expect('created_at' in p).toBe(false);
    expect('updated_at' in p).toBe(false);
  });

  it('preserva TODO o resto, inclusive valor nulo', () => {
    const p = camposGravaveisDoLead({ ...fichaLida, cpf_cnpj: null }) as Record<string, unknown>;
    expect(p.nome).toBe('JOÃO DA SILVA');
    expect(p.placa).toBe('ABC1D23');
    // nulo e uma gravacao legitima ("apagar o campo"), nao ausencia
    expect('cpf_cnpj' in p).toBe(true);
    expect(p.cpf_cnpj).toBeNull();
  });

  it('nao muta o objeto recebido', () => {
    const copia = { ...fichaLida };
    camposGravaveisDoLead(copia);
    expect(copia.busca_texto).toBe('joao da silva abc1d23');
  });
});

describe('leadCasaComBusca', () => {
  const lead = {
    nome: 'JOÃO DA SILVA', celular: '11988887777', cpf_cnpj: '11144477735',
    placa: 'ABC1D23', marca: 'FIAT', modelo: 'ARGO',
  };

  it('casa por nome ignorando acento e caixa', () => {
    expect(leadCasaComBusca(lead, 'joao')).toBe(true);
    expect(leadCasaComBusca(lead, 'SILVA')).toBe(true);
  });

  it('casa por placa, marca e modelo', () => {
    expect(leadCasaComBusca(lead, 'abc1d23')).toBe(true);
    expect(leadCasaComBusca(lead, 'argo')).toBe(true);
  });

  it('casa por telefone e CPF mesmo com mascara digitada', () => {
    expect(leadCasaComBusca(lead, '(11) 98888')).toBe(true);
    expect(leadCasaComBusca(lead, '111.444.777-35')).toBe(true);
  });

  it('nao casa com quem nao tem nada a ver', () => {
    expect(leadCasaComBusca(lead, 'pereira')).toBe(false);
    expect(leadCasaComBusca(lead, '99999999999')).toBe(false);
  });

  it('termo curto nao esconde ninguem', () => {
    expect(leadCasaComBusca(lead, '')).toBe(true);
    expect(leadCasaComBusca(lead, 'a')).toBe(true);
  });
});
