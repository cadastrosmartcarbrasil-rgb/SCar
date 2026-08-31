'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CalendarClock, Car, HandCoins, Link2, Target, Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FiltroPeriodo, Indicador, Vazio, periodoPreset, type Periodo,
} from '@/components/financeiro/ui-financeiro';
import { BotoesHotlink } from '@/components/vendedor/shell-vendedor';
import { usePainelVendedor, useLeadsDoVendedor } from '@/hooks/use-vendedor';
import {
  SELO_STATUS_LEAD, proximoPagamentoMensal, proximoPagamentoSemanal, rotuloDiaSemana,
} from '@/lib/vendedor';
import { formatCurrency, formatDate } from '@/lib/utils';

/** 0.155 -> "15,5%" (comissao e numeric(6,4): nao da para arredondar em 2). */
function percent(fracao: number | null | undefined): string {
  return `${String(Number(((fracao ?? 0) * 100).toFixed(2))).replace('.', ',')}%`;
}

export default function PainelVendedorPage() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoPreset('mes'));
  const { data: p, isLoading } = usePainelVendedor(periodo);
  const { data: leads } = useLeadsDoVendedor({});
  const ultimos = (leads ?? []).slice(0, 6);
  const proximoSemanal = proximoPagamentoSemanal(p?.dia_entrada ?? null);
  const proximoMensal = proximoPagamentoMensal(p?.dia_recorrencia ?? null);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Ola, {p?.nome?.split(' ')[0] ?? 'vendedor'}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Seus leads, suas vendas e sua comissao — {p?.regional_nome ?? 'Smart Car Brasil'}.
        </p>
      </header>

      {/* O hotlink e a ferramenta de trabalho: fica no topo, sempre. */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
              <Link2 className="h-3.5 w-3.5" /> Meu link de vendas
            </p>
            <p className="mt-1 truncate font-mono text-[13px] text-brand-700">
              {p?.codigo ? `/v/${p.codigo}` : 'codigo ainda nao gerado'}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Quem preencher por este link vira um lead ja vinculado a voce.
            </p>
          </div>
          <div className="sm:w-72"><BotoesHotlink codigo={p?.codigo ?? null} /></div>
        </CardContent>
      </Card>

      <FiltroPeriodo periodo={periodo} onChange={setPeriodo} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          titulo="Leads no periodo" valor={p?.leads_periodo} icon={Zap} tom="destaque"
          carregando={isLoading}
          detalhe={`${p?.leads_hotlink ?? 0} pelo meu link · ${p?.leads_abertos ?? 0} em aberto`}
        />
        <Indicador
          titulo="Taxa de conversao" valor={p?.taxa_conversao} icon={Target}
          tom={(p?.taxa_conversao ?? 0) >= 20 ? 'receita' : 'alerta'}
          carregando={isLoading}
          detalhe={`${p?.leads_convertidos ?? 0} viraram veiculo na base`}
        />
        <Indicador
          titulo="Comissao a receber" valor={p?.comissao_pendente} icon={HandCoins} tom="alerta"
          carregando={isLoading}
          detalhe={`Ja recebido no periodo: ${formatCurrency(p?.comissao_paga)}`}
        />
        <Indicador
          titulo="Minha carteira" valor={p?.veiculos_ativos} icon={Car} tom="neutro"
          carregando={isLoading}
          detalhe="Veiculos ativos vendidos por mim"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardHeader>
            <CardTitle>Ultimos leads</CardTitle>
            <p className="text-xs text-slate-500">O que chegou por ultimo na sua carteira.</p>
          </CardHeader>
          <CardContent>
            {ultimos.length === 0 ? (
              <Vazio
                icon={Zap}
                titulo="Nenhum lead ainda"
                descricao="Compartilhe seu link de vendas ou cadastre um interessado em Meus Leads."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {ultimos.map((l) => {
                  const selo = SELO_STATUS_LEAD[l.status] ?? SELO_STATUS_LEAD.NOVO;
                  return (
                    <li key={l.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-slate-800">{l.nome}</p>
                        <p className="truncate text-[11px] text-slate-400">
                          {l.celular}
                          {l.placa && <span className="ml-1.5 font-mono uppercase">{l.placa}</span>}
                          {l.origem_hotlink && <span className="ml-1.5 text-cyan-600">via meu link</span>}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${selo.classe}`}>
                          {selo.rotulo}
                        </span>
                        <p className="tnum mt-0.5 text-[10.5px] text-slate-400">{formatDate(l.created_at)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link
              href="/vendedor/leads"
              className="mt-3 inline-block text-[12px] font-semibold text-brand-700 hover:underline"
            >
              Ver todos os meus leads &rarr;
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4 text-slate-400" /> Meu pagamento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-[12.5px] text-slate-600">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Adesao</p>
              <p className="mt-0.5">{percent(p?.taxa_adesao)} da adesao</p>
              {p?.dia_entrada && (
                <p className="text-[11px] text-slate-400">
                  Pago toda {rotuloDiaSemana(p.dia_entrada)}
                  {proximoSemanal && ` · proximo em ${formatDate(proximoSemanal.toISOString())}`}
                </p>
              )}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Recorrencia</p>
              <p className="mt-0.5">{percent(p?.taxa_recorrente)} da mensalidade</p>
              {p?.dia_recorrencia && (
                <p className="text-[11px] text-slate-400">
                  Pago todo dia {p.dia_recorrencia}
                  {proximoMensal && ` · proximo em ${formatDate(proximoMensal.toISOString())}`}
                </p>
              )}
            </div>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
              A adesao recebida por voce na hora fica integralmente com voce e nao entra neste
              extrato. O que aparece aqui e o que passa pelo financeiro da empresa.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
