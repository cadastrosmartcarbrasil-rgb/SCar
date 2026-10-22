'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Camera, CheckCircle2, Clock, Loader2, RotateCcw, Send, ShieldCheck, Square, TriangleAlert, Video,
} from 'lucide-react';
import { CabecalhoMarca, RodapeMarca } from '@/components/hotlink/marca';
import { comprimirImagem, validarArquivo } from '@/lib/imagem';
import {
  extensaoDoVideo, formatarSegundos, mimeDeGravacao, progressoRevistoria, validarVideo,
  VIDEO_BITS_POR_SEGUNDO, VIDEO_REVISTORIA_SEGUNDOS,
} from '@/lib/revistoria';
import { identificacaoVeiculo } from '@/lib/placa';
import { formatDate } from '@/lib/utils';
import type { RevistoriaItemPublico, RevistoriaPublica as Sessao } from '@/lib/database.types';

/**
 * A revistoria do boleto vencido, feita pelo ASSOCIADO no celular dele (0137).
 * Escrita para quem nunca viu o sistema: um item por vez, sem jargao, e o video
 * gravado AQUI, com qualidade reduzida e parada automatica em 30 s — o video
 * da camera nativa passa facil de 50 MB e nao sobe no 4G.
 */
const MOTIVOS: Record<string, { titulo: string; texto: string; ok?: boolean }> = {
  LINK_INVALIDO: {
    titulo: 'Link não encontrado',
    texto: 'Confira se o endereço veio completo na mensagem. Se continuar assim, fale com a nossa central.',
  },
  LINK_EXPIRADO: {
    titulo: 'Este link expirou',
    texto: 'Por segurança o link vale alguns dias. Peça um novo à nossa central — leva um minuto.',
  },
  EM_ANALISE: {
    titulo: 'Recebemos a sua revistoria',
    texto: 'Nossa equipe está conferindo as fotos e o vídeo. Assim que aprovarmos, enviamos o seu boleto. Não precisa fazer mais nada.',
    ok: true,
  },
  APROVADA: {
    titulo: 'Revistoria aprovada',
    texto: 'Tudo certo com o seu veículo. O boleto é enviado pela nossa central.',
    ok: true,
  },
  ENCERRADA: {
    titulo: 'Esta revistoria foi encerrada',
    texto: 'Não é mais preciso enviar nada por este link. Em caso de dúvida, fale com a nossa central.',
  },
};

export function RevistoriaPublica({
  token, sessao, itensIniciais, logoUrl,
}: {
  token: string;
  sessao: Sessao | null;
  itensIniciais: RevistoriaItemPublico[];
  logoUrl: string | null;
}) {
  const [itens, setItens] = useState(itensIniciais);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [concluindo, setConcluindo] = useState(false);
  const [concluida, setConcluida] = useState(false);
  const progresso = progressoRevistoria(itens);

  if (!sessao?.valida || concluida) {
    const m = MOTIVOS[concluida ? 'EM_ANALISE' : sessao?.motivo ?? 'LINK_INVALIDO'] ?? MOTIVOS.LINK_INVALIDO;
    return (
      <Pagina logoUrl={logoUrl}>
        <div className="rounded-2xl bg-superficie p-6 text-center shadow-sm">
          {m.ok
            ? <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            : <TriangleAlert className="mx-auto h-12 w-12 text-amber-500" />}
          <h2 className="mt-3 text-lg font-semibold text-slate-800">{m.titulo}</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{m.texto}</p>
        </div>
      </Pagina>
    );
  }

  async function enviar(item: RevistoriaItemPublico, file: File, duracao?: number) {
    setEnviando(item.codigo);
    try {
      const form = new FormData();
      form.append('token', token);
      form.append('tipo', item.codigo);
      form.append('file', file);
      if (duracao != null) form.append('duracao', String(Math.round(duracao * 10) / 10));
      const res = await fetch('/api/v1/revistoria', { method: 'POST', body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Não consegui enviar');
      setItens(body.itens ?? itens);
      toast.success(item.midia === 'VIDEO' ? 'Vídeo recebido!' : 'Foto recebida!');
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setEnviando(null);
    }
  }

  async function enviarFoto(item: RevistoriaItemPublico, bruto: File | null) {
    if (!bruto) return;
    const recusa = validarArquivo(bruto);
    if (recusa) return toast.error(recusa);
    const file = await comprimirImagem(bruto);
    await enviar(item, file);
  }

  async function concluir() {
    setConcluindo(true);
    try {
      const res = await fetch('/api/v1/revistoria', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ acao: 'concluir', token }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Não consegui concluir');
      setConcluida(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConcluindo(false);
    }
  }

  const veiculo = identificacaoVeiculo(sessao.placa, sessao.chassi);
  const primeiro = (sessao.nome ?? '').trim().split(/\s+/)[0];

  return (
    <Pagina logoUrl={logoUrl}>
      <div className="rounded-2xl bg-superficie p-5 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-800">
          {primeiro ? `${primeiro.charAt(0)}${primeiro.slice(1).toLowerCase()}, ` : ''}vamos liberar o seu boleto
        </h1>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          Como o boleto venceu há alguns dias, precisamos ver o veículo antes de emitir o novo: uma foto da frente,
          uma da traseira e um vídeo de até {VIDEO_REVISTORIA_SEGUNDOS} segundos dando a volta no carro.
        </p>
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600">
          <span className="font-mono font-semibold tracking-wider">{veiculo}</span>
          {sessao.modelo && <> · {sessao.marca} {sessao.modelo}</>}
        </p>

        {sessao.motivo_reprovacao && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-amber-900">
            <TriangleAlert className="mt-px h-4 w-4 shrink-0" />
            <span><b>Precisamos que refaça:</b> {sessao.motivo_reprovacao}</span>
          </p>
        )}

        <div className="mt-4">
          <div className="flex items-center justify-between text-[12px] font-medium">
            <span className={progresso.completa ? 'text-emerald-600' : 'text-slate-600'}>
              {progresso.completa ? 'Tudo pronto para enviar!' : `${progresso.feitos} de ${progresso.obrigatorios}`}
            </span>
            {sessao.expira_em && (
              <span className="flex items-center gap-1 text-[11.5px] text-slate-400">
                <Clock className="h-3 w-3" /> até {formatDate(sessao.expira_em)}
              </span>
            )}
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${progresso.completa ? 'bg-emerald-500' : 'bg-cyan-500'}`}
              style={{ width: `${progresso.percentual}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {itens.map((item) => item.midia === 'VIDEO'
          ? (
            <CartaoVideo key={item.codigo} item={item} ocupado={enviando !== null}
              enviando={enviando === item.codigo} onEnviar={(f, d) => enviar(item, f, d)} />
          ) : (
            <label
              key={item.codigo}
              className={`flex items-center gap-3 rounded-2xl border p-3.5 transition ${
                item.enviado ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-superficie active:bg-slate-50'
              }`}
            >
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                item.enviado ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}
              >
                {enviando === item.codigo
                  ? <Loader2 className="h-5 w-5 animate-spin" />
                  : item.enviado ? <CheckCircle2 className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold text-slate-800">{item.nome}</span>
                {item.instrucao && <span className="mt-0.5 block text-[12px] leading-snug text-slate-500">{item.instrucao}</span>}
                {item.enviado && (
                  <span className="mt-0.5 block text-[11.5px] font-medium text-emerald-700">Recebida · toque para trocar</span>
                )}
              </span>
              <input
                type="file" accept="image/*" capture="environment" className="hidden"
                disabled={enviando !== null}
                onChange={(e) => { enviarFoto(item, e.target.files?.[0] ?? null); e.target.value = ''; }}
              />
            </label>
          ))}
      </div>

      <button
        type="button"
        onClick={concluir}
        disabled={!progresso.completa || concluindo || enviando !== null}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-acao px-4 py-3.5 text-[14px] font-semibold text-white transition hover:bg-acao-escura disabled:opacity-40"
      >
        {concluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Enviar para análise
      </button>

      <p className="mt-4 flex items-start gap-1.5 px-1 text-[11.5px] leading-relaxed text-slate-400">
        <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
        As fotos e o vídeo são usados só para conferir o estado do seu veículo.
      </p>
    </Pagina>
  );
}

// ---------------------------------------------------------------------------
// O video: gravado na pagina (qualidade reduzida, para em 30 s). Sem suporte a
// gravacao no navegador, cai na camera do celular, conferindo a duracao.
// ---------------------------------------------------------------------------
function CartaoVideo({
  item, ocupado, enviando, onEnviar,
}: {
  item: RevistoriaItemPublico;
  ocupado: boolean;
  enviando: boolean;
  onEnviar: (f: File, duracao: number) => Promise<boolean>;
}) {
  const visor = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const gravador = useRef<MediaRecorder | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const inicio = useRef(0);
  const [estado, setEstado] = useState<'parado' | 'camera' | 'gravando' | 'gravado'>('parado');
  const [segundos, setSegundos] = useState(0);
  const [gravado, setGravado] = useState<{ file: File; url: string; duracao: number } | null>(null);
  const [semGravador, setSemGravador] = useState(false);

  // Saiu da pagina com a camera aberta: desliga (senao a luz da camera fica acesa).
  useEffect(() => () => { stream.current?.getTracks().forEach((t) => t.stop()); }, []);

  useEffect(() => {
    if (estado !== 'gravando') return;
    const id = setInterval(() => {
      const s = (Date.now() - inicio.current) / 1000;
      setSegundos(s);
      if (s >= VIDEO_REVISTORIA_SEGUNDOS) parar();
    }, 200);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  async function abrirCamera() {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setSemGravador(true);
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } },
        audio: false,
      });
      stream.current = s;
      setEstado('camera');
      requestAnimationFrame(() => {
        if (visor.current) { visor.current.srcObject = s; visor.current.play().catch(() => {}); }
      });
    } catch {
      toast.error('Não consegui abrir a câmera. Libere a câmera para esta página ou use a gravação do celular.');
      setSemGravador(true);
    }
  }

  function gravar() {
    if (!stream.current) return;
    const mime = mimeDeGravacao((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) { setSemGravador(true); return; }
    pedacos.current = [];
    const r = new MediaRecorder(stream.current, { mimeType: mime, videoBitsPerSecond: VIDEO_BITS_POR_SEGUNDO });
    r.ondataavailable = (e) => { if (e.data.size > 0) pedacos.current.push(e.data); };
    r.onstop = () => {
      const duracao = Math.min((Date.now() - inicio.current) / 1000, VIDEO_REVISTORIA_SEGUNDOS);
      const tipo = mime.split(';')[0];
      const blob = new Blob(pedacos.current, { type: tipo });
      const file = new File([blob], `revistoria.${extensaoDoVideo(tipo)}`, { type: tipo });
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      setGravado({ file, url: URL.createObjectURL(blob), duracao });
      setEstado('gravado');
    };
    gravador.current = r;
    inicio.current = Date.now();
    setSegundos(0);
    r.start(1000);
    setEstado('gravando');
  }

  function parar() {
    if (gravador.current && gravador.current.state !== 'inactive') gravador.current.stop();
  }

  function refazer() {
    if (gravado) URL.revokeObjectURL(gravado.url);
    setGravado(null);
    setEstado('parado');
    abrirCamera();
  }

  async function enviarGravado() {
    if (!gravado) return;
    const recusa = validarVideo(gravado.duracao, gravado.file.size);
    if (recusa) return toast.error(recusa);
    const ok = await onEnviar(gravado.file, gravado.duracao);
    if (ok) { URL.revokeObjectURL(gravado.url); setGravado(null); setEstado('parado'); }
  }

  async function arquivoDoCelular(file: File | null) {
    if (!file) return;
    const duracao = await duracaoDoArquivo(file);
    const recusa = validarVideo(duracao, file.size);
    if (recusa) return toast.error(recusa);
    await onEnviar(file, duracao as number);
  }

  return (
    <div className={`rounded-2xl border p-3.5 ${item.enviado ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-superficie'}`}>
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${item.enviado ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
          {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : item.enviado ? <CheckCircle2 className="h-5 w-5" /> : <Video className="h-5 w-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold text-slate-800">{item.nome}</span>
          {item.instrucao && <span className="mt-0.5 block text-[12px] leading-snug text-slate-500">{item.instrucao}</span>}
          {item.enviado && (
            <span className="mt-0.5 block text-[11.5px] font-medium text-emerald-700">
              Recebido{item.duracao_segundos ? ` · ${formatarSegundos(Number(item.duracao_segundos))}` : ''} · grave de novo se quiser trocar
            </span>
          )}
        </span>
      </div>

      {(estado === 'camera' || estado === 'gravando') && (
        <div className="mt-3 overflow-hidden rounded-xl bg-black">
          <video ref={visor} muted playsInline className="aspect-video w-full object-cover" />
        </div>
      )}
      {estado === 'gravado' && gravado && (
        <div className="mt-3 overflow-hidden rounded-xl bg-black">
          <video src={gravado.url} controls playsInline className="aspect-video w-full object-contain" />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {estado === 'parado' && !semGravador && (
          <Botao onClick={abrirCamera} disabled={ocupado} icone={<Video className="h-4 w-4" />}>
            {item.enviado ? 'Gravar de novo' : 'Abrir a câmera'}
          </Botao>
        )}
        {estado === 'camera' && (
          <Botao onClick={gravar} icone={<span className="h-3 w-3 rounded-full bg-rose-500" />}>
            Começar a gravar ({VIDEO_REVISTORIA_SEGUNDOS}s)
          </Botao>
        )}
        {estado === 'gravando' && (
          <Botao onClick={parar} icone={<Square className="h-4 w-4" />}>
            Parar · {formatarSegundos(segundos)} / {formatarSegundos(VIDEO_REVISTORIA_SEGUNDOS)}
          </Botao>
        )}
        {estado === 'gravado' && (
          <>
            <Botao onClick={enviarGravado} disabled={ocupado} icone={enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}>
              Enviar vídeo ({formatarSegundos(gravado?.duracao ?? 0)})
            </Botao>
            <Botao secundario onClick={refazer} disabled={ocupado} icone={<RotateCcw className="h-4 w-4" />}>Gravar de novo</Botao>
          </>
        )}
        {semGravador && (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-acao px-3.5 py-2.5 text-[13px] font-semibold text-white">
            <Video className="h-4 w-4" /> Gravar com a câmera do celular
            <input
              type="file" accept="video/*" capture="environment" className="hidden" disabled={ocupado}
              onChange={(e) => { arquivoDoCelular(e.target.files?.[0] ?? null); e.target.value = ''; }}
            />
          </label>
        )}
      </div>
      {semGravador && (
        <p className="mt-2 text-[11.5px] text-slate-500">
          Grave no máximo {VIDEO_REVISTORIA_SEGUNDOS} segundos. Se o celular gravar em qualidade muito alta, o envio pode demorar.
        </p>
      )}
    </div>
  );
}

function Botao({ children, onClick, disabled, icone, secundario }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; icone?: React.ReactNode; secundario?: boolean;
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold transition disabled:opacity-40 ${
        secundario ? 'border border-slate-300 text-slate-700' : 'bg-acao text-white hover:bg-acao-escura'}`}
    >
      {icone}{children}
    </button>
  );
}

/** Duracao de um video escolhido no celular (o navegador le os metadados). */
function duracaoDoArquivo(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    const fim = (d: number | null) => { URL.revokeObjectURL(url); resolve(d); };
    v.onloadedmetadata = () => {
      if (Number.isFinite(v.duration)) return fim(v.duration);
      // webm sem duracao no cabecalho: pular para o fim forca o calculo
      v.currentTime = 1e7;
      v.ontimeupdate = () => { v.ontimeupdate = null; fim(Number.isFinite(v.duration) ? v.duration : null); };
    };
    v.onerror = () => fim(null);
    v.src = url;
  });
}

function Pagina({ children, logoUrl }: { children: React.ReactNode; logoUrl: string | null }) {
  return (
    <div className="min-h-screen bg-fundo">
      <CabecalhoMarca logoUrl={logoUrl} subtitulo="Revistoria do veículo" />
      <main className="mx-auto w-full max-w-lg px-4 pb-10">{children}</main>
      <RodapeMarca />
    </div>
  );
}
