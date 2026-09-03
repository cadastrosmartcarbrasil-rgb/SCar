'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, Check, Info, Loader2, Trash2, ZoomIn } from 'lucide-react';
import { VisorImagens } from '@/components/ui/visor-imagens';
import {
  useAddFotoVistoria, useFotosVistoriaLead, useRemoverFotoVistoria, useUrlAssinadaVendas,
  useUrlsAssinadasVendas,
} from '@/hooks/use-vendas';
import { progressoVistoria, proximaPose } from '@/lib/vistoria';
import { LADO_MAXIMO, tamanhoLegivel } from '@/lib/imagem';
import { formatDateTime } from '@/lib/utils';
import type { FotoVistoriaModelo, VistoriaAnexosRow } from '@/lib/database.types';

/**
 * Vistoria guiada por MODELO DE FOTOS.
 *
 * O vendedor nao decide o que fotografar: a tela lista as poses do catalogo
 * (`vistoria_fotos_modelo`), com a instrucao de enquadramento de cada uma, e
 * so fica verde quando as obrigatorias estao completas. No celular o botao
 * abre a camera traseira direto (`capture="environment"`).
 *
 * A MINIATURA e o que faz a auditoria funcionar: sem ela, conferir se a foto
 * subiu inteira exigia abrir uma aba por pose. Agora a foto aparece, com o
 * peso e a data do envio, e o clique amplia sem sair da tela. As imagens so
 * sao pedidas quando este componente monta — ou seja, quando a aba da vistoria
 * e aberta, e nao no carregamento da ficha inteira.
 */
export function FotosVistoria({ leadId, somenteLeitura }: {
  leadId: string;
  somenteLeitura?: boolean;
}) {
  const { data: poses, isLoading } = useFotosVistoriaLead(leadId);
  const addFoto = useAddFotoVistoria(leadId);
  const remover = useRemoverFotoVistoria(leadId);
  const urlAssinada = useUrlAssinadaVendas();
  const [enviando, setEnviando] = useState<string | null>(null);
  const [ampliada, setAmpliada] = useState<string | null>(null);

  const lista = poses ?? [];
  const enviadas = lista.filter((p) => p.enviada && p.url);
  const { data: urls, isLoading: carregandoUrls } = useUrlsAssinadasVendas(enviadas.map((p) => p.url));
  const progresso = progressoVistoria(lista);
  const proxima = proximaPose(lista);

  function enviar(codigo: string, file: File | null) {
    if (!file) return;
    setEnviando(codigo);
    addFoto.mutate(
      { file, tipo: codigo },
      {
        onSuccess: () => toast.success('Foto enviada'),
        onError: (e) => toast.error(e.message),
        onSettled: () => setEnviando(null),
      },
    );
  }

  async function abrirOriginal(path: string) {
    try {
      window.open(await urlAssinada.mutateAsync(path), '_blank');
    } catch {
      toast.error('Nao consegui abrir a foto');
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className={`rounded-xl border px-3 py-2.5 ${
        progresso.completa ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <div className="flex items-center justify-between gap-2">
          <p className={`text-[12.5px] font-semibold ${
            progresso.completa ? 'text-emerald-800' : 'text-amber-900'}`}>
            {progresso.completa
              ? 'Vistoria completa'
              : `${progresso.obrigatoriasFeitas} de ${progresso.obrigatorias} fotos obrigatorias`}
          </p>
          <span className={`tnum text-[12px] font-bold ${
            progresso.completa ? 'text-emerald-700' : 'text-amber-700'}`}>
            {progresso.percentual}%
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-superficie/70">
          <div
            className={`h-full rounded-full transition-all ${
              progresso.completa ? 'bg-emerald-500' : 'bg-amber-500'}`}
            style={{ width: `${progresso.percentual}%` }}
          />
        </div>
        {!progresso.completa && proxima && (
          <p className="mt-1.5 text-[11px] text-amber-800">
            Proxima: <b>{proxima.nome}</b>
          </p>
        )}
      </div>

      {!somenteLeitura && (
        <p className="text-[11px] leading-snug text-slate-400">
          Pode fotografar direto do celular: a imagem e reduzida automaticamente
          (ate {LADO_MAXIMO}px, em JPEG) antes de subir, entao nao precisa se preocupar com o
          tamanho do arquivo.
        </p>
      )}

      <ul className="space-y-2">
        {lista.map((p) => (
          <ItemPose
            key={p.codigo}
            pose={p}
            url={p.url ? urls?.[p.url] : undefined}
            carregandoUrl={carregandoUrls}
            enviando={enviando === p.codigo}
            somenteLeitura={somenteLeitura}
            onEnviar={(f) => enviar(p.codigo, f)}
            onAmpliar={() => setAmpliada(p.codigo)}
            onRemover={() => {
              if (!p.anexo_id || !p.url) return;
              remover.mutate({ id: p.anexo_id, url: p.url } as VistoriaAnexosRow, {
                onSuccess: () => toast.success('Foto removida'),
                onError: (e) => toast.error(e.message),
              });
            }}
          />
        ))}
      </ul>

      {ampliada && (
        <VisorImagens
          imagens={enviadas.map((p) => ({
            id: p.codigo,
            titulo: p.nome,
            legenda: [
              p.enviada_em ? formatDateTime(p.enviada_em) : null,
              p.tamanho_bytes != null ? tamanhoLegivel(p.tamanho_bytes) : null,
              p.arquivo,
            ].filter(Boolean).join(' · '),
            url: p.url ? urls?.[p.url] : undefined,
            original: p.url,
          }))}
          id={ampliada}
          onTrocar={setAmpliada}
          onFechar={() => setAmpliada(null)}
          onAbrirOriginal={abrirOriginal}
        />
      )}
    </div>
  );
}

function ItemPose({ pose, url, carregandoUrl, enviando, somenteLeitura, onEnviar, onAmpliar, onRemover }: {
  pose: FotoVistoriaModelo;
  url?: string;
  carregandoUrl: boolean;
  enviando: boolean;
  somenteLeitura?: boolean;
  onEnviar: (f: File | null) => void;
  onAmpliar: () => void;
  onRemover: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [quebrou, setQuebrou] = useState(false);

  return (
    <li className={`rounded-xl border p-3 transition ${
      pose.enviada ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-superficie'}`}>
      <div className="flex items-start gap-3">
        {/* Miniatura: a conferencia comeca aqui */}
        {pose.enviada ? (
          <button
            type="button" onClick={onAmpliar}
            title={`Ampliar ${pose.nome}`}
            className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-emerald-200 bg-slate-100"
          >
            {url && !quebrou ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url} alt={pose.nome} loading="lazy"
                onError={() => setQuebrou(true)}
                className="h-full w-full object-cover transition group-hover:scale-105"
              />
            ) : (
              <span className="grid h-full w-full place-items-center text-slate-400">
                {carregandoUrl && !quebrou
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Camera className="h-4 w-4" />}
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 hidden items-center justify-center gap-0.5 bg-black/55 py-0.5 text-[9.5px] font-semibold text-white group-hover:flex">
              <ZoomIn className="h-2.5 w-2.5" /> ampliar
            </span>
          </button>
        ) : (
          <span className="mt-0.5 grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400">
            <Camera className="h-5 w-5" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-semibold text-slate-800">
            {pose.enviada && <Check className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2.5} />}
            {pose.nome}
            {pose.obrigatorio
              ? <span className="rounded-full bg-rose-50 px-1.5 py-px text-[10px] font-bold uppercase text-rose-600 ring-1 ring-inset ring-rose-200">obrigatoria</span>
              : <span className="rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-medium uppercase text-slate-500">opcional</span>}
          </p>

          {pose.enviada ? (
            <p className="tnum mt-0.5 text-[11px] text-slate-500">
              {pose.enviada_em ? `enviada em ${formatDateTime(pose.enviada_em)}` : 'enviada'}
              {pose.tamanho_bytes != null && ` · ${tamanhoLegivel(pose.tamanho_bytes)}`}
              {quebrou && <span className="font-semibold text-rose-600"> · nao consegui carregar a imagem</span>}
            </p>
          ) : pose.instrucao ? (
            <p className="mt-0.5 flex items-start gap-1 text-[11.5px] leading-relaxed text-slate-500">
              <Info className="mt-px h-3 w-3 shrink-0 text-slate-400" />
              {pose.instrucao}
            </p>
          ) : null}

          {!somenteLeitura && (
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                ref={input}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => { onEnviar(e.target.files?.[0] ?? null); e.target.value = ''; }}
              />
              <button
                type="button"
                onClick={() => input.current?.click()}
                disabled={enviando}
                className="inline-flex items-center gap-1.5 rounded-lg bg-acao px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-acao-escura disabled:opacity-60"
              >
                {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                {enviando ? 'Enviando...' : pose.enviada ? 'Refazer' : 'Tirar foto'}
              </button>
              {pose.enviada && (
                <button
                  type="button" onClick={onRemover}
                  aria-label={`Remover foto ${pose.nome}`}
                  className="inline-grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
