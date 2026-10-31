// DOCUMENTACAO DA API EXTERNA (0151) — fonte UNICA para tudo que se entrega ao
// parceiro: a pagina HTML (/api/externa/v1/docs), o documento Markdown
// (/api/externa/v1/docs.md), a colecao do Postman (/api/externa/v1/postman.json)
// e os exemplos do OpenAPI (/api/externa/v1/openapi.json).
//
// O parceiro (a rastreadora) recebeu so o openapi.json cru e voltou dizendo que
// "faltam os endpoints": JSON de especificacao sem guia nem exemplo nao e
// documentacao. Mudou rota, parametro ou campo: mude AQUI (e no OpenAPI) — ha
// teste conferindo que o catalogo e o OpenAPI listam as mesmas rotas.

export type ParametroDoc = {
  nome: string;
  em: 'query' | 'path';
  tipo: string;
  obrigatorio?: boolean;
  descricao: string;
  exemplo?: string;
};

export type EndpointDoc = {
  id: string;
  metodo: 'GET' | 'POST';
  caminho: string;
  titulo: string;
  descricao: string;
  escopo: string | null;
  parametros: ParametroDoc[];
  corpo?: unknown;
  resposta: unknown;
  erros: string[];
  notas?: string[];
};

export const VERSAO_DOC = '1.2.0';

// ------------------------------------------------------------------ exemplos
const VEICULO_EXEMPLO = {
  id: '6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  placa: 'ABC1D23',
  chassi: '9BWZZZ377VT004251',
  renavam: '00123456789',
  zero_km: false,
  marca: 'VOLKSWAGEN',
  modelo: 'GOL 1.0 FLEX 12V 5P',
  ano_fabricacao: 2021,
  ano_modelo: 2022,
  cor: 'PRATA',
  tipo: 'Passeio',
  status: 'ativo',
  situacao_rastreamento: 'ATIVO',
  status_desde: '2026-03-10T14:22:05Z',
  data_ativacao: '2026-03-10',
  data_saida: null,
  unidade: { id: '2a7c9e10-1111-4222-8333-444455556666', nome: 'SMART CAR MATRIZ' },
  rastreador: {
    imei: '860000000000001',
    chip: '65999998888',
    rastreadora: { id: '7d1e2f30-aaaa-4bbb-8ccc-dddd00001111', nome: 'NEW TRACKER' },
  },
  associado: {
    id: '0b6c9a2e-1111-4222-8333-444455556666',
    nome: 'MARIA DA SILVA',
    documento: '52998224725',
    tipo_pessoa: 'PF',
    telefone: null,
    celular: '65999998888',
    email: 'maria@email.com',
  },
  alterado_em: '2026-10-27T18:40:12.123456Z',
};

const RASTREADOR_EXEMPLO = {
  id: '9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  imei: '860000000000001',
  numero_serie: 'NT-000123',
  iccid: '89550000000000000001',
  linha: '65999998888',
  operadora: 'VIVO',
  modelo: 'NT-40',
  fabricante: 'NEW TRACKER',
  status: 'ATIVO',
  status_numero: 2,
  status_desde: '2026-03-11T10:00:00Z',
  rastreadora: { id: '7d1e2f30-aaaa-4bbb-8ccc-dddd00001111', nome: 'NEW TRACKER' },
  unidade: { id: '2a7c9e10-1111-4222-8333-444455556666', nome: 'SMART CAR MATRIZ' },
  veiculo: {
    id: '6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    placa: 'ABC1D23',
    chassi: '9BWZZZ377VT004251',
    status: 'ativo',
    situacao_rastreamento: 'ATIVO',
  },
  data_instalacao: '2026-03-11T10:00:00Z',
  ultima_comunicacao: '2026-10-28T09:58:31Z',
  ultima_posicao: {
    latitude: -15.601, longitude: -56.097, velocidade: 0, ignicao: false,
    endereco: 'AV. HISTORIADOR RUBENS DE MENDONCA, CUIABA - MT', em: '2026-10-28T09:58:31Z', origem: 'NEW TRACKER',
  },
  alterado_em: '2026-10-28T09:58:40.512301Z',
};

const PAGINACAO: ParametroDoc[] = [
  { nome: 'limite', em: 'query', tipo: 'inteiro (1 a 500)', descricao: 'Registros por página. Padrão 100.', exemplo: '500' },
  { nome: 'cursor', em: 'query', tipo: 'texto', descricao: 'O `proximo_cursor` devolvido na página anterior. Omitir na primeira página.' },
  {
    nome: 'atualizados_desde', em: 'query', tipo: 'data/hora ISO 8601',
    descricao: 'Só registros alterados a partir deste instante (sincronia incremental). Use o maior `alterado_em` já recebido.',
    exemplo: '2026-10-27T00:00:00Z',
  },
];

// ------------------------------------------------------------------ endpoints
export const ENDPOINTS_API: EndpointDoc[] = [
  {
    id: 'status',
    metodo: 'GET',
    caminho: '/status',
    titulo: 'Conferir a chave',
    descricao: 'Primeira chamada da integração: confirma que a chave vale e mostra os escopos liberados e o IP que o SCar está vendo. Não exige escopo.',
    escopo: null,
    parametros: [],
    resposta: {
      ok: true,
      integracao: 'NEW TRACKER',
      escopos: ['associados:ler', 'rastreadores:escrever', 'rastreadores:ler', 'veiculos:ler'],
      unidades: 'todas',
      seu_ip: '200.150.10.20',
      servidor_em: '2026-10-28T13:00:00.000Z',
      versao: 'v1',
    },
    erros: ['SEM_CHAVE', 'CHAVE_INVALIDA', 'CHAVE_PAUSADA', 'CHAVE_VENCIDA', 'CHAVE_REVOGADA', 'IP_NAO_PERMITIDO'],
  },
  {
    id: 'veiculos-listar',
    metodo: 'GET',
    caminho: '/veiculos',
    titulo: 'Listar veículos (base do cruzamento)',
    descricao:
      'Devolve os veículos da Smart Car com placa, chassi, situação, unidade, o rastreador instalado e o associado. ' +
      'É a lista que a plataforma usa para ligar cada veículo ao seu equipamento. Ordenada por `alterado_em` e paginada por cursor.',
    escopo: 'veiculos:ler',
    parametros: [
      ...PAGINACAO,
      { nome: 'placa', em: 'query', tipo: 'texto', descricao: 'Filtra por placa (com ou sem hífen).', exemplo: 'ABC1D23' },
      { nome: 'chassi', em: 'query', tipo: 'texto', descricao: 'Filtra pelo chassi completo (17 caracteres).', exemplo: '9BWZZZ377VT004251' },
      { nome: 'imei', em: 'query', tipo: 'texto (dígitos)', descricao: 'Filtra pelo IMEI do rastreador instalado no veículo.', exemplo: '860000000000001' },
      { nome: 'situacao', em: 'query', tipo: 'ATIVO | SUSPENSO | ENCERRADO', descricao: 'Filtra pela situação do rastreamento.', exemplo: 'ATIVO' },
    ],
    resposta: { dados: [VEICULO_EXEMPLO], quantidade: 1, proximo_cursor: null },
    erros: ['PARAMETRO_INVALIDO', 'SEM_ESCOPO'],
    notas: [
      'Sem o escopo `associados:ler`, o objeto `associado` vem só com o `id` (sem nome, CPF/CNPJ e contato).',
      '`placa` vem nula no veículo 0 km (placa pendente): use o `chassi` para identificar.',
      'Enquanto `proximo_cursor` vier preenchido, há mais páginas: repita a mesma chamada acrescentando `cursor=<proximo_cursor>`.',
    ],
  },
  {
    id: 'veiculos-um',
    metodo: 'GET',
    caminho: '/veiculos/{ref}',
    titulo: 'Consultar um veículo',
    descricao: 'Um veículo pela placa, pelo chassi (17 caracteres) ou pelo id do SCar. Útil para conferir um caso pontual.',
    escopo: 'veiculos:ler',
    parametros: [
      { nome: 'ref', em: 'path', tipo: 'texto', obrigatorio: true, descricao: 'Placa, chassi ou id do veículo.', exemplo: 'ABC1D23' },
    ],
    resposta: { dados: VEICULO_EXEMPLO },
    erros: ['NAO_ENCONTRADO', 'SEM_ESCOPO'],
  },
  {
    id: 'rastreadores-listar',
    metodo: 'GET',
    caminho: '/rastreadores',
    titulo: 'Listar equipamentos (parque de rastreadores)',
    descricao:
      'Os equipamentos cadastrados no SCar, por IMEI, com status, unidade e o veículo em que estão instalados. ' +
      'Chave ligada a uma rastreadora vê só os equipamentos dela.',
    escopo: 'rastreadores:ler',
    parametros: [
      ...PAGINACAO,
      { nome: 'imei', em: 'query', tipo: 'texto (dígitos)', descricao: 'Filtra por IMEI.', exemplo: '860000000000001' },
    ],
    resposta: { dados: [RASTREADOR_EXEMPLO], quantidade: 1, proximo_cursor: null },
    erros: ['PARAMETRO_INVALIDO', 'SEM_ESCOPO'],
    notas: ['`status_numero` é o número que a equipe usa: 1 Disponível (estoque) · 2 Ativo/instalado · 3 Inadimplente · 4 Inativo (pedir devolução) · 5 A devolver · 6 Cobrar rastreador · 7 Boleto gerado · 8 Pendência de dados · 9 Manutenção · 10 Duplicado · 11 Baixado.'],
  },
  {
    id: 'rastreadores-cadastrar',
    metodo: 'POST',
    caminho: '/rastreadores',
    titulo: 'Cadastrar equipamentos e instalar nos veículos',
    descricao:
      'A plataforma cadastra os seus equipamentos no SCar pelo IMEI e, informando o veículo (placa, chassi ou veiculo_id), ' +
      'registra a instalação. Até 500 itens por chamada. Reenviar o mesmo IMEI é seguro: completa os dados e não duplica. ' +
      'É a primeira chamada a fazer: sem o equipamento cadastrado, a comunicação volta NAO_ENCONTRADO.',
    escopo: 'rastreadores:escrever',
    parametros: [],
    corpo: {
      equipamentos: [
        {
          imei: '860000000000001',
          numero_serie: 'NT-000123',
          iccid: '89550000000000000001',
          linha: '65999998888',
          operadora: 'VIVO',
          modelo: 'NT-40',
          fabricante: 'NEW TRACKER',
          placa: 'ABC1D23',
          data_instalacao: '2026-10-30T10:00:00-03:00',
        },
        { imei: '860000000000002', numero_serie: 'NT-000124' },
      ],
    },
    resposta: {
      resumo: { CRIADO_INSTALADO: 1, CRIADO: 1 },
      resultados: [
        { imei: '860000000000001', resultado: 'CRIADO_INSTALADO', motivo: null, rastreador_id: '9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', veiculo_id: '6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', placa: 'ABC1D23', situacao_rastreamento: 'ATIVO' },
        { imei: '860000000000002', resultado: 'CRIADO', motivo: null, rastreador_id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', veiculo_id: null, placa: null, situacao_rastreamento: null },
      ],
    },
    erros: ['CORPO_INVALIDO', 'SEM_ESCOPO', 'CHAVE_SEM_RASTREADORA'],
    notas: [
      'Obrigatório por item: `imei` (14 a 17 dígitos). Para instalar, informe UM de: `placa`, `chassi` ou `veiculo_id` (o `id` de GET /veiculos). Sem veículo, o equipamento entra em estoque.',
      'O equipamento é registrado em nome da rastreadora ligada à chave. IMEI já cadastrado por outra rastreadora volta OUTRA_PLATAFORMA e não é alterado.',
      'Se o veículo já tiver outro equipamento SEU ativo, ele volta ao estoque (troca de aparelho). Se for de outra rastreadora, a instalação é RECUSADA. Equipamento ativo em outro veículo é movido.',
      'Resultado por item: CRIADO · CRIADO_INSTALADO · ATUALIZADO · INSTALADO · JA_INSTALADO · VEICULO_NAO_ENCONTRADO (equipamento fica em estoque) · OUTRA_PLATAFORMA · RECUSADO (veja `motivo`) · INVALIDO · ERRO. Um item ruim não derruba o lote.',
      'Desinstalar e baixar equipamento continuam com a equipe da Smart Car.',
    ],
  },
  {
    id: 'rastreadores-comunicacao',
    metodo: 'POST',
    caminho: '/rastreadores/comunicacao',
    titulo: 'Informar a última comunicação dos equipamentos',
    descricao:
      'A plataforma envia, para cada IMEI, a data/hora da última comunicação e (opcional) a posição. ' +
      'Até 500 itens por chamada. Não altera status nem veículo: é telemetria. A resposta já diz, por IMEI, a situação do veículo no SCar.',
    escopo: 'rastreadores:escrever',
    parametros: [],
    corpo: {
      comunicacoes: [
        {
          imei: '860000000000001',
          comunicado_em: '2026-10-28T09:58:31-03:00',
          latitude: -15.601,
          longitude: -56.097,
          velocidade: 0,
          ignicao: false,
          endereco: 'AV. HISTORIADOR RUBENS DE MENDONCA, CUIABA - MT',
        },
      ],
    },
    resposta: {
      resumo: { ATUALIZADO: 1 },
      resultados: [{ imei: '860000000000001', resultado: 'ATUALIZADO', situacao_rastreamento: 'ATIVO' }],
    },
    erros: ['CORPO_INVALIDO', 'SEM_ESCOPO'],
    notas: [
      'Obrigatórios por item: `imei` (14 a 17 dígitos) e `comunicado_em` (ISO 8601, com fuso). Os demais são opcionais.',
      'Resultado por item: ATUALIZADO · IGNORADO_ANTIGO (mais antiga que a já gravada) · NAO_ENCONTRADO (IMEI fora do SCar) · OUTRA_PLATAFORMA (equipamento de outra rastreadora) · INVALIDO (item mal formado). Um item ruim não derruba o lote.',
    ],
  },
];

// ------------------------------------------------------------------ erros
export const ERROS_API: { codigo: string; http: number; significado: string; oQueFazer: string }[] = [
  { codigo: 'SEM_CHAVE', http: 401, significado: 'A requisição veio sem chave.', oQueFazer: 'Enviar `Authorization: Bearer <chave>` ou `x-api-key: <chave>`.' },
  { codigo: 'CHAVE_INVALIDA', http: 401, significado: 'Chave inexistente ou digitada errada.', oQueFazer: 'Conferir a chave inteira (começa com `scar_`).' },
  { codigo: 'MUITAS_TENTATIVAS', http: 429, significado: 'Muitas chaves inválidas do mesmo IP (20 em 10 min).', oQueFazer: 'Aguardar o tempo informado e corrigir a chave.' },
  { codigo: 'CHAVE_PAUSADA', http: 403, significado: 'A Smart Car pausou a chave.', oQueFazer: 'Falar com a Smart Car.' },
  { codigo: 'CHAVE_VENCIDA', http: 403, significado: 'A validade da chave acabou.', oQueFazer: 'Pedir uma chave nova.' },
  { codigo: 'CHAVE_REVOGADA', http: 403, significado: 'A chave foi revogada.', oQueFazer: 'Pedir uma chave nova.' },
  { codigo: 'IP_NAO_PERMITIDO', http: 403, significado: 'A chave só vale para IPs cadastrados e este não está.', oQueFazer: 'Informar à Smart Car o IP de saída (veja `seu_ip` em /status).' },
  { codigo: 'SEM_ESCOPO', http: 403, significado: 'A chave não tem permissão para esta rota.', oQueFazer: 'Pedir o escopo à Smart Car.' },
  { codigo: 'LIMITE', http: 429, significado: 'Mais de 120 requisições por minuto na mesma chave.', oQueFazer: 'Esperar os segundos informados; usar `limite=500` para paginar com menos chamadas.' },
  { codigo: 'PARAMETRO_INVALIDO', http: 400, significado: 'Data, cursor ou situação em formato errado.', oQueFazer: 'Conferir o parâmetro citado na mensagem.' },
  { codigo: 'CORPO_INVALIDO', http: 400, significado: 'Corpo do POST fora do formato (ou mais de 500 itens).', oQueFazer: 'Enviar `{ "equipamentos": [ ... ] }` ou `{ "comunicacoes": [ ... ] }` com até 500 itens.' },
  { codigo: 'CHAVE_SEM_RASTREADORA', http: 403, significado: 'A chave não está ligada a uma rastreadora, então não pode cadastrar equipamento.', oQueFazer: 'Pedir à Smart Car para vincular a chave à rastreadora.' },
  { codigo: 'NAO_ENCONTRADO', http: 404, significado: 'Veículo não encontrado (ou fora das unidades desta chave).', oQueFazer: 'Conferir placa/chassi.' },
  { codigo: 'ERRO_CONSULTA', http: 400, significado: 'O SCar recusou a consulta.', oQueFazer: 'Ler a mensagem; se persistir, falar com a Smart Car.' },
  { codigo: 'ERRO_GRAVACAO', http: 400, significado: 'O SCar recusou a gravação.', oQueFazer: 'Ler a mensagem; se persistir, falar com a Smart Car.' },
  { codigo: 'ERRO_INTERNO', http: 500, significado: 'Falha inesperada no SCar.', oQueFazer: 'Tentar de novo em alguns minutos; se persistir, avisar a Smart Car.' },
];

export const SITUACOES_DOC: { codigo: string; status: string; acao: string }[] = [
  { codigo: 'ATIVO', status: 'ativo, em_evento, vistoria_pendente', acao: 'Manter o rastreamento.' },
  { codigo: 'SUSPENSO', status: 'inadimplente, suspenso', acao: 'Associado com benefícios bloqueados. O equipamento continua no veículo.' },
  { codigo: 'ENCERRADO', status: 'inativo, baixado, excluido', acao: 'O veículo saiu da proteção: encerrar o rastreamento e recolher o equipamento.' },
];

export const PASSOS_INTEGRACAO: string[] = [
  'Receber da Smart Car a chave (`scar_…`) e, se for o caso, informar o IP fixo de saída do servidor.',
  'Chamar `GET /status` para conferir a chave e os escopos.',
  'Cadastrar o parque: `POST /rastreadores` com os equipamentos (IMEI) e o veículo de cada um (placa ou chassi), em lotes de até 500. Repetir sempre que instalar ou trocar um aparelho.',
  'Carga inicial: `GET /veiculos?limite=500` e repetir com `cursor=<proximo_cursor>` até ele vir `null`. Ligar cada veículo ao equipamento pelo IMEI (`rastreador.imei`), pela placa ou pelo chassi.',
  'Guardar o maior `alterado_em` recebido.',
  'De tempos em tempos (sugestão: a cada 15 a 60 minutos), chamar `GET /veiculos?atualizados_desde=<maior alterado_em>` com a mesma paginação e aplicar as mudanças — principalmente `situacao_rastreamento`.',
  'Enviar `POST /rastreadores/comunicacao` com a última comunicação de cada IMEI (em lotes de até 500).',
];

// ------------------------------------------------------------------ helpers
/** Origem publica (https://host) a partir dos cabecalhos do proxy. */
export function origemDaRequisicao(h: Headers): string {
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'appsmartcar.com.br';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

function curl(base: string, e: EndpointDoc): string {
  const caminho = e.caminho.replace('{ref}', 'ABC1D23');
  const qs = e.metodo === 'GET' && e.id.endsWith('-listar') ? '?limite=500' : '';
  const linhas = [`curl -X ${e.metodo} "${base}${caminho}${qs}" \\`, '  -H "Authorization: Bearer SUA_CHAVE"'];
  if (e.corpo) {
    linhas[1] += ' \\';
    linhas.push('  -H "Content-Type: application/json" \\');
    linhas.push(`  -d '${JSON.stringify(e.corpo)}'`);
  }
  return linhas.join('\n');
}

export function exemploCurl(base: string, id: string): string {
  const e = ENDPOINTS_API.find((x) => x.id === id);
  return e ? curl(base, e) : '';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** `codigo` em Markdown -> <code> (o texto ja vem escapado). */
function inline(s: string): string {
  return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}

// ------------------------------------------------------------------ Markdown
export function documentacaoMarkdown(origem: string): string {
  const base = `${origem}/api/externa/v1`;
  const l: string[] = [];
  l.push(`# SCar — API de integração (v${VERSAO_DOC})`, '');
  l.push('API REST da Smart Car Brasil para sistemas parceiros. Todas as respostas são JSON (UTF-8).', '');
  l.push('## 1. Acesso', '');
  l.push(`- **Endereço base:** \`${base}\``);
  l.push('- **Autenticação:** chave por sistema, emitida pela Smart Car. Envie em todo pedido um destes cabeçalhos:');
  l.push('  - `Authorization: Bearer SUA_CHAVE`');
  l.push('  - `x-api-key: SUA_CHAVE`');
  l.push('- **Datas:** ISO 8601. As respostas vêm em UTC (`Z`).');
  l.push('- **Limite:** 120 requisições por minuto por chave.');
  l.push(`- **Especificação OpenAPI 3:** \`${base}/openapi.json\` · **Coleção Postman:** \`${base}/postman.json\``, '');
  l.push('## 2. Roteiro da integração', '');
  PASSOS_INTEGRACAO.forEach((p, i) => l.push(`${i + 1}. ${p}`));
  l.push('');
  l.push('## 3. O que fazer com cada veículo (`situacao_rastreamento`)', '');
  l.push('| Situação | Status do veículo no SCar | Ação na plataforma |', '|---|---|---|');
  SITUACOES_DOC.forEach((s) => l.push(`| \`${s.codigo}\` | ${s.status} | ${s.acao} |`));
  l.push('');
  l.push('## 4. Endpoints', '');
  l.push('| Método | Rota | O que faz | Escopo |', '|---|---|---|---|');
  ENDPOINTS_API.forEach((e) => l.push(`| ${e.metodo} | \`${e.caminho}\` | ${e.titulo} | ${e.escopo ? `\`${e.escopo}\`` : '—'} |`));
  l.push('');
  ENDPOINTS_API.forEach((e, i) => {
    l.push(`### 4.${i + 1} ${e.metodo} ${e.caminho} — ${e.titulo}`, '');
    l.push(e.descricao, '');
    l.push(`**Escopo:** ${e.escopo ? `\`${e.escopo}\`` : 'nenhum'}`, '');
    if (e.parametros.length) {
      l.push('**Parâmetros**', '', '| Nome | Onde | Tipo | Obrig. | Descrição |', '|---|---|---|---|---|');
      e.parametros.forEach((p) => l.push(`| \`${p.nome}\` | ${p.em} | ${p.tipo} | ${p.obrigatorio ? 'sim' : 'não'} | ${p.descricao} |`));
      l.push('');
    }
    l.push('**Exemplo de chamada**', '', '```bash', curl(base, e), '```', '');
    if (e.corpo) l.push('**Corpo (JSON)**', '', '```json', JSON.stringify(e.corpo, null, 2), '```', '');
    l.push('**Resposta 200**', '', '```json', JSON.stringify(e.resposta, null, 2), '```', '');
    (e.notas ?? []).forEach((n) => l.push(`- ${n}`));
    if (e.notas?.length) l.push('');
    l.push(`**Erros próprios:** ${e.erros.map((c) => `\`${c}\``).join(', ')}`, '');
  });
  l.push('## 5. Erros', '');
  l.push('Todo erro volta como `{ "erro": "mensagem", "codigo": "CODIGO" }`.', '');
  l.push('| HTTP | Código | Significado | O que fazer |', '|---|---|---|---|');
  ERROS_API.forEach((x) => l.push(`| ${x.http} | \`${x.codigo}\` | ${x.significado} | ${x.oQueFazer} |`));
  l.push('');
  return l.join('\n');
}

// ------------------------------------------------------------------ HTML
export function paginaDocumentacao(origem: string): string {
  const base = `${origem}/api/externa/v1`;
  const json = (v: unknown) => esc(JSON.stringify(v, null, 2));
  const bloco = (txt: string) => `<div class="cod"><button class="copiar" type="button">Copiar</button><pre>${txt}</pre></div>`;

  const endpoints = ENDPOINTS_API.map((e) => `
<section id="${e.id}" class="ep">
  <h3><span class="met m-${e.metodo.toLowerCase()}">${e.metodo}</span> <code>${esc(e.caminho)}</code></h3>
  <p class="tit">${esc(e.titulo)}</p>
  <p>${inline(e.descricao)}</p>
  <p><b>Escopo:</b> ${e.escopo ? `<code>${esc(e.escopo)}</code>` : 'nenhum'}</p>
  ${e.parametros.length ? `<table><thead><tr><th>Parâmetro</th><th>Onde</th><th>Tipo</th><th>Obrig.</th><th>Descrição</th></tr></thead><tbody>
  ${e.parametros.map((p) => `<tr><td><code>${esc(p.nome)}</code></td><td>${p.em}</td><td>${esc(p.tipo)}</td><td>${p.obrigatorio ? 'sim' : 'não'}</td><td>${inline(p.descricao)}${p.exemplo ? ` <span class="ex">ex.: <code>${esc(p.exemplo)}</code></span>` : ''}</td></tr>`).join('')}
  </tbody></table>` : ''}
  <h4>Exemplo de chamada</h4>${bloco(esc(curl(base, e)))}
  ${e.corpo ? `<h4>Corpo (JSON)</h4>${bloco(json(e.corpo))}` : ''}
  <h4>Resposta 200</h4>${bloco(json(e.resposta))}
  ${(e.notas ?? []).length ? `<ul>${(e.notas ?? []).map((n) => `<li>${inline(n)}</li>`).join('')}</ul>` : ''}
  <p class="err"><b>Erros próprios:</b> ${e.erros.map((c) => `<a href="#erros"><code>${c}</code></a>`).join(' ')}</p>
</section>`).join('\n');

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SCar — API de integração</title>
<style>
:root{--fundo:#eef2f8;--card:#fff;--txt:#0f1b33;--sec:#38455c;--borda:#c9d3e3;--navy:#142445;--ciano:#0678a0;--cod:#0f1b33;--codtxt:#e6edf7}
*{box-sizing:border-box}body{margin:0;font:15px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--fundo);color:var(--txt)}
header{background:var(--navy);color:#fff;padding:24px 16px}header .in{max-width:1080px;margin:0 auto}header h1{margin:0 0 4px;font-size:24px}header p{margin:0;opacity:.85}
main{max-width:1080px;margin:0 auto;padding:16px}nav{background:var(--card);border:1px solid var(--borda);border-radius:12px;padding:12px 16px;margin-bottom:16px}
nav a{color:var(--ciano);text-decoration:none;margin-right:14px;display:inline-block}section{background:var(--card);border:1px solid var(--borda);border-radius:12px;padding:16px 20px;margin-bottom:16px}
h2{margin:0 0 10px;font-size:20px}h3{margin:0;font-size:18px}h4{margin:16px 0 6px;font-size:14px;color:var(--sec)}.tit{margin:4px 0 8px;font-weight:600}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;background:#e8eef7;padding:1px 5px;border-radius:4px}
.cod{position:relative}.cod pre{background:var(--cod);color:var(--codtxt);padding:14px;border-radius:8px;overflow:auto;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;margin:0}
.copiar{position:absolute;top:8px;right:8px;background:#2b3a5c;color:#fff;border:0;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer}
table{width:100%;border-collapse:collapse;margin:8px 0;font-size:14px}th,td{border-bottom:1px solid var(--borda);padding:6px 8px;text-align:left;vertical-align:top}th{background:#eaeff7}
.met{display:inline-block;color:#fff;font-size:12px;font-weight:700;padding:2px 8px;border-radius:6px;vertical-align:middle}.m-get{background:#12804a}.m-post{background:#0678a0}
.ex{color:var(--sec);white-space:nowrap}.err{color:var(--sec);font-size:14px}.dl a{display:inline-block;margin:4px 8px 4px 0;padding:6px 12px;border-radius:8px;background:var(--navy);color:#fff;text-decoration:none;font-size:14px}
ol li,ul li{margin:4px 0}@media(max-width:640px){table{display:block;overflow-x:auto}}
</style></head><body>
<header><div class="in"><h1>SCar — API de integração</h1><p>Smart Car Brasil · versão ${VERSAO_DOC} · REST/JSON</p></div></header>
<main>
<nav><a href="#acesso">Acesso</a><a href="#roteiro">Roteiro</a><a href="#situacao">Situação do veículo</a>${ENDPOINTS_API.map((e) => `<a href="#${e.id}">${e.metodo} ${esc(e.caminho)}</a>`).join('')}<a href="#erros">Erros</a></nav>

<section id="acesso"><h2>1. Acesso</h2>
<p><b>Endereço base:</b> <code>${esc(base)}</code></p>
<p><b>Autenticação:</b> chave por sistema, emitida pela Smart Car (começa com <code>scar_</code>). Envie em <u>todo</u> pedido um destes cabeçalhos:</p>
${bloco(`Authorization: Bearer SUA_CHAVE\n# ou\nx-api-key: SUA_CHAVE`)}
<ul><li>Respostas em JSON (UTF-8). Datas em ISO 8601, devolvidas em UTC (<code>Z</code>).</li>
<li>Limite de 120 requisições por minuto por chave.</li>
<li>Paginação por cursor: enquanto <code>proximo_cursor</code> vier preenchido, repita a chamada com <code>cursor=&lt;proximo_cursor&gt;</code>.</li></ul>
<p class="dl"><a href="${esc(base)}/postman.json" download>Baixar coleção Postman</a><a href="${esc(base)}/openapi.json">Especificação OpenAPI 3 (JSON)</a><a href="${esc(base)}/docs.md" download>Baixar esta documentação (Markdown)</a></p>
</section>

<section id="roteiro"><h2>2. Roteiro da integração</h2><ol>${PASSOS_INTEGRACAO.map((p) => `<li>${inline(p)}</li>`).join('')}</ol></section>

<section id="situacao"><h2>3. O que fazer com cada veículo — <code>situacao_rastreamento</code></h2>
<table><thead><tr><th>Situação</th><th>Status do veículo no SCar</th><th>Ação na plataforma</th></tr></thead><tbody>
${SITUACOES_DOC.map((s) => `<tr><td><code>${s.codigo}</code></td><td>${esc(s.status)}</td><td>${esc(s.acao)}</td></tr>`).join('')}
</tbody></table></section>

<section><h2>4. Endpoints</h2><table><thead><tr><th>Método</th><th>Rota</th><th>O que faz</th><th>Escopo</th></tr></thead><tbody>
${ENDPOINTS_API.map((e) => `<tr><td><span class="met m-${e.metodo.toLowerCase()}">${e.metodo}</span></td><td><a href="#${e.id}"><code>${esc(e.caminho)}</code></a></td><td>${esc(e.titulo)}</td><td>${e.escopo ? `<code>${e.escopo}</code>` : '—'}</td></tr>`).join('')}
</tbody></table></section>
${endpoints}

<section id="erros"><h2>5. Erros</h2><p>Todo erro volta como <code>{ "erro": "mensagem", "codigo": "CODIGO" }</code>.</p>
<table><thead><tr><th>HTTP</th><th>Código</th><th>Significado</th><th>O que fazer</th></tr></thead><tbody>
${ERROS_API.map((x) => `<tr><td>${x.http}</td><td><code>${x.codigo}</code></td><td>${esc(x.significado)}</td><td>${inline(x.oQueFazer)}</td></tr>`).join('')}
</tbody></table></section>
</main>
<script>document.querySelectorAll('.copiar').forEach(function(b){b.addEventListener('click',function(){var t=b.nextElementSibling.innerText;navigator.clipboard.writeText(t).then(function(){b.textContent='Copiado';setTimeout(function(){b.textContent='Copiar'},1500)})})})</script>
</body></html>`;
}

// ------------------------------------------------------------------ Postman
export function colecaoPostman(origem: string) {
  const base = `${origem}/api/externa/v1`;
  return {
    info: {
      name: 'SCar — API de integração',
      description: `Smart Car Brasil. Preencha a variável "chave" com a chave recebida. Documentação: ${base}/docs`,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{chave}}', type: 'string' }] },
    variable: [
      { key: 'base_url', value: base },
      { key: 'chave', value: 'COLE_A_CHAVE_AQUI' },
    ],
    item: ENDPOINTS_API.map((e) => {
      const caminho = e.caminho.replace('{ref}', '{{ref}}');
      const query = e.parametros.filter((p) => p.em === 'query').map((p) => ({
        key: p.nome, value: p.exemplo ?? '', description: p.descricao, disabled: p.nome !== 'limite',
      }));
      const qs = query.filter((q) => !q.disabled).map((q) => `${q.key}=${q.value}`).join('&');
      return {
        name: `${e.metodo} ${e.caminho} — ${e.titulo}`,
        request: {
          method: e.metodo,
          header: e.corpo ? [{ key: 'Content-Type', value: 'application/json' }] : [],
          url: {
            raw: `{{base_url}}${caminho}${qs ? `?${qs}` : ''}`,
            host: ['{{base_url}}'],
            path: caminho.split('/').filter(Boolean),
            query,
            variable: e.caminho.includes('{ref}') ? [{ key: 'ref', value: 'ABC1D23' }] : undefined,
          },
          description: e.descricao,
          ...(e.corpo ? { body: { mode: 'raw', raw: JSON.stringify(e.corpo, null, 2), options: { raw: { language: 'json' } } } } : {}),
        },
        response: [],
      };
    }),
  };
}
