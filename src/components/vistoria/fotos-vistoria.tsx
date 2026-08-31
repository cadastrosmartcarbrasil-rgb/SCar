'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, Check, Info, Loader2, Trash2 } from 'lucide-react';
import { useAddFotoVistoria, useFotosVistoriaLead, useRemoverFotoVistoria, useUrlAssinadaVendas } from '@/hooks/use-vendas';
import { progressoVistoria, proximaPose } from '@/lib/vistoria';
import type { VistoriaAnexosRow } from '@/lib/database.types';

/**
 * Vistoria guiada por MODELO DE FOTOS.
 *
 * O vendedor nao decide o que fotografar: a tela lista as poses do catalogo
 * (`vistoria_fotos_modelo`), com a instrucao de enquadramento de cada uma, e
 * so fica verde quando as obrigatorias estao completas. No celular o botao
 * abre a camera traseira direto (`capture="environment"`).
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

  const lista = poses ?? [];
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

  async function abrir(url: string) {
    try {
      window.open(await urlAssinada.mutateAsync(url), '_blank');
    } catch {
      toast.error('Nao consegui abrir a foto');
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}
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
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/70">
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

      <ul className="space-y-2">
        {lista.map((p) => (
          <ItemPose
            key={p.codigo}
            pose={p}
            enviando={enviando === p.codigo}
            somenteLeitura={somenteLeitura}
            onEnviar={(f) => enviar(p.codigo, f)}
            onAbrir={() => p.url && abrir(p.url)}
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
    </div>
  );
}

function ItemPose({ pose, enviando, somenteLeitura, onEnviar, onAbrir, onRemover }: {
  pose: { codigo: string; nome: string; instrucao: string | null; obrigatorio: boolean; enviada: boolean };
  enviando: boolean;
  somenteLeitura?: boolean;
  onEnviar: (f: File | null) => void;
  onAbrir: () => void;
  onRemover: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <li className={`rounded-xl border p-3 transition ${
      pose.enviada ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
          pose.enviada ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
          {pose.enviada ? <Check className="h-4.5 w-4.5" strokeWidth={2.5} /> : <Camera className="h-4.5 w-4.5" />}
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-semibold text-slate-800">
            {pose.nome}
            {pose.obrigatorio
              ? <span className="rounded-full bg-rose-50 px-1.5 py-px text-[10px] font-bold uppercase text-rose-600 ring-1 ring-inset ring-rose-200">obrigatoria</span>
              : <span className="rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-medium uppercase text-slate-500">opcional</span>}
          </p>
          {pose.instrucao && (
            <p className="mt-0.5 flex items-start gap-1 text-[11.5px] leading-relaxed text-slate-500">
              <Info className="mt-px h-3 w-3 shrink-0 text-slate-400" />
              {pose.instrucao}
            </p>
          )}

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
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
              >
                {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                {pose.enviada ? 'Refazer' : 'Tirar foto'}
              </button>
              {pose.enviada && (
                <>
                  <button
                    type="button" onClick={onAbrir}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Ver
                  </button>
                  <button
                    type="button" onClick={onRemover}
                    aria-label={`Remover foto ${pose.nome}`}
                    className="inline-grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
