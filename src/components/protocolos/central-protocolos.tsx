'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Search, Filter, ArrowLeftRight, CheckCircle2, MessageSquarePlus, Clock, User, Car,
  AlertTriangle, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select, Textarea } from '@/components/ui/field';
import {
  useProtocolos, useInteracoesProtocolo, useRegistrarInteracao, useTransferirProtocolo,
  useEncerrarProtocolo, useAlterarStatusProtocolo, useAtendentes,
  type FiltroProtocolos,
} from '@/hooks/use-protocolos';
import {
  STATUS_PROTOCOLO, PRIORIDADES, TIPO_INTERACAO_LABEL,
  rotuloCategoria, corPrioridade, protocoloAberto, precisaAtencao,
} from '@/lib/protocolos';
import { formatDateTime } from '@/lib/utils';
import type { ProtocoloLinha, PrioridadeAtendimento } from '@/lib/database.types';

// Central de Protocolos: fila de todos os atendimentos, com histórico de
// interacoes, transferencia entre atendentes e encerramento.
export function CentralProtocolos({ filtroInicial }: { filtroInicial?: FiltroProtocolos }) {
  const [filtro, setFiltro] = useState<FiltroProtocolos>({ status: 'ABERTOS', ...filtroInicial });
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<ProtocoloLinha | null>(null);

  const { data: protocolos, isLoading } = useProtocolos(filtro);
  const { data: atendentes } = useAtendentes();

  if (aberto) {
    return <DetalheProtocolo protocolo={aberto} onVoltar={() => setAberto(null)} />;
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <form
        onSubmit={(e) => { e.preventDefault(); setFiltro((f) => ({ ...f, busca: busca.trim() || null })); }}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-superficie p-4"
      >
        <FormField label="Buscar" className="min-w-[220px] flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Protocolo, associado, placa ou assunto"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </FormField>
        <FormField label="Situacao">
          <Select
            value={filtro.status ?? ''}
            onChange={(e) => setFiltro((f) => ({ ...f, status: e.target.value || null }))}
          >
            <option value="ABERTOS">Em aberto</option>
            <option value="">Todos</option>
            <option value="ABERTO">Aberto</option>
            <option value="EM_ANDAMENTO">Em atendimento</option>
            <option value="CONCLUIDO">Concluido</option>
            <option value="CANCELADO">Cancelado</option>
          </Select>
        </FormField>
        <FormField label="Prioridade">
          <Select
            value={filtro.prioridade ?? ''}
            onChange={(e) => setFiltro((f) => ({ ...f, prioridade: (e.target.value || null) as PrioridadeAtendimento | null }))}
          >
            <option value="">Todas</option>
            {PRIORIDADES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        </FormField>
        <FormField label="Responsavel">
          <Select
            value={filtro.responsavel ?? ''}
            onChange={(e) => setFiltro((f) => ({ ...f, responsavel: e.target.value || null }))}
          >
            <option value="">Todos</option>
            {(atendentes ?? []).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </Select>
        </FormField>
        <Button type="submit" variant="secondary"><Filter className="h-4 w-4" /> Filtrar</Button>
      </form>

      {/* Fila */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Protocolo</th>
              <th className="px-4 py-2">Associado / Item</th>
              <th className="px-4 py-2">Categoria</th>
              <th className="px-4 py-2">Assunto</th>
              <th className="px-4 py-2">Responsavel</th>
              <th className="px-4 py-2">Prioridade</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Aberto ha</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">Carregando...</td></tr>}
            {!isLoading && (protocolos ?? []).length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Nenhum protocolo com esses filtros.</td></tr>
            )}
            {(protocolos ?? []).map((p) => (
              <tr
                key={p.id}
                onClick={() => setAberto(p)}
                className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50"
              >
                <td className="px-4 py-2 font-mono text-xs text-slate-500">
                  {p.protocolo}
                  {precisaAtencao(p) && (
                    <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-amber-500" />
                  )}
                </td>
                <td className="px-4 py-2">
                  <p className="font-medium text-slate-700">{p.associado}</p>
                  {p.placa && (
                    <p className="flex items-center gap-1 text-xs text-slate-400">
                      <Car className="h-3 w-3" /> {p.placa}
                    </p>
                  )}
                </td>
                <td className="px-4 py-2 text-slate-600">{rotuloCategoria(p.tipo)}</td>
                <td className="px-4 py-2 text-slate-600">
                  {p.assunto ?? '-'}
                  {p.interacoes > 0 && <span className="ml-1 text-xs text-slate-400">({p.interacoes})</span>}
                </td>
                <td className="px-4 py-2 text-slate-600">{p.responsavel ?? <span className="text-rose-500">sem responsavel</span>}</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${corPrioridade(p.prioridade)}`}>{p.prioridade}</span>
                </td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS_PROTOCOLO[p.status].cor}`}>
                    {STATUS_PROTOCOLO[p.status].label}
                  </span>
                </td>
                <td className="tnum px-4 py-2 text-right text-slate-500">
                  {p.encerrado_em ? '—' : `${p.dias_aberto}d`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detalhe: historico, comentario, transferencia e encerramento
// ---------------------------------------------------------------------------
function DetalheProtocolo({ protocolo, onVoltar }: { protocolo: ProtocoloLinha; onVoltar: () => void }) {
  const { data: interacoes } = useInteracoesProtocolo(protocolo.id);
  const { data: atendentes } = useAtendentes();
  const comentar = useRegistrarInteracao();
  const transferir = useTransferirProtocolo();
  const encerrar = useEncerrarProtocolo();
  const alterarStatus = useAlterarStatusProtocolo();

  const [mensagem, setMensagem] = useState('');
  const [transferindo, setTransferindo] = useState<{ para: string; motivo: string } | null>(null);
  const [encerrando, setEncerrando] = useState<string | null>(null);

  const emAberto = protocoloAberto(protocolo.status, protocolo.encerrado_em);

  return (
    <div className="space-y-4">
      <button onClick={onVoltar} className="text-sm font-medium text-cyan-700 hover:text-cyan-800">
        ← Voltar a Central
      </button>

      {/* Cabecalho */}
      <div className="rounded-2xl border border-slate-200 bg-superficie p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-slate-400">{protocolo.protocolo}</p>
            <h2 className="text-lg font-semibold text-slate-900">{protocolo.assunto ?? rotuloCategoria(protocolo.tipo)}</h2>
            <p className="text-sm text-slate-600">
              {protocolo.associado}
              {protocolo.placa ? ` · ${protocolo.placa}` : ''}
            </p>
            {protocolo.descricao && <p className="mt-1 text-sm text-slate-500">{protocolo.descricao}</p>}
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`rounded px-2 py-0.5 text-xs ${STATUS_PROTOCOLO[protocolo.status].cor}`}>
              {STATUS_PROTOCOLO[protocolo.status].label}
            </span>
            <span className={`rounded px-2 py-0.5 text-xs ${corPrioridade(protocolo.prioridade)}`}>
              {protocolo.prioridade}
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <User className="h-3 w-3" /> {protocolo.responsavel ?? 'sem responsavel'}
            </span>
          </div>
        </div>

        {emAberto && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setTransferindo({ para: '', motivo: '' })}>
              <ArrowLeftRight className="h-4 w-4" /> Transferir
            </Button>
            {protocolo.status === 'ABERTO' && (
              <Button
                variant="secondary"
                onClick={() =>
                  alterarStatus.mutate(
                    { atendimento_id: protocolo.id, status: 'EM_ANDAMENTO' },
                    { onSuccess: () => toast.success('Protocolo em atendimento'), onError: (e) => toast.error(e.message) },
                  )
                }
              >
                <Clock className="h-4 w-4" /> Assumir atendimento
              </Button>
            )}
            <Button onClick={() => setEncerrando('')}>
              <CheckCircle2 className="h-4 w-4" /> Encerrar
            </Button>
            <Button
              variant="ghost"
              className="text-rose-600"
              onClick={() =>
                alterarStatus.mutate(
                  { atendimento_id: protocolo.id, status: 'CANCELADO', mensagem: 'Cancelado pelo atendimento' },
                  { onSuccess: () => { toast.success('Protocolo cancelado'); onVoltar(); }, onError: (e) => toast.error(e.message) },
                )
              }
            >
              <X className="h-4 w-4" /> Cancelar
            </Button>
          </div>
        )}
      </div>

      {/* Historico de interacoes */}
      <div className="rounded-2xl border border-slate-200 bg-superficie">
        <div className="border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Historico do atendimento</h3>
        </div>
        <ul className="divide-y divide-slate-100">
          {(interacoes ?? []).map((i) => (
            <li key={i.id} className="px-5 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-700">
                  {TIPO_INTERACAO_LABEL[i.tipo]}
                  {i.tipo === 'TRANSFERENCIA' && i.de_usuario && (
                    <span className="font-normal text-slate-500"> · {i.de_usuario} → {i.para_usuario}</span>
                  )}
                  {i.tipo === 'STATUS' && i.para_status && (
                    <span className="font-normal text-slate-500">
                      {i.de_status ? ` · ${STATUS_PROTOCOLO[i.de_status].label} → ` : ' · '}
                      {STATUS_PROTOCOLO[i.para_status].label}
                    </span>
                  )}
                </span>
                <span className="text-xs text-slate-400">{formatDateTime(i.created_at)} · {i.operador}</span>
              </div>
              {i.mensagem && <p className="mt-0.5 text-slate-600">{i.mensagem}</p>}
              {!i.interno && (
                <span className="mt-1 inline-block rounded bg-cyan-50 px-1.5 py-0.5 text-[10px] text-cyan-700">
                  visivel ao associado
                </span>
              )}
            </li>
          ))}
          {(interacoes ?? []).length === 0 && (
            <li className="px-5 py-6 text-center text-sm text-slate-400">Sem interacoes ainda.</li>
          )}
        </ul>

        {emAberto && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!mensagem.trim()) return toast.error('Escreva a interacao');
              comentar.mutate(
                { atendimento_id: protocolo.id, mensagem },
                { onSuccess: () => { setMensagem(''); toast.success('Interacao registrada'); }, onError: (err) => toast.error(err.message) },
              );
            }}
            className="border-t border-slate-100 p-4"
          >
            <FormField label="Nova interacao">
              <Textarea
                rows={2}
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                placeholder="O que foi feito/combinado neste atendimento"
              />
            </FormField>
            <div className="mt-2 flex justify-end">
              <Button type="submit" variant="secondary" disabled={comentar.isPending}>
                <MessageSquarePlus className="h-4 w-4" /> Registrar
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Transferencia */}
      <Modal open={!!transferindo} onClose={() => setTransferindo(null)} title="Transferir atendimento">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!transferindo?.para) return toast.error('Selecione o atendente de destino');
            transferir.mutate(
              { atendimento_id: protocolo.id, para_usuario: transferindo.para, motivo: transferindo.motivo || null },
              {
                onSuccess: () => { toast.success('Protocolo transferido'); setTransferindo(null); onVoltar(); },
                onError: (err) => toast.error(err.message),
              },
            );
          }}
          className="space-y-3"
        >
          <FormField label="Transferir para">
            <Select
              value={transferindo?.para ?? ''}
              onChange={(e) => setTransferindo((t) => (t ? { ...t, para: e.target.value } : t))}
            >
              <option value="">Selecione...</option>
              {(atendentes ?? [])
                .filter((a) => a.id !== protocolo.responsavel_id)
                .map((a) => <option key={a.id} value={a.id}>{a.nome} — {a.papel}</option>)}
            </Select>
          </FormField>
          <FormField label="Motivo (opcional)">
            <Input
              value={transferindo?.motivo ?? ''}
              onChange={(e) => setTransferindo((t) => (t ? { ...t, motivo: e.target.value } : t))}
              placeholder="Ex.: caso e do financeiro"
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setTransferindo(null)}>Voltar</Button>
            <Button type="submit" disabled={transferir.isPending}>Transferir</Button>
          </div>
        </form>
      </Modal>

      {/* Encerramento */}
      <Modal open={encerrando !== null} onClose={() => setEncerrando(null)} title="Encerrar protocolo">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!encerrando?.trim()) return toast.error('Descreva a solucao');
            encerrar.mutate(
              { atendimento_id: protocolo.id, solucao: encerrando },
              {
                onSuccess: () => { toast.success('Protocolo encerrado'); setEncerrando(null); onVoltar(); },
                onError: (err) => toast.error(err.message),
              },
            );
          }}
          className="space-y-3"
        >
          <FormField label="Solucao (obrigatoria)">
            <Textarea
              rows={3}
              value={encerrando ?? ''}
              onChange={(e) => setEncerrando(e.target.value)}
              placeholder="O que resolveu o atendimento"
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEncerrando(null)}>Voltar</Button>
            <Button type="submit" disabled={encerrar.isPending}>Encerrar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
