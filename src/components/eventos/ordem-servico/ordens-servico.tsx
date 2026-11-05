'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, ClipboardList, FilePen, PackageCheck, Play, XCircle } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select, Textarea } from '@/components/ui/field';
import { SeletorFornecedor } from '@/components/fornecedores/seletor-fornecedor';
import { usePode } from '@/hooks/use-permissoes';
import {
  useCancelarOS, useOrdensServico, useOrdensServicoEvento, useStatusOS, type OrdemServicoLista,
} from '@/hooks/use-ordens-servico';
import { ROTULO_TIPO_ITEM, STATUS_OS, situacaoDoPrazo, type StatusOS } from '@/lib/ordem-servico';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { EmitirOrdemServicoModal } from './emitir-os';
import { EnvioOS } from './envio-os';

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const nomeForn = (o: OrdemServicoLista) => o.fornecedores?.nome_fantasia || o.fornecedores?.razao_social || '—';

export function SeloStatusOS({ status }: { status: string }) {
  const m = STATUS_OS[status as StatusOS] ?? { rotulo: status, cor: 'bg-slate-100 text-slate-600' };
  return <span className={`rounded px-2 py-0.5 text-xs ${m.cor}`}>{m.rotulo}</span>;
}

export function SeloPrazoOS({ os }: { os: OrdemServicoLista }) {
  const s = situacaoDoPrazo(os, hojeSP());
  const cor = s.tipo === 'atrasada' ? 'bg-rose-600 text-white'
    : s.tipo === 'vence_hoje' || s.tipo === 'vence_logo' ? 'bg-amber-100 text-amber-900'
    : s.tipo === 'entregue' ? (s.atraso > 0 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700')
    : s.tipo === 'encerrada' ? 'hidden' : 'bg-slate-100 text-slate-600';
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${cor}`}>{s.texto}</span>;
}

/** Acoes de uma OS (quem trata o evento): em execucao, entregue, retificar, cancelar. */
function AcoesOS({ os }: { os: OrdemServicoLista }) {
  const trata = usePode('eventos.editar');
  const status = useStatusOS();
  const cancelar = useCancelarOS();
  const [entrega, setEntrega] = useState<string | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [retificar, setRetificar] = useState(false);
  if (!trata || ['CANCELADA', 'SUBSTITUIDA'].includes(os.status)) return null;
  const aberta = os.status !== 'ENTREGUE';
  return (
    <div className="flex flex-wrap gap-2">
      {aberta && os.status !== 'EM_EXECUCAO' && (
        <Button variant="secondary" className="px-2 py-1 text-xs"
          onClick={() => status.mutate({ os, status: 'EM_EXECUCAO' }, {
            onSuccess: () => toast.success('OS em execução.'), onError: (e) => toast.error((e as Error).message),
          })}>
          <Play className="h-3.5 w-3.5" /> Em execução
        </Button>
      )}
      {aberta && (
        <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setEntrega(hojeSP())}>
          <PackageCheck className="h-3.5 w-3.5" /> Marcar como entregue
        </Button>
      )}
      <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setRetificar(true)}>
        <FilePen className="h-3.5 w-3.5" /> Retificar
      </Button>
      <Button variant="ghost" className="px-2 py-1 text-xs text-rose-700" onClick={() => setMotivo('')}>
        <XCircle className="h-3.5 w-3.5" /> Cancelar
      </Button>

      {entrega !== null && (
        <Modal open onClose={() => setEntrega(null)} title={`Entrega da ${os.numero}`} subtitulo={nomeForn(os)}>
          <div className="space-y-3">
            <FormField label="Data em que o veículo/peça foi entregue">
              <Input type="date" value={entrega} max={hojeSP()} onChange={(e) => setEntrega(e.target.value)} />
            </FormField>
            <p className="text-xs text-slate-500">Data limite combinada: {formatDate(os.data_limite_entrega)}. Fica registrado no histórico do evento.</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEntrega(null)}>Voltar</Button>
              <Button disabled={!entrega || status.isPending}
                onClick={() => status.mutate({ os, status: 'ENTREGUE', data: entrega }, {
                  onSuccess: () => { toast.success('Entrega registrada.'); setEntrega(null); },
                  onError: (e) => toast.error((e as Error).message),
                })}>Registrar entrega</Button>
            </div>
          </div>
        </Modal>
      )}
      {motivo !== null && (
        <Modal open onClose={() => setMotivo(null)} title={`Cancelar a ${os.numero}`} subtitulo="A OS não se apaga: fica cancelada, com o motivo">
          <div className="space-y-3">
            <FormField label="Motivo">
              <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setMotivo(null)}>Voltar</Button>
              <Button variant="danger" disabled={motivo.trim().length < 5 || cancelar.isPending}
                onClick={() => cancelar.mutate({ os, motivo: motivo.trim() }, {
                  onSuccess: () => { toast.success('OS cancelada.'); setMotivo(null); },
                  onError: (e) => toast.error((e as Error).message),
                })}>Cancelar OS</Button>
            </div>
          </div>
        </Modal>
      )}
      {retificar && (
        <EmitirOrdemServicoModal
          origem={{ eventoId: os.evento_id, cotacaoId: os.cotacao_id, terceiroId: os.evento_terceiro_id, itens: [], anterior: os }}
          onClose={() => setRetificar(false)}
        />
      )}
    </div>
  );
}

function CartaoOS({ os }: { os: OrdemServicoLista }) {
  const [aberto, setAberto] = useState(false);
  const itens = [...(os.ordens_servico_itens ?? [])].sort((a, b) => a.ordem - b.ordem);
  return (
    <div className="rounded-lg border border-slate-200">
      <button type="button" onClick={() => setAberto((x) => !x)} className="flex w-full flex-wrap items-center gap-2 p-3 text-left">
        {aberto ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        <span className="codigo font-semibold text-slate-800">{os.numero}</span>
        {os.documento === 'RETIFICACAO' && <span className="rounded bg-violet-50 px-2 py-0.5 text-xs text-violet-700">Retificação</span>}
        <SeloStatusOS status={os.status} />
        <SeloPrazoOS os={os} />
        <span className="text-sm text-slate-600">{nomeForn(os)}</span>
        <span className="tnum ml-auto text-sm font-semibold text-brand-700">{formatCurrency(os.total_autorizado)}</span>
      </button>
      {aberto && (
        <div className="space-y-3 border-t border-slate-100 p-3">
          <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-4">
            <span>Emitida em {formatDateTime(os.emitida_em)}</span>
            <span>Limite: <b>{formatDate(os.data_limite_entrega)}</b></span>
            <span>Líquido a faturar: <b>{formatCurrency(os.valor_liquido)}</b></span>
            <span>{os.data_entrega_real ? `Entregue em ${formatDate(os.data_entrega_real)}` : os.local_entrega ?? ''}</span>
          </div>
          {os.cancelamento_motivo && <p className="text-xs text-rose-700">Cancelada: {os.cancelamento_motivo}</p>}
          <table className="w-full text-xs">
            <tbody>
              {itens.map((i) => (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="py-1 text-slate-500">{ROTULO_TIPO_ITEM[i.tipo]}</td>
                  <td className="py-1">{i.descricao}{i.codigo ? ` (${i.codigo})` : ''}</td>
                  <td className="py-1 text-right">{Number(i.quantidade)}x</td>
                  <td className="tnum py-1 text-right">{formatCurrency(i.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <AcoesOS os={os} />
          <div className="rounded-lg bg-superficie-alta p-3">
            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Enviar ao prestador</p>
            <EnvioOS osId={os.id} eventoId={os.evento_id} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Aba "Ordens de Serviço" do evento. */
export function OrdensServicoEvento({ eventoId }: { eventoId: string }) {
  const { data, isLoading, error } = useOrdensServicoEvento(eventoId);
  if (error) return <p className="text-sm text-rose-700">Não foi possível ler as ordens de serviço: {(error as Error).message}</p>;
  if (isLoading) return <div className="h-24 animate-pulse rounded-lg bg-slate-100" />;
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        A Ordem de Serviço nasce na aba <b>Reparo</b>: aprove a cotação e escolha &quot;Gerar Ordem de Serviço&quot;.
        O prazo daqui é o do prestador — o prazo de 90 dias do evento é outro.
      </p>
      {(data ?? []).map((os) => <CartaoOS key={os.id} os={os} />)}
      {(data ?? []).length === 0 && (
        <p className="flex items-center gap-2 text-sm text-slate-400"><ClipboardList className="h-4 w-4" /> Nenhuma ordem de serviço emitida.</p>
      )}
    </div>
  );
}

/** Lista geral (Eventos → Ordens de Serviço): filtros por status, prestador, período e atrasadas. */
export function ListaOrdensServico() {
  const [status, setStatus] = useState<StatusOS | 'ABERTAS' | ''>('ABERTAS');
  const [fornecedorId, setFornecedorId] = useState<string>('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [atrasadas, setAtrasadas] = useState(false);
  const hoje = hojeSP();
  const q = useOrdensServico({ status, fornecedorId: fornecedorId || null, de: de || null, ate: ate || null, atrasadas, hoje });
  const lista = q.data ?? [];
  const nAtrasadas = lista.filter((o) => situacaoDoPrazo(o, hoje).tipo === 'atrasada').length;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-superficie p-4 sm:grid-cols-2 lg:grid-cols-5">
        <FormField label="Situação">
          <Select value={status} onChange={(e) => setStatus(e.target.value as StatusOS | 'ABERTAS' | '')}>
            <option value="ABERTAS">Em aberto (emitidas, enviadas, em execução)</option>
            <option value="">Todas</option>
            {(Object.keys(STATUS_OS) as StatusOS[]).map((s) => <option key={s} value={s}>{STATUS_OS[s].rotulo}</option>)}
          </Select>
        </FormField>
        <FormField label="Prestador" className="lg:col-span-2">
          <SeletorFornecedor value={fornecedorId} onChange={(id) => setFornecedorId(id)} permiteCadastrar={false}
            placeholder="Todos os prestadores" />
        </FormField>
        <FormField label="Emitidas de"><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></FormField>
        <FormField label="até"><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></FormField>
        <label className="flex items-center gap-2 text-sm text-slate-700 lg:col-span-5">
          <input type="checkbox" checked={atrasadas} onChange={(e) => setAtrasadas(e.target.checked)} />
          Só as atrasadas (data limite passou e não foi entregue)
        </label>
      </div>

      <p className="text-sm text-slate-600">
        {lista.length} ordem(ns){nAtrasadas ? <> · <b className="text-rose-700">{nAtrasadas} atrasada(s)</b></> : null}
        {lista.length === 500 && ' · mostrando as 500 primeiras: refine os filtros'}
      </p>

      {q.error && <p className="text-sm text-rose-700">Não foi possível ler: {(q.error as Error).message}</p>}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-superficie">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-superficie-alta text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">OS</th><th>Evento</th><th>Associado / placa</th><th>Prestador</th>
              <th>Situação</th><th>Prazo</th><th className="text-right">Autorizado</th><th className="px-3 text-right">Líquido</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((o) => (
              <tr key={o.id} className="border-t border-slate-100">
                <td className="codigo px-3 py-2 font-medium">{o.numero}</td>
                <td>
                  <Link href={`/eventos/${o.evento_id}?aba=ordens`} className="text-brand-700 hover:underline">
                    {o.eventos_sinistro?.numero_protocolo ?? 'evento'}
                  </Link>
                </td>
                <td>
                  <span className="block">{o.clientes?.nome_razao_social}</span>
                  <span className="placa text-xs text-slate-500">{o.veiculos?.placa}</span>
                </td>
                <td>{nomeForn(o)}</td>
                <td><SeloStatusOS status={o.status} /></td>
                <td>
                  <span className="block text-xs text-slate-500">{formatDate(o.data_limite_entrega)}</span>
                  <SeloPrazoOS os={o} />
                </td>
                <td className="tnum text-right">{formatCurrency(o.total_autorizado)}</td>
                <td className="tnum px-3 text-right">{formatCurrency(o.valor_liquido)}</td>
              </tr>
            ))}
            {!q.isLoading && lista.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-slate-400">Nenhuma ordem de serviço com estes filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
