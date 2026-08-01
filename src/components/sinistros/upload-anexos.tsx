'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { UploadCloud, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useAnexos, useUploadAnexo, useSignedUrl } from '@/hooks/use-eventos';
import type { TipoDocumentoAnexo } from '@/lib/database.types';
import { formatDate } from '@/lib/utils';

const TIPOS: { value: TipoDocumentoAnexo; label: string }[] = [
  { value: 'FOTO_AVARIA', label: 'Foto de Avaria' },
  { value: 'BOLETIM_OCORRENCIA', label: 'Boletim de Ocorrencia' },
  { value: 'CNH', label: 'CNH' },
  { value: 'CRLV', label: 'CRLV' },
  { value: 'NOTA_FISCAL', label: 'Nota Fiscal' },
];

// Upload drag-and-drop de fotos/documentos para o Supabase Storage (bucket privado)
// com preview e listagem. Componente-chave do modulo de sinistros.
export function UploadAnexos({ eventoId }: { eventoId: string }) {
  const { data: anexos } = useAnexos(eventoId);
  const upload = useUploadAnexo(eventoId);
  const signedUrl = useSignedUrl();
  const [tipo, setTipo] = useState<TipoDocumentoAnexo>('FOTO_AVARIA');

  const onDrop = useCallback(
    (files: File[]) => {
      files.forEach((file) =>
        upload.mutate(
          { file, tipo },
          {
            onSuccess: () => toast.success(`${file.name} enviado`),
            onError: (e) => toast.error(`Erro no upload: ${(e as Error).message}`),
          },
        ),
      );
    },
    [tipo, upload],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
      'application/pdf': ['.pdf'],
      'application/xml': ['.xml'],
    },
    maxSize: 10 * 1024 * 1024,
  });

  async function abrir(path: string) {
    try {
      const url = await signedUrl.mutateAsync(path);
      window.open(url, '_blank');
    } catch (e) {
      toast.error(`Nao foi possivel abrir: ${(e as Error).message}`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-600">Tipo de documento:</label>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoDocumentoAnexo)}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          {TIPOS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div
        {...getRootProps()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition ${
          isDragActive ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50'
        }`}
      >
        <input {...getInputProps()} />
        {upload.isPending ? (
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
        ) : (
          <UploadCloud className="h-8 w-8 text-slate-400" />
        )}
        <p className="mt-2 text-sm text-slate-600">
          {isDragActive ? 'Solte os arquivos aqui...' : 'Arraste arquivos ou clique para enviar'}
        </p>
        <p className="text-xs text-slate-400">Imagens, PDF ou XML - ate 10 MB</p>
      </div>

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {(anexos ?? []).map((a) => {
          const isImg = a.tipo_documento === 'FOTO_AVARIA';
          return (
            <li key={a.id} className="flex items-center justify-between p-3 text-sm">
              <button onClick={() => abrir(a.arquivo_url)} className="flex items-center gap-2 text-left">
                {isImg ? (
                  <ImageIcon className="h-4 w-4 text-slate-400" />
                ) : (
                  <FileText className="h-4 w-4 text-slate-400" />
                )}
                <span className="text-slate-700 hover:text-brand-600">
                  {a.nome_original ?? a.arquivo_url}
                </span>
              </button>
              <span className="text-xs text-slate-400">
                {a.tipo_documento} - {formatDate(a.created_at)}
              </span>
            </li>
          );
        })}
        {(anexos ?? []).length === 0 && (
          <li className="p-4 text-center text-xs text-slate-400">Nenhum anexo enviado</li>
        )}
      </ul>
    </div>
  );
}
