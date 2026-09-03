'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Car, Phone, Lock, Percent, GripVertical, AlarmClock, Hourglass } from 'lucide-react';
import { useLeadsKanban, useMoverLead } from '@/hooks/use-vendas';
import {
  COLUNAS_KANBAN, colunaDoLead, podeArrastar, podeSoltarEm, exigeMotivo, leadCasaComBusca, STATUS_LEAD,
} from '@/lib/crm';
import { rotuloParado, rotuloRetorno, riscoDevolucao, SELO_AGENDA, situacaoAgenda } from '@/lib/agenda';
import { formatCurrency } from '@/lib/utils';
import { ModalPerda } from './modal-perda';
import type { LeadKanban, StatusKanban } from '@/lib/database.types';

// Quadro Kanban do funil de vendas com drag-and-drop nativo (HTML5), sem
// dependencia externa. O drop chama `mover_lead_status`, que valida a transicao
// no banco e grava a trilha.
export function KanbanVendas({ busca, consultorId }: { busca?: string; consultorId?: string | null } = {}) {
  // O dono do lead filtra no banco (a RPC ja aceita o consultor); a busca
  // filtra o que ja esta na tela, para responder a cada tecla sem refazer a
  // consulta. Ver o comentario em `filtroBuscaLeads`.
  const { data: leads, isLoading } = useLeadsKanban({ consultorId: consultorId ?? null });
  const mover = useMoverLead();
  const [arrastando, setArrastando] = useState<LeadKanban | null>(null);
  const [sobre, setSobre] = useState<StatusKanban | null>(null);
  const [perda, setPerda] = useState<LeadKanban | null>(null);

  const porColuna = useMemo(() => {
    const mapa = new Map<StatusKanban, LeadKanban[]>();
    COLUNAS_KANBAN.forEach((c) => mapa.set(c.id, []));
    (leads ?? [])
      .filter((l) => leadCasaComBusca(l, busca ?? ''))
      .forEach((l) => {
        const col = colunaDoLead(l.status);
        mapa.get(col)?.push(l);
      });
    return mapa;
  }, [leads, busca]);

  const emTela = [...porColuna.values()].reduce((n, l) => n + l.length, 0);

  function soltar(destino: StatusKanban) {
    const lead = arrastando;
    setArrastando(null);
    setSobre(null);
    if (!lead) return;
    if (!podeSoltarEm(lead.status, destino)) {
      if (!podeArrastar(lead.status)) toast.error('Lead em auditoria — trate pela Auditoria');
      return;
    }
    if (exigeMotivo(destino)) {
      setPerda(lead);
      return;
    }
    mover.mutate(
      { id: lead.id, status: destino },
      {
        onSuccess: (l) => toast.success(`${lead.nome} → ${STATUS_LEAD[l.status].label}`),
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <>
      {!isLoading && busca && emTela === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">
          Nenhum lead do quadro casa com &quot;{busca}&quot;.
        </p>
      )}

      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        {COLUNAS_KANBAN.map((coluna) => {
          const itens = porColuna.get(coluna.id) ?? [];
          const total = itens.reduce((s, l) => s + Number(l.total_com_desconto ?? l.total_mensalidade ?? 0), 0);
          return (
            <div
              key={coluna.id}
              onDragOver={(e) => { e.preventDefault(); setSobre(coluna.id); }}
              onDragLeave={() => setSobre((s) => (s === coluna.id ? null : s))}
              onDrop={(e) => { e.preventDefault(); soltar(coluna.id); }}
              className={`flex w-72 shrink-0 flex-col rounded-2xl border-t-4 bg-slate-50/70 ${coluna.cor} ${
                sobre === coluna.id ? 'ring-2 ring-cyan-400' : ''
              }`}
            >
              <div className="px-3 py-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">{coluna.titulo}</p>
                  <span className="rounded-full bg-superficie px-2 py-0.5 text-xs text-slate-500">{itens.length}</span>
                </div>
                <p className="text-[11px] text-slate-400">{coluna.descricao}</p>
                {total > 0 && (
                  <p className="tnum mt-0.5 text-xs font-medium text-slate-600">{formatCurrency(total)}/mes</p>
                )}
              </div>

              <div className="flex-1 space-y-2 p-2">
                {isLoading && <p className="px-1 text-xs text-slate-400">Carregando...</p>}
                {!isLoading && itens.length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-200 px-2 py-6 text-center text-xs text-slate-400">
                    {busca ? 'Nada aqui para a busca' : 'Arraste um lead para ca'}
                  </p>
                )}
                {itens.map((l) => {
                  const travado = !podeArrastar(l.status);
                  // Tempo: o que o gestor precisa ver sem abrir o lead.
                  const agenda = situacaoAgenda(l.proximo_contato_em);
                  const esfriando = riscoDevolucao(l.dias_parado, l.limite_sem_contato)
                    && l.status !== 'PERDIDO' && !travado;
                  return (
                    <div
                      key={l.id}
                      draggable={!travado}
                      onDragStart={() => setArrastando(l)}
                      onDragEnd={() => { setArrastando(null); setSobre(null); }}
                      className={`rounded-xl border border-slate-200 bg-superficie p-2.5 shadow-sm ${
                        travado ? 'opacity-80' : 'cursor-grab active:cursor-grabbing'
                      } ${arrastando?.id === l.id ? 'opacity-40' : ''}`}
                    >
                      <div className="flex items-start gap-1.5">
                        {travado ? (
                          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                        ) : (
                          <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
                        )}
                        <div className="min-w-0 flex-1">
                          <Link href={`/vendas/${l.id}`} className="block truncate text-sm font-medium text-slate-900 hover:text-brand-700">
                            {l.nome}
                          </Link>
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                            <Phone className="h-3 w-3" /> {l.celular}
                          </p>
                          {(l.marca || l.modelo) && (
                            <p className="flex items-center gap-1 truncate text-[11px] text-slate-500">
                              <Car className="h-3 w-3" /> {[l.marca, l.modelo].filter(Boolean).join(' ')}
                              {l.placa ? ` · ${l.placa}` : ''}
                            </p>
                          )}
                          {l.total_mensalidade != null && (
                            <p className="tnum mt-1 text-xs font-semibold text-slate-700">
                              {formatCurrency(Number(l.total_com_desconto ?? l.total_mensalidade))}
                              <span className="font-normal text-slate-400">/mes</span>
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {Number(l.desconto_percentual ?? 0) > 0 && (
                              <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] ${
                                l.desconto_aprovado ? 'bg-violet-50 text-violet-700' : 'bg-emerald-50 text-emerald-700'
                              }`}>
                                <Percent className="h-2.5 w-2.5" />
                                {Number(l.desconto_percentual).toFixed(2).replace('.', ',')}%
                                {l.desconto_aprovado ? ' (excecao)' : ''}
                              </span>
                            )}
                            {l.status !== colunaDoLead(l.status) && (
                              <span className={`rounded px-1.5 py-0.5 text-[10px] ${STATUS_LEAD[l.status].cor}`}>
                                {STATUS_LEAD[l.status].curto}
                              </span>
                            )}
                            {l.consultor && <span className="text-[10px] text-slate-400">{l.consultor}</span>}
                          </div>

                          {/* Tempo do lead: retorno combinado e ha quanto esta parado */}
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {agenda !== 'SEM_AGENDA' && (
                              <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${SELO_AGENDA[agenda].cor}`}>
                                <AlarmClock className="h-2.5 w-2.5" />
                                {rotuloRetorno(l.proximo_contato_em)}
                              </span>
                            )}
                            {!travado && (
                              <span
                                title={esfriando
                                  ? `Sem contato ha ${l.dias_parado} dias — a unidade devolve ao pool com ${l.limite_sem_contato}`
                                  : undefined}
                                className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] ${
                                  esfriando ? 'bg-rose-50 font-medium text-rose-700' : 'text-slate-400'
                                }`}
                              >
                                <Hourglass className="h-2.5 w-2.5" />
                                {rotuloParado(l.dias_parado)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Perda exige motivo — mesma janela que a ficha do lead usa */}
      {perda && <ModalPerda lead={perda} onClose={() => setPerda(null)} />}
    </>
  );
}
