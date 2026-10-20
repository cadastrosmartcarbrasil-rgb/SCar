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
  ClipboardList,
  LifeBuoy,
  ChevronRight,
  FileSignature,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { AssociadoForm } from '@/components/associados/associado-form';
import { useAssociado, useComunicacoes } from '@/hooks/use-associado-panel';
import {
  AcionamentosCadastro, EventosCadastro, FinanceiroCadastro, ProtocolosCadastro,
} from '@/components/cadastro/vida-cadastro';
import { TermosDoCadastro } from '@/components/termos/termos-do-cadastro';
import { usePode } from '@/hooks/use-permissoes';
import { statusVeiculoResumo } from '@/lib/sac';
import { useVeiculos } from '@/hooks/use-veiculos';
import { formatCurrency, formatDate } from '@/lib/utils';
import { formatarDocumento } from '@/lib/documento';
import type { EnderecoAssociado } from '@/hooks/use-associados';
import type { CanalComunicacao } from '@/lib/database.types';

type Aba = 'dados' | 'veiculos' | 'financeiro' | 'eventos' | 'protocolos' | 'assistencia' | 'termos' | 'comunicacoes';

export default function AssociadoPanel({ params }: { params: { id: string } }) {
  const id = params.id;
  const router = useRouter();
  const { data: associado, isLoading } = useAssociado(id);
  const [aba, setAba] = useState<Aba>('dados');
  const verTermos = usePode('termos.ver');

  if (isLoading) return <p className="text-sm text-slate-500">Carregando painel...</p>;
  if (!associado) return <p className="text-sm text-slate-500">Associado não encontrado.</p>;

  const abas: { id: Aba; label: string; icon: React.ElementType }[] = [
    { id: 'dados', label: 'Dados', icon: UserRound },
    { id: 'veiculos', label: 'Veículos', icon: Car },
    { id: 'financeiro', label: 'Financeiro', icon: DollarSign },
    { id: 'eventos', label: 'Eventos', icon: AlertTriangle },
    { id: 'protocolos', label: 'Protocolos', icon: ClipboardList },
    { id: 'assistencia', label: 'Assistência 24h', icon: LifeBuoy },
    ...(verTermos ? [{ id: 'termos' as Aba, label: 'Termos', icon: FileSignature }] : []),
    { id: 'comunicacoes', label: 'Comunicações', icon: MessagesSquare },
  ];

  return (
    <div className="space-y-5">
      <Link href="/associados" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Voltar aos associados
      </Link>

      {/* Cabecalho do associado */}
      <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-superficie p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <UserRound className="h-7 w-7" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900">{associado.nome_razao_social}</h1>
          <p className="text-sm text-slate-500">
            Matrícula <span className="font-mono text-brand-600">{associado.matricula ?? '-'}</span> ·{' '}
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
        {aba === 'financeiro' && <FinanceiroCadastro clienteId={id} />}
        {aba === 'eventos' && <EventosCadastro clienteId={id} />}
        {aba === 'protocolos' && <ProtocolosCadastro clienteId={id} />}
        {aba === 'assistencia' && <AcionamentosCadastro clienteId={id} />}
        {aba === 'termos' && <TermosDoCadastro clienteId={id} />}
        {aba === 'comunicacoes' && <AbaComunicacoes associadoId={id} />}
      </div>
    </div>
  );
}

// --- Veiculos -------------------------------------------------------------
function AbaVeiculos({ associadoId }: { associadoId: string }) {
  const router = useRouter();
  const { data: veiculos, isLoading } = useVeiculos(associadoId);
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">Veículos vinculados a este associado. Clique num veículo para abrir o cadastro dele.</p>
          <Link href="/veiculos" className="inline-flex items-center gap-1 rounded-md bg-acao px-3 py-1.5 text-sm text-white hover:bg-acao-escura">
            <Plus className="h-4 w-4" /> Novo veículo
          </Link>
        </div>
        {isLoading ? (
          <p className="text-sm text-slate-400">Carregando...</p>
        ) : (veiculos ?? []).length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum veículo vinculado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="py-2">Placa</th>
                <th className="py-2">Veiculo</th>
                <th className="py-2">FIPE</th>
                <th className="py-2">Situação</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(veiculos ?? []).map((v) => {
                const st = statusVeiculoResumo(v.status, false);
                return (
                  <tr
                    key={v.id}
                    onClick={() => router.push(`/veiculos/${v.id}`)}
                    className="cursor-pointer border-b border-slate-50 hover:bg-slate-50"
                    title="Abrir o cadastro do veículo"
                  >
                    <td className="py-2 font-mono font-medium text-brand-600">{v.placa}</td>
                    <td className="py-2">{[v.marca, v.modelo].filter(Boolean).join(' ') || '-'}</td>
                    <td className="py-2">{v.valor_fipe ? formatCurrency(v.valor_fipe) : '-'}</td>
                    <td className="py-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${st.cor}`}>{st.label}</span>
                    </td>
                    <td className="py-2 text-right text-slate-400"><ChevronRight className="inline h-4 w-4" /></td>
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
                canal === c.v ? 'bg-acao text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <c.icon className="h-4 w-4" />
              {c.label}
            </button>
          ))}
        </div>

        <p className="rounded-md bg-sky-50 p-3 text-xs text-sky-700">
          O envio de e-mail, SMS e WhatsApp será construído em breve. Esta aba já registra e exibe o
          histórico de comunicações enviadas ao associado.
        </p>

        {isLoading ? (
          <p className="text-sm text-slate-400">Carregando...</p>
        ) : (comunicacoes ?? []).length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma comunicação registrada.</p>
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
