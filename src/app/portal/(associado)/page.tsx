'use client';

import Link from 'next/link';
import { AlertTriangle, Car, CheckCircle2, Receipt, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { usePortalFinanceiro, usePortalPerfil, usePortalVeiculos } from '@/hooks/use-portal';
import { formatCurrency, formatDate } from '@/lib/utils';
import { STATUS_VEICULO_LABEL } from '@/types/domain';

const COR_STATUS: Record<string, string> = {
  ativo: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  em_evento: 'bg-amber-50 text-amber-800 ring-amber-200',
  vistoria_pendente: 'bg-sky-50 text-sky-700 ring-sky-200',
  suspenso: 'bg-rose-50 text-rose-700 ring-rose-200',
  inativo: 'bg-slate-100 text-slate-500 ring-slate-200',
  baixado: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export default function PortalVeiculosPage() {
  const { data: perfil } = usePortalPerfil();
  const { data: veiculos, isLoading } = usePortalVeiculos();
  const { data: fin } = usePortalFinanceiro();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[22px] font-bold tracking-tight text-brand-800">
          Ola, {perfil?.nome?.split(' ')[0] ?? 'associado'}
        </h1>
        <p className="mt-0.5 text-[13px] text-slate-500">
          {perfil?.associado_desde
            ? `Associado desde ${formatDate(perfil.associado_desde)}.`
            : 'Bem-vindo a sua area.'}
        </p>
      </header>

      {/* Situacao: e a primeira coisa que o associado quer saber. */}
      {fin && (
        <Link href="/portal/financeiro" className="block">
          <Card className={fin.em_dia ? '' : 'ring-1 ring-rose-200'}>
            <CardContent className="flex items-center gap-3 p-4">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
                fin.em_dia ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                {fin.em_dia ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-brand-800">
                  {fin.em_dia ? 'Voce esta em dia' : `${fin.qtd_vencidos} boleto(s) em atraso`}
                </p>
                <p className="text-[12px] text-slate-500">
                  {fin.em_dia
                    ? fin.proximo_vencimento
                      ? `Proximo vencimento em ${formatDate(fin.proximo_vencimento)} · ${formatCurrency(fin.proximo_valor ?? 0)}`
                      : 'Sem boletos em aberto.'
                    : `${formatCurrency(fin.vencido)} vencidos · toque para ver e pagar`}
                </p>
              </div>
              <Receipt className="h-4 w-4 shrink-0 text-slate-300" />
            </CardContent>
          </Card>
        </Link>
      )}

      <div>
        <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-500">
          <Car className="h-3.5 w-3.5" /> Veiculos protegidos
        </h2>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-superficie" />)}
          </div>
        ) : (veiculos ?? []).length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <ShieldCheck className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-[13px] text-slate-500">
                Nenhum veiculo na sua protecao ainda.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {(veiculos ?? []).map((v) => (
              <li key={v.id} className="rounded-2xl border border-slate-200/80 bg-superficie p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[17px] font-bold uppercase tracking-wider text-brand-800">
                      {v.placa}
                    </p>
                    <p className="text-[13px] text-slate-600">
                      {[v.marca, v.modelo].filter(Boolean).join(' ') || 'Veiculo'}
                      {v.ano_modelo ? ` · ${v.ano_modelo}` : ''}
                    </p>
                    {v.plano_nome && (
                      <p className="mt-0.5 text-[11.5px] text-slate-400">{v.plano_nome}</p>
                    )}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                    COR_STATUS[v.status] ?? COR_STATUS.inativo}`}>
                    {STATUS_VEICULO_LABEL[v.status as keyof typeof STATUS_VEICULO_LABEL] ?? v.status}
                  </span>
                </div>

                {(v.mensalidade || v.dia_vencimento) && (
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 pt-2.5 text-[12px]">
                    {v.mensalidade ? (
                      <span className="text-slate-500">
                        Mensalidade <b className="tnum text-slate-800">{formatCurrency(v.mensalidade)}</b>
                      </span>
                    ) : null}
                    {v.dia_vencimento ? (
                      <span className="text-slate-500">
                        Vence todo dia <b className="tnum text-slate-800">{v.dia_vencimento}</b>
                      </span>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
