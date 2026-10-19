'use client';

import { useEffect, useMemo, useState } from 'react';
import { Ban, FileDown, FilePlus2, Globe, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Select, Textarea, FormField } from '@/components/ui/field';
import { AvisoCamposVazios } from '@/components/termos/previa-termo';
import {
  useCancelarTermo, useEmitirTermo, useGerarPdfTermo, usePortalTermo, usePreviaTermo,
  useTermosEmitidos, useTermosModelos, useVeiculosParaTermo, urlPdfTermo,
} from '@/hooks/use-termos';
import { usePode } from '@/hooks/use-permissoes';
import { rotuloTipoTermo, termoServeParaVeiculo } from '@/lib/termos';
import { formatDateTime } from '@/lib/utils';

const SELO: Record<string, string> = {
  EMITIDO: 'bg-slate-100 text-slate-700',
  ENVIADO: 'bg-cyan-50 text-cyan-700',
  ACEITO: 'bg-emerald-50 text-emerald-700',
  CANCELADO: 'bg-rose-50 text-rose-700',
};

function EmitirTermoModal({ aberto, onFechar, clienteId, veiculoId }: {
  aberto: boolean; onFechar: () => void; clienteId: string; veiculoId?: string | null;
}) {
  const modelos = useTermosModelos();
  const veiculos = useVeiculosParaTermo(clienteId);
  const previa = usePreviaTermo();
  const emitir = useEmitirTermo();
  const [veic, setVeic] = useState<string>(veiculoId ?? '');
  const [modeloId, setModeloId] = useState('');
  const [portal, setPortal] = useState<boolean | null>(null);
  const [feito, setFeito] = useState<{ id: string; protocolo: string | null; aviso: string | null } | null>(null);

  useEffect(() => { if (aberto) { setFeito(null); setVeic(veiculoId ?? ''); } }, [aberto, veiculoId]);
  useEffect(() => {
    if (!veic && (veiculos.data ?? []).length === 1) setVeic(veiculos.data![0].id);
  }, [veiculos.data, veic]);

  const v = (veiculos.data ?? []).find((x) => x.id === veic) ?? null;
  // So termos publicados, ativos e por associado; os que servem ao veiculo primeiro.
  const opcoes = useMemo(() => (modelos.data ?? [])
    .filter((m) => m.ativo && m.versao_atual_id && m.escopo === 'ASSOCIADO')
    .map((m) => ({ m, serve: termoServeParaVeiculo(m, v) }))
    .sort((a, b) => Number(b.serve) - Number(a.serve) || a.m.nome.localeCompare(b.m.nome)), [modelos.data, v]);
  const escolhido = opcoes.find((o) => o.m.id === modeloId) ?? null;

  useEffect(() => {
    if (!modeloId && opcoes.length) setModeloId(opcoes.find((o) => o.serve)?.m.id ?? '');
  }, [opcoes, modeloId]);
  useEffect(() => {
    if (!aberto || !escolhido?.m.versao_atual_id) return;
    previa.mutate({ versao_id: escolhido.m.versao_atual_id, cliente_id: clienteId, veiculo_id: veic || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, escolhido?.m.versao_atual_id, veic]);

  async function confirmar() {
    if (!escolhido?.m.versao_atual_id) return;
    try {
      const r = await emitir.mutateAsync({
        versaoId: escolhido.m.versao_atual_id, clienteId, veiculoId: veic || null,
        visivelPortal: portal ?? escolhido.m.visivel_portal,
      });
      setFeito({ id: r.emitido.id, protocolo: r.emitido.protocolo, aviso: r.aviso });
      if (r.aviso) toast.warning(r.aviso);
      else toast.success(`Termo emitido: ${r.emitido.protocolo}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Modal open={aberto} onClose={onFechar} title="Emitir termo" tamanho="xl">
      {feito ? (
        <div className="space-y-3 text-sm">
          <p className="text-slate-700">Termo emitido com o protocolo <strong className="codigo">{feito.protocolo}</strong>.</p>
          {feito.aviso && <p className="text-amber-700">{feito.aviso}</p>}
          <div className="flex gap-2">
            {!feito.aviso && (
              <a href={urlPdfTermo({ emitido: feito.id })} target="_blank" rel="noreferrer">
                <Button><FileDown className="mr-1 h-4 w-4" /> Abrir PDF</Button>
              </a>
            )}
            <Button variant="secondary" onClick={onFechar}>Fechar</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Veículo">
              <Select value={veic} onChange={(e) => setVeic(e.target.value)}>
                <option value="">— sem veículo (só dados do associado) —</option>
                {(veiculos.data ?? []).map((x) => (
                  <option key={x.id} value={x.id}>{x.placa} · {x.marca} {x.modelo} ({x.status})</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Termo">
              <Select value={modeloId} onChange={(e) => setModeloId(e.target.value)}>
                <option value="">— escolha —</option>
                {opcoes.map(({ m, serve }) => (
                  <option key={m.id} value={m.id}>
                    {m.nome} · {rotuloTipoTermo(m.tipo)}{serve ? '' : ' (não é deste plano/tipo)'}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          {opcoes.length === 0 && !modelos.isLoading && (
            <p className="text-sm text-slate-500">Nenhum termo publicado. Os modelos são criados em Configurações → Termos.</p>
          )}
          {escolhido && !escolhido.serve && (
            <p className="text-sm text-amber-700">Este termo foi configurado para outro plano, tipo, uso ou unidade.</p>
          )}
          {escolhido && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={portal ?? escolhido.m.visivel_portal}
                onChange={(e) => setPortal(e.target.checked)} />
              Disponibilizar no portal do associado
            </label>
          )}
          {previa.isPending && <div className="h-40 animate-pulse rounded-lg bg-slate-100" />}
          {previa.isError && <p className="text-sm text-rose-700">{(previa.error as Error).message}</p>}
          {previa.data && escolhido && (
            <>
              <AvisoCamposVazios vazios={previa.data.vazios} />
              <div className="termo-previa max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 text-slate-900"
                dangerouslySetInnerHTML={{ __html: previa.data.html }} />
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onFechar}>Cancelar</Button>
            <Button onClick={confirmar} disabled={!escolhido || emitir.isPending || previa.isPending}>
              {emitir.isPending ? 'Emitindo e gerando o PDF…' : 'Emitir termo'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Os termos do associado (ou de um veiculo): lista, PDF, portal, cancelar e
 * emitir. Fica na ficha do associado, na do veiculo e no SAC.
 */
export function TermosDoCadastro({ clienteId, veiculoId }: { clienteId: string; veiculoId?: string | null }) {
  const lista = useTermosEmitidos({ clienteId, veiculoId });
  const podeEmitir = usePode('termos.criar');
  const podeCancelar = usePode('termos.cancelar');
  const podeBaixar = usePode('termos.exportar');
  const cancelar = useCancelarTermo();
  const portal = usePortalTermo();
  const gerarPdf = useGerarPdfTermo();
  const [emitindo, setEmitindo] = useState(false);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');

  async function confirmarCancelamento() {
    try {
      await cancelar.mutateAsync({ id: cancelando!, motivo });
      toast.success('Termo cancelado.');
      setCancelando(null);
      setMotivo('');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Termos e documentos emitidos{veiculoId ? ' para este veículo' : ''}.</p>
        {podeEmitir && (
          <Button onClick={() => setEmitindo(true)}><FilePlus2 className="mr-1 h-4 w-4" /> Emitir termo</Button>
        )}
      </div>
      {lista.isError && <p className="text-sm text-rose-700">Não foi possível ler os termos: {(lista.error as Error).message}</p>}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Protocolo</th><th className="px-3 py-2">Termo</th>
              {!veiculoId && <th className="px-3 py-2">Veículo</th>}
              <th className="px-3 py-2">Emitido</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {(lista.data ?? []).map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="codigo px-3 py-2">{t.protocolo}</td>
                <td className="px-3 py-2">
                  {t.titulo}
                  {t.campos_vazios.length > 0 && (
                    <p className="text-xs text-amber-700">{t.campos_vazios.length} campo(s) saíram em branco</p>
                  )}
                </td>
                {!veiculoId && <td className="placa px-3 py-2">{t.veiculos?.placa ?? '—'}</td>}
                <td className="px-3 py-2 text-slate-600">
                  {formatDateTime(t.emitido_em)}
                  <p className="text-xs text-slate-500">{t.usuarios?.nome ?? ''}</p>
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded px-1.5 text-xs ${SELO[t.situacao] ?? ''}`}>{t.situacao}</span>
                  {t.visivel_portal && t.situacao !== 'CANCELADO' && (
                    <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-cyan-700"><Globe className="h-3 w-3" /> portal</span>
                  )}
                  {t.cancelamento_motivo && <p className="text-xs text-slate-500">{t.cancelamento_motivo}</p>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {t.pdf_path && podeBaixar && (
                    <a href={urlPdfTermo({ emitido: t.id })} target="_blank" rel="noreferrer"
                      className="mr-2 inline-flex items-center gap-1 text-brand-700 hover:underline">
                      <FileDown className="h-4 w-4" /> PDF
                    </a>
                  )}
                  {!t.pdf_path && t.situacao !== 'CANCELADO' && podeEmitir && (
                    <button type="button" className="mr-2 inline-flex items-center gap-1 text-amber-700 hover:underline"
                      disabled={gerarPdf.isPending}
                      onClick={() => gerarPdf.mutate(t.id, { onError: (e) => toast.error((e as Error).message) })}>
                      <RefreshCw className="h-4 w-4" /> Gerar PDF
                    </button>
                  )}
                  {t.situacao !== 'CANCELADO' && podeEmitir && (
                    <button type="button" className="mr-2 text-xs text-slate-600 hover:underline"
                      onClick={() => portal.mutate({ id: t.id, visivel: !t.visivel_portal },
                        { onError: (e) => toast.error((e as Error).message) })}>
                      {t.visivel_portal ? 'Tirar do portal' : 'Pôr no portal'}
                    </button>
                  )}
                  {t.situacao !== 'CANCELADO' && podeCancelar && (
                    <button type="button" title="Cancelar" className="text-rose-600" onClick={() => setCancelando(t.id)}>
                      <Ban className="inline h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {lista.data && lista.data.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Nenhum termo emitido.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <EmitirTermoModal aberto={emitindo} onFechar={() => setEmitindo(false)} clienteId={clienteId} veiculoId={veiculoId} />

      <Modal open={!!cancelando} onClose={() => setCancelando(null)} title="Cancelar termo">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">O termo fica no histórico como cancelado e sai do portal. Para corrigir, emita outro.</p>
          <FormField label="Motivo">
            <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCancelando(null)}>Voltar</Button>
            <Button variant="danger" onClick={confirmarCancelamento} disabled={!motivo.trim() || cancelar.isPending}>Cancelar termo</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
