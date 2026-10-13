import { beforeEach, describe, expect, it } from 'vitest';
import { getPaymentGateway } from './index';
import { GatewayNaoImplementadoError, type CobrancaInput } from './types';
import {
  SicrediGateway,
  configSicrediDoAmbiente,
  corpoBoletoSicredi,
  dataIsoDeSicredi,
  dataSicredi,
  emitidaDoRetornoSicredi,
  limparCacheTokenSicredi,
  liquidacoesDoRetorno,
  mensagemErroSicredi,
  seuNumeroDoTitulo,
  urlBaseSicredi,
  variaveisSicrediFaltando,
  type SicrediConfig,
} from './sicredi';

// Valores ficticios da propria colecao Postman do sandbox (nao sao segredo).
const ENV = {
  SICREDI_API_KEY: 'chave-teste',
  SICREDI_USERNAME: '123456789',
  SICREDI_PASSWORD: 'teste123',
  SICREDI_COOPERATIVA: '6789',
  SICREDI_POSTO: '03',
  SICREDI_CODIGO_BENEFICIARIO: '12345',
};
const CFG = configSicrediDoAmbiente(ENV) as SicrediConfig;

const cobranca = (extra: Partial<CobrancaInput> = {}): CobrancaInput => ({
  titulo_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  valor: 135,
  vencimento: '2026-11-10',
  descricao: 'Mensalidade de protecao veicular',
  pagador: {
    nome: 'Joao da Silva',
    cpf_cnpj: '111.444.777-35',
    telefone: '(65) 99999-8888',
    endereco: { logradouro: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Cuiaba', uf: 'mt', cep: '78000-000' },
  },
  ...extra,
});

describe('configuracao pelo ambiente', () => {
  it('lista so os NOMES das variaveis faltando', () => {
    expect(variaveisSicrediFaltando({})).toEqual([
      'SICREDI_API_KEY', 'SICREDI_USERNAME', 'SICREDI_PASSWORD',
      'SICREDI_COOPERATIVA', 'SICREDI_POSTO', 'SICREDI_CODIGO_BENEFICIARIO',
    ]);
    expect(variaveisSicrediFaltando(ENV)).toEqual([]);
    expect(configSicrediDoAmbiente({ ...ENV, SICREDI_POSTO: ' ' })).toBeNull();
  });
  it('sem SICREDI_AMBIENTE=producao e sandbox', () => {
    expect(CFG.ambiente).toBe('sandbox');
    expect(configSicrediDoAmbiente({ ...ENV, SICREDI_AMBIENTE: 'PRODUCAO' })!.ambiente).toBe('producao');
    expect(configSicrediDoAmbiente({ ...ENV, SICREDI_AMBIENTE: 'prod' })!.ambiente).toBe('sandbox');
  });
  it('url base: /sb no sandbox, sem /sb em producao, override sem barra final', () => {
    expect(urlBaseSicredi({ ambiente: 'sandbox' })).toBe('https://api-parceiro.sicredi.com.br/sb');
    expect(urlBaseSicredi({ ambiente: 'producao' })).toBe('https://api-parceiro.sicredi.com.br');
    expect(urlBaseSicredi({ ambiente: 'sandbox', apiBase: 'https://x.test/' })).toBe('https://x.test');
  });
  it('fabrica: SICREDI le o ambiente e falha dizendo o que falta', () => {
    expect(getPaymentGateway({ provedor: 'SICREDI' }, ENV)).toBeInstanceOf(SicrediGateway);
    expect(() => getPaymentGateway({ provedor: 'SICREDI' }, {})).toThrow(GatewayNaoImplementadoError);
    expect(() => getPaymentGateway({ provedor: 'SICREDI' }, {})).toThrow(/SICREDI_API_KEY/);
  });
});

describe('datas e seuNumero', () => {
  it('seuNumero cabe em 10 caracteres', () => {
    expect(seuNumeroDoTitulo('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('A1B2C3D4E5');
  });
  it('converte datas nos dois sentidos', () => {
    expect(dataSicredi('2026-10-13')).toBe('13/10/2026');
    expect(dataIsoDeSicredi('13/10/2026')).toBe('2026-10-13');
    expect(dataIsoDeSicredi('2026-10-13T10:00:00')).toBe('2026-10-13');
    expect(dataIsoDeSicredi('ontem')).toBeNull();
    expect(dataIsoDeSicredi(null)).toBeNull();
  });
});

describe('corpo do cadastro', () => {
  it('monta o boleto HIBRIDO com pagador normalizado', () => {
    const { corpo, erros } = corpoBoletoSicredi(cobranca(), '12345');
    expect(erros).toEqual([]);
    expect(corpo).toMatchObject({
      codigoBeneficiario: '12345',
      dataVencimento: '2026-11-10',
      tipoCobranca: 'HIBRIDO',
      especieDocumento: 'DUPLICATA_MERCANTIL_INDICACAO',
      seuNumero: 'A1B2C3D4E5',
      valor: 135,
      pagador: {
        tipoPessoa: 'PESSOA_FISICA',
        documento: '11144477735',
        cep: '78000000',
        uf: 'MT',
        cidade: 'Cuiaba',
        endereco: 'Rua A, 10, Centro',
        telefone: '65999998888',
      },
      informativos: ['Mensalidade de protecao veicular'],
    });
  });
  it('CNPJ vira pessoa juridica', () => {
    const { corpo } = corpoBoletoSicredi(cobranca({ pagador: { ...cobranca().pagador, cpf_cnpj: '11.222.333/0001-81' } }), '1');
    expect(corpo!.pagador.tipoPessoa).toBe('PESSOA_JURIDICA');
  });
  it('recusa antes de chamar o banco quando falta endereco', () => {
    const { corpo, erros } = corpoBoletoSicredi(cobranca({ pagador: { nome: 'X', cpf_cnpj: '11144477735' } }), '1');
    expect(corpo).toBeNull();
    expect(erros).toEqual(expect.arrayContaining(['CEP do pagador ausente ou invalido', 'UF do pagador ausente']));
  });
  it('recusa valor zero', () => {
    expect(corpoBoletoSicredi(cobranca({ valor: 0 }), '1').erros).toContain('Valor deve ser maior que zero');
  });
});

describe('leitura do retorno', () => {
  it('cadastro -> nosso numero, linha digitavel e PIX', () => {
    const e = emitidaDoRetornoSicredi('t1', {
      linhaDigitavel: '74891121150039736789903123451001187340000000050',
      codigoBarras: '7489...',
      nossoNumero: 211001293,
      txid: 'abc',
      qrCode: '00020101...',
    });
    expect(e).toMatchObject({
      titulo_id: 't1',
      nosso_numero: '211001293',
      gateway_transacao_id: '211001293',
      linha_digitavel: '74891121150039736789903123451001187340000000050',
      pix_copia_cola: '00020101...',
    });
  });
  it('payload REAL do sandbox (13/10/2026): cadastro HIBRIDO', () => {
    // Resposta verbatim do POST /cobranca/boleto/v1/boletos no sandbox.
    // ATENCAO: o sandbox e um MOCK fixo (mesmo nossoNumero do exemplo da colecao,
    // linha de R$ 0,50 para qualquer valor enviado) — serve para o FORMATO, nao para conferir valores.
    const real = {
      txid: '445488181811848',
      qrCode: '00020126930014br.gov.bcb.pix2571pix-qrcode-h.sicredi.com.br/qr/v2/cobv/528520acdd5f4740b63b9b643ca2bcf99999999999999999999BR5903PIX6006Cidade62070503***630441AC\n\n',
      linhaDigitavel: '74891121150039736789903123451001187340000000050',
      codigoBarras: '74897937700000099891122224595067890312345109',
      cooperativa: '6789',
      posto: '03',
      nossoNumero: '211001292',
    };
    const e = emitidaDoRetornoSicredi('t1', real);
    expect(e.nosso_numero).toBe('211001292');
    expect(e.gateway_transacao_id).toBe('211001292');
    expect(e.linha_digitavel).toBe('74891121150039736789903123451001187340000000050');
    // As quebras de linha que o Sicredi poe no fim do qrCode nao vao para o PIX copia e cola.
    expect(e.pix_copia_cola).toBe(real.qrCode.trim());
    expect(e.pix_copia_cola!.endsWith('\n')).toBe(false);
  });
  it('liquidados aceita array solto ou embrulhado', () => {
    const item = { nossoNumero: '211001293', seuNumero: 'A1B2C3D4E5', valorLiquidado: '135.00', dataPagamento: '10/11/2026' };
    for (const r of [[item], { items: [item] }, { content: [item] }]) {
      expect(liquidacoesDoRetorno(r)[0]).toMatchObject({
        nossoNumero: '211001293', seuNumero: 'A1B2C3D4E5', valorPago: 135, dataPagamento: '2026-11-10',
      });
    }
    expect(liquidacoesDoRetorno(null)).toEqual([]);
    expect(liquidacoesDoRetorno({ outra: 1 })).toEqual([]);
  });
  it('erro leva o corpo da recusa', () => {
    expect(mensagemErroSicredi(400, { message: 'CEP invalido' })).toBe('Sicredi HTTP 400: CEP invalido');
    expect(mensagemErroSicredi(401, { error_description: 'Invalid user credentials' })).toContain('Invalid user');
    expect(mensagemErroSicredi(500, null)).toBe('Sicredi HTTP 500');
  });
});

// ---------------------------------------------------------------------------
// Gateway com fetch falso
// ---------------------------------------------------------------------------
type Chamada = { url: string; init: RequestInit };

function fetchFalso(respostas: Array<{ status?: number; body: unknown }>) {
  const chamadas: Chamada[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    chamadas.push({ url, init });
    const r = respostas.shift() ?? { status: 500, body: { message: 'sem resposta' } };
    return new Response(r.body == null ? '' : JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fn, chamadas };
}

const TOKEN = { access_token: 'jwt-1', refresh_token: 'rf-1', expires_in: 300 };

describe('SicrediGateway', () => {
  beforeEach(() => limparCacheTokenSicredi());

  it('autentica com form, x-api-key e context; sandbox manda cooperativa/posto/beneficiario', async () => {
    const { fn, chamadas } = fetchFalso([{ body: TOKEN }]);
    expect(await new SicrediGateway(CFG, fn).token()).toBe('jwt-1');
    const c = chamadas[0];
    expect(c.url).toBe('https://api-parceiro.sicredi.com.br/sb/auth/openapi/token');
    const h = c.init.headers as Record<string, string>;
    expect(h['x-api-key']).toBe('chave-teste');
    expect(h.context).toBe('COBRANCA');
    const form = new URLSearchParams(String(c.init.body));
    expect(form.get('grant_type')).toBe('password');
    expect(form.get('scope')).toBe('cobranca');
    expect(form.get('cooperativa')).toBe('6789');
    expect(form.get('codigoBeneficiario')).toBe('12345');
  });

  it('producao nao manda os campos extras do sandbox', async () => {
    const { fn, chamadas } = fetchFalso([{ body: TOKEN }]);
    await new SicrediGateway({ ...CFG, ambiente: 'producao' }, fn).token();
    expect(chamadas[0].url).toBe('https://api-parceiro.sicredi.com.br/auth/openapi/token');
    expect(new URLSearchParams(String(chamadas[0].init.body)).get('cooperativa')).toBeNull();
  });

  it('reusa o token em cache e renova pelo refresh quando vence', async () => {
    let agora = 1_000_000;
    const { fn, chamadas } = fetchFalso([{ body: TOKEN }, { body: { ...TOKEN, access_token: 'jwt-2' } }]);
    const gw = new SicrediGateway(CFG, fn, () => agora);
    expect(await gw.token()).toBe('jwt-1');
    expect(await gw.token()).toBe('jwt-1');
    expect(chamadas).toHaveLength(1);
    agora += 300_000; // venceu (renova 60 s antes)
    expect(await gw.token()).toBe('jwt-2');
    expect(new URLSearchParams(String(chamadas[1].init.body)).get('grant_type')).toBe('refresh_token');
  });

  it('falha de autenticacao vira erro legivel', async () => {
    const { fn } = fetchFalso([{ status: 401, body: { error_description: 'Invalid user credentials' } }]);
    await expect(new SicrediGateway(CFG, fn).token()).rejects.toThrow('Sicredi HTTP 401: Invalid user credentials');
  });

  it('emitir: POST com Bearer, cooperativa e posto; devolve o nosso numero', async () => {
    const { fn, chamadas } = fetchFalso([
      { body: TOKEN },
      { body: { nossoNumero: '211001293', linhaDigitavel: '7489', qrCode: 'pix' } },
    ]);
    const r = await new SicrediGateway(CFG, fn).emitir(cobranca());
    expect(r).toMatchObject({ nosso_numero: '211001293', linha_digitavel: '7489', pix_copia_cola: 'pix' });
    const c = chamadas[1];
    expect(c.url).toBe('https://api-parceiro.sicredi.com.br/sb/cobranca/boleto/v1/boletos');
    expect(c.init.method).toBe('POST');
    const h = c.init.headers as Record<string, string>;
    expect(h.Authorization).toBe('Bearer jwt-1');
    expect(h.cooperativa).toBe('6789');
    expect(h.posto).toBe('03');
    expect(JSON.parse(String(c.init.body)).tipoCobranca).toBe('HIBRIDO');
  });

  it('emitir sem endereco nao chama o banco e devolve o erro no titulo', async () => {
    const { fn, chamadas } = fetchFalso([]);
    const r = await new SicrediGateway(CFG, fn).emitir(cobranca({ pagador: { nome: 'X', cpf_cnpj: '11144477735' } }));
    expect(r.erro).toMatch(/CEP/);
    expect(chamadas).toHaveLength(0);
  });

  it('lote tolerante: recusa do banco num titulo nao derruba os outros', async () => {
    const { fn } = fetchFalso([
      { body: TOKEN },
      { status: 422, body: { message: 'Pagador invalido' } },
      { body: { nossoNumero: '2' } },
    ]);
    const r = await new SicrediGateway(CFG, fn).emitirLote([cobranca({ titulo_id: 'aaaa' }), cobranca({ titulo_id: 'bbbb' })]);
    expect(r[0].erro).toBe('Sicredi HTTP 422: Pagador invalido');
    expect(r[1].nosso_numero).toBe('2');
  });

  it('baixa: PATCH no nosso numero com o codigo do beneficiario no header', async () => {
    const { fn, chamadas } = fetchFalso([{ body: TOKEN }, { body: {} }]);
    await new SicrediGateway(CFG, fn).cancelar('211001293');
    expect(chamadas[1].url).toBe('https://api-parceiro.sicredi.com.br/sb/cobranca/boleto/v1/boletos/211001293/baixa');
    expect(chamadas[1].init.method).toBe('PATCH');
    expect((chamadas[1].init.headers as Record<string, string>).codigoBeneficiario).toBe('12345');
  });

  it('liquidados do dia pede DD/MM/AAAA', async () => {
    const { fn, chamadas } = fetchFalso([{ body: TOKEN }, { body: [] }]);
    expect(await new SicrediGateway(CFG, fn).liquidadosDoDia('2026-10-13')).toEqual([]);
    expect(chamadas[1].url).toContain('dia=13%2F10%2F2026');
    expect(chamadas[1].url).toContain('codigoBeneficiario=12345');
  });
});
