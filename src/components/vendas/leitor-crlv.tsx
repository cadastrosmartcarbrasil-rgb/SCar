'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { Camera, CheckCircle2, FileUp, Info, Loader2, QrCode, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { interpretarQrCrlv, qrTrouxeDados, type DadosCrlv } from '@/lib/crlv';

/** Decodifica um QR a partir de um <img>/<video> desenhado num canvas. */
async function lerQrDeImagem(fonte: CanvasImageSource, largura: number, altura: number): Promise<string | null> {
  if (!largura || !altura) return null;
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(fonte, 0, 0, largura, altura);
  const jsQR = (await import('jsqr')).default;
  const img = ctx.getImageData(0, 0, largura, altura);
  return jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

/**
 * Leitura do QR Code do CRLV-e.
 * O QR do CRLV aponta para a validacao no gov.br — ele identifica o documento,
 * nao devolve a ficha do veiculo. Entao aqui: guardamos o conteudo como prova,
 * aproveitamos placa/Renavam/chassi quando vierem, e a ficha e completada pela
 * consulta da placa que ja existe no sistema.
 */
export function LeitorCrlv({
  onLido,
  valorAtual,
}: {
  onLido: (dados: DadosCrlv) => void;
  valorAtual?: string | null;
}) {
  const [camera, setCamera] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [resultado, setResultado] = useState<DadosCrlv | null>(
    valorAtual ? interpretarQrCrlv(valorAtual) : null,
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);

  const encerrarCamera = useCallback(() => {
    if (loopRef.current) cancelAnimationFrame(loopRef.current);
    loopRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamera(false);
  }, []);

  useEffect(() => () => encerrarCamera(), [encerrarCamera]);

  function aceitar(conteudo: string) {
    const dados = interpretarQrCrlv(conteudo);
    setResultado(dados);
    onLido(dados);
    toast.success(qrTrouxeDados(dados) ? 'CRLV lido — dados aproveitados' : 'CRLV registrado');
    encerrarCamera();
  }

  async function abrirCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCamera(true);

      // O <video> so existe apos o render; espera o proximo quadro.
      requestAnimationFrame(async () => {
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play().catch(() => undefined);

        const varrer = async () => {
          if (!videoRef.current || !streamRef.current) return;
          const conteudo = await lerQrDeImagem(
            videoRef.current, videoRef.current.videoWidth, videoRef.current.videoHeight,
          );
          if (conteudo) { aceitar(conteudo); return; }
          loopRef.current = requestAnimationFrame(() => void varrer());
        };
        void varrer();
      });
    } catch {
      toast.error('Nao consegui abrir a camera. Use "Enviar imagem do CRLV".');
    }
  }

  const onDrop = useCallback(async (arquivos: File[]) => {
    const file = arquivos[0];
    if (!file) return;
    setLendo(true);
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      await img.decode();
      const conteudo = await lerQrDeImagem(img, img.naturalWidth, img.naturalHeight);
      URL.revokeObjectURL(url);
      if (conteudo) aceitar(conteudo);
      else toast.error('Nao achei um QR Code nessa imagem. Tente uma foto mais nitida e enquadrada.');
    } catch {
      toast.error('Nao consegui ler a imagem.');
    } finally {
      setLendo(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, multiple: false, accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
  });

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-[11.5px] leading-relaxed text-slate-600">
        <Info className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" />
        O QR do CRLV-e aponta para a validacao no gov.br — ele comprova o documento e costuma
        trazer <b>placa, Renavam e chassi</b>. Marca, modelo e ano continuam vindo da consulta da
        placa (FIPE), que o formulario ja faz.
      </p>

      {camera ? (
        <div className="relative overflow-hidden rounded-xl border border-slate-300 bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} className="h-64 w-full object-cover" playsInline muted />
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="h-40 w-40 rounded-xl border-2 border-cyan-400/80" />
          </div>
          <button
            type="button"
            onClick={encerrarCamera}
            className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg bg-black/60 text-white"
            aria-label="Fechar camera"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="absolute inset-x-0 bottom-0 bg-black/60 py-1.5 text-center text-[11px] text-white">
            Aponte para o QR Code do CRLV
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={abrirCamera}>
            <Camera className="h-4 w-4" /> Ler com a camera
          </Button>
          <div {...getRootProps()} className="inline-flex">
            <input {...getInputProps()} />
            <Button type="button" variant="secondary" disabled={lendo}>
              {lendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {isDragActive ? 'Solte a imagem' : 'Enviar imagem do CRLV'}
            </Button>
          </div>
        </div>
      )}

      {resultado && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" /> CRLV registrado
          </p>
          <dl className="mt-1.5 grid grid-cols-3 gap-2 text-[11.5px]">
            <Campo rotulo="Placa" valor={resultado.placa} />
            <Campo rotulo="Renavam" valor={resultado.renavam} />
            <Campo rotulo="Chassi" valor={resultado.chassi} />
          </dl>
          {!qrTrouxeDados(resultado) && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-emerald-700">
              <QrCode className="h-3 w-3" />
              Este QR so traz o link de validacao — preencha os campos do veiculo manualmente.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-[10.5px] uppercase tracking-wide text-emerald-700/70">{rotulo}</dt>
      <dd className="tnum font-medium text-emerald-900">{valor ?? '—'}</dd>
    </div>
  );
}
