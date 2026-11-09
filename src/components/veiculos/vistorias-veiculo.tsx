'use client';

// ABA VISTORIAS da ficha do veiculo: a vistoria de adesao (que veio do lead na
// autorizacao) e as revistorias da 2a via, com as fotos e videos de cada uma.
// So leitura — enviar e analisar continuam na venda e em Cobranca → Revistorias.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Camera, ExternalLink, ImageOff, Loader2, PlayCircle, Smartphone, ZoomIn } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { VisorImagens } from '@/components/ui/visor-imagens';
import { useUrlAssinadaVendas, useUrlsAssinadasVendas } from '@/hooks/use-vendas';
import { useCatalogoPoses, useVistoriasDoVeiculo, type VistoriaDoVeiculo } from '@/hooks/use-vistorias-veiculo';
import {
  anexosVigentes, duracaoLegivel, ehVideo, nomeDaPose, rotuloVistoria, situacaoVistoria,
  type AnexoVistoria, type Tom,
} from '@/lib/vistorias-veiculo';
import { tamanhoLegivel } from '@/lib/imagem';
import { formatDate, formatDateTime } from '@/lib/utils';

const TOM: Record<Tom, string> = {
  verde: 'bg-emerald-50 text-emerald-700',
  ambar: 'bg-amber-50 text-amber-700',
  vermelho: 'bg-rose-50 text-rose-700',
  azul: 'bg-sky-50 text-sky-700',
  cinza: 'bg-slate-100 text-slate-600',
};

export function VistoriasDoVeiculo({ veiculoId }: { veiculoId: string }) {
  const { data, isLoading, error } = useVistoriasDoVeiculo(veiculoId);
  const { data: catalogo } = useCatalogoPoses();
  const paths = useMemo(() => (data ?? []).flatMap((v) => v.anexos.map((a) => a.url)), [data]);
  const { data: urls, isLoading: carregandoUrls } = useUrlsAssinadasVendas(paths);

  if (isLoading) return <p className="text-sm text-slate-500">Carregando vistorias...</p>;
  if (error) {
    return <p className="text-sm text-rose-600">Não foi possível carregar as vistorias: {(error as { message?: string }).message}</p>;
  }
  if (!data?.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-slate-500">
          <Camera className="h-8 w-8 text-slate-300" />
          <p>Nenhuma vistoria registrada para este veículo.</p>
          <p className="max-w-md text-xs text-slate-400">
            A vistoria de adesão aparece aqui depois que a Auditoria autoriza a entrada na base. Os veículos migrados do
            Mutual não trouxeram as fotos de lá.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {data.map((v) => (
        <CartaoVistoria
          key={v.id}
          v={v}
          nomes={catalogo?.nomes ?? {}}
          ordem={catalogo?.ordem ?? {}}
          urls={urls ?? {}}
          carregandoUrls={carregandoUrls}
        />
      ))}
    </div>
  );
}

function CartaoVistoria({ v, nomes, ordem, urls, carregandoUrls }: {
  v: VistoriaDoVeiculo;
  nomes: Record<string, string>;
  ordem: Record<string, number>;
  urls: Record<string, string>;
  carregandoUrls: boolean;
}) {
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const [video, setVideo] = useState<AnexoVistoria | null>(null);
  const urlAssinada = useUrlAssinadaVendas();
  const sit = situacaoVistoria(v.status, v.revistoria);
  const { vigentes, substituidos } = anexosVigentes(v.anexos, ordem);
  const fotos = vigentes.filter((a) => !ehVideo(a));
  const doCliente = vigentes.some((a) => a.enviado_pelo_cliente);
  const r = v.revistoria;

  async function abrirOriginal(path: string) {
    try {
      window.open(await urlAssinada.mutateAsync(path), '_blank');
    } catch {
      toast.error('Não consegui abrir o arquivo');
    }
  }

  const legenda = (a: AnexoVistoria) => [
    formatDateTime(a.created_at),
    a.tamanho_bytes != null ? tamanhoLegivel(a.tamanho_bytes) : null,
    duracaoLegivel(a.duracao_segundos),
    a.enviado_pelo_cliente ? 'enviada pelo associado' : null,
  ].filter(Boolean).join(' · ');

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900">{rotuloVistoria(v.tipo)}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {v.data_vistoria ? `Realizada em ${formatDate(v.data_vistoria)}` : `Aberta em ${formatDateTime(v.created_at)}`}
              {r?.vencimento_referencia && ` · boleto de ${formatDate(r.vencimento_referencia)}`}
              {r?.dias_atraso != null && ` (${r.dias_atraso} dias de atraso)`}
              {' · '}{vigentes.length} {vigentes.length === 1 ? 'arquivo' : 'arquivos'}
              {substituidos > 0 && ` (${substituidos} ${substituidos === 1 ? 'reenvio' : 'reenvios'})`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {doCliente && (
              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-[0.6875rem] font-medium text-cyan-700">
                <Smartphone className="h-3 w-3" /> pelo associado
              </span>
            )}
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TOM[sit.tom]}`}>{sit.texto}</span>
          </div>
        </div>

        {(r?.motivo_reprovacao || r?.observacao_analise || r?.dispensa_justificativa || v.observacoes) && (
          <div className="space-y-1 rounded-lg bg-superficie-alta px-3 py-2 text-xs text-slate-600">
            {r?.motivo_reprovacao && <p><b>Reprovada:</b> {r.motivo_reprovacao}</p>}
            {r?.observacao_analise && <p><b>Análise{r.analisado_em ? ` em ${formatDateTime(r.analisado_em)}` : ''}:</b> {r.observacao_analise}</p>}
            {r?.dispensa_justificativa && <p><b>Liberada sem revistoria:</b> {r.dispensa_justificativa}</p>}
            {v.observacoes && <p><b>Observações:</b> {v.observacoes}</p>}
          </div>
        )}

        {vigentes.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma foto enviada ainda.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {vigentes.map((a) => {
              const url = urls[a.url];
              const video_ = ehVideo(a);
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => (video_ ? setVideo(a) : setAmpliada(a.id))}
                    className="group block w-full overflow-hidden rounded-xl border border-slate-200 bg-superficie-alta text-left transition hover:border-cyan-400"
                  >
                    <div className="relative aspect-[4/3] w-full">
                      {video_ ? (
                        <div className="grid h-full w-full place-items-center bg-slate-800 text-white">
                          <PlayCircle className="h-10 w-10 opacity-90" />
                        </div>
                      ) : url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt={nomeDaPose(a.tipo, nomes)} className="h-full w-full object-cover" loading="lazy" />
                      ) : carregandoUrls ? (
                        <div className="grid h-full w-full place-items-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
                      ) : (
                        <div className="grid h-full w-full place-items-center text-rose-500"><ImageOff className="h-6 w-6" /></div>
                      )}
                      {!video_ && url && (
                        <span className="absolute right-1.5 top-1.5 rounded-md bg-black/50 p-1 text-white opacity-0 transition group-hover:opacity-100">
                          <ZoomIn className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                    <div className="px-2 py-1.5">
                      <p className="truncate text-xs font-semibold text-slate-800">{nomeDaPose(a.tipo, nomes)}</p>
                      <p className="truncate text-[0.6875rem] text-slate-500">{formatDateTime(a.created_at)}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {v.lead_id && (
          <Link href={`/vendas/${v.lead_id}`} className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:text-cyan-800">
            Abrir a venda que originou esta vistoria <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </CardContent>

      {ampliada && (
        <VisorImagens
          imagens={fotos.map((a) => ({
            id: a.id,
            titulo: nomeDaPose(a.tipo, nomes),
            legenda: legenda(a),
            url: urls[a.url],
            original: a.url,
          }))}
          id={ampliada}
          onTrocar={setAmpliada}
          onFechar={() => setAmpliada(null)}
          onAbrirOriginal={abrirOriginal}
        />
      )}

      <Modal open={!!video} onClose={() => setVideo(null)} title={video ? nomeDaPose(video.tipo, nomes) : ''} subtitulo={video ? legenda(video) : undefined} tamanho="lg">
        {video && (urls[video.url] ? (
          <video src={urls[video.url]} controls playsInline className="max-h-[70vh] w-full rounded-lg bg-black" />
        ) : (
          <p className="text-sm text-slate-500">Carregando o vídeo...</p>
        ))}
      </Modal>
    </Card>
  );
}
