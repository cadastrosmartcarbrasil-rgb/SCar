'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Car, Phone, Lock, Percent, GripVertical } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/field';
import { useLeadsKanban, useMoverLead } from '@/hooks/use-vendas';
import { COLUNAS_KANBAN, colunaDoLead, podeArrastar, podeSoltarEm, exigeMotivo, STATUS_LEAD } from '@/lib/crm';
import { formatCurrency } from '@/lib/utils';
import type { LeadKanban, StatusKanban } from '@/lib/database.types';

// Quadro Kanban do funil de vendas com drag-and-drop nativo (HTML5), sem
// dependencia externa. O drop chama `mover_lead_status`, que valida a transicao
// no banco e grava a trilha.
export function KanbanVendas() {
  const { data: leads, isLoading } = useLeadsKanban();
  const mover = useMoverLead();
  const [arrastando, setArrastando] = useState<LeadKanban | null>(null);
  const [sobre, setSobre] = useState<StatusKanban | null>(null);
  const [perda, setPerda] = useState<{ lead: LeadKanban; motivo: string } | null>(null);

  const porColuna = useMemo(() => {
    const mapa = new Map<StatusKanban, LeadKanban[]>();
    COLUNAS_KANBAN.forEach((c) => mapa.set(c.id, []));
    (leads ?? []).forEach((l) => {
      const col = colunaDoLead(l.status);
      mapa.get(col)?.push(l);
    });
    return mapa;
  }, [leads]);

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
      setPerda({ lead, motivo: '' });
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
                    Arraste um lead para ca
                  </p>
                )}
                {itens.map((l) => {
                  const travado = !podeArrastar(l.status);
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

      {/* Perda exige motivo */}
      <Modal open={!!perda} onClose={() => setPerda(null)} title="Marcar lead como perdido">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!perda?.motivo.trim()) return toast.error('Informe o motivo da perda');
            mover.mutate(
              { id: perda.lead.id, status: 'PERDIDO', obs: perda.motivo },
              {
                onSuccess: () => { toast.success('Lead marcado como perdido'); setPerda(null); },
                onError: (e2) => toast.error(e2.message),
              },
            );
          }}
          className="space-y-3"
        >
          <p className="text-sm text-slate-600">
            {perda?.lead.nome} — o motivo fica no historico do lead.
          </p>
          <FormField label="Motivo da perda">
            <Input
              autoFocus
              value={perda?.motivo ?? ''}
              onChange={(e) => setPerda((p) => (p ? { ...p, motivo: e.target.value } : p))}
              placeholder="Ex.: fechou com concorrente / sem interesse"
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setPerda(null)}>Voltar</Button>
            <Button type="submit" variant="danger" disabled={mover.isPending}>Marcar como perdido</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
