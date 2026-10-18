'use client';

// FICHA DO VEICULO (administrativo): o cadastro e a VIDA do veiculo —
// financeiro, eventos, protocolos e acionamentos da 24h ligados a ele.
// O SAC continua sendo a tela do atendimento; esta e a da consulta.
import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowLeft, Car, ClipboardList, DollarSign, FileText, LifeBuoy, Pencil, UserRound,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertasVeiculo } from '@/components/veiculos/alertas-veiculo';
import { CoberturasDetalhadas } from '@/components/veiculos/coberturas-veiculo';
import {
  AcionamentosCadastro, EventosCadastro, FinanceiroCadastro, ProtocolosCadastro,
} from '@/components/cadastro/vida-cadastro';
import { useVeiculoFicha } from '@/hooks/use-vida-cadastro';
import { primeiraAtivacao, statusVeiculoResumo } from '@/lib/sac';
import { formatarDocumento } from '@/lib/documento';
import { formatCurrency } from '@/lib/utils';

type Aba = 'dados' | 'financeiro' | 'eventos' | 'protocolos' | 'assistencia';

export default function FichaVeiculo({ params }: { params: { id: string } }) {
  const { data: v, isLoading, error } = useVeiculoFicha(params.id);
  const [aba, setAba] = useState<Aba>('dados');

  if (isLoading) return <p className="text-sm text-slate-500">Carregando veiculo...</p>;
  if (error) return <p className="text-sm text-rose-600">Nao foi possivel carregar: {(error as Error).message}</p>;
  if (!v) return <p className="text-sm text-slate-500">Veiculo nao encontrado (ou fora da sua unidade).</p>;

  const st = statusVeiculoResumo(v.status, false);
  const ativacao = primeiraAtivacao(v.data_ativacao);
  const voltar = `/veiculos/${v.id}`;

  const abas: { id: Aba; label: string; icon: React.ElementType }[] = [
    { id: 'dados', label: 'Dados', icon: FileText },
    { id: 'financeiro', label: 'Financeiro', icon: DollarSign },
    { id: 'eventos', label: 'Eventos', icon: AlertTriangle },
    { id: 'protocolos', label: 'Protocolos', icon: ClipboardList },
    { id: 'assistencia', label: 'Assistencia 24h', icon: LifeBuoy },
  ];

  return (
    <div className="space-y-5">
      <Link
        href={v.clientes ? `/associados/${v.clientes.id}` : '/veiculos'}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" /> {v.clientes ? 'Voltar ao associado' : 'Voltar aos veiculos'}
      </Link>

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-superficie p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Car className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-slate-900">
            <span className="font-mono">{v.placa}</span>{' '}
            <span className="font-normal text-slate-600">
              {[v.marca, v.modelo].filter(Boolean).join(' ')}
              {v.ano_modelo ? ` ${v.ano_fabricacao ?? ''}/${v.ano_modelo}` : ''}
            </span>
          </h1>
          {v.clientes && (
            <p className="text-sm text-slate-500">
              <Link href={`/associados/${v.clientes.id}`} className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                <UserRound className="h-3.5 w-3.5" /> {v.clientes.nome_razao_social}
              </Link>
              {' · '}Matricula {v.clientes.matricula ?? '-'} · {formatarDocumento(v.clientes.cpf_cnpj, v.clientes.tipo_pessoa as 'PF' | 'PJ')}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded-md px-3 py-1 text-sm ${st.cor}`}>{st.label}</span>
          <Link
            href={`/veiculos?editar=${v.id}&voltar=${encodeURIComponent(voltar)}`}
            className="inline-flex items-center gap-1 rounded-md bg-acao px-3 py-1.5 text-sm text-white hover:bg-acao-escura"
          >
            <Pencil className="h-4 w-4" /> Editar cadastro
          </Link>
        </div>
      </div>

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

      {aba === 'dados' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardContent className="pt-5">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Item rotulo="Plano" valor={v.planos_protecao?.nome ?? 'Sem plano'} />
                <Item rotulo="Tipo de veiculo" valor={v.tipos_veiculo?.nome} />
                <Item rotulo="Unidade" valor={v.regionais?.nome ?? 'Matriz'} />
                <Item rotulo="Valor FIPE" valor={v.valor_fipe ? formatCurrency(v.valor_fipe) : null} />
                <Item
                  rotulo="Mensalidade"
                  valor={v.valor_mensalidade ? formatCurrency(v.valor_mensalidade) : 'Pelo plano (cotacao)'}
                />
                <Item rotulo="Dia de vencimento" valor={v.dia_vencimento ? String(v.dia_vencimento) : null} />
                <Item
                  rotulo="Cobranca"
                  valor={v.cobranca_externa ? 'Externa (sistema anterior)' : 'Emitida pelo SCar'}
                />
                <Item
                  rotulo="Primeira ativacao"
                  valor={ativacao ? `${ativacao.data}${ativacao.tempo ? ` · ${ativacao.tempo}` : ''}` : null}
                />
                <Item rotulo="Chassi" valor={v.chassi} mono />
                <Item rotulo="Renavam" valor={v.renavam} mono />
                <Item rotulo="Cor" valor={v.cor} />
                <Item rotulo="Rastreador (IMEI)" valor={v.rastreador_imei} mono />
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <AlertasVeiculo veiculoId={v.id} />
            </CardContent>
          </Card>
          <div className="lg:col-span-3">
            <CoberturasDetalhadas veiculo={v} />
          </div>
        </div>
      )}
      {aba === 'financeiro' && <FinanceiroCadastro clienteId={v.cliente_id} veiculoId={v.id} />}
      {aba === 'eventos' && <EventosCadastro clienteId={v.cliente_id} veiculoId={v.id} />}
      {aba === 'protocolos' && <ProtocolosCadastro clienteId={v.cliente_id} veiculoId={v.id} />}
      {aba === 'assistencia' && <AcionamentosCadastro clienteId={v.cliente_id} veiculoId={v.id} />}
    </div>
  );
}

function Item({ rotulo, valor, mono }: { rotulo: string; valor: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{rotulo}</dt>
      <dd className={`text-slate-800 ${mono ? 'font-mono' : ''}`}>{valor || '—'}</dd>
    </div>
  );
}
