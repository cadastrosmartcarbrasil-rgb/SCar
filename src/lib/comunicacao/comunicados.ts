/**
 * Comunicados por e-mail (0171) — regras puras da tela e do envio.
 * O texto usa as mesmas regras dos modelos: {nome} e **negrito**, linha em branco = paragrafo.
 */
import { camposUsados } from './modelos';

export type FinalidadeComunicado = 'INFORMATIVO' | 'SERVICO';

export const FINALIDADES: { valor: FinalidadeComunicado; rotulo: string; explicacao: string }[] = [
  {
    valor: 'INFORMATIVO',
    rotulo: 'Informativo / relacionamento',
    explicacao: 'Novidades, campanhas, datas comemorativas. Leva o link "não quero receber" e não vai para quem se descadastrou.',
  },
  {
    valor: 'SERVICO',
    rotulo: 'Aviso de serviço',
    explicacao: 'Algo que o associado precisa saber sobre a proteção (regimento, atendimento, documentos). Vai também para quem se descadastrou dos informativos.',
  },
];

export const CAMPOS_COMUNICADO = [{ chave: 'nome', descricao: 'Primeiro nome do associado', exemplo: 'Maria' }];

export const SITUACOES_VEICULO = [
  { valor: 'ativo', rotulo: 'Ativo' },
  { valor: 'inadimplente', rotulo: 'Inadimplente' },
  { valor: 'em_evento', rotulo: 'Em evento' },
  { valor: 'vistoria_pendente', rotulo: 'Vistoria pendente' },
  { valor: 'suspenso', rotulo: 'Suspenso' },
  { valor: 'inativo', rotulo: 'Inativo (fora da base)' },
];
export const SITUACOES_PADRAO = ['ativo', 'inadimplente', 'em_evento', 'vistoria_pendente', 'suspenso'];

export interface FiltrosComunicado {
  cliente_id?: string | null;
  regional_ids?: string[];
  situacoes?: string[];
  plano_ids?: string[];
  tipo_veiculo_ids?: string[];
}

export interface DadosComunicado {
  nome_interno: string;
  finalidade: FinalidadeComunicado;
  assunto: string;
  titulo: string;
  previa: string;
  corpo: string;
  botao_texto: string;
  botao_url: string;
  filtros: FiltrosComunicado;
}

export const COMUNICADO_VAZIO: DadosComunicado = {
  nome_interno: '',
  finalidade: 'INFORMATIVO',
  assunto: '',
  titulo: '',
  previa: '',
  corpo: '',
  botao_texto: '',
  botao_url: '',
  filtros: { situacoes: SITUACOES_PADRAO },
};

const PALAVRAS_RUINS = ['urgente', 'ultimo aviso', 'último aviso', 'protesto', 'serasa', 'spc', 'clique aqui', 'gratis', 'grátis'];
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Erros que impedem salvar (`envio` = tambem o que impede enviar). */
export function validarComunicado(d: DadosComunicado, envio = false): string[] {
  const e: string[] = [];
  if (d.nome_interno.trim().length < 3) e.push('Dê um nome ao comunicado (só a equipe vê).');
  if (envio) {
    if (!d.assunto.trim()) e.push('Preencha o assunto.');
    if (!d.titulo.trim()) e.push('Preencha o título.');
    if (!d.corpo.trim()) e.push('Escreva o texto.');
  }
  if (d.assunto.length > 150) e.push('Assunto: até 150 caracteres.');
  if (d.titulo.length > 120) e.push('Título: até 120 caracteres.');
  if (d.previa.length > 200) e.push('Prévia: até 200 caracteres.');
  if (d.corpo.length > 5000) e.push('Texto: até 5000 caracteres.');
  const textos = [d.assunto, d.titulo, d.previa, d.corpo, d.botao_texto].join('\n');
  const desconhecidos = Array.from(new Set(camposUsados(textos).filter((c) => c !== 'nome')));
  if (desconhecidos.length) e.push(`Campo ${desconhecidos.map((c) => `{${c}}`).join(', ')} não existe (use só {nome}).`);
  if (d.botao_texto.trim() && !d.botao_url.trim()) e.push('O botão precisa do link.');
  if (d.botao_url.trim() && !/^https:\/\/\S+$/.test(d.botao_url.trim())) e.push('O link do botão precisa começar com https://');
  if (d.botao_url.trim() && !d.botao_texto.trim()) e.push('Escreva o texto do botão.');
  const t = semAcento(`${d.assunto} ${d.titulo}`);
  const ruins = PALAVRAS_RUINS.filter((w) => t.includes(semAcento(w)));
  if (ruins.length) e.push(`Evite "${ruins.join('", "')}" no assunto/título: cai no spam.`);
  return e;
}

/** O que vai para o banco (filtros vazios saem; um associado ignora os outros filtros). */
export function filtrosParaGravar(f: FiltrosComunicado): FiltrosComunicado {
  if (f.cliente_id) return { cliente_id: f.cliente_id };
  const r: FiltrosComunicado = {};
  if (f.regional_ids?.length) r.regional_ids = f.regional_ids;
  r.situacoes = f.situacoes?.length ? f.situacoes : SITUACOES_PADRAO;
  if (f.plano_ids?.length) r.plano_ids = f.plano_ids;
  if (f.tipo_veiculo_ids?.length) r.tipo_veiculo_ids = f.tipo_veiculo_ids;
  return r;
}

export interface PreviaPublico {
  associados: number;
  recebem: number;
  sem_email: number;
  email_repetido: number;
  suprimidos: number;
  descadastrados: number;
  amostra: { nome: string; email: string }[];
}

/** As linhas de "quem fica de fora" que a tela mostra embaixo do total. */
export function foraDoEnvio(p: PreviaPublico): string[] {
  const l: string[] = [];
  if (p.sem_email) l.push(`${p.sem_email} sem e-mail válido no cadastro`);
  if (p.email_repetido) l.push(`${p.email_repetido} com e-mail repetido (recebe uma vez só)`);
  if (p.suprimidos) l.push(`${p.suprimidos} na lista de supressão (e-mail devolvido ou reclamação)`);
  if (p.descadastrados) l.push(`${p.descadastrados} pediram para não receber informativos`);
  return l;
}
