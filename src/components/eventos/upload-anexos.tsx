'use client';

import { useCallback, useMemo, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { toast } from 'sonner';
import { UploadCloud, FileText, Loader2, Play, Trash2 } from 'lucide-react';
import { useAnexos, useRemoverAnexoEvento, useUploadAnexo, useSignedUrl, useUrlsAssinadasEvento } from '@/hooks/use-eventos';
import { VisorImagens, type ImagemDoVisor } from '@/components/ui/visor-imagens';
import { tipoDeMidia, VIDEO_ANEXO_SEGUNDOS } from '@/lib/video';
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
  VIDEO: 'Vídeo',
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
  const [progresso, setProgresso] = useState<{ nome: string; fracao: number } | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  // Galeria: foto e video aparecem como miniatura e abrem no visor, sem uma aba por arquivo.
  const midias = useMemo(
    () => (anexos ?? []).filter((a) => !a.termo_emitido_id && tipoDeMidia(a.arquivo_url)),
    [anexos],
  );
  const documentos = useMemo(
    () => (anexos ?? []).filter((a) => a.termo_emitido_id || !tipoDeMidia(a.arquivo_url)),
    [anexos],
  );
  const { data: urls, isError: urlsFalharam } = useUrlsAssinadasEvento(midias.map((a) => a.arquivo_url));
  const rotulo = (a: AnexosEventoRow) =>
    ROTULO_EXTRA[a.tipo_documento] ?? TIPOS.find((t) => t.value === a.tipo_documento)?.label ?? a.tipo_documento;
  const itensVisor: ImagemDoVisor[] = midias.map((a) => ({
    id: a.id,
    titulo: a.nome_original ?? rotulo(a),
    legenda: [rotulo(a), formatDate(a.created_at), a.tamanho_bytes != null ? tamanhoLegivel(a.tamanho_bytes) : null]
      .filter(Boolean).join(' · '),
    url: urls?.[a.arquivo_url],
    original: a.arquivo_url,
    video: tipoDeMidia(a.arquivo_url) === 'VIDEO',
  }));

  const onDrop = useCallback(
    (files: File[]) => {
      files.forEach((file) =>
        upload.mutate(
          { file, tipo, onProgresso: (fracao) => setProgresso({ nome: file.name, fracao }) },
          {
            onSuccess: () => toast.success(`${file.name} enviado`),
            onError: (e) => toast.error(`Erro no upload: ${(e as Error).message}`),
            onSettled: () => setProgresso(null),
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
        : `${r.file.name}: formato não aceito (imagem, vídeo, PDF ou XML).`);
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected: onRejeitado,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.heic'],
      'video/*': ['.mp4', '.mov', '.m4v', '.webm', '.3gp'],
      'application/pdf': ['.pdf'],
      'application/xml': ['.xml'],
      'text/xml': ['.xml'],
    },
    // Teto do absurdo: o que passa daqui e reduzido antes de subir (foto e
    // video); PDF/XML respondem ao teto de 10 MB do banco. O video bruto do
    // celular passa de 100 MB facil, por isso o teto e o do video (500 MB).
    maxSize: 500 * 1024 * 1024,
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
        {progresso ? (
          <span className="text-center text-sm text-slate-600">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-500" />
            Reduzindo o vídeo {progresso.nome}… {Math.round(progresso.fracao * 100)}%
            <span className="block text-xs text-slate-400">Leva o tempo do próprio vídeo. Não feche a página.</span>
          </span>
        ) : upload.isPending ? (
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
        ) : (
          <UploadCloud className="h-8 w-8 text-slate-400" />
        )}
        <p className="mt-2 text-sm text-slate-600">
          {isDragActive ? 'Solte os arquivos aqui...' : 'Arraste arquivos ou clique para enviar'}
        </p>
        <p className="text-xs text-slate-400">
          Imagens, vídeos (até {VIDEO_ANEXO_SEGUNDOS} s), PDF ou XML · foto e vídeo são reduzidos automaticamente
          (foto até {LADO_MAXIMO}px, vídeo até 1280px) antes de subir
        </p>
      </div>

      {midias.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Fotos e vídeos ({midias.length})
          </p>
          {urlsFalharam && (
            <p className="mb-2 text-xs text-rose-600">Não foi possível carregar as miniaturas. Recarregue a página.</p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {midias.map((a) => {
              const url = urls?.[a.arquivo_url];
              const video = tipoDeMidia(a.arquivo_url) === 'VIDEO';
              return (
                <div key={a.id} className="group overflow-hidden rounded-lg border border-slate-200 bg-superficie">
                  <button
                    type="button"
                    onClick={() => setAberto(a.id)}
                    className="relative block aspect-[4/3] w-full bg-slate-100"
                    title="Ampliar"
                  >
                    {!url ? (
                      <Loader2 className="absolute inset-0 m-auto h-5 w-5 animate-spin text-slate-400" />
                    ) : video ? (
                      <>
                        <video src={`${url}#t=0.5`} preload="metadata" muted playsInline
                          className="h-full w-full object-cover" />
                        <span className="absolute inset-0 grid place-items-center">
                          <span className="grid h-10 w-10 place-items-center rounded-full bg-black/60 text-white">
                            <Play className="h-5 w-5" />
                          </span>
                        </span>
                      </>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt={a.nome_original ?? rotulo(a)} loading="lazy"
                        className="h-full w-full object-cover transition group-hover:scale-105" />
                    )}
                  </button>
                  <div className="flex items-start justify-between gap-1 p-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-slate-700" title={a.nome_original ?? ''}>{rotulo(a)}</p>
                      <p className="tnum text-[0.6875rem] text-slate-400">
                        {formatDate(a.created_at)}{a.tamanho_bytes != null && ` · ${tamanhoLegivel(a.tamanho_bytes)}`}
                      </p>
                    </div>
                    {podeExcluir && <BotaoExcluir anexo={a} onClick={() => { setMotivo(''); setExcluindo(a); }} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {documentos.map((a) => (
          <li key={a.id} className="flex items-center justify-between p-3 text-sm">
            <button
              onClick={() => (a.termo_emitido_id
                // 0181: o PDF da Ordem de Servico mora no bucket `termos` e abre pela rota dos termos
                ? window.open(`/api/v1/termos/pdf?emitido=${a.termo_emitido_id}`, '_blank')
                : abrir(a.arquivo_url))}
              className="flex items-center gap-2 text-left"
            >
              <FileText className="h-4 w-4 text-slate-400" />
              <span className="text-slate-700 hover:text-brand-600">
                {a.nome_original ?? a.arquivo_url}
              </span>
            </button>
            <span className="flex items-center gap-2">
              <span className="tnum text-xs text-slate-400">
                {rotulo(a)} · {formatDate(a.created_at)}
                {a.tamanho_bytes != null && ` · ${tamanhoLegivel(a.tamanho_bytes)}`}
              </span>
              {podeExcluir && <BotaoExcluir anexo={a} onClick={() => { setMotivo(''); setExcluindo(a); }} />}
            </span>
          </li>
        ))}
        {(anexos ?? []).length === 0 && (
          <li className="p-4 text-center text-xs text-slate-400">Nenhum anexo enviado</li>
        )}
        {(anexos ?? []).length > 0 && documentos.length === 0 && (
          <li className="p-3 text-center text-xs text-slate-400">Nenhum documento (PDF/XML) — só fotos e vídeos acima</li>
        )}
      </ul>

      {aberto && (
        <VisorImagens
          imagens={itensVisor}
          id={aberto}
          onTrocar={setAberto}
          onFechar={() => setAberto(null)}
          onAbrirOriginal={abrir}
        />
      )}

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

function BotaoExcluir({ anexo, onClick }: { anexo: AnexosEventoRow; onClick: () => void }) {
  const bloqueio = motivoAnexoNaoExcluivel(anexo);
  return (
    <button
      type="button"
      title={bloqueio ?? 'Excluir anexo'}
      disabled={!!bloqueio}
      onClick={onClick}
      className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
