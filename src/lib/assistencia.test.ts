import { describe, it, expect } from 'vitest';
import {
  calcularKmExcedente,
  calcularTotalOS,
  avaliarBloqueio,
  rotuloLimite,
  montarVoucherTexto,
  montarVoucherHtml,
  linkWhatsApp,
  enderecoTexto,
  rotaDoVoucher,
  grupoSituacao,
  agruparSituacao,
  fatiasPorServico,
  lerPracas,
  formatarHoras,
  variacao,
  compararUltimosMeses,
  rotuloMes,
  type DadosVoucher,
} from './assistencia';
import type { ElegibilidadeAssistencia, SituacaoAssistencia } from '@/lib/database.types';

const reboque = { cobra_km_excedente: true, valor_km_excedente: 4, km_franquia: 100 };
const chaveiro = { cobra_km_excedente: false, valor_km_excedente: 0, km_franquia: 0 };

const situacao = (over: Partial<SituacaoAssistencia> = {}): SituacaoAssistencia => ({
  veiculo_id: 'v1', placa: 'ABC1D23', cliente_id: 'c1', associado: 'Carlos',
  status_veiculo: 'ativo', veiculo_ativo: true, inadimplente: false, titulos_vencidos: 0,
  valor_em_atraso: 0, pendencia_cadastral: false, alertas_ativos: 0,
  pode_acionar: true, motivos: [], ...over,
});

const eleg = (over: Partial<ElegibilidadeAssistencia> = {}): ElegibilidadeAssistencia => ({
  servico_id: 's1', descricao: 'Reboque Passeio', computa_limite: true, limite_quantidade: 2,
  janela_meses: 12, usados: 0, restantes: 2, elegivel: true, ultimo_uso: null, ...over,
});

describe('KM excedente e total da OS', () => {
  it('desconta a franquia do servico', () => {
    expect(calcularKmExcedente(120, 100)).toBe(20);
    expect(calcularKmExcedente(80, 100)).toBe(0);
    expect(calcularKmExcedente(null, 100)).toBe(0);
  });

  it('soma servico + KM excedente (espelha confirmar_prestador_assistencia)', () => {
    expect(calcularTotalOS(reboque, 230, 20)).toEqual({
      valorServico: 230, valorKmExcedente: 80, total: 310,
    });
  });

  it('usa o valor de KM negociado com o prestador quando informado', () => {
    expect(calcularTotalOS(reboque, 230, 20, 5).total).toBe(330);
  });

  it('servico que nao cobra KM ignora o excedente', () => {
    expect(calcularTotalOS(chaveiro, 180, 50, 4)).toEqual({
      valorServico: 180, valorKmExcedente: 0, total: 180,
    });
  });
});

describe('avaliarBloqueio — trava financeira/cadastral + limite', () => {
  it('veiculo ativo, em dia e dentro do limite: libera', () => {
    const r = avaliarBloqueio(situacao(), eleg());
    expect(r.bloqueado).toBe(false);
    expect(r.motivos).toEqual([]);
  });

  it('inadimplente exige liberacao de superior', () => {
    const r = avaliarBloqueio(situacao({ pode_acionar: false, inadimplente: true, motivos: ['2 titulo(s) em atraso'] }), eleg());
    expect(r.bloqueado).toBe(true);
    expect(r.exigeLiberacao).toBe(true);
    expect(r.motivos).toContain('2 titulo(s) em atraso');
  });

  it('limite do opcional esgotado tambem bloqueia', () => {
    const r = avaliarBloqueio(situacao(), eleg({ usados: 2, restantes: 0, elegivel: false }));
    expect(r.bloqueado).toBe(true);
    expect(r.motivos[0]).toContain('Limite do opcional atingido: 2 de 2 uso(s) em 12 meses');
  });

  it('acumula os motivos do veiculo e do limite', () => {
    const r = avaliarBloqueio(
      situacao({ pode_acionar: false, motivos: ['Veiculo com status suspenso (necessario ATIVO)'] }),
      eleg({ usados: 2, elegivel: false }),
    );
    expect(r.motivos).toHaveLength(2);
  });

  it('servico sem limite nunca bloqueia por uso', () => {
    const r = avaliarBloqueio(situacao(), eleg({ computa_limite: false, elegivel: true, usados: 9 }));
    expect(r.bloqueado).toBe(false);
  });

  it('veiculo inexistente bloqueia sem alcada', () => {
    const r = avaliarBloqueio(null);
    expect(r).toEqual({ bloqueado: true, motivos: ['Veiculo nao localizado'], exigeLiberacao: false });
  });
});

describe('rotuloLimite — painel do atendente em tempo real', () => {
  it('mostra consumo e janela', () => {
    expect(rotuloLimite(eleg({ usados: 1 }))).toBe('1/2 em 12 meses');
  });
  it('servico sem limite', () => {
    expect(rotuloLimite(eleg({ computa_limite: false }))).toBe('Sem limite');
  });
});

describe('voucher do prestador', () => {
  const dados: DadosVoucher = {
    codigo_os: 'OS-20260815-0001',
    protocolo: 'ASS-20260815-0003',
    servico: 'Reboque Passeio',
    prestador: 'Guincho Rapido LTDA',
    associado: 'Carlos Assistido',
    solicitante: 'Carlos',
    telefone: '11988887777',
    veiculo: { placa: 'ABC1D23', marca: 'Chevrolet', modelo: 'Onix', cor: 'Prata' },
    origem: 'Av. Paulista 1000, Sao Paulo, SP',
    destino: 'Oficina Central, Sao Paulo, SP',
    km_previsto: 120,
    valor_servico: 230,
    valor_km_excedente: 80,
    valor_total: 310,
    prazo_estimado_min: 45,
    observacoes: 'Carro nao liga',
    contato_central: '0800 000 0000',
  };

  it('traz OS, veiculo, locais e o valor autorizado', () => {
    const txt = montarVoucherTexto(dados);
    expect(txt).toContain('OS-20260815-0001');
    expect(txt).toContain('ASS-20260815-0003');
    expect(txt).toContain('Guincho Rapido LTDA');
    expect(txt).toContain('ABC1D23 — Chevrolet Onix Prata');
    expect(txt).toContain('Av. Paulista 1000');
    expect(txt).toContain('KM excedente: R$');
    // o Intl usa espaco nao-separavel entre "R$" e o valor
    expect(txt).toMatch(/Valor total autorizado: R\$\s310,00/);
  });

  it('omite as linhas que nao se aplicam', () => {
    const txt = montarVoucherTexto({ ...dados, valor_km_excedente: 0, destino: null, observacoes: null });
    expect(txt).not.toContain('KM excedente');
    expect(txt).not.toContain('Destino:');
    expect(txt).not.toContain('Observacoes:');
  });

  it('versao HTML converte *negrito* e escapa o conteudo', () => {
    const html = montarVoucherHtml({ ...dados, associado: 'Casa & Cia <Ltda>' });
    expect(html).toContain('<strong>OS-20260815-0001</strong>');
    expect(html).toContain('Casa &amp; Cia &lt;Ltda&gt;');
  });

  it('link do WhatsApp normaliza o numero com DDI', () => {
    const link = linkWhatsApp('(11) 99999-0000', 'Ola');
    expect(link).toBe('https://wa.me/5511999990000?text=Ola');
    expect(linkWhatsApp('5511999990000', 'Ola')).toContain('wa.me/5511999990000');
    expect(linkWhatsApp('123', 'Ola')).toBeNull();
    expect(linkWhatsApp(null, 'Ola')).toBeNull();
  });
});

describe('enderecoTexto', () => {
  it('monta o endereco em uma linha', () => {
    expect(enderecoTexto({ logradouro: 'Av. Paulista', numero: '1000', cidade: 'Sao Paulo', uf: 'SP' }))
      .toBe('Av. Paulista, 1000, Sao Paulo, SP');
  });
  it('vazio vira null', () => {
    expect(enderecoTexto({})).toBeNull();
    expect(enderecoTexto(null)).toBeNull();
  });
});

describe('rota e navegacao no voucher (0031)', () => {
  const origem = { logradouro: 'Avenida Mato Grosso', numero: '240', cidade: 'Cuiaba', uf: 'MT', lat: -15.5989, lng: -56.0949 };
  const destino = { logradouro: 'Rua Mirassol', numero: '54', cidade: 'Cuiaba', uf: 'MT', lat: -15.5801, lng: -56.0712 };

  const base: DadosVoucher = {
    codigo_os: 'OS-20260816-0007', protocolo: 'ASS-20260816-0007', servico: 'Reboque Passeio',
    prestador: 'Guincho Geo', associado: 'Joana', veiculo: { placa: 'GEO1A11' },
    origem: 'Avenida Mato Grosso, 240', destino: 'Rua Mirassol, 54',
    valor_servico: 200, valor_km_excedente: 67.2, valor_total: 267.2,
    distancia_km: 72.4, duracao_min: 95,
    ...rotaDoVoucher(origem, destino),
  };

  it('monta os links a partir das coordenadas da OS', () => {
    const l = rotaDoVoucher(origem, destino);
    expect(l.link_rota).toContain('google.com/maps/dir/?api=1&origin=-15.5989');
    expect(l.link_navegacao_origem).toBe('https://waze.com/ul?ll=-15.5989,-56.0949&navigate=yes');
    expect(l.link_navegacao_destino).toContain('waze.com/ul?ll=-15.5801');
  });

  it('o comunicado leva rota, navegacao e o aviso de trajeto autorizado', () => {
    const txt = montarVoucherTexto(base);
    expect(txt).toContain('Rota autorizada: 72,4 km · 1h35');
    expect(txt).toContain('Navegar ate o resgate: https://waze.com/ul?ll=');
    expect(txt).toContain('Rota completa (Google Maps): https://www.google.com/maps/dir/');
    expect(txt).toContain('estritamente as cadastradas nesta OS');
    expect(txt).toContain('trecho nao autorizado nao e pago');
  });

  it('sem coordenada nem endereco, o voucher nao inventa link', () => {
    const txt = montarVoucherTexto({ ...base, ...rotaDoVoucher({}, {}), distancia_km: null, duracao_min: null });
    expect(txt).not.toContain('Navegar ate o resgate');
    expect(txt).not.toContain('Rota completa');
    // o aviso do trajeto autorizado continua valendo
    expect(txt).toContain('estritamente as cadastradas nesta OS');
  });

  it('o HTML do e-mail carrega os mesmos links', () => {
    const html = montarVoucherHtml(base);
    expect(html).toContain('google.com/maps/dir/');
    expect(html).toContain('waze.com/ul');
  });
});

// ===========================================================================
// PAINEL GERENCIAL (0061)
// ===========================================================================
describe('painel 24h — frota por situacao', () => {
  it('mapeia os status do banco nos 3 grupos do painel', () => {
    expect(grupoSituacao('ativo')).toBe('ATIVO');
    expect(grupoSituacao('suspenso')).toBe('BLOQUEADO');
    expect(grupoSituacao('inativo')).toBe('INATIVO');
    expect(grupoSituacao('baixado')).toBe('INATIVO');
    expect(grupoSituacao('em_evento')).toBe('INATIVO');
  });

  it('consolida grupos e calcula o percentual', () => {
    const [ativo, inativo, bloqueado] = agruparSituacao([
      { situacao: 'ativo', quantidade: 2522 },
      { situacao: 'inativo', quantidade: 10000 },
      { situacao: 'baixado', quantidade: 500 },
      { situacao: 'suspenso', quantidade: 1 },
    ]);
    expect(ativo.quantidade).toBe(2522);
    expect(inativo.quantidade).toBe(10500); // inativo + baixado no mesmo grupo
    expect(bloqueado.quantidade).toBe(1);
    expect(Math.round(ativo.fracao * 100)).toBe(19);
  });

  it('frota vazia nao divide por zero', () => {
    expect(agruparSituacao([]).every((g) => g.fracao === 0 && g.quantidade === 0)).toBe(true);
  });
});

describe('painel 24h — servicos', () => {
  const linhas = [
    { servico_id: 's1', servico: 'Reboque Passeio', acionamentos: 11, veiculos: 6, custo: 5500, custo_medio: 500, computa_limite: true, limite_quantidade: 2, janela_meses: 12, veiculos_no_limite: 2 },
    { servico_id: 's2', servico: 'Chaveiro', acionamentos: 9, veiculos: 9, custo: 1350, custo_medio: 150, computa_limite: true, limite_quantidade: 1, janela_meses: 12, veiculos_no_limite: 0 },
  ];

  it('participacao soma 100%', () => {
    const f = fatiasPorServico(linhas);
    expect(f.reduce((a, x) => a + x.fracao, 0)).toBeCloseTo(1, 10);
    expect(f[0].fracao).toBeCloseTo(11 / 20, 10);
  });

  it('marca o servico que ja tem veiculo no teto do limite', () => {
    const [reboque, chaveiro] = fatiasPorServico(linhas);
    expect(reboque.temVeiculoNoLimite).toBe(true);
    expect(chaveiro.temVeiculoNoLimite).toBe(false);
  });

  it('lista vazia nao gera NaN', () => {
    expect(fatiasPorServico([])).toEqual([]);
  });
});

describe('painel 24h — pracas (a taxa aponta o alvo, nao o volume)', () => {
  const pracas = [
    { cidade: 'SAO PAULO', uf: 'SP', acionamentos: 30, custo: 15000, veiculos: 3000, taxa: 0.01 },
    { cidade: 'CUIABA', uf: 'MT', acionamentos: 30, custo: 12000, veiculos: 200, taxa: 0.15 },
    { cidade: 'NAO INFORMADO', uf: 'NF', acionamentos: 5, custo: 500, veiculos: 0, taxa: 0 },
  ];

  it('mesmo volume, so a praca pequena e critica', () => {
    const [sp, cba] = lerPracas(pracas);
    expect(sp.acionamentos).toBe(cba.acionamentos);
    expect(cba.critica).toBe(true);
    expect(sp.critica).toBe(false);
  });

  it('rotulo junta UF, e UF desconhecida nao polui', () => {
    const [sp, , nf] = lerPracas(pracas);
    expect(sp.rotulo).toBe('SAO PAULO-SP');
    expect(nf.rotulo).toBe('NAO INFORMADO');
  });

  it('praca sem frota mapeada nao vira Infinity nem entra como critica', () => {
    const [, , nf] = lerPracas(pracas);
    expect(nf.custoPorVeiculo).toBe(0);
    expect(nf.critica).toBe(false);
  });

  it('custo por veiculo da praca', () => {
    const [sp, cba] = lerPracas(pracas);
    expect(sp.custoPorVeiculo).toBeCloseTo(5, 10);
    expect(cba.custoPorVeiculo).toBeCloseTo(60, 10);
  });
});

describe('painel 24h — tempo medio e tendencia', () => {
  it('horas decimais viram HH:MM', () => {
    expect(formatarHoras(0.1)).toBe('00:06');
    expect(formatarHoras(1.5)).toBe('01:30');
    expect(formatarHoras(26.25)).toBe('26:15');
  });

  it('sem dado vira 00:00', () => {
    expect(formatarHoras(null)).toBe('00:00');
    expect(formatarHoras(undefined)).toBe('00:00');
    expect(formatarHoras(-3)).toBe('00:00');
  });

  it('variacao percentual, com base zero sem comparacao', () => {
    expect(variacao(120, 100)).toBeCloseTo(0.2, 10);
    expect(variacao(80, 100)).toBeCloseTo(-0.2, 10);
    expect(variacao(10, 0)).toBeNull();
    expect(variacao(0, 0)).toBe(0);
  });

  it('compara o ultimo mes com o anterior', () => {
    const c = compararUltimosMeses([
      { competencia: '2026-07-01', acionamentos: 10, custo: 1000 },
      { competencia: '2026-08-01', acionamentos: 20, custo: 3000 },
      { competencia: '2026-09-01', acionamentos: 26, custo: 4500 },
    ]);
    expect(c.atual?.competencia).toBe('2026-09-01');
    expect(c.varAcionamentos).toBeCloseTo(0.3, 10);
    expect(c.varCusto).toBeCloseTo(0.5, 10);
  });

  it('serie de um mes so nao tem comparativo', () => {
    const c = compararUltimosMeses([{ competencia: '2026-09-01', acionamentos: 5, custo: 100 }]);
    expect(c.anterior).toBeNull();
    expect(c.varCusto).toBeNull();
  });

  it('rotulo curto do mes', () => {
    expect(rotuloMes('2026-09-01')).toBe('set/26');
    expect(rotuloMes('2025-01-01')).toBe('jan/25');
  });
});
