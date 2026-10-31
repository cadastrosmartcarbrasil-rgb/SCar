'use client';

import Link from 'next/link';
import { AlertTriangle, ChevronRight, Link2, Plus, UserRound } from 'lucide-react';
import { useTerceirosEvento } from '@/hooks/use-terceiros';
import { PAPEL_LABEL, STATUS_TERCEIRO, rotuloVinculo, terceiroPendente } from '@/lib/terceiros';
import { formatCurrency } from '@/lib/utils';
import type { StatusTerceiro } from '@/lib/database.types';

/** Faixa fixa no topo das telas do terceiro: "Terceiro do Evento X do Associado Y". */
export function VinculoTerceiro({
  codigo,
  protocolo,
  associado,
  eventoId,
}: {
  codigo: string | null;
  protocolo: string | null;
  associado: string | null;
  eventoId: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50/60 px-4 py-2.5 text-sm text-cyan-900">
      <Link2 className="h-4 w-4 shrink-0 text-cyan-600" />
      <span className="font-medium">
        {codigo ? rotuloVinculo(codigo, protocolo, associado) : `Novo terceiro · Evento ${protocolo ?? '-'} · Associado ${associado ?? '-'}`}
      </span>
      <Link href={`/eventos/${eventoId}`} className="ml-auto text-xs text-cyan-700 underline-offset-2 hover:underline">
        abrir evento
      </Link>
    </div>
  );
}

export function StatusTerceiroBadge({ status }: { status: StatusTerceiro }) {
  const s = STATUS_TERCEIRO[status];
  return <span className={`rounded-md border px-2 py-0.5 text-[0.6875rem] font-medium ${s.cor}`}>{s.label}</span>;
}

/** Aviso usado no topo do protocolo enquanto faltar cadastro de terceiro. */
export function AvisoTerceiroPendente({ eventoId, possuiTerceiros }: { eventoId: string; possuiTerceiros: boolean }) {
  const { data } = useTerceirosEvento(eventoId);
  if (!data || !terceiroPendente(possuiTerceiros, data.length)) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      Este evento informa terceiro(s) envolvido(s), mas nenhum foi cadastrado.
      <Link
        href={`/eventos/${eventoId}/terceiros/novo`}
        className="ml-auto rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700"
      >
        Cadastrar terceiro
      </Link>
    </div>
  );
}

/** Aba "Terceiros" do protocolo: lista e atalho para a tela propria de cada um. */
export function TerceirosEvento({ eventoId }: { eventoId: string }) {
  const { data, isLoading } = useTerceirosEvento(eventoId);
  const lista = data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Cada terceiro tem tela própria (dados, reparo e financeiro) e fica vinculado a este evento e ao associado.
        </p>
        <Link
          href={`/eventos/${eventoId}/terceiros/novo`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-acao px-3 py-1.5 text-sm font-medium text-white hover:bg-acao-escura"
        >
          <Plus className="h-4 w-4" /> Adicionar terceiro
        </Link>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400">Carregando...</p>
      ) : lista.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
          Nenhum terceiro cadastrado neste evento.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {lista.map((t) => (
            <li key={t.id}>
              <Link href={`/eventos/${eventoId}/terceiros/${t.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
                <UserRound className="h-4 w-4 text-brand-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">
                    <span className="mr-2 font-mono text-xs text-brand-600">{t.codigo}</span>
                    {t.nome}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t.papel ? PAPEL_LABEL[t.papel] : 'Papel a apurar'}
                    {t.veiculo_placa && ` · ${t.veiculo_placa}`}
                    {[t.veiculo_marca, t.veiculo_modelo].filter(Boolean).length > 0 && ` ${[t.veiculo_marca, t.veiculo_modelo].filter(Boolean).join(' ')}`}
                    {t.valor_estimado_danos != null && ` · danos est. ${formatCurrency(t.valor_estimado_danos)}`}
                  </p>
                </div>
                <StatusTerceiroBadge status={t.status} />
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
