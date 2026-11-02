/**
 * Modelos de WhatsApp EDITAVEIS (etapa 3, 0172). Mesma ideia dos e-mails (0170): o texto
 * ORIGINAL mora aqui; no banco (`comunicacao_modelos`, canal WHATSAPP) fica so o que difere.
 *
 * Nao ha envio automatico: estes sao os textos que os botoes "WhatsApp" do sistema abrem
 * prontos (wa.me). O que e LISTA (os boletos com linha digitavel e PIX) continua montado pelo
 * sistema e entra entre as partes; a tela edita a conversa em volta.
 *
 * Campo vazio some sem deixar sobra: espacos duplos, espaco antes de pontuacao e parenteses
 * vazios sao limpos linha a linha (`limparMensagem`). Por isso campos opcionais trazem a frase
 * inteira ("{prazo}" = "O link vale até 08/11/2026.") ou so o pedaco ("{veiculo}" = "do veículo ABC1D23").
 */
import { PALAVRAS_PROIBIDAS } from './cobranca';
import { aplicarCampos, camposUsados, type CampoModelo, type ParteModelo, type TextosModelo } from './modelos';

export type CodigoModeloWhatsApp =
  | 'proposta'
  | 'vistoria'
  | 'revistoria'
  | 'revistoria_refazer'
  | 'cobranca'
  | 'boleto'
  | 'carne'
  | 'boas_vindas'
  | 'sac_contato'
  | 'evento_associado'
  | 'evento_terceiro';

export interface ModeloWhatsApp {
  codigo: CodigoModeloWhatsApp;
  nome: string;
  grupo: 'Vendas' | 'Cobrança' | 'Atendimento' | 'Eventos';
  descricao: string;
  /** onde o botao fica (para quem edita saber o que muda) */
  onde: string;
  /** palavras que nao podem aparecer (ameaca na cobranca; vocabulario de seguro no evento) */
  proibidas: readonly string[];
  campos: CampoModelo[];
  partes: ParteModelo[];
}

/** Palavras que o envolvido do evento nao le (mesma lista de comunicacao-evento.ts). */
export const PROIBIDAS_EVENTO = ['sinistro', 'seguro', 'segurado', 'apolice', 'premio', 'indeniza', 'franquia', 'corretor'];

const C = {
  saudacao: { chave: 'saudacao', descricao: '"Olá, Maria!" (vazio quando não há nome)', exemplo: 'Olá, Maria!' },
  nome: { chave: 'nome', descricao: 'Primeiro nome', exemplo: 'Maria' },
  link: { chave: 'link', descricao: 'O link (obrigatório no texto)', exemplo: 'https://appsmartcar.com.br/x/abc' },
  prazo: { chave: 'prazo', descricao: 'Frase da validade: "O link vale até 08/11/2026."', exemplo: 'O link vale até 08/11/2026.' },
  veiculoDo: { chave: 'veiculo', descricao: '"do veículo ABC1D23" (vazio sem placa)', exemplo: 'do veículo ABC1D23' },
  placa: { chave: 'placa', descricao: 'Placa do veículo', exemplo: 'ABC1D23' },
  empresa: { chave: 'empresa', descricao: 'Nome da associação', exemplo: 'Smart Car Brasil' },
  valor: { chave: 'valor', descricao: 'Valor total em aberto', exemplo: 'R$ 250,00' },
  protocolo: { chave: 'protocolo', descricao: '"(protocolo EVT-…)"', exemplo: '(protocolo EVT-20261102-0001)' },
} satisfies Record<string, CampoModelo>;

const t = (chave: string, rotulo: string, padrao: string, o: Partial<Pick<ParteModelo, 'linhas' | 'obrigatorio' | 'limite' | 'ajuda'>> = {}): ParteModelo => ({
  chave, rotulo, padrao,
  linhas: o.linhas ?? 4,
  obrigatorio: o.obrigatorio ?? true,
  limite: o.limite ?? 1000,
  ajuda: o.ajuda,
});

export const MODELOS_WHATSAPP: ModeloWhatsApp[] = [
  {
    codigo: 'proposta', nome: 'Envio da proposta', grupo: 'Vendas',
    descricao: 'O link da proposta comercial ao cliente.',
    onde: 'Ficha da venda (CRM) → cartão da cotação → WhatsApp.',
    proibidas: [],
    campos: [C.saudacao, C.nome, C.link],
    partes: [t('texto', 'Mensagem', '{saudacao} Segue a sua proposta da Smart Car Brasil: {link}')],
  },
  {
    codigo: 'vistoria', nome: 'Link da vistoria', grupo: 'Vendas',
    descricao: 'O convite para o cliente fotografar o veículo pelo celular.',
    onde: 'Fechamento da venda e portal do vendedor → Documentos e fotos → Enviar link.',
    proibidas: [],
    campos: [C.saudacao, C.nome, C.link, C.prazo],
    partes: [t('texto', 'Mensagem',
      '{saudacao} Para concluir a sua proteção, faltam as fotos do veículo. É pelo celular mesmo e leva uns 3 minutos: {link} {prazo}')],
  },
  {
    codigo: 'revistoria', nome: 'Pedido de revistoria', grupo: 'Cobrança',
    descricao: 'Antes da 2ª via do boleto vencido: frente, traseira e vídeo.',
    onde: 'SAC, modal da 2ª via e Cobrança → Revistorias.',
    proibidas: PALAVRAS_PROIBIDAS,
    campos: [C.saudacao, C.nome, C.veiculoDo, C.link, C.prazo,
      { chave: 'segundos', descricao: 'Duração máxima do vídeo', exemplo: '30' }],
    partes: [t('texto', 'Mensagem',
      '{saudacao} Para emitirmos o seu novo boleto {veiculo}, precisamos de uma revistoria rápida: uma foto da frente, uma da traseira e um vídeo de até {segundos} segundos dando a volta no carro. É pelo celular e leva uns 2 minutos: {link} {prazo} Assim que aprovarmos, enviamos o boleto.')],
  },
  {
    codigo: 'revistoria_refazer', nome: 'Revistoria reprovada', grupo: 'Cobrança',
    descricao: 'Quando a equipe pede para refazer, com o motivo.',
    onde: 'Cobrança → Revistorias → Reprovar.',
    proibidas: PALAVRAS_PROIBIDAS,
    campos: [C.saudacao, C.nome, C.veiculoDo, C.link, C.prazo,
      { chave: 'motivo', descricao: 'O motivo da reprovação', exemplo: 'A foto da traseira ficou escura.' }],
    partes: [t('texto', 'Mensagem',
      '{saudacao} Precisamos que refaça a revistoria {veiculo}: {motivo} Use o mesmo link: {link} {prazo}')],
  },
  {
    codigo: 'cobranca', nome: 'Abordagem de cobrança', grupo: 'Cobrança',
    descricao: 'O primeiro contato com o associado em atraso.',
    onde: 'Cobrança → Fila de Cobrança → ficha → WhatsApp.',
    proibidas: PALAVRAS_PROIBIDAS,
    campos: [C.saudacao, C.nome, C.empresa, C.valor,
      { chave: 'quantidade', descricao: '"2 mensalidades em aberto"', exemplo: '2 mensalidades em aberto' },
      C.veiculoDo],
    partes: [t('texto', 'Mensagem',
      '{saudacao} Aqui é da {empresa}. Identificamos {quantidade} {veiculo}, no total de {valor}. Podemos ajudar a regularizar? Mantendo em dia, sua proteção e a assistência 24h continuam ativas.')],
  },
  {
    codigo: 'boleto', nome: '2ª via e boletos do acordo', grupo: 'Cobrança',
    descricao: 'O boleto novo (2ª via, acordo, pró-rata, avulso): entre a abertura e o fechamento o sistema põe vencimento, valor, linha digitável e PIX de cada boleto.',
    onde: 'Histórico Financeiro (SAC e fichas), negociação e cancelamento.',
    proibidas: PALAVRAS_PROIBIDAS,
    campos: [C.saudacao, C.nome,
      { chave: 'o_que', descricao: '"o seu boleto" ou "os boletos do seu acordo"', exemplo: 'o seu boleto' }],
    partes: [
      t('abertura', 'Abertura', '{saudacao} Segue {o_que} da Smart Car Brasil.', { linhas: 2 }),
      t('fecho_substitui', 'Fechamento — substituiu UM boleto', 'O boleto anterior foi substituido por este: pague somente este.', { linhas: 2 }),
      t('fecho_substitui_varios', 'Fechamento — acordo (vários boletos)', 'Os boletos anteriores foram substituidos por estes: pague somente os desta mensagem.', { linhas: 2 }),
      t('fecho_mesmo', 'Fechamento — 2ª via do mesmo boleto', 'Qualquer duvida, fale com a nossa central.', { linhas: 2 }),
    ],
  },
  {
    codigo: 'carne', nome: 'Carnê da adesão', grupo: 'Cobrança',
    descricao: 'Os boletos do carnê: entre a abertura e o fechamento o sistema lista cada boleto com a linha digitável.',
    onde: 'Aprovação da venda e ficha do veículo → Carnê / boletos → WhatsApp.',
    proibidas: PALAVRAS_PROIBIDAS,
    campos: [C.saudacao, C.nome,
      { chave: 'veiculo', descricao: '"(ABC1D23)" (vazio sem placa)', exemplo: '(ABC1D23)' }],
    partes: [
      t('abertura', 'Abertura', '{saudacao} Seguem os boletos da sua proteção veicular {veiculo}:', { linhas: 2 }),
      t('fecho', 'Fechamento', 'Todos também podem ser pagos por PIX (o código está no boleto).', { linhas: 2 }),
    ],
  },
  {
    codigo: 'boas_vindas', nome: 'Boas-vindas', grupo: 'Vendas',
    descricao: 'Na entrada na base. Depois do texto o sistema lista os boletos, quando houver.',
    onde: 'Autorização da venda → boas-vindas → WhatsApp.',
    proibidas: [],
    campos: [C.saudacao, C.nome, C.placa,
      { chave: 'cobertura', descricao: '"A cobertura começa em 05/11/2026 14:00." (vazio sem carência)', exemplo: 'A cobertura começa em 05/11/2026 14:00.' },
      { chave: 'portal', descricao: 'Link de login do portal', exemplo: 'https://appsmartcar.com.br/portal/login' }],
    partes: [t('texto', 'Mensagem',
      '{saudacao} Seja bem-vindo(a) à Smart Car Brasil 🚗\nA proteção do seu veículo {placa} está ativa. {cobertura}\n\nPortal do associado: {portal}\nLogin e senha do primeiro acesso: o seu CPF (só os números). Lá estão seus boletos, a 2ª via e os documentos.',
      { linhas: 7 })],
  },
  {
    codigo: 'sac_contato', nome: 'Contato do SAC', grupo: 'Atendimento',
    descricao: 'O texto que já vem escrito no botão WhatsApp do SAC (dá para mudar antes de enviar).',
    onde: 'SAC → veículo → WhatsApp.',
    proibidas: [],
    campos: [C.nome, C.empresa,
      { chave: 'atendente', descricao: 'Nome de quem atende ("a equipe" quando não há)', exemplo: 'a equipe' },
      { chave: 'veiculo', descricao: '"referente ao veículo ABC1D23"', exemplo: 'referente ao veículo ABC1D23' }],
    partes: [t('texto', 'Mensagem', 'Olá, {nome}! Aqui é {atendente} da {empresa}. Estamos entrando em contato {veiculo}. Podemos falar agora?')],
  },
  {
    codigo: 'evento_associado', nome: 'Comunicação de evento — associado e condutor', grupo: 'Eventos',
    descricao: 'O link para o associado (ou o condutor) contar o evento e mandar fotos.',
    onde: 'Ficha do evento → Comunicações → WhatsApp.',
    proibidas: PROIBIDAS_EVENTO,
    campos: [C.saudacao, C.nome, C.protocolo, C.link],
    partes: [t('texto', 'Mensagem',
      '{saudacao} Recebemos a comunicação do evento com o seu veículo {protocolo}. Para agilizar, conte o que aconteceu e envie as fotos por este link:\n{link}\nLeva poucos minutos e você pode parar e continuar depois. Comunique o quanto antes.')],
  },
  {
    codigo: 'evento_terceiro', nome: 'Comunicação de evento — terceiro, passageiro e testemunha', grupo: 'Eventos',
    descricao: 'O link para quem não é associado. Não cite o associado nem valores.',
    onde: 'Ficha do evento → Comunicações → WhatsApp.',
    proibidas: PROIBIDAS_EVENTO,
    campos: [C.saudacao, C.nome, C.protocolo, C.link],
    partes: [t('texto', 'Mensagem',
      '{saudacao} A Smart Car Brasil esta registrando um evento de transito {protocolo} em que você esteve envolvido(a). Pedimos que conte o que aconteceu e, se puder, envie fotos por este link:\n{link}\nLeva poucos minutos e você pode parar e continuar depois. Comunique o quanto antes.')],
  },
];

/** Partes que precisam ter o campo {link} (sem ele a mensagem nao leva a lugar nenhum). */
const EXIGE_LINK: Partial<Record<CodigoModeloWhatsApp, string[]>> = {
  proposta: ['texto'], vistoria: ['texto'], revistoria: ['texto'], revistoria_refazer: ['texto'],
  evento_associado: ['texto'], evento_terceiro: ['texto'], boas_vindas: [],
};

export function modeloWhatsApp(codigo: string): ModeloWhatsApp | undefined {
  return MODELOS_WHATSAPP.find((m) => m.codigo === codigo);
}

export function textosEfetivosWhatsApp(codigo: CodigoModeloWhatsApp, gravados?: TextosModelo | null): TextosModelo {
  const m = modeloWhatsApp(codigo);
  const r: TextosModelo = {};
  if (!m) return r;
  for (const parte of m.partes) {
    const g = gravados?.[parte.chave];
    r[parte.chave] = typeof g === 'string' && g.trim() ? g : parte.padrao;
  }
  return r;
}

export function textosWhatsAppParaGravar(codigo: CodigoModeloWhatsApp, textos: TextosModelo): TextosModelo {
  const m = modeloWhatsApp(codigo);
  const r: TextosModelo = {};
  if (!m) return r;
  for (const parte of m.partes) {
    const v = (textos[parte.chave] ?? '').replace(/\r\n/g, '\n').trim();
    if (v && v !== parte.padrao) r[parte.chave] = v;
  }
  return r;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function validarTextosWhatsApp(codigo: string, textos: TextosModelo): string[] {
  const m = modeloWhatsApp(codigo);
  if (!m) return ['Modelo desconhecido.'];
  const erros: string[] = [];
  const permitidos = new Set(m.campos.map((c) => c.chave));
  for (const chave of Object.keys(textos)) {
    if (!m.partes.some((x) => x.chave === chave)) erros.push(`Parte desconhecida: ${chave}.`);
  }
  for (const parte of m.partes) {
    const v = (textos[parte.chave] ?? '').trim();
    if (parte.obrigatorio && textos[parte.chave] !== undefined && !v) {
      erros.push(`${parte.rotulo}: não pode ficar vazio (apague a alteração para voltar ao original).`);
    }
    if (v.length > parte.limite) erros.push(`${parte.rotulo}: até ${parte.limite} caracteres (tem ${v.length}).`);
    const desconhecidos = Array.from(new Set(camposUsados(v).filter((c) => !permitidos.has(c))));
    if (desconhecidos.length) {
      erros.push(`${parte.rotulo}: campo ${desconhecidos.map((c) => `{${c}}`).join(', ')} não existe neste modelo.`);
    }
    if (v && (EXIGE_LINK[m.codigo] ?? []).includes(parte.chave) && !camposUsados(v).includes('link')) {
      erros.push(`${parte.rotulo}: tem de ter o campo {link}.`);
    }
    const sa = semAcento(v);
    const achadas = m.proibidas.filter((w) => sa.includes(semAcento(w)));
    if (achadas.length) erros.push(`${parte.rotulo}: evite "${achadas.join('", "')}".`);
  }
  return erros;
}

/** Limpa as sobras de campo vazio, linha a linha (nunca junta linhas). */
export function limparMensagem(texto: string): string {
  return texto
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\(\s*\)/g, '')
      .replace(/[ \t]+([,.;:!?)])/g, '$1')
      .replace(/\(\s+/g, '(')
      .replace(/[ \t]{2,}/g, ' ')
      .trim())
    .join('\n');
}

/** Uma parte do modelo, com os campos trocados e as sobras limpas. */
export function parteWhatsApp(
  codigo: CodigoModeloWhatsApp, parte: string,
  valores: Record<string, string | number | null | undefined>,
  gravados?: TextosModelo | null,
): string {
  const textos = textosEfetivosWhatsApp(codigo, gravados);
  const v = Object.fromEntries(Object.entries(valores).map(([k, x]) => [k, x ?? '']));
  return limparMensagem(aplicarCampos(textos[parte] ?? '', v));
}

/** "Olá, Maria!" do primeiro nome (caixa normalizada se `capitalizar`), ou o `semNome`. */
export function saudacao(nome: string | null | undefined, semNome = '', capitalizar = false): string {
  const p = (nome ?? '').trim().split(/\s+/)[0] ?? '';
  if (!p) return semNome;
  const n = capitalizar ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p;
  return `Olá, ${n}!`;
}

/** Valores de exemplo (pre-visualizacao do editor). */
export function exemploWhatsApp(codigo: CodigoModeloWhatsApp): Record<string, string> {
  return Object.fromEntries((modeloWhatsApp(codigo)?.campos ?? []).map((c) => [c.chave, c.exemplo]));
}

/** Os textos gravados de todos os modelos, por codigo (o que a RPC modelos_whatsapp devolve). */
export type TextosWhatsApp = Partial<Record<CodigoModeloWhatsApp, TextosModelo>>;

const BLOCO_EXEMPLO = {
  boleto: 'Vencimento 10/11/2026 · R$ 189,90\nLinha digitavel: 74891.12345 12345.678901 ...\nPIX copia e cola: 000201...',
  carne: 'Mensalidade · vence 10/11/2026 · R$ 189,90\n74891.12345 12345.678901 ...',
  boas_vindas: 'Seus boletos:\n\nMensalidade · vence 10/11/2026 · R$ 189,90\n74891.12345 12345.678901 ...',
} as const;

/** A pre-visualizacao: uma mensagem por situacao, com dados de exemplo e a lista que o sistema monta. */
export function previaWhatsApp(codigo: CodigoModeloWhatsApp, textos: TextosModelo): { titulo: string; texto: string }[] {
  const ex = exemploWhatsApp(codigo);
  const p = (parte: string, extra: Record<string, string> = {}) => parteWhatsApp(codigo, parte, { ...ex, ...extra }, textos);
  if (codigo === 'boleto') {
    return [
      { titulo: '2ª via que substitui o boleto', texto: [p('abertura'), '', BLOCO_EXEMPLO.boleto, '', p('fecho_substitui')].join('\n') },
      { titulo: 'Acordo (vários boletos)', texto: [p('abertura', { o_que: 'os boletos do seu acordo' }), '', BLOCO_EXEMPLO.boleto, '', p('fecho_substitui_varios')].join('\n') },
      { titulo: '2ª via do mesmo boleto', texto: [p('abertura'), '', BLOCO_EXEMPLO.boleto, '', p('fecho_mesmo')].join('\n') },
    ];
  }
  if (codigo === 'carne') {
    return [{ titulo: 'Carnê', texto: [p('abertura'), '', BLOCO_EXEMPLO.carne, '', p('fecho')].join('\n') }];
  }
  if (codigo === 'boas_vindas') {
    return [{ titulo: 'Boas-vindas com boletos', texto: [p('texto'), '', BLOCO_EXEMPLO.boas_vindas].join('\n') }];
  }
  return [{ titulo: 'Mensagem', texto: p('texto') }];
}
