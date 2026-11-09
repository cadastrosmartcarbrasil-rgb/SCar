'use client';

import { useCallback, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { toast } from 'sonner';
import { UploadCloud, FileText, Image as ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { useAnexos, useRemoverAnexoEvento, useUploadAnexo, useSignedUrl } from '@/hooks/use-eventos';
import { usePode } from '@/hooks/use-permissoes';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { motivoAnexoNaoExcluivel, motivoExclusaoValido } from '@/lib/anexos-evento';
import type { AnexosEventoRow, TipoDocumentoAnexo } from '@/lib/database.types';
import { LADO_MAXIMO, tamanhoLegivel } from '@/lib/imagem';
import { formatDate } from '@/lib/utils';

// Tipos que nascem pelo sistema (OS 0181, termo de entrega 0182): nao se escolhem no upload.
const ROTULO_EXTRA: Record<string, string> = {
  ORDEM_SERVICO: 'Ordem de Serviço',
  TERMO_ENTREGA: 'Termo de entrega',
  TERMO_ENTREGA_ASSINADO: 'Termo de entrega assinado',
};

const TIPOS: { value: TipoDocumentoAnexo; label: string }[] = [
  { value: 'FOTO_AVARIA', label: 'Foto de Avaria' },
  { value: 'BOLETIM_OCORRENCIA', label: 'Boletim de Ocorrência' },
  { value: 'CNH', label: 'CNH' },
  { value: 'CRLV', label: 'CRLV' },
  { value: 'NOTA_FISCAL', label: 'Nota Fiscal' },
  { value: 'FOTO_VEICULO', label: 'Foto do Veículo' },
  { value: 'FOTO_LOCAL', label: 'Foto do Local' },
  { value: 'CROQUI', label: 'Croqui' },
  { value: 'OUTRO', label: 'Outro documento' },
];

// Upload drag-and-drop de fotos/documentos para o Supabase Storage (bucket
// privado) com listagem. Componente-chave do modulo de sinistros.
//
// A FOTO E REDUZIDA no navegador antes de subir (1600px, JPEG — `useUploadAnexo`),
// entao o limite do dropzone aqui e so a barreira do absurdo: uma foto de 12 MB
// do celular precisa PASSAR por este filtro para poder ser comprimida. Era o
// contrario antes, e o perito recebia "arquivo grande demais" com a foto certa
// na mao.
export function UploadAnexos({ eventoId }: { eventoId: string }) {
  const { data: anexos } = useAnexos(eventoId);
  const upload = useUploadAnexo(eventoId);
  const signedUrl = useSignedUrl();
  const [tipo, setTipo] = useState<TipoDocumentoAnexo>('FOTO_AVARIA');
  // Excluir anexo incluido por engano: quem trata o evento (o banco confere).
  const podeExcluir = usePode('eventos.editar');
  const remover = useRemoverAnexoEvento(eventoId);
  const [excluindo, setExcluindo] = useState<AnexosEventoRow | null>(null);
  const [motivo, setMotivo] = useState('');

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

  const onRejeitado = useCallback((rejeitados: FileRejection[]) => {
    rejeitados.forEach((r) => {
      const grande = r.errors.some((e) => e.code === 'file-too-large');
      toast.error(grande
        ? `${r.file.name} tem ${tamanhoLegivel(r.file.size)} — grande demais até para reduzir.`
        : `${r.file.name}: formato não aceito (imagem, PDF ou XML).`);
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected: onRejeitado,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.heic'],
      'application/pdf': ['.pdf'],
      'application/xml': ['.xml'],
      'text/xml': ['.xml'],
    },
    // Teto do absurdo: o que passa daqui e reduzido antes de subir; PDF/XML
    // ainda respondem ao teto de 10 MB do banco/rota.
    maxSize: 40 * 1024 * 1024,
  });

  async function abrir(path: string) {
    try {
      const url = await signedUrl.mutateAsync(path);
      window.open(url, '_blank');
    } catch (e) {
      toast.error(`Não foi possível abrir: ${(e as Error).message}`);
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
        <p className="text-xs text-slate-400">
          Imagens, PDF ou XML · a foto é reduzida automaticamente (até {LADO_MAXIMO}px) antes de subir
        </p>
      </div>

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {(anexos ?? []).map((a) => {
          const isImg = ['FOTO_AVARIA', 'FOTO_VEICULO', 'FOTO_LOCAL'].includes(a.tipo_documento);
          return (
            <li key={a.id} className="flex items-center justify-between p-3 text-sm">
              <button
                onClick={() => (a.termo_emitido_id
                  // 0181: o PDF da Ordem de Servico mora no bucket `termos` e abre pela rota dos termos
                  ? window.open(`/api/v1/termos/pdf?emitido=${a.termo_emitido_id}`, '_blank')
                  : abrir(a.arquivo_url))}
                className="flex items-center gap-2 text-left"
              >
                {isImg ? (
                  <ImageIcon className="h-4 w-4 text-slate-400" />
                ) : (
                  <FileText className="h-4 w-4 text-slate-400" />
                )}
                <span className="text-slate-700 hover:text-brand-600">
                  {a.nome_original ?? a.arquivo_url}
                </span>
              </button>
              <span className="flex items-center gap-2">
                <span className="tnum text-xs text-slate-400">
                  {ROTULO_EXTRA[a.tipo_documento] ?? TIPOS.find((t) => t.value === a.tipo_documento)?.label ?? a.tipo_documento} · {formatDate(a.created_at)}
                  {a.tamanho_bytes != null && ` · ${tamanhoLegivel(a.tamanho_bytes)}`}
                </span>
                {podeExcluir && (() => {
                  const bloqueio = motivoAnexoNaoExcluivel(a);
                  return (
                    <button
                      type="button"
                      title={bloqueio ?? 'Excluir anexo'}
                      disabled={!!bloqueio}
                      onClick={() => { setMotivo(''); setExcluindo(a); }}
                      className="rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  );
                })()}
              </span>
            </li>
          );
        })}
        {(anexos ?? []).length === 0 && (
          <li className="p-4 text-center text-xs text-slate-400">Nenhum anexo enviado</li>
        )}
      </ul>

      <Modal open={!!excluindo} onClose={() => setExcluindo(null)} title="Excluir anexo" subtitulo={excluindo?.nome_original ?? undefined}>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            O arquivo sai do evento e do armazenamento, sem volta. A exclusão e o motivo ficam no histórico do evento.
          </p>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Motivo (ex.: foto de outro veículo, documento duplicado)"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setExcluindo(null)}>Voltar</Button>
            <Button
              type="button"
              variant="danger"
              disabled={!motivoExclusaoValido(motivo) || remover.isPending}
              onClick={() => excluindo && remover.mutate(
                { anexo: excluindo, motivo: motivo.trim() },
                {
                  onSuccess: () => { toast.success('Anexo excluído'); setExcluindo(null); },
                  onError: (e) => toast.error((e as Error).message),
                },
              )}
            >
              {remover.isPending ? 'Excluindo...' : 'Excluir anexo'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
