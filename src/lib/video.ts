// Video dos anexos (evento): o que entra, como reduzir e como reconhecer.
//
// O video do celular sai com 60-200 MB por minuto. Ele e REDUZIDO no navegador
// antes de subir: tocado num <video> escondido, desenhado num <canvas> no
// maximo 1280px no maior lado e regravado pelo MediaRecorder a ~1,2 Mbps
// (o mesmo bitrate da revistoria, 0137). 90 s viram ~14 MB. Sem audio, como a
// revistoria: o que se confere no anexo e a imagem.
// O teto final (50 MB) e do BANCO (0196); aqui e o que evita gastar rede a toa.

import { mimeDeGravacao, extensaoDoVideo, VIDEO_BITS_POR_SEGUNDO } from './revistoria';
import { tamanhoLegivel } from './imagem';

/** Duracao maxima do video do anexo (segundos). */
export const VIDEO_ANEXO_SEGUNDOS = 90;
/** Teto do arquivo que sobe (o do banco, 0196). */
export const VIDEO_ANEXO_MAX_BYTES = 50 * 1024 * 1024;
/** Video maior que isso nem e lido (o navegador do celular trava). */
export const VIDEO_BRUTO_MAX_BYTES = 500 * 1024 * 1024;
/** Maior lado do video reduzido. */
export const VIDEO_LADO_MAXIMO = 1280;

const EXT_VIDEO = /\.(mp4|m4v|mov|webm|3gp|mkv|avi)$/i;
const EXT_IMAGEM = /\.(png|jpe?g|webp|heic|heif|gif)$/i;

export function ehVideo(file: { name: string; type?: string }): boolean {
  return (file.type ?? '').startsWith('video/') || EXT_VIDEO.test(file.name);
}

/** O anexo guardado e imagem ou video? (pela extensao do caminho no bucket) */
export function tipoDeMidia(caminho: string | null | undefined): 'IMAGEM' | 'VIDEO' | null {
  const c = (caminho ?? '').split('?')[0];
  if (EXT_VIDEO.test(c)) return 'VIDEO';
  if (EXT_IMAGEM.test(c)) return 'IMAGEM';
  return null;
}

/** Recusa antes de ler o arquivo; `duracao` (segundos) quando ja conhecida. */
export function validarVideo(file: { size: number }, duracao?: number | null): string | null {
  if (file.size > VIDEO_BRUTO_MAX_BYTES) {
    return `O vídeo tem ${tamanhoLegivel(file.size)}; o máximo para envio é ${tamanhoLegivel(VIDEO_BRUTO_MAX_BYTES)}.`;
  }
  if (duracao != null && Number.isFinite(duracao) && duracao > VIDEO_ANEXO_SEGUNDOS + 1) {
    return `O vídeo tem ${Math.round(duracao)} segundos; o limite é ${VIDEO_ANEXO_SEGUNDOS} segundos. Corte o vídeo no celular e envie de novo.`;
  }
  return null;
}

/** Tamanho da tela do video reduzido: maior lado no maximo `max`, numeros pares (o codificador exige). */
export function dimensoesVideo(largura: number, altura: number, max = VIDEO_LADO_MAXIMO): { largura: number; altura: number } {
  if (!largura || !altura) return { largura: 0, altura: 0 };
  const fator = Math.min(1, max / Math.max(largura, altura));
  const par = (n: number) => Math.max(2, Math.round((n * fator) / 2) * 2);
  return { largura: par(largura), altura: par(altura) };
}

/** Nome do arquivo reduzido: mesmo nome, extensao do formato gravado. */
export function nomeVideoReduzido(nome: string, mime: string): string {
  const base = nome.replace(/\.[^.]+$/, '') || 'video';
  return `${base}.${extensaoDoVideo(mime)}`;
}

/** Duracao do video (segundos), lida no navegador. Null quando nao da para ler. */
export function duracaoDoVideo(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve(null);
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    const fim = (d: number | null) => { URL.revokeObjectURL(url); resolve(d); };
    v.onloadedmetadata = () => fim(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => fim(null);
    v.src = url;
  });
}

/**
 * Reduz o video no navegador. Leva o tempo do proprio video (ele e tocado).
 * Nunca falha para quem chama: sem suporte no navegador, ou se o reduzido
 * sair maior, devolve o original (o teto do banco decide).
 */
export async function comprimirVideo(file: File, onProgresso?: (fracao: number) => void): Promise<File> {
  if (typeof document === 'undefined' || typeof MediaRecorder === 'undefined') return file;
  const mime = mimeDeGravacao((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) return file;

  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;

  try {
    await new Promise<void>((ok, erro) => {
      v.onloadedmetadata = () => ok();
      v.onerror = () => erro(new Error('formato de vídeo não lido'));
    });
    const { largura, altura } = dimensoesVideo(v.videoWidth, v.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx || !largura || typeof canvas.captureStream !== 'function') return file;

    const stream = canvas.captureStream(30);
    const gravador = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: VIDEO_BITS_POR_SEGUNDO });
    const partes: Blob[] = [];
    gravador.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
    const parado = new Promise<void>((ok) => { gravador.onstop = () => ok(); });

    let ativo = true;
    // setInterval (e nao requestAnimationFrame) para nao parar se a aba sair de foco.
    const relogio = window.setInterval(() => {
      if (!ativo) return;
      ctx.drawImage(v, 0, 0, largura, altura);
      if (v.duration) onProgresso?.(Math.min(1, v.currentTime / v.duration));
    }, 1000 / 30);

    gravador.start(1000);
    await v.play();
    await new Promise<void>((ok) => { v.onended = () => ok(); });
    ativo = false;
    window.clearInterval(relogio);
    gravador.stop();
    await parado;
    stream.getTracks().forEach((t) => t.stop());

    const tipo = mime.split(';')[0];
    const blob = new Blob(partes, { type: tipo });
    if (!blob.size || blob.size >= file.size) return file;
    onProgresso?.(1);
    return new File([blob], nomeVideoReduzido(file.name, mime), { type: tipo });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
