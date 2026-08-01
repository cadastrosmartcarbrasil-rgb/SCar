'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowRightLeft, Clock, Paperclip, Wrench, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UploadAnexos } from './upload-anexos';
import { CotacaoPecas } from './cotacao-pecas';
import {
  useEvento,
  useHistoricoProtocolo,
  useTransferirProtocolo,
} from '@/hooks/use-eventos';
import { PIPELINE_SINISTRO, TIPO_EVENTO_LABEL } from '@/types/domain';
import { formatDate } from '@/lib/utils';
import type { StatusEvento } from '@/lib/database.types';

type Aba = 'info' | 'anexos' | 'cotacao' | 'historico';

// Tela completa de gestao de um protocolo de sinistro.
export function ProtocoloDetail({ eventoId }: { eventoId: string }) {
  const { data: evento, isLoading } = useEvento(eventoId);
  const { data: historico } = useHistoricoProtocolo(eventoId);
  const transferir = useTransferirProtocolo(eventoId);
  const [aba, setAba] = useState<Aba>('info');
  const [parecer, setParecer] = useState('');
  const [novoStatus, setNovoStatus] = useState<StatusEvento | ''>('');

  if (isLoading || !evento) return <p className="text-sm text-slate-500">Carregando protocolo...</p>;

  const veiculo = (evento as { veiculos?: { placa: string; marca: string | null; modelo: string | null } }).veiculos;
  const cliente = (evento as { clientes?: { nome_razao_social: string; cpf_cnpj: string } }).clientes;

  function tramitar() {
    transferir.mutate(
      {
        // Numa app real, o destino sai de um seletor de operadores; aqui mantemos o atual.
        destino: evento!.operador_atual_id ?? '',
        parecer: parecer || undefined,
        novoStatus: (novoStatus || undefined) as StatusEvento | undefined,
      },
      {
        onSuccess: () => {
          toast.success('Protocolo tramitado');
          setParecer('');
          setNovoStatus('');
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  const abas: { id: Aba; label: string; icon: React.ElementType }[] = [
    { id: 'info', label: 'Dados', icon: Info },
    { id: 'anexos', label: 'Anexos', icon: Paperclip },
    { id: 'cotacao', label: 'Cotacao de Pecas', icon: Wrench },
    { id: 'historico', label: 'Historico', icon: Clock },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Coluna principal */}
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-sm text-brand-600">{evento.numero_protocolo}</p>
                <CardTitle className="text-lg font-semibold text-slate-900">
                  {TIPO_EVENTO_LABEL[evento.tipo_evento]} - {veiculo?.placa}
                </CardTitle>
              </div>
              <StatusBadge status={evento.status} />
            </div>
          </CardHeader>

          <CardContent>
            <div className="flex gap-1 border-b border-slate-200">
              {abas.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAba(a.id)}
                  className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${
                    aba === a.id
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <a.icon className="h-4 w-4" />
                  {a.label}
                </button>
              ))}
            </div>

            <div className="pt-4">
              {aba === 'info' && (
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Field label="Cliente" value={cliente?.nome_razao_social} />
                  <Field label="CPF/CNPJ" value={cliente?.cpf_cnpj} />
                  <Field label="Veiculo" value={`${veiculo?.marca ?? ''} ${veiculo?.modelo ?? ''}`} />
                  <Field label="Placa" value={veiculo?.placa} />
                  <Field label="Data da Ocorrencia" value={formatDate(evento.data_ocorrencia)} />
                  <Field label="Aberto em" value={formatDate(evento.created_at)} />
                  <div className="col-span-2">
                    <dt className="text-slate-500">Descricao</dt>
                    <dd className="text-slate-800">{evento.descricao ?? '-'}</dd>
                  </div>
                </dl>
              )}
              {aba === 'anexos' && <UploadAnexos eventoId={eventoId} />}
              {aba === 'cotacao' && <CotacaoPecas eventoId={eventoId} />}
              {aba === 'historico' && (
                <ol className="relative space-y-4 border-l border-slate-200 pl-4">
                  {(historico ?? []).map((h) => (
                    <li key={h.id} className="relative">
                      <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500" />
                      <p className="text-sm font-medium text-slate-800">{h.acao_realizada}</p>
                      {h.status_anterior && (
                        <p className="text-xs text-slate-500">
                          {h.status_anterior} → {h.status_novo}
                        </p>
                      )}
                      {h.observacoes && <p className="text-xs text-slate-600">{h.observacoes}</p>}
                      <p className="text-[11px] text-slate-400">{formatDate(h.created_at)}</p>
                    </li>
                  ))}
                  {(historico ?? []).length === 0 && (
                    <li className="text-sm text-slate-400">Sem tramitacoes.</li>
                  )}
                </ol>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Coluna lateral: tramitacao */}
      <div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" /> Tramitar Protocolo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-slate-500">Novo status</label>
              <select
                value={novoStatus}
                onChange={(e) => setNovoStatus(e.target.value as StatusEvento)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="">Manter status atual</option>
                {PIPELINE_SINISTRO.map((c) => (
                  <option key={c.status} value={c.status}>
                    {c.titulo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">Parecer / observacoes</label>
              <textarea
                value={parecer}
                onChange={(e) => setParecer(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="Descreva a analise ou motivo da transferencia..."
              />
            </div>
            <button
              onClick={tramitar}
              disabled={transferir.isPending}
              className="w-full rounded-md bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {transferir.isPending ? 'Registrando...' : 'Registrar tramitacao'}
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-800">{value || '-'}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: StatusEvento }) {
  const col = PIPELINE_SINISTRO.find((c) => c.status === status);
  return (
    <span className={`rounded-md border px-2 py-1 text-xs font-medium ${col?.cor ?? ''}`}>
      {col?.titulo ?? status}
    </span>
  );
}
