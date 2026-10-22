// REVISTORIA DO BOLETO VENCIDO (0137) — regras puras, espelho do banco.
//
// Passados N dias de atraso (padrao 5, `empresa.dias_revistoria_boleto`), a 2a
// via so sai depois de uma revistoria do veiculo (frente, traseira e um video
// dando a volta, ate 30 s) aprovada pela equipe. Quem trava e o BANCO (trigger
// em `cobranca_renegociacao_origens`); aqui ficam o que a tela mostra e decide.

import type { RevistoriaItemPublico, SituacaoRevistoria } from '@/lib/database.types';

export const DIAS_REVISTORIA_PADRAO = 5;
/** Duracao maxima do video (decisao do usuario). O banco aceita ate +2 s de folga. */
export const VIDEO_REVISTORIA_SEGUNDOS = 30;
export const VIDEO_TOLERANCIA_SEGUNDOS = 2;
/** Teto do video no banco (`chk_vistoria_anexo_tamanho`, 0137). */
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
/** Bitrate da gravacao na pagina: ~30 s ficam em ~5 MB, o que sobe no 4G. */
export const VIDEO_BITS_POR_SEGUNDO = 1_200_000;

/** Exige revistoria? So ACIMA do limite: no dia N ainda nao. */
export function exigeRevistoria(diasAtraso: number | null | undefined, limite: number = DIAS_REVISTORIA_PADRAO): boolean {
  return typeof diasAtraso === 'number' && diasAtraso > limite;
}

export const ROTULO_SITUACAO_REVISTORIA: Record<SituacaoRevistoria, { rotulo: string; tom: string }> = {
  AGUARDANDO: { rotulo: 'Aguardando o associado', tom: 'bg-amber-100 text-amber-800' },
  EM_ANALISE: { rotulo: 'Em análise', tom: 'bg-cyan-100 text-cyan-800' },
  APROVADA: { rotulo: 'Aprovada', tom: 'bg-emerald-100 text-emerald-800' },
  DISPENSADA: { rotulo: 'Liberada sem revistoria', tom: 'bg-violet-100 text-violet-800' },
  UTILIZADA: { rotulo: 'Usada na 2ª via', tom: 'bg-slate-100 text-slate-600' },
  CANCELADA: { rotulo: 'Cancelada', tom: 'bg-slate-100 text-slate-500' },
  EXPIRADA: { rotulo: 'Expirada', tom: 'bg-slate-100 text-slate-500' },
};

/** Motivos prontos de reprovacao (o texto vai para o associado no link). */
export const MOTIVOS_REPROVACAO = [
  'Foto escura ou fora de foco — refaça com luz do dia.',
  'A placa não aparece legível — refaça mostrando a placa.',
  'O vídeo não mostra o carro inteiro — dê a volta completa.',
  'O veículo da foto não é o do cadastro.',
  'Há dano/alteração no veículo — fale com a nossa equipe.',
] as const;

/** Quanto falta no link: obrigatorios enviados nesta rodada. */
export function progressoRevistoria(itens: Pick<RevistoriaItemPublico, 'obrigatorio' | 'enviado'>[]) {
  const obrig = itens.filter((i) => i.obrigatorio);
  const feitos = obrig.filter((i) => i.enviado).length;
  return {
    obrigatorios: obrig.length,
    feitos,
    completa: obrig.length > 0 && feitos === obrig.length,
    percentual: obrig.length ? Math.round((feitos / obrig.length) * 100) : 0,
  };
}

/** O video cabe? Duracao ate 30 s (+folga) e tamanho ate 50 MB. Null = ok. */
export function validarVideo(duracao: number | null | undefined, tamanho: number): string | null {
  if (duracao == null || !Number.isFinite(duracao) || duracao <= 0) {
    return 'Não consegui ler a duração do vídeo. Grave pelo botão da página.';
  }
  if (duracao > VIDEO_REVISTORIA_SEGUNDOS + VIDEO_TOLERANCIA_SEGUNDOS) {
    return `O vídeo tem ${Math.round(duracao)} segundos; o limite é ${VIDEO_REVISTORIA_SEGUNDOS}.`;
  }
  if (tamanho > VIDEO_MAX_BYTES) return 'O vídeo passou de 50 MB. Grave pelo botão da página (fica menor).';
  return null;
}

/** O primeiro formato de gravacao que o navegador suporta (iPhone grava mp4; Android, webm). */
export function mimeDeGravacao(suporta: (mime: string) => boolean): string | null {
  const candidatos = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  return candidatos.find((m) => { try { return suporta(m); } catch { return false; } }) ?? null;
}

export function extensaoDoVideo(mime: string): string {
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('quicktime')) return 'mov';
  return 'webm';
}

/** O convite: diz o que fazer, por que, e ate quando vale (sem prazo o associado deixa para depois). */
export function mensagemRevistoria(p: {
  nome?: string | null; placa?: string | null; link: string; expiraEm?: string | null; motivo?: string | null;
}): string {
  const primeiro = (p.nome ?? '').trim().split(/\s+/)[0];
  const ola = primeiro ? `Olá, ${primeiro.charAt(0)}${primeiro.slice(1).toLowerCase()}! ` : 'Olá! ';
  const placa = p.placa ? ` do veículo ${p.placa}` : '';
  const d = p.expiraEm ? new Date(p.expiraEm) : null;
  const prazo = d && !Number.isNaN(d.getTime()) ? ` O link vale até ${d.toLocaleDateString('pt-BR')}.` : '';
  if (p.motivo) {
    return `${ola}Precisamos que refaça a revistoria${placa}: ${p.motivo} `
      + `Use o mesmo link: ${p.link}${prazo}`;
  }
  return `${ola}Para emitirmos o seu novo boleto${placa}, precisamos de uma revistoria rápida: `
    + `uma foto da frente, uma da traseira e um vídeo de até ${VIDEO_REVISTORIA_SEGUNDOS} segundos dando a volta no carro. `
    + `É pelo celular e leva uns 2 minutos: ${p.link}${prazo} Assim que aprovarmos, enviamos o boleto.`;
}

/** Resumo do que a 2a via destes boletos exige (o painel do modal de negociacao). */
export function resumoExigencia(linhas: { liberada: boolean; situacao: SituacaoRevistoria | null }[]) {
  const pendentes = linhas.filter((l) => !l.liberada);
  return {
    exige: linhas.length > 0,
    bloqueia: pendentes.length > 0,
    pendentes: pendentes.length,
    emAnalise: pendentes.filter((l) => l.situacao === 'EM_ANALISE').length,
    semPedido: pendentes.filter((l) => !l.situacao).length,
  };
}

/** Segundos em "0:28". */
export function formatarSegundos(s: number): string {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
