'use client';

import { useState } from 'react';
import { Clock, Paperclip, Wrench, Info, DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UploadAnexos } from './upload-anexos';
import { CotacaoPecas } from './cotacao-pecas';
import { EventoFinanceiro } from './evento-financeiro';
import { useEvento, useHistoricoProtocolo } from '@/hooks/use-eventos';
import { useUsuarios } from '@/hooks/use-config';
import { TramitacaoEvento } from './tramitacao-evento';
import { PIPELINE_SINISTRO, TIPO_EVENTO_LABEL } from '@/types/domain';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { StatusEvento, TipoEvento, Json } from '@/lib/database.types';

type Aba = 'info' | 'reparo' | 'financeiro' | 'anexos' | 'historico';

interface LocalEvento {
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
}

export function ProtocoloDetail({ eventoId }: { eventoId: string }) {
  const { data: evento, isLoading } = useEvento(eventoId);
  const { data: historico } = useHistoricoProtocolo(eventoId);
  const { data: usuarios } = useUsuarios();
  const [aba, setAba] = useState<Aba>('info');

  if (isLoading || !evento) return <p className="text-sm text-slate-500">Carregando protocolo...</p>;

  const e = evento as Record<string, unknown> & {
    veiculos?: { placa: string; marca: string | null; modelo: string | null; chassi: string | null; renavam: string | null };
    clientes?: { nome_razao_social: string; cpf_cnpj: string; matricula: string | null; telefone: string | null; celular: string | null };
    tipos_evento?: { nome: string } | null;
  };
  const veiculo = e.veiculos;
  const cliente = e.clientes;
  const local = (evento.local_evento as Json as LocalEvento) ?? {};
  const tipoNome =
    e.tipos_evento?.nome ?? (evento.tipo_evento ? TIPO_EVENTO_LABEL[evento.tipo_evento as TipoEvento] : '-');

  const abas: { id: Aba; label: string; icon: React.ElementType }[] = [
    { id: 'info', label: 'Dados', icon: Info },
    { id: 'reparo', label: 'Reparo', icon: Wrench },
    { id: 'financeiro', label: 'Financeiro', icon: DollarSign },
    { id: 'anexos', label: 'Anexos', icon: Paperclip },
    { id: 'historico', label: 'Historico', icon: Clock },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-sm text-brand-600">{evento.numero_protocolo}</p>
                <CardTitle className="text-lg font-semibold text-slate-900">
                  {tipoNome} - {veiculo?.placa}
                </CardTitle>
              </div>
              <StatusBadge status={evento.status} />
            </div>
          </CardHeader>

          <CardContent>
            <div className="flex flex-wrap gap-1 border-b border-slate-200">
              {abas.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAba(a.id)}
                  className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${
                    aba === a.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <a.icon className="h-4 w-4" />
                  {a.label}
                </button>
              ))}
            </div>

            <div className="pt-4">
              {aba === 'info' && (
                <div className="space-y-5 text-sm">
                  <Secao titulo="Envolvidos e datas">
                    <Campo label="Associado" value={cliente?.nome_razao_social} />
                    <Campo label="Matricula" value={cliente?.matricula} />
                    <Campo label="Veiculo" value={`${veiculo?.marca ?? ''} ${veiculo?.modelo ?? ''} - ${veiculo?.placa ?? ''}`} />
                    <Campo label="Contato" value={cliente?.celular || cliente?.telefone} />
                    <Campo label="Veiculo envolvido" value={evento.envolvido_tipo === 'TERCEIRO' ? 'De Terceiro' : 'Do Associado'} />
                    <Campo label="Envolvimento" value={evento.tipo_envolvimento === 'CAUSADOR' ? 'Causador' : evento.tipo_envolvimento === 'VITIMA' ? 'Vitima' : '-'} />
                    <Campo label="Tipo de evento" value={tipoNome} />
                    <Campo label="Data do evento" value={formatDate(evento.data_ocorrencia)} />
                    <Campo label="Data da comunicacao" value={evento.data_comunicacao ? formatDate(evento.data_comunicacao) : '-'} />
                    <Campo label="Aberto em" value={formatDate(evento.created_at)} />
                  </Secao>

                  <Secao titulo="Local do evento">
                    <Campo label="Logradouro" value={[local.logradouro, local.numero].filter(Boolean).join(', ')} />
                    <Campo label="Complemento" value={local.complemento} />
                    <Campo label="Bairro" value={local.bairro} />
                    <Campo label="Cidade/UF" value={local.cidade ? `${local.cidade}/${local.estado ?? ''}` : '-'} />
                    <Campo label="CEP" value={local.cep} />
                  </Secao>

                  <Secao titulo="Boletim de Ocorrencia">
                    <Campo label="Numero" value={evento.bo_numero} />
                    <Campo label="Data" value={evento.bo_data ? formatDate(evento.bo_data) : '-'} />
                    <Campo label="Unidade" value={evento.bo_unidade} />
                    <div className="col-span-2">
                      <dt className="text-slate-500">Resumo do B.O.</dt>
                      <dd className="text-slate-800">{evento.bo_resumo || '-'}</dd>
                    </div>
                  </Secao>

                  <Secao titulo="Valores">
                    <Campo label="FIPE atualizado" value={evento.valor_fipe_atualizado != null ? formatCurrency(evento.valor_fipe_atualizado) : '-'} />
                    <Campo label="Participacao (franquia)" value={evento.valor_participacao != null ? formatCurrency(evento.valor_participacao) : '-'} />
                  </Secao>

                  {evento.descricao && (
                    <div>
                      <dt className="text-slate-500">Descricao / relato</dt>
                      <dd className="text-slate-800">{evento.descricao}</dd>
                    </div>
                  )}
                </div>
              )}

              {aba === 'reparo' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <Wrench className="h-4 w-4" /> Reparo do veiculo (proprio)
                    </h3>
                    <CotacaoPecas eventoId={eventoId} tipoReparo="PROPRIO" />
                  </div>
                  <div className="border-t border-slate-200 pt-5">
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <Wrench className="h-4 w-4" /> Reparo de veiculo de terceiro
                    </h3>
                    <CotacaoPecas eventoId={eventoId} tipoReparo="TERCEIRO" />
                  </div>
                </div>
              )}

              {aba === 'financeiro' && <EventoFinanceiro eventoId={eventoId} regionalId={evento.regional_id} />}
              {aba === 'anexos' && <UploadAnexos eventoId={eventoId} />}

              {aba === 'historico' && (
                <ol className="relative space-y-4 border-l border-slate-200 pl-4">
                  {(historico ?? []).map((h) => (
                    <li key={h.id} className="relative">
                      <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500" />
                      <p className="text-sm font-medium text-slate-800">
                        {ACAO_HISTORICO[h.acao_realizada] ?? h.acao_realizada}
                        {/* de nada adianta dizer "TRANSFERENCIA" sem dizer para quem */}
                        {h.usuario_destino_id && (
                          <span className="font-normal text-slate-500">
                            {' '}· {nomeDe(usuarios, h.usuario_destino_id)}
                          </span>
                        )}
                      </p>
                      {h.status_anterior && h.status_anterior !== h.status_novo && (
                        <p className="text-xs text-slate-500">
                          {h.status_anterior} → {h.status_novo}
                        </p>
                      )}
                      {h.observacoes && <p className="text-xs text-slate-600">{h.observacoes}</p>}
                      <p className="text-[11px] text-slate-400">{formatDate(h.created_at)}</p>
                    </li>
                  ))}
                  {(historico ?? []).length === 0 && <li className="text-sm text-slate-400">Sem tramitacoes.</li>}
                </ol>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tramitacao + pareceres (0059): passar a bola de verdade e pedir analise */}
      <div>
        <TramitacaoEvento eventoId={eventoId} operadorAtualId={evento.operador_atual_id} />
      </div>
    </div>
  );
}

/** Rotulos da trilha do evento — `acao_realizada` e texto no banco (0002/0059). */
const ACAO_HISTORICO: Record<string, string> = {
  ABERTURA: 'Protocolo aberto',
  TRANSFERENCIA: 'Transferido para',
  MUDANCA_STATUS: 'Status alterado',
  PARECER: 'Parecer registrado',
};

function nomeDe(usuarios: { id: string; nome: string }[] | undefined, id: string): string {
  return usuarios?.find((u) => u.id === id)?.nome ?? 'equipe';
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{titulo}</h3>
      <dl className="grid grid-cols-2 gap-3">{children}</dl>
    </div>
  );
}

function Campo({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-800">{value || '-'}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: StatusEvento }) {
  const col = PIPELINE_SINISTRO.find((c) => c.status === status);
  return <span className={`rounded-md border px-2 py-1 text-xs font-medium ${col?.cor ?? ''}`}>{col?.titulo ?? status}</span>;
}
