// Especificacao OpenAPI 3.0 da API externa (0151). Servida em
// GET /api/externa/v1/openapi.json — e o que se entrega ao fornecedor que vai
// integrar (Swagger/Postman importam direto). Mudou rota ou campo: mude aqui.

const str = { type: 'string' };
const strN = { type: 'string', nullable: true };
const intN = { type: 'integer', nullable: true };
const data = { type: 'string', format: 'date', nullable: true };
const dataHora = { type: 'string', format: 'date-time', nullable: true };
const ref = (nome: string) => ({ $ref: `#/components/schemas/${nome}` });

const erros = {
  401: { description: 'Sem chave ou chave inválida', content: { 'application/json': { schema: ref('Erro') } } },
  403: { description: 'Chave revogada/vencida/pausada, IP não autorizado ou sem o escopo', content: { 'application/json': { schema: ref('Erro') } } },
  429: { description: 'Limite de requisições (120 por minuto por chave)', content: { 'application/json': { schema: ref('Erro') } } },
};

const paginacao = [
  { name: 'atualizados_desde', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Só o que mudou desde esta data/hora (sincronia incremental).' },
  { name: 'cursor', in: 'query', schema: str, description: 'O `proximo_cursor` da página anterior.' },
  { name: 'limite', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 } },
];

export function especificacaoApiExterna(servidor: string) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'SCar — API de integração',
      version: '1.0.0',
      description:
        'API da Smart Car Brasil para sistemas parceiros. Autenticação por chave (emitida pela Smart Car em ' +
        'Configurações → API e Integrações): `Authorization: Bearer <chave>` ou `x-api-key: <chave>`. ' +
        'Datas em ISO 8601 (UTC). Paginação por cursor: repita a chamada com `cursor=<proximo_cursor>` até ele vir nulo. ' +
        'Para sincronia incremental, guarde o maior `alterado_em` recebido e use-o em `atualizados_desde` na próxima rodada.\n\n' +
        '**situacao_rastreamento** (o que a plataforma faz com o veículo): ' +
        '`ATIVO` = manter o rastreamento; `SUSPENSO` = associado inadimplente/suspenso, benefícios bloqueados, equipamento continua; ' +
        '`ENCERRADO` = veículo saiu da base, encerrar e recolher o equipamento.',
    },
    servers: [{ url: `${servidor}/api/externa/v1` }],
    security: [{ bearer: [] }, { chave: [] }],
    paths: {
      '/status': {
        get: {
          summary: 'Confere a chave',
          description: 'Devolve a integração, os escopos e o IP visto pelo SCar. Não exige escopo.',
          responses: { 200: { description: 'Chave válida', content: { 'application/json': { schema: ref('Status') } } }, ...erros },
        },
      },
      '/veiculos': {
        get: {
          summary: 'Lista os veículos (cruzamento)',
          description: 'Escopo `veiculos:ler`. Dados do associado (nome, CPF/CNPJ, contato) só com `associados:ler`.',
          parameters: [
            ...paginacao,
            { name: 'placa', in: 'query', schema: str },
            { name: 'chassi', in: 'query', schema: str },
            { name: 'imei', in: 'query', schema: str, description: 'IMEI do rastreador instalado.' },
            { name: 'situacao', in: 'query', schema: { type: 'string', enum: ['ATIVO', 'SUSPENSO', 'ENCERRADO'] } },
          ],
          responses: { 200: { description: 'Página de veículos', content: { 'application/json': { schema: ref('PaginaVeiculos') } } }, ...erros },
        },
      },
      '/veiculos/{ref}': {
        get: {
          summary: 'Um veículo por placa, chassi ou id',
          description: 'Escopo `veiculos:ler`.',
          parameters: [{ name: 'ref', in: 'path', required: true, schema: str, description: 'Placa, chassi (17) ou id.' }],
          responses: {
            200: { description: 'Veículo', content: { 'application/json': { schema: { type: 'object', properties: { dados: ref('Veiculo') } } } } },
            404: { description: 'Não encontrado', content: { 'application/json': { schema: ref('Erro') } } },
            ...erros,
          },
        },
      },
      '/rastreadores': {
        get: {
          summary: 'Lista o parque de rastreadores',
          description: 'Escopo `rastreadores:ler`. Chave ligada a uma rastreadora vê só os equipamentos dela.',
          parameters: [...paginacao, { name: 'imei', in: 'query', schema: str }],
          responses: { 200: { description: 'Página de rastreadores', content: { 'application/json': { schema: ref('PaginaRastreadores') } } }, ...erros },
        },
      },
      '/rastreadores/comunicacao': {
        post: {
          summary: 'Informa a última comunicação dos equipamentos',
          description:
            'Escopo `rastreadores:escrever`. Até 500 por chamada. Não muda status nem veículo: é telemetria. ' +
            'Comunicação mais antiga que a já gravada é ignorada (IGNORADO_ANTIGO).',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['comunicacoes'], properties: { comunicacoes: { type: 'array', maxItems: 500, items: ref('Comunicacao') } } } } },
          },
          responses: { 200: { description: 'Resultado por IMEI', content: { 'application/json': { schema: ref('ResultadoComunicacao') } } }, ...erros },
        },
      },
    },
    components: {
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer' },
        chave: { type: 'apiKey', in: 'header', name: 'x-api-key' },
      },
      schemas: {
        Erro: { type: 'object', properties: { erro: str, codigo: str } },
        Status: {
          type: 'object',
          properties: { ok: { type: 'boolean' }, integracao: str, escopos: { type: 'array', items: str }, seu_ip: str, servidor_em: dataHora, versao: str },
        },
        Veiculo: {
          type: 'object',
          properties: {
            id: str, placa: { ...strN, description: 'Nulo no 0 km (placa pendente) — use o chassi.' },
            chassi: strN, renavam: strN, zero_km: { type: 'boolean' },
            marca: strN, modelo: strN, ano_fabricacao: intN, ano_modelo: intN, cor: strN, tipo: strN,
            status: { type: 'string', enum: ['ativo', 'em_evento', 'vistoria_pendente', 'inadimplente', 'suspenso', 'inativo', 'baixado', 'excluido'] },
            situacao_rastreamento: { type: 'string', enum: ['ATIVO', 'SUSPENSO', 'ENCERRADO'] },
            status_desde: dataHora, data_ativacao: data, data_saida: data,
            unidade: { type: 'object', nullable: true, properties: { id: str, nome: str } },
            rastreador: {
              type: 'object', nullable: true,
              properties: { imei: str, chip: strN, rastreadora: { type: 'object', nullable: true, properties: { id: str, nome: str } } },
            },
            associado: {
              type: 'object',
              description: 'Sem o escopo associados:ler vem só o id.',
              properties: { id: str, nome: str, documento: str, tipo_pessoa: { type: 'string', enum: ['PF', 'PJ'] }, telefone: strN, celular: strN, email: strN },
            },
            alterado_em: { type: 'string', format: 'date-time' },
          },
        },
        PaginaVeiculos: {
          type: 'object',
          properties: { dados: { type: 'array', items: ref('Veiculo') }, quantidade: { type: 'integer' }, proximo_cursor: strN },
        },
        Rastreador: {
          type: 'object',
          properties: {
            id: str, imei: str, numero_serie: strN, iccid: strN, linha: strN, operadora: strN, modelo: strN, fabricante: strN,
            status: str, status_numero: { type: 'integer', description: 'Número do status como a equipe fala (2 = Ativo).' },
            status_desde: dataHora,
            rastreadora: { type: 'object', nullable: true, properties: { id: str, nome: str } },
            unidade: { type: 'object', nullable: true, properties: { id: str, nome: str } },
            veiculo: {
              type: 'object', nullable: true,
              properties: { id: str, placa: strN, chassi: strN, status: str, situacao_rastreamento: { type: 'string', enum: ['ATIVO', 'SUSPENSO', 'ENCERRADO'] } },
            },
            data_instalacao: dataHora, ultima_comunicacao: dataHora, ultima_posicao: { type: 'object', nullable: true },
            alterado_em: { type: 'string', format: 'date-time' },
          },
        },
        PaginaRastreadores: {
          type: 'object',
          properties: { dados: { type: 'array', items: ref('Rastreador') }, quantidade: { type: 'integer' }, proximo_cursor: strN },
        },
        Comunicacao: {
          type: 'object',
          required: ['imei', 'comunicado_em'],
          properties: {
            imei: str, comunicado_em: { type: 'string', format: 'date-time' },
            latitude: { type: 'number' }, longitude: { type: 'number' }, velocidade: { type: 'number' },
            ignicao: { type: 'boolean' }, endereco: str,
          },
        },
        ResultadoComunicacao: {
          type: 'object',
          properties: {
            resumo: { type: 'object', additionalProperties: { type: 'integer' } },
            resultados: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  imei: str,
                  resultado: { type: 'string', enum: ['ATUALIZADO', 'IGNORADO_ANTIGO', 'NAO_ENCONTRADO', 'OUTRA_PLATAFORMA', 'INVALIDO'] },
                  situacao_rastreamento: { type: 'string', nullable: true, enum: ['ATIVO', 'SUSPENSO', 'ENCERRADO', null] },
                },
              },
            },
          },
        },
      },
    },
  };
}
