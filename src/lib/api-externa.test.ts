import { describe, it, expect } from 'vitest';
import {
  montarChave, chaveDaRequisicao, prefixoDaChave, situacaoRastreamento, ipPermitido,
  situacaoChave, lerListaIps, codificarCursor, decodificarCursor, limitePagina, lerDataHora,
  tipoDaReferencia, chaveMascarada, veiculoParaApi, proximoCursor,
} from './api-externa';
import { especificacaoApiExterna } from './api-externa-openapi';

const bytes = (n: number, v = 7) => new Uint8Array(Array.from({ length: n }, (_, i) => (i * 31 + v) % 256));

describe('chave da API', () => {
  it('monta no formato scar_<prefixo>_<segredo> e o prefixo e lido de volta', () => {
    const { chave, prefixo } = montarChave(bytes(10), bytes(32, 3));
    expect(chave.startsWith(`scar_${prefixo}_`)).toBe(true);
    expect(prefixo).toMatch(/^[a-z0-9]{10}$/);
    expect(prefixoDaChave(chave)).toBe(prefixo);
    expect(chaveMascarada(prefixo)).toContain(prefixo);
  });

  it('formato estranho nao chega ao banco', () => {
    expect(prefixoDaChave(null)).toBeNull();
    expect(prefixoDaChave('abc')).toBeNull();
    expect(prefixoDaChave('scar_ABC_curto')).toBeNull();
  });

  it('le Bearer ou x-api-key (x-api-key vence)', () => {
    expect(chaveDaRequisicao('Bearer scar_x_y', null)).toBe('scar_x_y');
    expect(chaveDaRequisicao('bearer  scar_x_y ', null)).toBe('scar_x_y');
    expect(chaveDaRequisicao('Bearer a', 'b')).toBe('b');
    expect(chaveDaRequisicao(null, null)).toBeNull();
  });
});

describe('situacao do rastreamento (espelho do SQL)', () => {
  it('na base = ATIVO, devendo/suspenso = SUSPENSO, fora = ENCERRADO', () => {
    expect(situacaoRastreamento('ativo')).toBe('ATIVO');
    expect(situacaoRastreamento('em_evento')).toBe('ATIVO');
    expect(situacaoRastreamento('vistoria_pendente')).toBe('ATIVO');
    expect(situacaoRastreamento('inadimplente')).toBe('SUSPENSO');
    expect(situacaoRastreamento('suspenso')).toBe('SUSPENSO');
    expect(situacaoRastreamento('inativo')).toBe('ENCERRADO');
    expect(situacaoRastreamento('baixado')).toBe('ENCERRADO');
    expect(situacaoRastreamento('excluido')).toBe('ENCERRADO');
  });
});

describe('IPs e situacao da chave', () => {
  it('lista vazia libera; com lista, so os listados', () => {
    expect(ipPermitido('1.2.3.4', null)).toBe(true);
    expect(ipPermitido('1.2.3.4', [])).toBe(true);
    expect(ipPermitido('1.2.3.4', ['1.2.3.4'])).toBe(true);
    expect(ipPermitido('1.2.3.5', ['1.2.3.4'])).toBe(false);
  });

  it('le a lista digitada e aponta o que nao e IP', () => {
    expect(lerListaIps('1.2.3.4, 10.0.0.1\n1.2.3.4 abc 300.1.1.1')).toEqual({
      ips: ['1.2.3.4', '10.0.0.1'], invalidos: ['abc', '300.1.1.1'],
    });
  });

  it('revogada > vencida > pausada/ativa', () => {
    const agora = new Date('2026-10-25T12:00:00Z');
    expect(situacaoChave({ ativo: true, revogada_em: '2026-10-01', expira_em: null }, agora)).toBe('REVOGADA');
    expect(situacaoChave({ ativo: true, revogada_em: null, expira_em: '2026-10-24T00:00:00Z' }, agora)).toBe('VENCIDA');
    expect(situacaoChave({ ativo: false, revogada_em: null, expira_em: null }, agora)).toBe('PAUSADA');
    expect(situacaoChave({ ativo: true, revogada_em: null, expira_em: '2027-01-01' }, agora)).toBe('ATIVA');
  });
});

describe('paginacao', () => {
  it('cursor vai e volta', () => {
    const c = codificarCursor('2026-10-25T10:00:00.123456+00:00', '0b6c9a2e-1111-4222-8333-444455556666');
    expect(c).not.toMatch(/[+/=]/);
    expect(decodificarCursor(c)).toEqual({ em: '2026-10-25T10:00:00.123456+00:00', id: '0b6c9a2e-1111-4222-8333-444455556666' });
  });

  it('cursor adulterado vira null', () => {
    expect(decodificarCursor('lixo')).toBeNull();
    expect(decodificarCursor(null)).toBeNull();
  });

  it('limite entre 1 e 500, padrao 100', () => {
    expect(limitePagina(null)).toBe(100);
    expect(limitePagina('abc')).toBe(100);
    expect(limitePagina('0')).toBe(1);
    expect(limitePagina('9999')).toBe(500);
    expect(limitePagina('250')).toBe(250);
  });

  it('data/hora: ausente vale, invalida nao', () => {
    expect(lerDataHora(null)).toEqual({ ok: true, valor: null });
    expect(lerDataHora('ontem')).toEqual({ ok: false });
    expect(lerDataHora('2026-10-20T10:00:00-03:00')).toEqual({ ok: true, valor: '2026-10-20T13:00:00.000Z' });
  });
});

describe('referencia do veiculo', () => {
  it('uuid, chassi (17) ou placa', () => {
    expect(tipoDaReferencia('0b6c9a2e-1111-4222-8333-444455556666')).toBe('id');
    expect(tipoDaReferencia('9BWZZZ377VT004251')).toBe('chassi');
    expect(tipoDaReferencia('ABC-1D23')).toBe('placa');
  });
});


describe('JSON do veiculo', () => {
  const linha = {
    veiculo_id: 'v', placa: 'ABC1D23', chassi: null, renavam: null, zero_km: false, marca: 'FIAT', modelo: 'UNO',
    ano_fabricacao: 2020, ano_modelo: 2021, cor: 'PRATA', tipo_veiculo: 'Passeio', status: 'ativo',
    situacao_rastreamento: 'ATIVO', status_desde: null, data_ativacao: '2026-01-01', data_saida: null,
    unidade_id: 'u', unidade_nome: 'MATRIZ', rastreador_imei: '860000000000001', rastreador_chip: null,
    rastreadora_id: null, rastreadora_nome: null, cliente_id: 'c', associado_nome: 'MARIA',
    associado_documento: '52998224725', associado_tipo_pessoa: 'PF', associado_telefone: null,
    associado_celular: null, associado_email: null, alterado_em: '2026-10-25T00:00:00Z',
  };

  it('agrupa unidade, rastreador e associado', () => {
    const j = veiculoParaApi(linha, true);
    expect(j.unidade).toEqual({ id: 'u', nome: 'MATRIZ' });
    expect(j.rastreador).toEqual({ imei: '860000000000001', chip: null, rastreadora: null });
    expect(j.associado).toMatchObject({ id: 'c', nome: 'MARIA', documento: '52998224725' });
  });

  it('sem o escopo, o associado sai so com o id (nem a chave aparece)', () => {
    expect(veiculoParaApi(linha, false).associado).toEqual({ id: 'c' });
  });

  it('cursor so quando a pagina veio cheia', () => {
    const k = (x: { id: string }) => ({ em: '2026-10-25T00:00:00Z', id: x.id });
    const id = '0b6c9a2e-1111-4222-8333-444455556666';
    expect(proximoCursor([{ id }], 2, k)).toBeNull();
    expect(proximoCursor([{ id }, { id }], 2, k)).not.toBeNull();
  });
});


describe('OpenAPI', () => {
  it('documenta as 5 rotas e todo $ref aponta para um schema que existe', () => {
    const e = especificacaoApiExterna('https://x');
    expect(Object.keys(e.paths).sort()).toEqual(
      ['/rastreadores', '/rastreadores/comunicacao', '/status', '/veiculos', '/veiculos/{ref}'],
    );
    const refs = JSON.stringify(e).match(/#\/components\/schemas\/(\w+)/g) ?? [];
    for (const r of refs) expect(e.components.schemas).toHaveProperty(r.split('/').pop()!);
    expect(e.servers[0].url).toBe('https://x/api/externa/v1');
  });
});
