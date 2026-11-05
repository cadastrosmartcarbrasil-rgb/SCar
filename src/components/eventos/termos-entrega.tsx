'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, Eye, FileCheck2, FilePlus2, Printer, RefreshCw, Upload, XCircle } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select, Textarea } from '@/components/ui/field';
import { AvisoCamposVazios } from '@/components/termos/previa-termo';
import { usePode } from '@/hooks/use-permissoes';
import { useEvento } from '@/hooks/use-eventos';
import { useTerceirosEvento } from '@/hooks/use-terceiros';
import { useOrdensServicoEvento } from '@/hooks/use-ordens-servico';
import {
  urlDaViaAssinada, useAnexarAssinado, useCancelarEntrega, useEmitirEntrega, useGerarPdfEntrega,
  useModeloEntrega, usePreviaEntrega, useTermosEntregaEvento, type TermoEntregaLista,
} from '@/hooks/use-termos-entrega';
import {
  SITUACAO_ENTREGA, problemasDaEntrega, resumoTermosEntrega, type DadosEntrega, type SituacaoEntrega,
} from '@/lib/termo-entrega';
import { formatDate, formatDateTime } from '@/lib/utils';

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const abrirPdf = (termoEmitidoId: string) => window.open(`/api/v1/termos/pdf?emitido=${termoEmitidoId}`, '_blank');

/**
 * Aba TERMOS do evento (0182): o termo de entrega do veiculo reparado.
 * Pode haver varios (entrega parcial ou total, associado ou terceiro).
 * Fluxo: emitir -> imprimir -> a oficina colhe a assinatura do recebedor ->
 * a equipe anexa a foto/PDF da via assinada.
 */
export function TermosEvento({ eventoId }: { eventoId: string }) {
  const trata = usePode('eventos.editar');
  const lista = useTermosEntregaEvento(eventoId);
  const modelo = useModeloEntrega();
  const [emitindo, setEmitindo] = useState(false);
  const termos = lista.data ?? [];
  const r = resumoTermosEntrega(termos);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-superficie p-4">
        <div>
          <h3 className="font-display text-sm font-semibold text-slate-900">Termo de entrega do veículo</h3>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">
            Emita um termo por entrega (total ou parcial, ao associado ou a um terceiro). A oficina imprime, colhe a
            assinatura de quem recebe e devolve a foto ou o PDF da via assinada, que você anexa aqui.
          </p>
          {r.total > 0 && (
            <p className="mt-2 text-xs text-slate-600">
              {r.total} termo{r.total > 1 ? 's' : ''} · {r.assinados} assinado{r.assinados === 1 ? '' : 's'}
              {r.aguardando > 0 && <span className="font-medium text-amber-700"> · {r.aguardando} aguardando a via assinada</span>}
            </p>
          )}
        </div>
        {trata && modelo.data?.publicado && (
          <Button onClick={() => setEmitindo(true)}><FilePlus2 className="h-4 w-4" /> Emitir termo de entrega</Button>
        )}
      </div>

      {trata && modelo.isSuccess && !modelo.data?.publicado && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Não há modelo de termo de entrega publicado. Em{' '}
            <Link href="/configuracoes/termos" className="underline">Configurações → Termos</Link>, crie um termo do tipo
            &quot;Termo de entrega de veículo (evento)&quot;, use <b>Importar Word</b> com o modelo e publique.
          </span>
        </p>
      )}

      {lista.isLoading && <div className="h-24 animate-pulse rounded-lg bg-slate-100" />}
      {lista.isError && <p className="text-sm text-rose-700">Não foi possível ler os termos: {(lista.error as Error).message}</p>}
      {lista.isSuccess && termos.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Nenhum termo de entrega emitido neste evento.
        </p>
      )}

      <ul className="space-y-3">
        {termos.map((t) => <CartaoTermo key={t.id} termo={t} trata={trata} />)}
      </ul>

      {emitindo && <EmitirEntregaModal eventoId={eventoId} onClose={() => setEmitindo(false)} />}
    </div>
  );
}

function SeloSituacao({ situacao }: { situacao: string }) {
  const m = SITUACAO_ENTREGA[situacao as SituacaoEntrega] ?? { rotulo: situacao, cor: 'bg-slate-100 text-slate-600' };
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${m.cor}`}>{m.rotulo}</span>;
}

function CartaoTermo({ termo: t, trata }: { termo: TermoEntregaLista; trata: boolean }) {
  const anexar = useAnexarAssinado();
  const gerarPdf = useGerarPdfEntrega();
  const cancelar = useCancelarEntrega();
  const input = useRef<HTMLInputElement>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const cancelado = t.situacao === 'CANCELADO';
  const oficina = t.fornecedores?.nome_fantasia || t.fornecedores?.razao_social;

  const enviar = (f: File | undefined) => {
    if (!f) return;
    anexar.mutate({ termo: t, arquivo: f }, {
      onSuccess: () => toast.success('Via assinada anexada ao termo.'),
      onError: (e) => toast.error((e as Error).message),
    });
    if (input.current) input.current.value = '';
  };
  const verAssinada = async () => {
    if (!t.anexos_evento?.arquivo_url) return;
    try { window.open(await urlDaViaAssinada(t.anexos_evento.arquivo_url), '_blank'); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <li className={`rounded-lg border p-4 ${cancelado ? 'border-slate-200 bg-slate-50 opacity-75' : 'border-slate-200 bg-superficie'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-brand-700">{t.termos_emitidos?.protocolo ?? '—'}</span>
          <SeloSituacao situacao={t.situacao} />
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
            Entrega {t.abrangencia === 'PARCIAL' ? 'parcial' : 'total'}
          </span>
        </div>
        <span className="text-xs text-slate-500">emitido em {formatDateTime(t.emitido_em)}</span>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div><dt className="inline text-slate-500">Recebedor: </dt>
          <dd className="inline text-slate-800">
            {t.recebedor_tipo === 'TERCEIRO' ? `Terceiro — ${t.evento_terceiros?.nome ?? ''}` : 'Associado'}
          </dd></div>
        <div><dt className="inline text-slate-500">Data da entrega: </dt><dd className="inline text-slate-800">{formatDate(t.data_entrega)}</dd></div>
        {oficina && <div><dt className="inline text-slate-500">Oficina: </dt><dd className="inline text-slate-800">{oficina}</dd></div>}
        {t.ordens_servico?.numero && <div><dt className="inline text-slate-500">OS: </dt><dd className="inline text-slate-800">{t.ordens_servico.numero}</dd></div>}
        {t.descricao && <div className="sm:col-span-2"><dt className="inline text-slate-500">O que foi entregue: </dt><dd className="inline text-slate-800">{t.descricao}</dd></div>}
        {t.situacao === 'ASSINADO' && t.assinado_em && (
          <div className="sm:col-span-2 text-xs text-emerald-700">Via assinada anexada em {formatDateTime(t.assinado_em)}</div>
        )}
        {cancelado && <div className="sm:col-span-2 text-xs text-rose-700">Cancelado: {t.cancelamento_motivo}</div>}
      </dl>

      {!cancelado && (
        <div className="mt-3 flex flex-wrap gap-2">
          {t.termos_emitidos?.pdf_path ? (
            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => abrirPdf(t.termo_emitido_id)}>
              <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
            </Button>
          ) : trata && (
            <Button variant="secondary" className="px-2 py-1 text-xs" disabled={gerarPdf.isPending}
              onClick={() => gerarPdf.mutate(t, {
                onSuccess: () => toast.success('PDF gerado.'), onError: (e) => toast.error((e as Error).message),
              })}>
              <RefreshCw className="h-3.5 w-3.5" /> Gerar PDF
            </Button>
          )}
          {t.situacao === 'ASSINADO' && (
            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={verAssinada}>
              <Eye className="h-3.5 w-3.5" /> Ver via assinada
            </Button>
          )}
          {trata && (
            <>
              <input ref={input} type="file" accept="image/*,application/pdf" className="hidden"
                onChange={(e) => enviar(e.target.files?.[0])} />
              <Button className="px-2 py-1 text-xs" disabled={anexar.isPending} onClick={() => input.current?.click()}
                variant={t.situacao === 'ASSINADO' ? 'secondary' : undefined}>
                {t.situacao === 'ASSINADO'
                  ? <><Upload className="h-3.5 w-3.5" /> Trocar via assinada</>
                  : <><FileCheck2 className="h-3.5 w-3.5" /> {anexar.isPending ? 'Enviando…' : 'Anexar via assinada'}</>}
              </Button>
              <Button variant="ghost" className="px-2 py-1 text-xs text-rose-700" onClick={() => setMotivo('')}>
                <XCircle className="h-3.5 w-3.5" /> Cancelar
              </Button>
            </>
          )}
        </div>
      )}

      {motivo !== null && (
        <Modal open onClose={() => setMotivo(null)} title="Cancelar termo de entrega" subtitulo={t.termos_emitidos?.protocolo ?? ''}>
          <div className="space-y-3">
            <FormField label="Motivo">
              <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
            </FormField>
            <p className="text-xs text-slate-500">O termo não é apagado: fica no evento como cancelado. Para corrigir, emita outro.</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setMotivo(null)}>Voltar</Button>
              <Button disabled={!motivo.trim() || cancelar.isPending}
                onClick={() => cancelar.mutate({ termo: t, motivo }, {
                  onSuccess: () => { toast.success('Termo cancelado.'); setMotivo(null); },
                  onError: (e) => toast.error((e as Error).message),
                })}>Cancelar termo</Button>
            </div>
          </div>
        </Modal>
      )}
    </li>
  );
}

function EmitirEntregaModal({ eventoId, onClose }: { eventoId: string; onClose: () => void }) {
  const { data: evento } = useEvento(eventoId);
  const { data: terceiros } = useTerceirosEvento(eventoId);
  const ordens = useOrdensServicoEvento(eventoId);
  const previa = usePreviaEntrega();
  const emitir = useEmitirEntrega();
  const osValidas = (ordens.data ?? []).filter((o) => !['CANCELADA', 'SUBSTITUIDA'].includes(o.status));

  const [recebedor, setRecebedor] = useState<'ASSOCIADO' | 'TERCEIRO'>('ASSOCIADO');
  const [terceiroId, setTerceiroId] = useState('');
  const [abrangencia, setAbrangencia] = useState<'TOTAL' | 'PARCIAL'>('TOTAL');
  const [descricao, setDescricao] = useState('');
  const [data, setData] = useState(hojeSP());
  const [osId, setOsId] = useState<string | null>(null);
  const [emitido, setEmitido] = useState<{ termoEmitidoId: string; aviso: string | null } | null>(null);

  // OS escolhida: a mais recente valida, ate o usuario escolher outra (ou nenhuma)
  const osEscolhida = osId ?? osValidas[0]?.id ?? '';

  const dados: DadosEntrega = {
    evento_id: eventoId,
    recebedor_tipo: recebedor,
    evento_terceiro_id: recebedor === 'TERCEIRO' ? terceiroId || null : null,
    ordem_servico_id: osEscolhida || null,
    abrangencia,
    descricao: descricao.trim() || null,
    data_entrega: data,
  };
  const problemas = problemasDaEntrega(dados, evento?.data_ocorrencia ?? null);

  const verPrevia = () => previa.mutate(dados, { onError: (e) => toast.error((e as Error).message) });
  const confirmar = () => emitir.mutate(dados, {
    onSuccess: (r) => {
      toast.success('Termo de entrega emitido.');
      if (r.aviso) toast.warning(r.aviso);
      setEmitido({ termoEmitidoId: r.termo.termo_emitido_id, aviso: r.aviso });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (emitido) {
    return (
      <Modal open onClose={onClose} title="Termo de entrega emitido">
        <div className="space-y-3 text-sm">
          <p>Imprima o termo e entregue à oficina: o recebedor assina na hora de retirar o veículo.</p>
          <p className="text-xs text-slate-500">Quando a oficina devolver a foto ou o PDF assinado, use <b>Anexar via assinada</b> no termo.</p>
          {emitido.aviso && <p className="text-xs text-amber-700">{emitido.aviso}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Fechar</Button>
            {!emitido.aviso && (
              <Button onClick={() => abrirPdf(emitido.termoEmitidoId)}><Printer className="h-4 w-4" /> Imprimir / PDF</Button>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Emitir termo de entrega" subtitulo={evento?.numero_protocolo ?? ''} tamanho="lg">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Quem recebe o veículo">
            <Select value={recebedor} onChange={(e) => { setRecebedor(e.target.value as 'ASSOCIADO' | 'TERCEIRO'); previa.reset(); }}>
              <option value="ASSOCIADO">Associado</option>
              <option value="TERCEIRO" disabled={(terceiros ?? []).length === 0}>Terceiro do evento</option>
            </Select>
          </FormField>
          {recebedor === 'TERCEIRO' && (
            <FormField label="Terceiro">
              <Select value={terceiroId} onChange={(e) => { setTerceiroId(e.target.value); previa.reset(); }}>
                <option value="">Escolha…</option>
                {(terceiros ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.codigo} · {t.nome}{t.veiculo_placa ? ` · ${t.veiculo_placa}` : ''}</option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField label="Entrega">
            <Select value={abrangencia} onChange={(e) => { setAbrangencia(e.target.value as 'TOTAL' | 'PARCIAL'); previa.reset(); }}>
              <option value="TOTAL">Total (o reparo terminou)</option>
              <option value="PARCIAL">Parcial (fica algo pendente)</option>
            </Select>
          </FormField>
          <FormField label="Data da entrega">
            <Input type="date" value={data} onChange={(e) => { setData(e.target.value); previa.reset(); }} />
          </FormField>
          <FormField label="Ordem de Serviço (oficina)" className="sm:col-span-2">
            <Select value={osEscolhida} onChange={(e) => { setOsId(e.target.value); previa.reset(); }}>
              <option value="">Sem OS</option>
              {osValidas.map((o) => (
                <option key={o.id} value={o.id}>{o.numero} · {o.fornecedores?.nome_fantasia || o.fornecedores?.razao_social}</option>
              ))}
            </Select>
          </FormField>
          <FormField label={abrangencia === 'PARCIAL' ? 'O que foi entregue e o que fica pendente' : 'Observação (opcional)'}
            className="sm:col-span-2">
            <Textarea rows={2} value={descricao} onChange={(e) => { setDescricao(e.target.value); previa.reset(); }} />
          </FormField>
        </div>

        {problemas.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-800">{problemas.map((p) => <li key={p}>{p}</li>)}</ul>
        )}

        {previa.isPending && <div className="h-40 animate-pulse rounded-lg bg-slate-100" />}
        {previa.data && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Modelo: {previa.data.modelo}</p>
            <AvisoCamposVazios vazios={previa.data.vazios} />
            <div className="termo-previa max-h-[55vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 text-slate-900"
              dangerouslySetInnerHTML={{ __html: previa.data.html }} />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Voltar</Button>
          <Button variant="secondary" onClick={verPrevia} disabled={previa.isPending || problemas.length > 0}>
            <Eye className="h-4 w-4" /> Prévia
          </Button>
          <Button onClick={confirmar} disabled={!previa.data || emitir.isPending || problemas.length > 0}>
            <FilePlus2 className="h-4 w-4" /> {emitir.isPending ? 'Emitindo…' : 'Emitir'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
