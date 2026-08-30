'use client';

import { useCallback, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { toast } from 'sonner';
import { Download, FileText, Loader2, Paperclip, Trash2, UploadCloud } from 'lucide-react';
import {
  useAbrirAnexoLancamento, useAnexosLancamento, useRemoverAnexoLancamento, useUploadAnexoLancamento,
} from '@/hooks/use-financeiro';
import { formatDate } from '@/lib/utils';
import type { AnexosFinanceirosRow } from '@/lib/database.types';

const TAMANHO_MAXIMO = 10 * 1024 * 1024; // 10 MB por arquivo
const TIPOS_ACEITOS = {
  'application/pdf': ['.pdf'],
  'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
  'application/xml': ['.xml'],
  'text/xml': ['.xml'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
};

function tamanhoLegivel(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Anexos do titulo (nota fiscal, boleto, contrato, comprovante).
 * So aparece com um `lancamentoId` real: nada sobe para o storage antes do
 * lancamento existir, senao um cadastro abandonado deixaria arquivo orfao.
 */
export function AnexosLancamento({ lancamentoId }: { lancamentoId: string }) {
  const { data: anexos, isLoading } = useAnexosLancamento(lancamentoId);
  const upload = useUploadAnexoLancamento(lancamentoId);
  const remover = useRemoverAnexoLancamento(lancamentoId);
  const abrir = useAbrirAnexoLancamento();
  const [enviando, setEnviando] = useState(0);

  const onDrop = useCallback(
    async (aceitos: File[], rejeitados: readonly FileRejection[]) => {
      rejeitados.forEach((r) => {
        const grande = r.errors.some((e) => e.code === 'file-too-large');
        toast.error(
          grande
            ? `"${r.file.name}" passa de 10 MB.`
            : `"${r.file.name}" nao e um tipo aceito (PDF, imagem, XML ou planilha).`,
        );
      });
      for (const file of aceitos) {
        setEnviando((n) => n + 1);
        try {
          await upload.mutateAsync(file);
          toast.success(`"${file.name}" anexado`);
        } catch (err) {
          toast.error(`Falha ao anexar "${file.name}": ${(err as Error).message}`);
        } finally {
          setEnviando((n) => n - 1);
        }
      }
    },
    [upload],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: TIPOS_ACEITOS,
    maxSize: TAMANHO_MAXIMO,
  });

  async function baixar(anexo: AnexosFinanceirosRow) {
    try {
      const url = await abrir.mutateAsync(anexo.url_storage);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      toast.error(`Nao foi possivel abrir o arquivo: ${(err as Error).message}`);
    }
  }

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
          isDragActive ? 'border-cyan-500 bg-cyan-50/60' : 'border-slate-300 bg-slate-50/60 hover:border-cyan-400'
        }`}
      >
        <input {...getInputProps()} />
        {enviando > 0 ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-cyan-600" />
            <p className="text-xs font-medium text-slate-600">Enviando {enviando} arquivo(s)...</p>
          </>
        ) : (
          <>
            <UploadCloud className="h-5 w-5 text-slate-400" />
            <p className="text-xs font-medium text-slate-600">
              Arraste os arquivos aqui ou <span className="text-cyan-700 underline">selecione do computador</span>
            </p>
            <p className="text-[11px] text-slate-400">Nota fiscal, boleto, contrato ou comprovante · PDF, imagem, XML ou planilha · ate 10 MB</p>
          </>
        )}
      </div>

      {isLoading && <p className="text-xs text-slate-400">Carregando anexos...</p>}

      {(anexos ?? []).length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {(anexos ?? []).map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-700">{a.nome_arquivo}</p>
                <p className="text-[11px] text-slate-400">
                  {formatDate(a.created_at)}
                  {a.tamanho_bytes ? ` · ${tamanhoLegivel(a.tamanho_bytes)}` : ''}
                </p>
              </div>
              <button
                type="button"
                title="Abrir / baixar"
                aria-label={`Abrir ${a.nome_arquivo}`}
                onClick={() => baixar(a)}
                className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Remover anexo"
                aria-label={`Remover ${a.nome_arquivo}`}
                onClick={() => {
                  if (!confirm(`Remover o anexo "${a.nome_arquivo}"?`)) return;
                  remover.mutate(a, {
                    onSuccess: () => toast.success('Anexo removido'),
                    onError: (err) => toast.error(err.message),
                  });
                }}
                className="grid h-7 w-7 place-items-center rounded-lg text-rose-600 transition hover:bg-rose-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!isLoading && (anexos ?? []).length === 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Paperclip className="h-3 w-3" /> Nenhum arquivo anexado a este titulo.
        </p>
      )}
    </div>
  );
}
