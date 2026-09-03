'use client';

import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, X } from 'lucide-react';

export interface ImagemDoVisor {
  /** Chave estavel do item (codigo da pose, id do anexo...). */
  id: string;
  titulo: string;
  legenda?: string | null;
  /** URL assinada, ja resolvida por quem chama. */
  url?: string;
  /** Caminho no bucket, para abrir o arquivo original em outra aba. */
  original?: string | null;
}

/**
 * Visor em tela cheia para conferir foto.
 *
 * Nasceu na vistoria de vendas — a Auditoria precisava ver a foto grande sem
 * abrir uma aba por arquivo — e serve tambem a OS da 24h. Fica AQUI, e nao
 * dentro de uma tela, porque conferir imagem e o mesmo gesto nos dois lugares:
 * setas, `Esc` e o link do original.
 */
export function VisorImagens({ imagens, id, onTrocar, onFechar, onAbrirOriginal }: {
  imagens: ImagemDoVisor[];
  id: string;
  onTrocar: (id: string) => void;
  onFechar: () => void;
  onAbrirOriginal?: (path: string) => void;
}) {
  const i = Math.max(0, imagens.findIndex((im) => im.id === id));
  const atual = imagens[i];

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar();
      if (e.key === 'ArrowRight' && imagens[i + 1]) onTrocar(imagens[i + 1].id);
      if (e.key === 'ArrowLeft' && imagens[i - 1]) onTrocar(imagens[i - 1].id);
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [i, imagens, onTrocar, onFechar]);

  if (!atual) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/85 p-3 sm:p-6"
      onClick={onFechar}
      role="dialog"
      aria-modal="true"
      aria-label={`Foto ${atual.titulo}`}
    >
      <header className="flex items-start justify-between gap-3 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">{atual.titulo}</p>
          <p className="tnum text-[11.5px] text-white/70">
            {atual.legenda}
            {atual.legenda ? ' · ' : ''}{i + 1} de {imagens.length}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {atual.original && onAbrirOriginal && (
            <button
              type="button" onClick={() => onAbrirOriginal(atual.original as string)}
              className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-white hover:bg-white/20"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Abrir original
            </button>
          )}
          <button
            type="button" onClick={onFechar} aria-label="Fechar"
            className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 items-center gap-2 py-3" onClick={(e) => e.stopPropagation()}>
        <Seta lado="esq" ativo={!!imagens[i - 1]} onClick={() => imagens[i - 1] && onTrocar(imagens[i - 1].id)} />
        <div className="flex h-full min-w-0 flex-1 items-center justify-center">
          {atual.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={atual.url} alt={atual.titulo} className="max-h-full max-w-full rounded-lg object-contain" />
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-white/70" />
          )}
        </div>
        <Seta lado="dir" ativo={!!imagens[i + 1]} onClick={() => imagens[i + 1] && onTrocar(imagens[i + 1].id)} />
      </div>
    </div>
  );
}

function Seta({ lado, ativo, onClick }: { lado: 'esq' | 'dir'; ativo: boolean; onClick: () => void }) {
  const Icone = lado === 'esq' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button" onClick={onClick} disabled={!ativo}
      aria-label={lado === 'esq' ? 'Foto anterior' : 'Proxima foto'}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-20"
    >
      <Icone className="h-5 w-5" />
    </button>
  );
}
