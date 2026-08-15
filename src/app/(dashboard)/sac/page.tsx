'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Search, User, Car, Phone, Mail, MapPin, ShieldCheck, Loader2,
  CheckCircle2, XCircle, CreditCard, Layers, SplitSquareHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useSacBusca, useVisao360, useToggleFaturamento, useGerarBoleto, type Veiculo360,
} from '@/hooks/use-sac';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { OpcionalElegibilidade, TipoFaturamento } from '@/lib/database.types';

export default function SacPage() {
  const [q, setQ] = useState('');
  const [clienteId, setClienteId] = useState<string | undefined>();
  const busca = useSacBusca(q);
  const { data: v360, isLoading } = useVisao360(clienteId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">SAC · Visao 360</h1>
        <p className="mt-0.5 text-sm text-slate-500">Atendimento centralizado — base para SAC, Assistencia 24h e Chatbot.</p>
      </div>

      {/* Busca global */}
      <div className="relative max-w-xl">
        <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-cyan-500/40">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por Nome, CPF/CNPJ ou Placa..."
            className="w-full text-sm outline-none"
          />
          {busca.isFetching && <Loader2 className="h-4 w-4 animate-spin text-slate-300" />}
        </div>
        {q.trim().length >= 2 && (busca.data?.length ?? 0) > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            {busca.data!.map((h) => (
              <li key={h.cliente_id}>
                <button
                  onClick={() => { setClienteId(h.cliente_id); setQ(''); }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50"
                >
                  <User className="h-4 w-4 text-slate-400" />
                  <span className="flex-1"><b className="text-slate-800">{h.nome}</b> <span className="text-slate-400">· {h.cpf_cnpj}</span></span>
                  {h.via && <span className="rounded bg-cyan-50 px-2 py-0.5 text-[11px] text-cyan-700">{h.via}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!clienteId && <p className="text-sm text-slate-400">Busque um associado para abrir a Visao 360.</p>}
      {clienteId && isLoading && <p className="py-10 text-center text-sm text-slate-400">Carregando Visao 360...</p>}

      {v360 && (
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <AssociadoCard v360={v360} />
            <FinanceiroCard v360={v360} clienteId={v360.associado.id} />
          </div>

          <div>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Car className="h-4 w-4 text-cyan-600" /> Veiculos / Itens ({v360.veiculos.length})
            </h2>
            <div className="space-y-4">
              {v360.veiculos.map((v) => (
                <VeiculoCard key={v.id} v={v} clienteId={v360.associado.id} />
              ))}
              {v360.veiculos.length === 0 && <p className="text-sm text-slate-400">Nenhum veiculo cadastrado.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AssociadoCard({ v360 }: { v360: NonNullable<ReturnType<typeof useVisao360>['data']> }) {
  const a = v360.associado;
  const end = (a.endereco ?? {}) as Record<string, string>;
  const endStr = [end.logradouro, end.numero, end.bairro, end.cidade, end.uf].filter(Boolean).join(', ');
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-800 text-sm font-bold text-white">
              {a.nome_razao_social.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{a.nome_razao_social}</h3>
              <p className="text-sm text-slate-500">{a.tipo_pessoa} · {a.cpf_cnpj}</p>
            </div>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${a.status === 'ativo' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
            {a.status}
          </span>
        </div>
        <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          {a.telefone && <span className="inline-flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-slate-400" /> {a.telefone}</span>}
          {a.email && <span className="inline-flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-slate-400" /> {a.email}</span>}
          {endStr && <span className="inline-flex items-center gap-2 sm:col-span-2"><MapPin className="h-3.5 w-3.5 text-slate-400" /> {endStr}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function FinanceiroCard({ v360, clienteId }: { v360: NonNullable<ReturnType<typeof useVisao360>['data']>; clienteId: string }) {
  const r = v360.financeiro.resumo;
  const gerar = useGerarBoleto();
  return (
    <Card>
      <CardHeader><CardTitle>Status Financeiro</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          {r.adimplente
            ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Adimplente</span>
            : <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700"><XCircle className="h-3.5 w-3.5" /> {r.vencidos} vencido(s)</span>}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Abertos" valor={String(r.abertos)} />
          <Stat label="Pagos" valor={String(r.pagos)} />
          <Stat label="Em aberto" valor={formatCurrency(r.valorEmAberto)} />
        </div>
        <Button
          variant="accent"
          className="w-full"
          disabled={gerar.isPending}
          onClick={() => gerar.mutate({ cliente_id: clienteId }, {
            onSuccess: (d) => toast.success(`Faturas da competencia ${d.competencia} prontas (${d.faturas.length})`),
            onError: (e) => toast.error(e.message),
          })}
        >
          {gerar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          Emitir / 2a via de boleto
        </Button>
      </CardContent>
    </Card>
  );
}

function Stat({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-lg bg-slate-50 py-2">
      <p className="tnum text-base font-bold text-slate-800">{valor}</p>
      <p className="text-[11px] uppercase text-slate-400">{label}</p>
    </div>
  );
}

function VeiculoCard({ v, clienteId }: { v: Veiculo360; clienteId: string }) {
  const toggle = useToggleFaturamento();
  const setModo = (tipo: TipoFaturamento) => {
    if (tipo === v.tipo_faturamento) return;
    toggle.mutate({ veiculo_id: v.id, tipo, cliente_id: clienteId }, {
      onSuccess: () => toast.success('Modo de faturamento atualizado'),
      onError: (e) => toast.error(e.message),
    });
  };
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-sm font-semibold text-slate-700">{v.placa}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${v.status === 'ativo' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{v.status}</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {[v.marca, v.modelo].filter(Boolean).join(' ')} {v.ano_modelo ?? ''} {v.cor ? `· ${v.cor}` : ''}
              {v.plano_nome && <span className="ml-2 text-slate-400">· {v.plano_nome}</span>}
            </p>
          </div>
          {/* Toggle de faturamento */}
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs font-medium">
            <button
              onClick={() => setModo('AGRUPADO_ASSOCIADO')}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition ${v.tipo_faturamento === 'AGRUPADO_ASSOCIADO' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <Layers className="h-3.5 w-3.5" /> Agrupado
            </button>
            <button
              onClick={() => setModo('INDIVIDUAL_VEICULO')}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition ${v.tipo_faturamento === 'INDIVIDUAL_VEICULO' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <SplitSquareHorizontal className="h-3.5 w-3.5" /> Individual
            </button>
          </div>
        </div>

        {/* Elegibilidade de opcionais (janela flutuante 12 meses) */}
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Opcionais — uso nos ultimos 12 meses
          </p>
          {v.opcionais.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum opcional com limite configurado.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {v.opcionais.map((o) => <OpcionalRow key={o.produto_id} o={o} />)}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function OpcionalRow({ o }: { o: OpcionalElegibilidade }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="text-slate-700">{o.nome}</span>
      <div className="flex items-center gap-3">
        <span className="tnum text-xs text-slate-500">{o.usados}/{o.quantidade_limite} usados</span>
        {o.elegivel ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> DISPONIVEL
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700" title={o.ultimo_uso ? `Ultimo uso em ${formatDate(o.ultimo_uso)}` : undefined}>
            <XCircle className="h-3.5 w-3.5" /> LIMITE EXCEDIDO
          </span>
        )}
      </div>
    </li>
  );
}
