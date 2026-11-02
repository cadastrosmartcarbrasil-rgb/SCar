/**
 * Modelos de comunicacao EDITAVEIS (0170). O VISUAL fica no codigo (templates React Email);
 * o que a tela edita sao os TEXTOS: assunto, previa, titulo, corpo e as frases de apoio.
 *
 * - O texto ORIGINAL de cada parte mora aqui (`padrao`). No banco fica so o que difere dele
 *   (`textosParaGravar`): '{}' = modelo original.
 * - Campos entre chaves (`{nome}`, `{valor}`...) sao trocados pelo dado de cada envio.
 *   Campo desconhecido e recusado ao salvar; se chegar ao envio, sai como escrito.
 * - **negrito** e paragrafos separados por linha em branco sao a unica formatacao.
 */
import { PALAVRAS_PROIBIDAS } from './cobranca';

export type CodigoModeloEmail =
  | 'lembrete'
  | 'vence_hoje'
  | 'atraso'
  | 'boas_vindas'
  | 'aniversario'
  | 'recuperar_senha';

export type TextosModelo = Record<string, string>;

export interface ParteModelo {
  chave: string;
  rotulo: string;
  padrao: string;
  /** linhas no editor; 1 = campo de uma linha */
  linhas: number;
  obrigatorio: boolean;
  limite: number;
  ajuda?: string;
}

export interface CampoModelo {
  chave: string;
  descricao: string;
  exemplo: string;
}

export interface ModeloEmail {
  codigo: CodigoModeloEmail;
  nome: string;
  grupo: 'Cobrança' | 'Serviço' | 'Relacionamento';
  descricao: string;
  /** cobranca: vale a lista de palavras que soam como ameaca */
  cobranca: boolean;
  campos: CampoModelo[];
  partes: ParteModelo[];
}

const CAMPO = {
  nome: { chave: 'nome', descricao: 'Primeiro nome do associado', exemplo: 'Maria' },
  valor: { chave: 'valor', descricao: 'Valor do boleto', exemplo: 'R$ 189,90' },
  vencimento: { chave: 'vencimento', descricao: 'Data de vencimento', exemplo: '10/11/2026' },
  veiculo: { chave: 'veiculo', descricao: 'Modelo e final da placa', exemplo: 'Fiat Argo · placa final 23' },
  quando: { chave: 'quando', descricao: '"amanhã" ou "em 5 dias"', exemplo: 'em 5 dias' },
  dias: { chave: 'dias', descricao: 'Dias em atraso', exemplo: '7 dias' },
  modelo: { chave: 'modelo', descricao: 'Modelo do veículo', exemplo: 'Fiat Argo' },
  placa: { chave: 'placa', descricao: 'Placa do veículo', exemplo: 'ABC1D23' },
  validade: { chave: 'validade', descricao: 'Validade do link', exemplo: '60 minutos' },
} satisfies Record<string, CampoModelo>;

const p = (
  chave: string, rotulo: string, padrao: string,
  o: Partial<Pick<ParteModelo, 'linhas' | 'obrigatorio' | 'limite' | 'ajuda'>> = {},
): ParteModelo => ({
  chave, rotulo, padrao,
  linhas: o.linhas ?? 1,
  obrigatorio: o.obrigatorio ?? false,
  limite: o.limite ?? (o.linhas && o.linhas > 1 ? 1500 : 200),
  ajuda: o.ajuda,
});

const ASSUNTO = (padrao: string) => p('assunto', 'Assunto', padrao, { obrigatorio: true, limite: 150 });
const PREVIA = (padrao: string) =>
  p('previa', 'Prévia (texto ao lado do assunto na caixa de entrada)', padrao, { limite: 200 });
const TITULO = (padrao: string) => p('titulo', 'Título', padrao, { obrigatorio: true, limite: 120 });
const CORPO = (padrao: string) =>
  p('corpo', 'Texto principal', padrao, {
    linhas: 6, obrigatorio: true,
    ajuda: 'Linha em branco separa parágrafos. **texto** fica em negrito.',
  });
const AJUDA = (padrao: string) =>
  p('ajuda', 'Frase antes do link do WhatsApp', padrao, { limite: 160 });
const ASSINATURA = (padrao: string) => p('assinatura', 'Assinatura', padrao, { limite: 160 });

export const MODELOS_EMAIL: ModeloEmail[] = [
  {
    codigo: 'lembrete',
    nome: 'Lembrete de vencimento',
    grupo: 'Cobrança',
    descricao: 'Antes do vencimento (5 dias e 1 dia antes, pela régua).',
    cobranca: true,
    campos: [CAMPO.nome, CAMPO.valor, CAMPO.vencimento, CAMPO.veiculo, CAMPO.quando],
    partes: [
      ASSUNTO('Lembrete: sua contribuição vence {quando}'),
      PREVIA('Sua contribuição vence {quando} — {valor} em {vencimento}. Veja como pagar.'),
      TITULO('Sua contribuição vence {quando}'),
      CORPO(
        'Olá, **{nome}**! Passando para lembrar que a contribuição da proteção do seu veículo está ' +
          'chegando ao vencimento. Para manter tudo em dia, é só escolher uma das formas de pagamento abaixo.',
      ),
      AJUDA('Alguma dúvida sobre o seu boleto?'),
      ASSINATURA('Obrigado por fazer parte da família Smart Car Brasil.'),
    ],
  },
  {
    codigo: 'vence_hoje',
    nome: 'Vence hoje',
    grupo: 'Cobrança',
    descricao: 'No dia do vencimento.',
    cobranca: true,
    campos: [CAMPO.nome, CAMPO.valor, CAMPO.vencimento, CAMPO.veiculo],
    partes: [
      ASSUNTO('Sua contribuição vence hoje — Smart Car Brasil'),
      PREVIA('Hoje é o dia do vencimento: {valor}. Pague em instantes pelo Pix, boleto ou cartão.'),
      TITULO('Sua contribuição vence hoje'),
      CORPO(
        'Olá, **{nome}**! Hoje é o dia do vencimento da contribuição da proteção do seu veículo. ' +
          'Pagando pelo Pix, a confirmação costuma ser imediata — mas você pode escolher a forma que for melhor para você.',
      ),
      AJUDA('Precisa de ajuda para pagar?'),
      ASSINATURA('Obrigado por fazer parte da família Smart Car Brasil.'),
    ],
  },
  {
    codigo: 'atraso',
    nome: 'Contribuição em aberto',
    grupo: 'Cobrança',
    descricao: 'Depois do vencimento (2 e 7 dias, pela régua).',
    cobranca: true,
    campos: [CAMPO.nome, CAMPO.valor, CAMPO.vencimento, CAMPO.veiculo, CAMPO.dias],
    partes: [
      ASSUNTO('Sua contribuição está em aberto — Smart Car Brasil'),
      PREVIA('Não identificamos o pagamento que venceu em {vencimento}. Regularize em instantes.'),
      TITULO('Identificamos uma contribuição em aberto'),
      CORPO(
        'Olá, **{nome}**. Ainda não identificamos o pagamento da contribuição que venceu em **{vencimento}** ' +
          '(há {dias}). Você pode regularizar agora mesmo por uma das opções abaixo. Se tiver qualquer ' +
          'dificuldade, nossa equipe está pronta para ajudar.',
      ),
      p('rastreador_titulo', 'Quadro do rastreador — título', 'Atenção ao rastreador', { limite: 80 }),
      p(
        'rastreador_com', 'Quadro do rastreador — veículo COM rastreador na ficha',
        'Como o seu veículo possui rastreador, o **sinal do equipamento também é bloqueado automaticamente** ' +
          'enquanto houver contribuição em aberto. Após a confirmação do pagamento, o sinal é normalizado.',
        { linhas: 3, obrigatorio: true, limite: 600 },
      ),
      p(
        'rastreador_sem', 'Quadro do rastreador — veículo sem rastreador na ficha',
        'Caso o seu veículo possua rastreador, o **sinal do equipamento também é bloqueado automaticamente** ' +
          'enquanto houver contribuição em aberto. Após a confirmação do pagamento, o sinal é normalizado.',
        { linhas: 3, obrigatorio: true, limite: 600 },
      ),
      AJUDA('Quer conversar sobre o pagamento ou combinar uma solução?'),
      ASSINATURA('Estamos juntos para manter o seu veículo protegido.'),
    ],
  },
  {
    codigo: 'boas_vindas',
    nome: 'Boas-vindas',
    grupo: 'Serviço',
    descricao: 'Adesão concluída (ainda não é enviado automaticamente).',
    cobranca: false,
    campos: [CAMPO.nome, CAMPO.modelo, CAMPO.placa],
    partes: [
      ASSUNTO('Bem-vindo(a) à Smart Car Brasil, {nome}!'),
      PREVIA('{nome}, seu veículo {modelo} já está protegido. Veja seus produtos, documentos e como acessar o portal.'),
      TITULO('Bem-vindo(a), {nome}!'),
      CORPO(
        'A **Smart Car Brasil** tem o prazer de receber você e o parabeniza pela decisão de fazer parte da ' +
          'nossa proteção veicular. A partir de agora, o seu veículo já está usufruindo dos nossos serviços de proteção.',
      ),
      p('final', 'Frase depois dos contatos', 'Qualquer dúvida, é só chamar a nossa assistente virtual Smart Car.', {
        limite: 200,
      }),
      ASSINATURA('Atenciosamente, equipe Smart Car Brasil.'),
    ],
  },
  {
    codigo: 'aniversario',
    nome: 'Aniversário',
    grupo: 'Relacionamento',
    descricao: 'No aniversário do associado (ainda não é enviado automaticamente).',
    cobranca: false,
    campos: [CAMPO.nome],
    partes: [
      ASSUNTO('Feliz aniversário, {nome}! 🎉'),
      PREVIA('{nome}, hoje o dia é seu! A família Smart Car Brasil deseja um feliz aniversário.'),
      TITULO('Parabéns, {nome}!'),
      CORPO(
        'Hoje o dia é seu, e a família **Smart Car Brasil** não poderia deixar de celebrar com você. ' +
          'Desejamos um aniversário cheio de alegria, saúde e boas estradas pela frente.\n\n' +
          'Obrigado por confiar a proteção do seu veículo a nós. Cuidar de quem faz parte da nossa associação ' +
          'é o que nos move todos os dias.',
      ),
      AJUDA('Quer deixar um recado ou falar com a nossa equipe?'),
      ASSINATURA('Um abraço de toda a equipe Smart Car Brasil. 💙'),
    ],
  },
  {
    codigo: 'recuperar_senha',
    nome: 'Recuperar senha do portal',
    grupo: 'Serviço',
    descricao: '"Esqueci minha senha" do portal do associado.',
    cobranca: false,
    campos: [CAMPO.nome, CAMPO.validade],
    partes: [
      ASSUNTO('Crie uma nova senha do portal — Smart Car Brasil'),
      PREVIA('Use o botão para criar uma nova senha do portal do associado.'),
      TITULO('Crie uma nova senha'),
      CORPO(
        'Olá, **{nome}**. Recebemos um pedido para criar uma nova senha do portal do associado. ' +
          'Toque no botão abaixo e escolha a sua senha.',
      ),
      p(
        'aviso', 'Texto depois do botão',
        'O link vale por {validade} e só pode ser usado uma vez. Seu login continua sendo o seu **CPF/CNPJ (somente números)**.',
        { linhas: 2, limite: 400 },
      ),
      p('ignorar', 'Texto final', 'Não foi você que pediu? Pode ignorar este e-mail: a sua senha atual continua valendo.', {
        linhas: 2, limite: 400,
      }),
      ASSINATURA('Atenciosamente, equipe Smart Car Brasil.'),
    ],
  },
];

export function modeloEmail(codigo: string): ModeloEmail | undefined {
  return MODELOS_EMAIL.find((m) => m.codigo === codigo);
}

/** Os textos efetivos: o gravado por cima do original; parte vazia ou desconhecida cai no original. */
export function textosEfetivos(codigo: CodigoModeloEmail, gravados?: TextosModelo | null): TextosModelo {
  const m = modeloEmail(codigo);
  const t: TextosModelo = {};
  if (!m) return t;
  for (const parte of m.partes) {
    const g = gravados?.[parte.chave];
    t[parte.chave] = typeof g === 'string' && g.trim() ? g : parte.padrao;
  }
  return t;
}

/** O que vai ao banco: so as partes que diferem do original (sem espacos nas pontas). */
export function textosParaGravar(codigo: CodigoModeloEmail, textos: TextosModelo): TextosModelo {
  const m = modeloEmail(codigo);
  const r: TextosModelo = {};
  if (!m) return r;
  for (const parte of m.partes) {
    const v = (textos[parte.chave] ?? '').replace(/\r\n/g, '\n').trim();
    if (v && v !== parte.padrao) r[parte.chave] = v;
  }
  return r;
}

const RE_CAMPO = /\{([a-zA-Z_]+)\}/g;

export function camposUsados(texto: string): string[] {
  return Array.from(texto.matchAll(RE_CAMPO), (x) => x[1]);
}

/** Troca {campo} pelo valor; asterisco do valor sai (nao vira negrito por acidente). */
export function aplicarCampos(texto: string, valores: Record<string, string | number | null | undefined>): string {
  return texto.replace(RE_CAMPO, (inteiro, chave: string) => {
    const v = valores[chave];
    return v === undefined || v === null ? inteiro : String(v).replace(/\*/g, '');
  });
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Erros que impedem salvar (vazio = pode salvar). */
export function validarTextos(codigo: string, textos: TextosModelo): string[] {
  const m = modeloEmail(codigo);
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
    if (m.cobranca) {
      const t = semAcento(v);
      const achadas = PALAVRAS_PROIBIDAS.filter((w) => new RegExp(`\\b${semAcento(w)}\\b`).test(t));
      if (achadas.length) {
        erros.push(`${parte.rotulo}: evite "${achadas.join('", "')}" — soa como ameaça e prejudica a entrega.`);
      }
    }
  }
  return erros;
}

/** Trecho com ou sem negrito, na ordem do texto. */
export type Trecho = { texto: string; negrito: boolean };

/** Paragrafos (linha em branco) e, dentro de cada um, os trechos em **negrito**. */
export function paragrafosRicos(texto: string): Trecho[][] {
  return texto
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((par) => par.trim())
    .filter(Boolean)
    .map((par) => {
      const partes = par.split('**');
      // numero par de "**" fecha; um "**" sem par sai como escrito
      if (partes.length % 2 === 0) return [{ texto: par, negrito: false }];
      return partes.map((t, i) => ({ texto: t, negrito: i % 2 === 1 })).filter((t) => t.texto);
    });
}

/** Valores de exemplo de cada campo (pre-visualizacao). */
export function valoresDeExemplo(codigo: CodigoModeloEmail): Record<string, string> {
  const m = modeloEmail(codigo);
  return Object.fromEntries((m?.campos ?? []).map((c) => [c.chave, c.exemplo]));
}
