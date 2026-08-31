'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, MessageCircle, Phone, Plus, Search, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { Vazio } from '@/components/financeiro/ui-financeiro';
import { BotoesHotlink } from '@/components/vendedor/shell-vendedor';
import { useLeadsDoVendedor, usePerfilVendedor } from '@/hooks/use-vendedor';
import { FILTROS_LEAD, SELO_STATUS_LEAD, filtrarPorEtapa } from '@/lib/vendedor';
import { formatCurrency, formatDate } from '@/lib/utils';

function soNumeros(v: string) {
  return (v ?? '').replace(/\D/g, '');
}

export default function LeadsVendedorPage() {
  const [etapa, setEtapa] = useState('');
  const [busca, setBusca] = useState('');
  const { data: leads, isLoading } = useLeadsDoVendedor({ busca });
  const { data: perfil } = usePerfilVendedor();

  const lista = useMemo(() => filtrarPorEtapa(leads ?? [], etapa), [leads, etapa]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Meus leads</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Tudo que chegou pelo seu link ou que voce cadastrou.
          </p>
        </div>
        <Link href="/vendedor/leads/novo">
          <Button><Plus className="mr-1.5 h-4 w-4" /> Novo lead</Button>
        </Link>
      </header>

      <Card>
        <CardContent className="p-3">
          <BotoesHotlink codigo={perfil?.codigo ?? null} compacto />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {FILTROS_LEAD.map((f) => (
          <button
            key={f.chave || 'todos'}
            onClick={() => setEtapa(f.chave)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
              etapa === f.chave
                ? 'bg-brand-600 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {f.rotulo}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, celular ou placa"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-white" />)}
        </div>
      ) : lista.length === 0 ? (
        <Card>
          <CardContent className="p-4">
            <Vazio
              icon={Zap}
              titulo="Nenhum lead aqui"
              descricao="Compartilhe seu link de vendas ou cadastre um interessado agora."
              acao={(
                <Link href="/vendedor/leads/novo">
                  <Button><Plus className="mr-1.5 h-4 w-4" /> Novo lead</Button>
                </Link>
              )}
            />
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {lista.map((l) => {
            const selo = SELO_STATUS_LEAD[l.status] ?? SELO_STATUS_LEAD.NOVO;
            const fone = soNumeros(l.celular);
            return (
              <li key={l.id} className="rounded-2xl border border-slate-200/80 bg-white p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-slate-900">{l.nome}</p>
                    <p className="mt-0.5 text-[12px] text-slate-500">
                      {l.celular}
                      {l.placa && <span className="ml-2 font-mono uppercase text-slate-600">{l.placa}</span>}
                    </p>
                    {(l.marca || l.modelo) && (
                      <p className="text-[11.5px] text-slate-400">
                        {[l.marca, l.modelo].filter(Boolean).join(' ')}
                        {l.valor_fipe ? ` · FIPE ${formatCurrency(l.valor_fipe)}` : ''}
                      </p>
                    )}
                    {l.status === 'PERDIDO' && l.perdido_motivo && (
                      <p className="mt-1 text-[11.5px] text-rose-600">Motivo: {l.perdido_motivo}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${selo.classe}`}>
                      {selo.rotulo}
                    </span>
                    <p className="tnum mt-1 text-[10.5px] text-slate-400">{formatDate(l.created_at)}</p>
                    {l.origem_hotlink && (
                      <p className="text-[10.5px] font-medium text-cyan-600">pelo meu link</p>
                    )}
                  </div>
                </div>

                <div className="mt-2.5 flex gap-2 border-t border-slate-100 pt-2.5">
                  <a
                    href={`https://wa.me/55${fone}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                  <a
                    href={`tel:+55${fone}`}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    <Phone className="h-3.5 w-3.5" /> Ligar
                  </a>
                  <Link
                    href={`/vendedor/leads/${l.id}`}
                    className="flex items-center justify-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-brand-700"
                  >
                    Abrir <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

    </div>
  );
}
