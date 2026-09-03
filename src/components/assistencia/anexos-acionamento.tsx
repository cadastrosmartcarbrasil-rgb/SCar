'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, FileText, Image as ImgIcon, Loader2, Paperclip, Trash2, Upload, ZoomIn } from 'lucide-react';
import {
  useAnexosAcionamento, useRemoverAnexoAcionamento, useUploadAnexoAcionamento,
  useUrlAssinadaAssistencia, useUrlsAssinadasAssistencia,
} from '@/hooks/use-assistencia';
import { VisorImagens } from '@/components/ui/visor-imagens';
import { LADO_MAXIMO, ehImagem, tamanhoLegivel } from '@/lib/imagem';
import { formatDateTime } from '@/lib/utils';
import type { AcionamentoAnexosRow, TipoAnexoAcionamento } from '@/lib/database.types';

const TIPOS: { valor: TipoAnexoAcionamento; rotulo: string }[] = [
  { valor: 'FOTO_VEICULO', rotulo: 'Foto do veiculo' },
  { valor: 'FOTO_LOCAL',   rotulo: 'Foto do local' },
  { valor: 'DOCUMENTO',    rotulo: 'Documento' },
  { valor: 'COMPROVANTE',  rotulo: 'Comprovante' },
  { valor: 'OUTRO',        rotulo: 'Outro' },
];

const ROTULO_TIPO: Record<TipoAnexoAcionamento, string> = Object.fromEntries(
  TIPOS.map((t) => [t.valor, t.rotulo]),
) as Record<TipoAnexoAcionamento, string>;

/** Imagem pelo nome do arquivo: o que vale para escolher miniatura ou icone. */
function anexoEhImagem(a: AcionamentoAnexosRow): boolean {
  return ehImagem({ type: '', size: 0, name: a.descricao ?? a.url })
    || /\.(jpe?g|png|webp|gif|heic)$/i.test(a.descricao ?? a.url);
}

/**
 * Anexos da OS da 24h: a PROVA do atendimento.
 *
 * O modulo nasceu completo no dinheiro e vazio na prova — a foto do veiculo
 * chegava pelo WhatsApp do atendente e morria ali. Quando o associado contesta
 * uma avaria ou o prestador cobra servico a mais, e aqui que se olha.
 *
 * A imagem e reduzida no navegador antes de subir (mesma regra da vistoria de
 * vendas) e o teto de 10 MB vive no banco.
 */
export function AnexosAcionamento({ acionamentoId }: { acionamentoId: string }) {
  const { data: anexos, isLoading } = useAnexosAcionamento(acionamentoId);
  const enviar = useUploadAnexoAcionamento(acionamentoId);
  const remover = useRemoverAnexoAcionamento(acionamentoId);
  const urlAssinada = useUrlAssinadaAssistencia();
  const input = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState<TipoAnexoAcionamento>('FOTO_VEICULO');
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const [quebradas, setQuebradas] = useState<Record<string, boolean>>({});

  const lista = anexos ?? [];
  const imagens = lista.filter(anexoEhImagem);
  const documentos = lista.filter((a) => !anexoEhImagem(a));
  const { data: urls, isLoading: carregandoUrls } = useUrlsAssinadasAssistencia(imagens.map((a) => a.url));

  function subir(files: FileList | null) {
    if (!files?.length) return;
    Array.from(files).forEach((file) => {
      enviar.mutate({ file, tipo }, {
        onSuccess: () => toast.success(`${file.name} anexado`),
        onError: (e) => toast.error(`${file.name}: ${e.message}`),
      });
    });
  }

  async function abrir(path: string) {
    try {
      window.open(await urlAssinada.mutateAsync(path), '_blank', 'noopener');
    } catch {
      toast.error('Nao consegui abrir o arquivo');
    }
  }

  function apagar(a: AcionamentoAnexosRow) {
    remover.mutate(a, {
      onSuccess: () => toast.success('Anexo removido'),
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-superficie">
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
        <Paperclip className="h-4 w-4 text-brand-700" />
        <h3 className="text-sm font-semibold text-slate-900">Fotos e documentos</h3>
        {lista.length > 0 && (
          <span className="tnum rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
            {lista.length}
          </span>
        )}
      </div>

      <div className="space-y-3 p-5">
        {/* O tipo vem ANTES do arquivo: e o que diz para que serve a foto */}
        <div className="flex flex-wrap gap-1.5">
          {TIPOS.map((t) => (
            <button
              key={t.valor} type="button" onClick={() => setTipo(t.valor)}
              className={`rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition ${
                tipo === t.valor ? 'bg-acao text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t.rotulo}
            </button>
          ))}
        </div>

        <input
          ref={input} type="file" multiple className="hidden"
          accept="image/*,application/pdf"
          onChange={(e) => { subir(e.target.files); e.target.value = ''; }}
        />
        <button
          type="button" onClick={() => input.current?.click()} disabled={enviar.isPending}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-cyan-400 hover:bg-cyan-50/40 disabled:opacity-60"
        >
          {enviar.isPending
            ? <Loader2 className="h-6 w-6 animate-spin text-cyan-600" />
            : <Upload className="h-6 w-6 text-slate-400" />}
          <span className="text-[13px] font-medium text-slate-600">
            Anexar {ROTULO_TIPO[tipo].toLowerCase()}
          </span>
          <span className="text-[11px] text-slate-400">
            Imagem ou PDF · a foto e reduzida automaticamente (ate {LADO_MAXIMO}px) antes de subir
          </span>
        </button>

        {isLoading && <p className="text-xs text-slate-400">Carregando anexos...</p>}

        {/* Fotos: miniatura, porque anexo que nao se ve nao serve de prova */}
        {imagens.length > 0 && (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {imagens.map((a) => {
              const url = urls?.[a.url];
              const quebrou = quebradas[a.id];
              return (
                <li key={a.id} className="overflow-hidden rounded-xl border border-slate-200">
                  <button
                    type="button" onClick={() => setAmpliada(a.id)}
                    className="group relative block h-28 w-full bg-slate-100"
                    title={`Ampliar ${a.descricao ?? ''}`}
                  >
                    {url && !quebrou ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url} alt={a.descricao ?? 'Anexo'} loading="lazy"
                        onError={() => setQuebradas((q) => ({ ...q, [a.id]: true }))}
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-slate-400">
                        {carregandoUrls && !quebrou
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <ImgIcon className="h-5 w-5" />}
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 hidden items-center justify-center gap-0.5 bg-black/55 py-0.5 text-[9.5px] font-semibold text-white group-hover:flex">
                      <ZoomIn className="h-2.5 w-2.5" /> ampliar
                    </span>
                  </button>
                  <div className="flex items-start justify-between gap-1 px-2 py-1.5">
                    <div className="min-w-0">
                      <p className="truncate text-[11.5px] font-medium text-slate-700">
                        {ROTULO_TIPO[a.tipo] ?? a.tipo}
                      </p>
                      <p className="tnum truncate text-[10.5px] text-slate-400">
                        {formatDateTime(a.created_at)}
                        {a.tamanho_bytes != null && ` · ${tamanhoLegivel(a.tamanho_bytes)}`}
                        {quebrou && <span className="font-semibold text-rose-600"> · nao carregou</span>}
                      </p>
                    </div>
                    <button
                      type="button" onClick={() => apagar(a)}
                      aria-label={`Remover ${a.descricao ?? 'anexo'}`}
                      className="shrink-0 rounded p-1 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Documentos: PDF nao tem miniatura, tem linha */}
        {documentos.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {documentos.map((a) => (
              <li key={a.id} className="flex items-center gap-2 px-3 py-2">
                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] text-slate-700">{a.descricao ?? a.url}</p>
                  <p className="tnum text-[10.5px] text-slate-400">
                    {ROTULO_TIPO[a.tipo] ?? a.tipo} · {formatDateTime(a.created_at)}
                    {a.tamanho_bytes != null && ` · ${tamanhoLegivel(a.tamanho_bytes)}`}
                  </p>
                </div>
                <button
                  type="button" onClick={() => abrir(a.url)}
                  className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-200"
                >
                  <ExternalLink className="mr-1 inline h-3 w-3" /> Abrir
                </button>
                <button
                  type="button" onClick={() => apagar(a)}
                  aria-label={`Remover ${a.descricao ?? 'anexo'}`}
                  className="shrink-0 rounded p-1 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {!isLoading && lista.length === 0 && (
          <p className="text-center text-[11.5px] text-slate-400">
            Nenhum anexo ainda. A foto do veiculo antes do atendimento e a melhor defesa contra
            contestacao de avaria.
          </p>
        )}
      </div>

      {ampliada && (
        <VisorImagens
          imagens={imagens.map((a) => ({
            id: a.id,
            titulo: ROTULO_TIPO[a.tipo] ?? a.tipo,
            legenda: [
              a.descricao,
              formatDateTime(a.created_at),
              a.tamanho_bytes != null ? tamanhoLegivel(a.tamanho_bytes) : null,
            ].filter(Boolean).join(' · '),
            url: urls?.[a.url],
            original: a.url,
          }))}
          id={ampliada}
          onTrocar={setAmpliada}
          onFechar={() => setAmpliada(null)}
          onAbrirOriginal={abrir}
        />
      )}
    </div>
  );
}
