/**
 * Comunicacao de evento online (0129) — regras puras.
 *
 * Um link por envolvido: cada PAPEL ve e preenche so as secoes dele. O
 * terceiro nunca ve dado do associado. A mesma estrutura de `dados` serve a
 * pagina publica (/comunicar/<token>) e o preenchimento pela equipe.
 *
 * Vocabulario de tela: evento, envolvido, participacao. Nunca "sinistro,
 * seguro, apolice, indenizacao, franquia" — ha teste varrendo os textos daqui.
 */

export type PapelComunicacao =
  | 'associado' | 'condutor_associado' | 'terceiro_condutor'
  | 'terceiro_proprietario' | 'passageiro_vitima' | 'testemunha';

export type StatusComunicacao =
  | 'ABERTO' | 'EM_PREENCHIMENTO' | 'ENVIADO' | 'CORRECAO' | 'CONFERIDO' | 'REVOGADO';

export type SituacaoComunicacao = StatusComunicacao | 'EXPIRADO';

export type SecaoComunicacao =
  | 'identificacao' | 'veiculo' | 'evento' | 'condutor' | 'veiculo_terceiro'
  | 'fotos' | 'vitimas' | 'final';

export const PAPEIS_COMUNICACAO: { valor: PapelComunicacao; rotulo: string; descricao: string }[] = [
  { valor: 'associado', rotulo: 'Associado', descricao: 'Titular do veículo protegido' },
  { valor: 'condutor_associado', rotulo: 'Condutor do veículo do associado', descricao: 'Outra pessoa dirigindo o veículo protegido' },
  { valor: 'terceiro_condutor', rotulo: 'Terceiro (condutor)', descricao: 'Quem dirigia o outro veículo' },
  { valor: 'terceiro_proprietario', rotulo: 'Terceiro (proprietário)', descricao: 'Dono do outro veículo ou bem, se não era quem dirigia' },
  { valor: 'passageiro_vitima', rotulo: 'Passageiro / vítima', descricao: 'Passageiro, pedestre ou ciclista' },
  { valor: 'testemunha', rotulo: 'Testemunha', descricao: 'Quem presenciou o evento' },
];

export function rotuloPapel(p: string): string {
  return PAPEIS_COMUNICACAO.find((x) => x.valor === p)?.rotulo ?? p;
}

export const ehTerceiro = (p: string) => p === 'terceiro_condutor' || p === 'terceiro_proprietario';

/** As etapas que cada papel percorre, na ordem. */
export const SECOES_POR_PAPEL: Record<PapelComunicacao, SecaoComunicacao[]> = {
  associado: ['identificacao', 'veiculo', 'evento', 'condutor', 'fotos', 'vitimas', 'final'],
  condutor_associado: ['identificacao', 'evento', 'condutor', 'fotos', 'vitimas', 'final'],
  terceiro_condutor: ['identificacao', 'evento', 'condutor', 'veiculo_terceiro', 'fotos', 'vitimas', 'final'],
  terceiro_proprietario: ['identificacao', 'veiculo_terceiro', 'fotos', 'final'],
  passageiro_vitima: ['identificacao', 'evento', 'vitimas', 'final'],
  testemunha: ['identificacao', 'evento', 'final'],
};

export const ROTULO_SECAO: Record<SecaoComunicacao, string> = {
  identificacao: 'Seus dados',
  veiculo: 'Veiculo',
  evento: 'O que aconteceu',
  condutor: 'Quem dirigia',
  veiculo_terceiro: 'O outro veículo',
  fotos: 'Fotos e documentos',
  vitimas: 'Pessoas feridas',
  final: 'Croqui e envio',
};

export interface PoseComunicacao {
  codigo: string;
  nome: string;
  instrucao: string;
  /** tipo gravado em `anexos_evento.tipo_documento` */
  tipo: string;
  documento?: boolean;
}

const P = (codigo: string, nome: string, instrucao: string, tipo = 'FOTO_VEICULO', documento = false): PoseComunicacao =>
  ({ codigo, nome, instrucao, tipo, documento });

const POSES_VEICULO_ASSOCIADO: PoseComunicacao[] = [
  P('FRENTE', 'Frente do veículo', 'De frente, a uns 3 metros, pegando o carro inteiro.'),
  P('TRASEIRA', 'Traseira', 'De tras, a uns 3 metros.'),
  P('LATERAL_ESQ', 'Lateral esquerda', 'Do lado do motorista, pegando o carro inteiro.'),
  P('LATERAL_DIR', 'Lateral direita', 'Do lado do passageiro, pegando o carro inteiro.'),
  P('DANO', 'Dano', 'De perto, mostrando bem a parte danificada. Pode enviar mais de uma.', 'FOTO_AVARIA'),
  P('PAINEL', 'Painel (quilometragem)', 'Com o carro ligado, mostrando o hodometro.'),
  P('PLACA', 'Placa', 'A placa legivel.'),
  P('LOCAL', 'Local do evento', 'Se ainda estiver no local, uma foto mostrando a rua.', 'FOTO_LOCAL'),
];

const DOC = {
  CNH: P('CNH', 'CNH de quem dirigia', 'Frente da CNH aberta, legivel.', 'CNH', true),
  CRLV: P('CRLV', 'Documento do veículo (CRLV)', 'O documento inteiro, legivel.', 'CRLV', true),
  BO: P('BO', 'Boletim de ocorrência', 'Se já tiver, foto ou PDF do boletim.', 'BOLETIM_OCORRENCIA', true),
};

export const POSES_POR_PAPEL: Record<PapelComunicacao, PoseComunicacao[]> = {
  associado: [...POSES_VEICULO_ASSOCIADO, DOC.CNH, DOC.BO],
  condutor_associado: [...POSES_VEICULO_ASSOCIADO, DOC.CNH, DOC.BO],
  terceiro_condutor: [
    P('PLACA', 'Placa do seu veiculo', 'A placa legivel.'),
    P('DANO', 'Dano no seu veículo', 'De perto, mostrando bem a parte danificada.', 'FOTO_AVARIA'),
    P('GERAL', 'Visão geral', 'Os dois veículos, se ainda estiverem no local.', 'FOTO_LOCAL'),
    DOC.CNH, DOC.CRLV, DOC.BO,
  ],
  terceiro_proprietario: [
    P('PLACA', 'Placa do seu veiculo', 'A placa legivel.'),
    P('DANO', 'Dano no seu veículo ou bem', 'De perto, mostrando bem a parte danificada.', 'FOTO_AVARIA'),
    DOC.CRLV,
  ],
  passageiro_vitima: [],
  testemunha: [],
};

export const POSE_CROQUI: PoseComunicacao =
  P('CROQUI', 'Croqui (desenho do evento)', 'Desenhe num papel como os veículos estavam e fotografe.', 'CROQUI');

export const OPCOES = {
  natureza: ['Colisao', 'Capotamento', 'Furto', 'Roubo', 'Incendio', 'Fenomeno da natureza', 'Danos a terceiros', 'Outro'],
  colidiu_com: ['Veiculo automotor', 'Bicicleta / moto eletrica', 'Pedestre', 'Muro, poste ou fachada', 'Animal', 'Nada / nao se aplica'],
  via: ['Urbana', 'Rodovia', 'Estrada de terra'],
  pista: ['Seca', 'Molhada'],
  luz: ['Dia', 'Noite'],
  uso: ['Particular', 'Aplicativo', 'Trabalho'],
} as const;

export interface DadosComunicacao {
  identificacao?: { nome?: string; cpf?: string; telefone?: string; email?: string; cidade?: string; uf?: string };
  veiculo?: { km?: string };
  evento?: {
    data?: string; hora?: string; endereco?: string; referencia?: string; cidade?: string; uf?: string;
    natureza?: string; colidiu_com?: string; via?: string; pista?: string; luz?: string;
    sinalizacao?: string; velocidade?: string; relato?: string; bo_numero?: string; bo_orgao?: string;
  };
  condutor?: {
    nome?: string; cpf?: string; e_titular?: boolean; habilitado?: boolean;
    cnh_numero?: string; cnh_categoria?: string; cnh_validade?: string; uso?: string;
  };
  veiculo_terceiro?: {
    placa?: string; marca_modelo?: string; cor?: string;
    tem_protecao?: boolean; empresa_protecao?: string; contrato_protecao?: string;
  };
  vitimas?: { houve?: boolean; quantidade?: string; socorro?: string };
  contato_whatsapp?: boolean;
}

const vazio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/**
 * O que falta para ENVIAR (a tela mostra; o servidor confere de novo).
 * Foto nunca e obrigatoria: quem nao tem como fotografar ainda comunica.
 */
export function pendenciasDaComunicacao(papel: PapelComunicacao, d: DadosComunicacao): string[] {
  const s = SECOES_POR_PAPEL[papel];
  const f: string[] = [];
  const id = d.identificacao ?? {};
  if (vazio(id.nome) || (id.nome ?? '').trim().length < 3) f.push('Seu nome');
  const tel = (id.telefone ?? '').replace(/\D/g, '');
  if (tel.length < 10) f.push('Seu telefone com DDD');
  if (ehTerceiro(papel) && (id.cpf ?? '').replace(/\D/g, '').length < 11) f.push('Seu CPF/CNPJ');
  if (s.includes('evento')) {
    const e = d.evento ?? {};
    if (vazio(e.data)) f.push('Data do evento');
    if (vazio(e.relato) || (e.relato ?? '').trim().length < 10) f.push('O relato do que aconteceu');
    if ((papel === 'associado' || papel === 'condutor_associado') && vazio(e.natureza)) f.push('O que aconteceu (natureza)');
  }
  if (s.includes('veiculo_terceiro') && vazio(d.veiculo_terceiro?.placa) && papel === 'terceiro_proprietario') {
    f.push('Placa do seu veiculo');
  }
  return f;
}

/**
 * Limpa o que o envolvido NAO deve mandar (secao fora do papel) e corta textos
 * longos. E o que vai para o banco.
 */
export function dadosParaGravar(papel: PapelComunicacao, d: DadosComunicacao): DadosComunicacao {
  const s = new Set(SECOES_POR_PAPEL[papel]);
  const corta = <T extends Record<string, unknown>>(o: T | undefined, max = 300): T | undefined => {
    if (!o) return undefined;
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string') { const t = v.trim(); if (t) r[k] = t.slice(0, k === 'relato' ? 5000 : max); }
      else if (typeof v === 'boolean') r[k] = v;
    }
    return r as T;
  };
  const out: DadosComunicacao = { identificacao: corta(d.identificacao) };
  if (s.has('veiculo')) out.veiculo = corta(d.veiculo);
  if (s.has('evento')) out.evento = corta(d.evento);
  if (s.has('condutor')) out.condutor = corta(d.condutor);
  if (s.has('veiculo_terceiro')) out.veiculo_terceiro = corta(d.veiculo_terceiro);
  if (s.has('vitimas')) {
    const v = corta(d.vitimas);
    // Passageiro/vitima: so "houve lesao" (sem detalhe de saude, LGPD art. 11).
    out.vitimas = papel === 'passageiro_vitima' && v ? { houve: v.houve } : v;
  }
  if (typeof d.contato_whatsapp === 'boolean') out.contato_whatsapp = d.contato_whatsapp;
  return JSON.parse(JSON.stringify(out));
}

/** A situacao que a tela mostra (o vencido e calculado, como no banco). */
export function situacaoComunicacao(c: { status: string; expira_em: string }, agora = new Date()): SituacaoComunicacao {
  if (c.status === 'REVOGADO' || c.status === 'ENVIADO' || c.status === 'CONFERIDO') return c.status;
  if (new Date(c.expira_em).getTime() < agora.getTime()) return 'EXPIRADO';
  return c.status as StatusComunicacao;
}

export const ROTULO_SITUACAO: Record<SituacaoComunicacao, { texto: string; cor: string }> = {
  ABERTO: { texto: 'Aguardando', cor: 'bg-slate-100 text-slate-700' },
  EM_PREENCHIMENTO: { texto: 'Preenchendo', cor: 'bg-cyan-50 text-cyan-800' },
  ENVIADO: { texto: 'Recebida', cor: 'bg-emerald-50 text-emerald-700' },
  CORRECAO: { texto: 'Correção pedida', cor: 'bg-amber-50 text-amber-800' },
  CONFERIDO: { texto: 'Conferida', cor: 'bg-emerald-100 text-emerald-800' },
  REVOGADO: { texto: 'Cancelado', cor: 'bg-rose-50 text-rose-700' },
  EXPIRADO: { texto: 'Link vencido', cor: 'bg-rose-50 text-rose-700' },
};

export function linkComunicacao(origem: string, token: string): string {
  return `${origem.replace(/\/$/, '')}/comunicar/${token}`;
}

/** Mensagem do WhatsApp. Ao terceiro, nada de associado nem de valores. */
export function mensagemComunicacao(p: { papel: string; nome?: string | null; protocolo?: string | null; link: string }): string {
  const ola = p.nome ? `Olá, ${p.nome.split(' ')[0]}!` : 'Olá!';
  const proto = p.protocolo ? ` (protocolo ${p.protocolo})` : '';
  const pedido = ehTerceiro(p.papel) || p.papel === 'testemunha' || p.papel === 'passageiro_vitima'
    ? `A Smart Car Brasil esta registrando um evento de transito${proto} em que você esteve envolvido(a). Pedimos que conte o que aconteceu e, se puder, envie fotos por este link:`
    : `Recebemos a comunicação do evento com o seu veículo${proto}. Para agilizar, conte o que aconteceu e envie as fotos por este link:`;
  return `${ola} ${pedido}\n${p.link}\nLeva poucos minutos e você pode parar e continuar depois. Comunique o quanto antes.`;
}

export const TEXTOS = {
  privacidade: 'A Smart Car Brasil Proteção Patrimonial Mutualista coleta estes dados para apurar o evento ocorrido, registrar o protocolo e exercer seus direitos. Você informa somente o que sabe. Seus dados são usados para essa finalidade e guardados pelo prazo necessário.',
  declaracao: 'Declaro que as informações prestadas são verdadeiras e completas, e autorizo a Smart Car Brasil a verifica-las junto aos órgãos competentes e aos demais envolvidos.',
  naoReconhece: 'Esta comunicação não é reconhecimento de responsabilidade, de culpa nem de cobertura. A análise é feita depois, conforme o contrato e o regulamento.',
  naoReconheceTerceiro: 'Esta comunicação não é reconhecimento de responsabilidade nem de culpa. A análise é feita depois pela Smart Car Brasil.',
  relato: 'Conte só o que você viu e fez, em ordem. Não precisa dizer de quem foi a culpa.',
  equipe: 'Registrado pela equipe da Smart Car Brasil com as informações prestadas pelo envolvido.',
} as const;

/** Palavras que nao aparecem para o envolvido (teste varre os textos). */
export const TERMOS_PROIBIDOS = ['sinistro', 'seguro', 'segurado', 'apolice', 'premio', 'indeniza', 'franquia', 'corretor'];

// ---------------------------------------------------------------------------
// Comparador de versoes (associado x terceiro): so DESTACA, nunca decide.
// ---------------------------------------------------------------------------
export const CAMPOS_COMPARADOS: { chave: string; rotulo: string; ler: (d: DadosComunicacao) => string | undefined }[] = [
  { chave: 'data', rotulo: 'Data', ler: (d) => d.evento?.data },
  { chave: 'hora', rotulo: 'Hora', ler: (d) => d.evento?.hora },
  { chave: 'local', rotulo: 'Local', ler: (d) => [d.evento?.endereco, d.evento?.cidade, d.evento?.uf].filter(Boolean).join(', ') || undefined },
  { chave: 'natureza', rotulo: 'O que aconteceu', ler: (d) => d.evento?.natureza },
  { chave: 'colidiu_com', rotulo: 'Colidiu com', ler: (d) => d.evento?.colidiu_com },
  { chave: 'via', rotulo: 'Via / pista / luz', ler: (d) => [d.evento?.via, d.evento?.pista, d.evento?.luz].filter(Boolean).join(' · ') || undefined },
  { chave: 'velocidade', rotulo: 'Velocidade', ler: (d) => d.evento?.velocidade },
  { chave: 'vitimas', rotulo: 'Houve feridos', ler: (d) => (d.vitimas?.houve === undefined ? undefined : d.vitimas.houve ? 'Sim' : 'Nao') },
  { chave: 'relato', rotulo: 'Relato', ler: (d) => d.evento?.relato },
];

const normal = (s?: string) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export interface LinhaComparacao { chave: string; rotulo: string; valores: (string | undefined)[]; diverge: boolean }

/** Uma linha por campo; `diverge` quando dois envolvidos informaram coisas diferentes. Relato nunca "diverge". */
export function compararDeclaracoes(lista: DadosComunicacao[]): LinhaComparacao[] {
  return CAMPOS_COMPARADOS.map((c) => {
    const valores = lista.map((d) => c.ler(d));
    const preenchidos = [...new Set(valores.filter((v) => !vazio(v)).map(normal))];
    return { chave: c.chave, rotulo: c.rotulo, valores, diverge: c.chave !== 'relato' && preenchidos.length > 1 };
  });
}

/** Linhas para exibir uma declaracao (tela e PDF). */
export function linhasDaDeclaracao(papel: PapelComunicacao, d: DadosComunicacao): { secao: string; itens: [string, string][] }[] {
  const sim = (b?: boolean) => (b === undefined ? '' : b ? 'Sim' : 'Nao');
  const id = d.identificacao ?? {}; const e = d.evento ?? {}; const c = d.condutor ?? {}; const v = d.veiculo_terceiro ?? {};
  const blocos: { secao: string; itens: [string, string | undefined][] }[] = [
    { secao: 'Identificação', itens: [['Nome', id.nome], ['CPF/CNPJ', id.cpf], ['Telefone', id.telefone], ['E-mail', id.email], ['Cidade/UF', [id.cidade, id.uf].filter(Boolean).join('/')]] },
  ];
  const s = SECOES_POR_PAPEL[papel];
  if (s.includes('veiculo')) blocos.push({ secao: 'Veiculo', itens: [['Km aproximado', d.veiculo?.km]] });
  if (s.includes('evento')) blocos.push({ secao: 'O evento', itens: [
    ['Data', e.data], ['Hora', e.hora], ['Endereço', e.endereco], ['Referência', e.referencia],
    ['Cidade/UF', [e.cidade, e.uf].filter(Boolean).join('/')], ['Natureza', e.natureza], ['Colidiu com', e.colidiu_com],
    ['Via', e.via], ['Pista', e.pista], ['Luz', e.luz], ['Sinalização', e.sinalizacao], ['Velocidade', e.velocidade],
    ['Boletim de ocorrência', [e.bo_numero, e.bo_orgao].filter(Boolean).join(' · ')], ['Relato', e.relato],
  ] });
  if (s.includes('condutor')) blocos.push({ secao: 'Quem dirigia', itens: [
    ['Era o titular', sim(c.e_titular)], ['Nome', c.nome], ['CPF', c.cpf], ['Habilitado', sim(c.habilitado)],
    ['CNH', [c.cnh_numero, c.cnh_categoria, c.cnh_validade].filter(Boolean).join(' · ')], ['Uso', c.uso],
  ] });
  if (s.includes('veiculo_terceiro')) blocos.push({ secao: 'O outro veículo', itens: [
    ['Placa', v.placa], ['Marca/modelo', v.marca_modelo], ['Cor', v.cor],
    ['Tem protecao/seguro', sim(v.tem_protecao)], ['Empresa', v.empresa_protecao], ['Contrato', v.contrato_protecao],
  ] });
  if (s.includes('vitimas')) blocos.push({ secao: 'Pessoas feridas', itens: [
    ['Houve feridos', sim(d.vitimas?.houve)], ['Quantidade', d.vitimas?.quantidade], ['Socorro', d.vitimas?.socorro],
  ] });
  if (d.contato_whatsapp !== undefined) blocos.push({ secao: 'Contato', itens: [['Aceita contato pelo WhatsApp', sim(d.contato_whatsapp)]] });
  return blocos
    .map((b) => ({ secao: b.secao, itens: b.itens.filter((i): i is [string, string] => !vazio(i[1])) }))
    .filter((b) => b.itens.length);
}
