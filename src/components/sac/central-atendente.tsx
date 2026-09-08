'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Ticket, Megaphone, Siren, ArrowRight, Check, ChevronDown, ChevronUp, LifeBuoy,
  Loader2, BellRing,
} from 'lucide-react';
import { useMeuMural, useMarcarMemoLido, useAcionamentosAbertos } from '@/hooks/use-memos';
import { useProtocolos, useResumoProtocolos } from '@/hooks/use-protocolos';
import { categoriaMeta, prioridadeMeta, pendenteCiencia, destinoDoMemo } from '@/lib/memos';
import { STATUS_ATENDIMENTO_LABEL } from '@/lib/sac-servicos';
import { formatDate } from '@/lib/utils';

/**
 * CENTRAL DO ATENDENTE — o que a tela do SAC mostra ENQUANTO ninguem foi
 * buscado. Antes esse espaco (o maior da tela) ficava com uma frase cinza.
 *
 * Tres perguntas, na ordem em que a operacao precisa delas:
 *   1. o que esta na MINHA mao agora?      -> protocolos direcionados a mim
 *   2. o que a gestao MANDOU?              -> mural de comunicados e scripts
 *   3. o que esta pegando fogo?            -> 24h em aberto e fila parada
 *
 * Assim que um associado e selecionado, esta area sai de cena e a ficha assume
 * — o atendimento continua focado na pessoa.
 */
export function CentralAtendente({ usuarioId }: { usuarioId?: string | null }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
      <div className="space-y-4">
        <MeusProtocolos usuarioId={usuarioId} />
        <QuadroAlertas />
      </div>
      <MuralDaGestao />
    </div>
  );
}

// ---------------------------------------------------------------- bloco 1
function MeusProtocolos({ usuarioId }: { usuarioId?: string | null }) {
  // So o que esta na mao DESTE atendente, e so o que ainda esta aberto.
  const { data: todos, isLoading } = useProtocolos(
    usuarioId ? { responsavel: usuarioId, status: 'ABERTOS' } : {},
  );
  const protocolos = usuarioId ? (todos ?? []).slice(0, 8) : [];

  return (
    <section className="rounded-2xl border border-slate-200 bg-superficie">
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Ticket className="h-4 w-4 text-violet-600" /> Meus protocolos
        </p>
        <Link href="/protocolos" className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:underline">
          Central <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      <div className="divide-y divide-slate-50">
        {isLoading && <p className="px-4 py-6 text-center text-sm text-slate-400">Carregando...</p>}
        {!isLoading && protocolos.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-slate-400">
            Nenhum protocolo direcionado a voce. Bom sinal.
          </p>
        )}
        {protocolos.map((p) => (
          <Link key={p.id} href={`/protocolos?protocolo=${p.id}`}
            className="flex items-center justify-between gap-3 px-4 py-2.5 transition hover:bg-cyan-50/40">
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-xs font-semibold text-slate-700">{p.protocolo}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  p.prioridade === 'URGENTE' || p.prioridade === 'ALTA'
                    ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                  {p.prioridade}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${
                  STATUS_ATENDIMENTO_LABEL[p.status]?.cor ?? 'bg-slate-100 text-slate-600'}`}>
                  {STATUS_ATENDIMENTO_LABEL[p.status]?.label ?? p.status}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-sm text-slate-700">{p.assunto}</span>
              <span className="block truncate text-[11px] text-slate-400">
                {p.associado}{p.placa ? ` · ${p.placa}` : ''}
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
          </Link>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- bloco 2
function MuralDaGestao() {
  const { data: memos, isLoading } = useMeuMural();
  const marcar = useMarcarMemoLido();
  const [aberto, setAberto] = useState<string | null>(null);

  const pendentes = (memos ?? []).filter(pendenteCiencia).length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-superficie">
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Megaphone className="h-4 w-4 text-cyan-600" /> Mural da gestao
        </p>
        {pendentes > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
            <BellRing className="h-3 w-3" /> {pendentes} aguardando ciencia
          </span>
        )}
      </header>

      <div className="divide-y divide-slate-50">
        {isLoading && <p className="px-4 py-6 text-center text-sm text-slate-400">Carregando...</p>}
        {!isLoading && (memos ?? []).length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-slate-400">
            Nenhum comunicado publicado.
          </p>
        )}
        {(memos ?? []).map((m) => {
          const cat = categoriaMeta(m.categoria);
          const pri = prioridadeMeta(m.prioridade);
          const expandido = aberto === m.id;
          const precisaCiencia = m.pendente_ciencia;
          return (
            <article key={m.id} className={precisaCiencia ? 'bg-amber-50/40' : ''}>
              <button onClick={() => setAberto(expandido ? null : m.id)}
                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cat.cor}`}>{cat.rotulo}</span>
                    {m.prioridade !== 'BAIXA' && (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${pri.cor}`}>{pri.rotulo}</span>
                    )}
                    {m.meu && (
                      <span className="rounded bg-cyan-50 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700">
                        voce publicou
                      </span>
                    )}
                    {(m.regional || m.papeis?.length) && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                        {destinoDoMemo(m.regional, m.papeis)}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-slate-800">{m.titulo}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-400">
                    {/* no proprio comunicado, o que interessa e para QUEM ele foi */}
                    {m.meu ? `Para ${destinoDoMemo(m.regional, m.papeis)}` : m.autor}
                    {' · '}{formatDate(m.publicado_em)}
                    {m.lido_em ? ' · ciencia dada' : ''}
                  </span>
                </span>
                {expandido ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
                           : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
              </button>

              {expandido && (
                <div className="px-4 pb-3">
                  <p className="whitespace-pre-wrap rounded-lg bg-fundo p-3 text-sm leading-relaxed text-slate-700">
                    {m.mensagem}
                  </p>
                  {m.expira_em && (
                    <p className="mt-1 text-[11px] text-slate-400">Vale ate {formatDate(m.expira_em)}.</p>
                  )}
                </div>
              )}

              {precisaCiencia && (
                <div className="px-4 pb-3">
                  <button
                    onClick={() => marcar.mutate(m.id, {
                      onSuccess: () => toast.success('Ciencia registrada'),
                      onError: (e) => toast.error(e.message),
                    })}
                    disabled={marcar.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-acao px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-acao-escura disabled:opacity-60"
                  >
                    {marcar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Marcar como lido
                  </button>
                  <span className="ml-2 text-[11px] text-slate-500">Leitura obrigatoria.</span>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- bloco 3
function QuadroAlertas() {
  const { data: resumo } = useResumoProtocolos();
  const { data: acionamentos, isLoading } = useAcionamentosAbertos();

  const urgentes = Number(resumo?.urgentes ?? 0);
  const parados = Number(resumo?.mais_7_dias ?? 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-superficie">
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Siren className="h-4 w-4 text-rose-600" /> Alertas do dia
        </p>
      </header>

      <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
        <Numero titulo="24h em aberto" valor={(acionamentos ?? []).length} href="/assistencia" tom="rose" />
        <Numero titulo="Alta / urgente" valor={urgentes} href="/protocolos" tom={urgentes > 0 ? 'rose' : 'neutro'} />
        <Numero titulo="Parados +7 dias" valor={parados} href="/protocolos" tom={parados > 0 ? 'amber' : 'neutro'} />
      </div>

      <div className="divide-y divide-slate-50">
        {isLoading && <p className="px-4 py-5 text-center text-sm text-slate-400">Carregando...</p>}
        {!isLoading && (acionamentos ?? []).length === 0 && (
          <p className="px-4 py-5 text-center text-sm text-slate-400">
            Nenhum acionamento da 24h em aberto agora.
          </p>
        )}
        {(acionamentos ?? []).map((a) => {
          const veiculo = a.veiculos as { placa?: string } | null;
          const cliente = a.clientes as { nome_razao_social?: string } | null;
          return (
            <Link key={a.id} href="/assistencia"
              className="flex items-center justify-between gap-3 px-4 py-2.5 transition hover:bg-rose-50/40">
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <LifeBuoy className="h-3.5 w-3.5 text-amber-500" />
                  <span className="font-mono text-xs font-semibold text-slate-700">{a.protocolo}</span>
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                    {a.status}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                  {veiculo?.placa ?? 'sem placa'} · {cliente?.nome_razao_social ?? ''}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Numero({ titulo, valor, href, tom }: {
  titulo: string; valor: number; href: string; tom: 'rose' | 'amber' | 'neutro';
}) {
  const cor = tom === 'rose' ? 'text-rose-600' : tom === 'amber' ? 'text-amber-600' : 'text-slate-800';
  return (
    <Link href={href} className="px-4 py-3 transition hover:bg-slate-50">
      <p className="text-[10.5px] uppercase tracking-wide text-slate-400">{titulo}</p>
      <p className={`tnum mt-0.5 text-xl font-bold ${cor}`}>{valor}</p>
    </Link>
  );
}
