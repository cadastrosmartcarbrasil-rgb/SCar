import { describe, expect, it } from 'vitest';
import {
  BASE_NEWTRACKER, camposDaAmostra, casarComBase, chassiValido, contarSituacoes, ehRecursoNewTracker, emBlocos,
  imeiNewTracker, itemParaCadastro, itemParaComunicacao, lerPaginaNewTracker, montarItensNewTracker, placaValida,
  mensagemErroNewTracker, semSinal, temMaisPaginas, urlNewTracker,
} from './newtracker';

describe('urlNewTracker', () => {
  it('monta a URL da API externa com o recurso', () => {
    expect(urlNewTracker('', 'status')).toBe(`${BASE_NEWTRACKER}/api-externa?recurso=status`);
  });
  it('limita a pagina a 500 e normaliza a placa', () => {
    const u = new URL(urlNewTracker(BASE_NEWTRACKER + '/', 'veiculos', { limite: 9000, pagina: 2, placa: 'abc-1d23' }));
    expect(u.searchParams.get('limite')).toBe('500');
    expect(u.searchParams.get('pagina')).toBe('2');
    expect(u.searchParams.get('placa')).toBe('ABC1D23');
  });
  it('placa so vale em veiculos e status ignora paginacao', () => {
    expect(urlNewTracker('', 'posicoes', { placa: 'ABC1D23' })).not.toContain('placa');
    expect(urlNewTracker('', 'status', { limite: 5 })).not.toContain('limite');
  });
});

describe('lerPaginaNewTracker', () => {
  it('le o envelope documentado', () => {
    const p = lerPaginaNewTracker({ success: true, recurso: 'equipamentos', pagina: 1, limite: 50, total: 128, dados: [{ imei: '1' }, 3] });
    expect(p).toMatchObject({ ok: true, total: 128, pagina: 1, limite: 50 });
    expect(p.dados).toEqual([{ imei: '1' }]);
  });
  it('status nao e listagem: corpo inteiro', () => {
    const p = lerPaginaNewTracker({ success: true, empresa_id: 'x', permissoes: ['veiculos'] });
    expect(p.dados).toEqual([]);
    expect(p.corpo?.empresa_id).toBe('x');
  });
  it('lixo nao quebra', () => {
    expect(lerPaginaNewTracker('html').ok).toBe(false);
  });
});

describe('temMaisPaginas', () => {
  it('pelo total', () => {
    expect(temMaisPaginas({ ok: true, total: 128, pagina: 2, limite: 50, dados: [], corpo: null }, 50)).toBe(true);
    expect(temMaisPaginas({ ok: true, total: 128, pagina: 3, limite: 50, dados: [], corpo: null }, 50)).toBe(false);
  });
  it('sem total: pagina cheia', () => {
    expect(temMaisPaginas({ ok: true, total: null, pagina: null, limite: null, dados: [{}, {}], corpo: null }, 2)).toBe(true);
  });
});

describe('mensagemErroNewTracker', () => {
  it('traduz os codigos documentados', () => {
    expect(mensagemErroNewTracker(403, { code: 'FORBIDDEN_SCOPE' })).toContain('permissão');
    expect(mensagemErroNewTracker(401, {})).toContain('inválida');
    expect(mensagemErroNewTracker(500, { error: 'falhou' })).toBe('A New Tracker respondeu HTTP 500: falhou.');
  });
});

describe('camposDaAmostra', () => {
  it('conta preenchidos e abre um nivel', () => {
    const c = camposDaAmostra([
      { imei: '123', modelo: '', veiculo: { placa: 'ABC1D23' } },
      { imei: '456', modelo: null },
    ]);
    expect(c.find((x) => x.campo === 'imei')).toMatchObject({ preenchidos: 2, total: 2, exemplo: '123' });
    expect(c.find((x) => x.campo === 'modelo')).toMatchObject({ preenchidos: 0, exemplo: null });
    expect(c.find((x) => x.campo === 'veiculo.placa')?.preenchidos).toBe(1);
  });
});

describe('imeiNewTracker e semSinal', () => {
  it('imei so digitos 14..17', () => {
    expect(imeiNewTracker(' 86-0000000000001 ')).toBe('860000000000001');
    expect(imeiNewTracker('123')).toBeNull();
  });
  it('sem sinal depois de 3 dias', () => {
    const agora = new Date('2026-11-05T12:00:00Z');
    expect(semSinal('2026-11-03T12:00:00Z', agora)).toBe(false);
    expect(semSinal('2026-11-01T11:00:00Z', agora)).toBe(true);
    expect(semSinal(null, agora)).toBe(true);
  });
  it('recurso valido', () => {
    expect(ehRecursoNewTracker('posicoes')).toBe(true);
    expect(ehRecursoNewTracker('faturas')).toBe(false);
  });
});

// Amostras REAIS da API da New Tracker (02/11/2026), reduzidas a um caso cada.
const EQUIP = {
  id: '388ede23-a737-40a8-b702-b8e0ab42b187', imei: '865080041327137', numero_serie: null,
  modelo: 'SR-411 MINI', tipo: 'rastreador', status: 'instalado', estoque_tipo: 'empresa',
  created_at: '2026-05-06T20:10:40.326524+00:00', updated_at: '2026-05-19T15:06:26.219246+00:00',
};
const CHIP = {
  id: 'f1744394-3e9b-4845-ae2f-64811a731bdd', iccid: '89550532310023805128', numero_linha: '31980530842',
  operadora: 'Claro', fornecedor: 'SMART', plano: 'M2M', franquia: '20MB', consumo_mb: null, status: 'ativo',
  status_conexao: null, ultima_conexao: null, imei: null,
  equipamento_id: '388ede23-a737-40a8-b702-b8e0ab42b187', data_ativacao: '2026-05-06',
};
const VEIC_0KM = {
  id: '078657d8-5cad-4cfa-b184-02e6f4dfcaa3', placa: '9BWAG5R1', marca: 'VW - VolksWagen',
  modelo: 'Polo Track 1.0 Flex 12V 5p', ano: 2026, cor: 'BRANCO', tipo: 'Carro', status: 'ativo', imei: null,
  chassi: '9BWAG5R11TP071881', cliente_id: '8e4ac0cb-a215-44f6-94da-70fdcca0c2c6', numero_frota: null,
};
const VEIC_PLACA = {
  id: '906944bb-43c0-4757-84d1-f56ac2a4a613', placa: 'ADX9673', marca: 'GM - CHEVROLET',
  modelo: 'D-20 S / LUXE 3.9/4.0 DIESEL', status: 'ativo', imei: null, chassi: '9BG258RBPPC016382',
};
const POS = {
  veiculo_id: '078657d8-5cad-4cfa-b184-02e6f4dfcaa3', imei: '865080041327137',
  latitude: -15.6267566666667, longitude: -55.98116, speed: 0, course: 0, ignition: false, online: false,
  address: 'Alameda São João, São Sebastião, Cuiabá, Mato Grosso, CEP 78098-247, BR',
  device_time: '2026-11-02T18:08:29+00:00', updated_at: '2026-11-02T21:14:03.088+00:00',
};

describe('montarItensNewTracker', () => {
  it('liga equipamento, chip (pelo id interno) e veiculo (pela posicao)', () => {
    const [it] = montarItensNewTracker({ equipamentos: [EQUIP], chips: [CHIP], veiculos: [VEIC_0KM], posicoes: [POS] });
    expect(it).toMatchObject({
      imei: '865080041327137', modelo: 'SR-411 MINI', iccid: '89550532310023805128',
      linha: '31980530842', operadora: 'Claro',
      veiculo_nt: { id: VEIC_0KM.id, placa: '9BWAG5R1', chassi: '9BWAG5R11TP071881' },
      posicao: { comunicado_em: '2026-11-02T18:08:29+00:00', ignicao: false, online: false },
    });
  });
  it('equipamento sem posicao fica sem veiculo; IMEI so da posicao entra', () => {
    const itens = montarItensNewTracker({
      equipamentos: [EQUIP], chips: [], veiculos: [VEIC_PLACA],
      posicoes: [{ ...POS, imei: '862667080800363', veiculo_id: VEIC_PLACA.id }],
    });
    expect(itens.find((i) => i.imei === EQUIP.imei)?.veiculo_nt).toBeNull();
    expect(itens.find((i) => i.imei === '862667080800363')?.veiculo_nt?.placa).toBe('ADX9673');
  });
  it('vale a posicao mais recente do IMEI', () => {
    const [it] = montarItensNewTracker({
      equipamentos: [EQUIP], chips: [], veiculos: [VEIC_0KM],
      posicoes: [POS, { ...POS, device_time: '2026-11-01T10:00:00+00:00', latitude: 1 }],
    });
    expect(it.posicao?.comunicado_em).toBe('2026-11-02T18:08:29+00:00');
  });
});

describe('casarComBase', () => {
  const nossos = [
    { id: 'v-0km', placa: null, chassi: '9BWAG5R11TP071881', status: 'ativo' },
    { id: 'v-adx', placa: 'ADX9673', chassi: 'OUTROCHASSI000000', status: 'ativo' },
  ];
  it('0 km casa pelo CHASSI (a "placa" da New Tracker e o comeco do chassi)', () => {
    const itens = montarItensNewTracker({ equipamentos: [EQUIP], chips: [], veiculos: [VEIC_0KM], posicoes: [POS] });
    const [l] = casarComBase(itens, nossos);
    expect(l).toMatchObject({ situacao: 'INSTALAR', casou_por: 'CHASSI', veiculo: { id: 'v-0km' } });
    expect(itemParaCadastro(l)).toMatchObject({ imei: EQUIP.imei, veiculo_id: 'v-0km', iccid: null });
  });
  it('sem chassi igual, casa pela PLACA valida', () => {
    const itens = montarItensNewTracker({
      equipamentos: [], chips: [], veiculos: [VEIC_PLACA],
      posicoes: [{ ...POS, imei: '862667080800363', veiculo_id: VEIC_PLACA.id }],
    });
    expect(casarComBase(itens, nossos)[0]).toMatchObject({ situacao: 'INSTALAR', casou_por: 'PLACA', veiculo: { id: 'v-adx' } });
  });
  it('veiculo que nao e nosso fica de fora; sem posicao tambem', () => {
    const itens = montarItensNewTracker({
      equipamentos: [EQUIP, { ...EQUIP, id: 'x', imei: '865080041328184' }], chips: [],
      veiculos: [{ ...VEIC_PLACA, placa: 'ZZZ9Z99', chassi: '9BG000000000ZZZ99' }],
      posicoes: [{ ...POS, veiculo_id: VEIC_PLACA.id }],
    });
    expect(contarSituacoes(casarComBase(itens, nossos))).toEqual({
      INSTALAR: 0, SEM_POSICAO: 1, VEICULO_SEM_CADASTRO: 0, FORA_DA_BASE: 1,
    });
  });
});

describe('itens para as RPCs', () => {
  it('comunicacao no formato da 0151', () => {
    const [it] = montarItensNewTracker({ equipamentos: [EQUIP], chips: [], veiculos: [VEIC_0KM], posicoes: [POS] });
    expect(itemParaComunicacao(it)).toMatchObject({
      imei: EQUIP.imei, comunicado_em: POS.device_time, latitude: POS.latitude, ignicao: false,
    });
  });
  it('placa/chassi validos', () => {
    expect(placaValida('9BWAG5R1')).toBeNull();
    expect(placaValida('abc-1d23')).toBe('ABC1D23');
    expect(chassiValido('9BWAG5R11TP071881')).toBe('9BWAG5R11TP071881');
    expect(emBlocos([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });
});
