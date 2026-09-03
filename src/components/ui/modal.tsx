'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

// Modal simples (dialog) para formularios de cadastro/edicao.
// `tamanho`: formularios normais ficam em 'md'; telas com mapa/tabela pedem
// 'lg' ou 'xl' para nao espremer o conteudo.
const LARGURA = { md: 'max-w-lg', lg: 'max-w-3xl', xl: 'max-w-5xl' } as const;

export function Modal({
  open,
  onClose,
  title,
  subtitulo,
  children,
  tamanho = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitulo?: string;
  children: React.ReactNode;
  tamanho?: keyof typeof LARGURA;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16"
      onClick={onClose}
    >
      <div
        className={`w-full ${LARGURA[tamanho]} rounded-xl bg-superficie shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitulo && <p className="mt-0.5 text-xs text-slate-500">{subtitulo}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
