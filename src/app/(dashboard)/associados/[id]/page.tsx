'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  UserRound,
  Car,
  DollarSign,
  AlertTriangle,
  MessagesSquare,
  Mail,
  Smartphone,
  Plus,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { AssociadoForm } from '@/components/associados/associado-form';
import { useAssociado, useTitulosAssociado, useEventosAssociado, useComunicacoes } from '@/hooks/use-associado-panel';
import { useVeiculos } from '@/hooks/use-veiculos';
import { formatCurrency, formatDate } from '@/lib/utils';
import { formatarDocumento } from '@/lib/documento';
import { STATUS_TITULO_LABEL, TIPO_EVENTO_LABEL, PIPELINE_SINISTRO } from '@/types/domain';
import type { EnderecoAssociado } from '@/hooks/use-associados';
import type { CanalComunicacao, StatusEvento } from '@/lib/database.types';

type Aba = 'dados' | 'veiculos' | 'financeiro' | 'eventos' | 'comunicacoes';

export default function AssociadoPanel({ params }: { params: { id: string } }) {
  const id = params.id;
  const router = useRouter();
  const { data: associado, isLoading } = useAssociado(id);
  const [aba, setAba] = useState<Aba>('dados');

  if (isLoading) return <p className="text-sm text-slate-500">Carregando painel...</p>;
  if (!associado) return <p className="text-sm text-slate-500">Associado nao encontrado.</p>;

  const abas: { id: Aba; label: string; icon: React.ElementType }[] = [
    { id: 'dados', label: 'Dados', icon: UserRound },
    { id: 'veiculos', label: 'Veiculos', icon: Car },
    { id: 'financeiro', label: 'Financeiro', icon: DollarSign },
    { id: 'eventos', label: 'Eventos', icon: AlertTriangle },
    { id: 'comunicacoes', label: 'Comunicacoes', icon: MessagesSquare },
  ];

  return (
    <div className="space-y-5">
      <Link href="/associados" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Voltar aos associados
      </Link>

      {/* Cabecalho do associado */}
      <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <UserRound className="h-7 w-7" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900">{associado.nome_razao_social}</h1>
          <p className="text-sm text-slate-500">
            Matricula <span className="font-mono text-brand-600">{associado.matricula ?? '-'}</span> ·{' '}
            {associado.cpf_cnpj ? formatarDocumento(associado.cpf_cnpj, associado.tipo_pessoa) : '-'} ·{' '}
            {associado.celular || associado.telefone || associado.email || 'sem contato'}
          </p>
        </div>
        <span className="rounded-md bg-slate-100 px-3 py-1 text-sm capitalize text-slate-600">{associado.status}</span>
      </div>

      {/* Abas */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${
              aba === a.id ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <a.icon className="h-4 w-4" />
            {a.label}
          </button>
        ))}
      </div>

      <div>
        {aba === 'dados' && (
          <Card>
            <CardContent className="pt-5">
              <AssociadoForm
                initial={{ ...associado, endereco: (associado.endereco as EnderecoAssociado) ?? {} }}
                onSaved={() => router.refresh()}
              />
            </CardContent>
          </Card>
        )}
        {aba === 'veiculos' && <AbaVeiculos associadoId={id} />}
        {aba === 'financeiro' && <AbaFinanceiro associadoId={id} />}
        {aba === 'eventos' && <AbaEventos associadoId={id} />}
        {aba === 'comunicacoes' && <AbaComunicacoes associadoId={id} />}
      </div>
    </div>
  );
}

// --- Veiculos -------------------------------------------------------------
function AbaVeiculos({ associadoId }: { associadoId: string }) {
  const { data: veiculos, isLoading } = useVeiculos(associadoId);
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">Veiculos vinculados a este associado.</p>
          <Link href="/veiculos" className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" /> Novo veiculo
          </Link>
        </div>
        {isLoading ? (
          <p className="text-sm text-slate-400">Carregando...</p>
        ) : (veiculos ?? []).length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum veiculo vinculado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="py-2">Placa</th>
                <th className="py-2">Veiculo</th>
                <th className="py-2">FIPE</th>
                <th className="py-2">Situacao</th>
              </tr>
            </thead>
            <tbody>
              {(veiculos ?? []).map((v) => (
                <tr key={v.id} className="border-b border-slate-50">
                  <td className="py-2 font-mono">{v.placa}</td>
                  <td className="py-2">{[v.marca, v.modelo].filter(Boolean).join(' ') || '-'}</td>
                  <td className="py-2">{v.valor_fipe ? formatCurrency(v.valor_fipe) : '-'}</td>
                  <td className="py-2 capitalize">{v.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

// --- Financeiro -----------------------------------------------------------
function AbaFinanceiro({ associadoId }: { associadoId: string }) {
  const { data: titulos, isLoading } = useTitulosAssociado(associadoId);
  const t = titulos ?? [];
  const total = t.reduce((s, x) => s + Number(x.valor), 0);
  const pago = t.filter((x) => x.status === 'pago').reduce((s, x) => s + Number(x.valor_pago ?? x.valor), 0);
  const pendente = t.filter((x) => x.status === 'pendente').reduce((s, x) => s + Number(x.valor), 0);
  const vencido = t.filter((x) => x.status === 'vencido').reduce((s, x) => s + Number(x.valor), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Resumo titulo="Total" valor={total} cor="text-slate-800" />
        <Resumo titulo="Pago" valor={pago} cor="text-emerald-600" />
        <Resumo titulo="Pendente" valor={pendente} cor="text-amber-600" />
        <Resumo titulo="Vencido" valor={vencido} cor="text-rose-600" />
      </div>
      <Card>
        <CardContent className="pt-5">
          {isLoading ? (
            <p className="text-sm text-slate-400">Carregando...</p>
          ) : t.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum titulo/boleto para este associado.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                  <th className="py-2">Vencimento</th>
                  <th className="py-2">Valor</th>
                  <th className="py-2">Pago em</th>
                  <th className="py-2">Situacao</th>
                  <th className="py-2">Boleto</th>
                </tr>
              </thead>
              <tbody>
                {t.map((x) => {
                  const st = STATUS_TITULO_LABEL[x.status];
                  return (
                    <tr key={x.id} className="border-b border-slate-50">
                      <td className="py-2">{formatDate(x.data_vencimento)}</td>
                      <td className="py-2">{formatCurrency(x.valor)}</td>
                      <td className="py-2">{x.data_pagamento ? formatDate(x.data_pagamento) : '-'}</td>
                      <td className="py-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${st.cor}`}>{st.label}</span>
                      </td>
                      <td className="py-2">
                        {x.url_boleto ? (
                          <a href={x.url_boleto} target="_blank" className="text-brand-600 hover:underline">
                            2a via
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Resumo({ titulo, valor, cor }: { titulo: string; valor: number; cor: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-slate-500">{titulo}</p>
        <p className={`mt-1 text-lg font-semibold ${cor}`}>{formatCurrency(valor)}</p>
      </CardContent>
    </Card>
  );
}

// --- Eventos --------------------------------------------------------------
function AbaEventos({ associadoId }: { associadoId: string }) {
  const { data: eventos, isLoading } = useEventosAssociado(associadoId);
  const statusLabel = (s: StatusEvento) => PIPELINE_SINISTRO.find((c) => c.status === s);
  return (
    <Card>
      <CardContent className="pt-5">
        {isLoading ? (
          <p className="text-sm text-slate-400">Carregando...</p>
        ) : (eventos ?? []).length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum evento (sinistro) registrado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="py-2">Protocolo</th>
                <th className="py-2">Tipo</th>
                <th className="py-2">Ocorrencia</th>
                <th className="py-2">Status</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(eventos ?? []).map((e) => {
                const col = statusLabel(e.status);
                return (
                  <tr key={e.id} className="border-b border-slate-50">
                    <td className="py-2 font-mono text-brand-600">{e.numero_protocolo}</td>
                    <td className="py-2">{TIPO_EVENTO_LABEL[e.tipo_evento]}</td>
                    <td className="py-2">{formatDate(e.data_ocorrencia)}</td>
                    <td className="py-2">
                      <span className={`rounded border px-2 py-0.5 text-xs ${col?.cor ?? ''}`}>{col?.titulo ?? e.status}</span>
                    </td>
                    <td className="py-2 text-right">
                      <Link href={`/sinistros/${e.id}`} className="text-brand-600 hover:underline">
                        abrir
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

// --- Comunicacoes ---------------------------------------------------------
function AbaComunicacoes({ associadoId }: { associadoId: string }) {
  const [canal, setCanal] = useState<CanalComunicacao | undefined>(undefined);
  const { data: comunicacoes, isLoading } = useComunicacoes(associadoId, canal);

  const canais: { v: CanalComunicacao | undefined; label: string; icon: React.ElementType }[] = [
    { v: undefined, label: 'Todas', icon: MessagesSquare },
    { v: 'EMAIL', label: 'E-mail', icon: Mail },
    { v: 'SMS', label: 'SMS', icon: Smartphone },
    { v: 'WHATSAPP', label: 'WhatsApp', icon: Smartphone },
  ];

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center gap-2">
          {canais.map((c) => (
            <button
              key={c.label}
              onClick={() => setCanal(c.v)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
                canal === c.v ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <c.icon className="h-4 w-4" />
              {c.label}
            </button>
          ))}
        </div>

        <p className="rounded-md bg-sky-50 p-3 text-xs text-sky-700">
          O envio de e-mail, SMS e WhatsApp sera construido em breve. Esta aba ja registra e exibe o
          historico de comunicacoes enviadas ao associado.
        </p>

        {isLoading ? (
          <p className="text-sm text-slate-400">Carregando...</p>
        ) : (comunicacoes ?? []).length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma comunicacao registrada.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="py-2">Data</th>
                <th className="py-2">Canal</th>
                <th className="py-2">Destino</th>
                <th className="py-2">Assunto</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(comunicacoes ?? []).map((c) => (
                <tr key={c.id} className="border-b border-slate-50">
                  <td className="py-2">{formatDate(c.created_at)}</td>
                  <td className="py-2">{c.canal}</td>
                  <td className="py-2">{c.destino ?? '-'}</td>
                  <td className="py-2">{c.assunto ?? '-'}</td>
                  <td className="py-2 capitalize">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
