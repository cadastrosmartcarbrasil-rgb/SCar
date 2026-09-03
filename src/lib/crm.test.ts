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
