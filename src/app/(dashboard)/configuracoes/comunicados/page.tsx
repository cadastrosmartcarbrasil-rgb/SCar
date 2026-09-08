'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Megaphone, Archive, Eye, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMemosGestao, useArquivarMemo, type FormMemo } from '@/hooks/use-memos';
import { ModalMemo, memoVazio } from '@/components/memos/modal-memo';
import { categoriaMeta, prioridadeMeta, resumoLeitura, papelMemoRotulo } from '@/lib/memos';
import { formatDate } from '@/lib/utils';

export default function ComunicadosPage() {
  const { data: memos, isLoading } = useMemosGestao();
  const arquivar = useArquivarMemo();
  const [form, setForm] = useState<FormMemo | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-500">
          Mural interno: comunicados, scripts de atendimento e avisos urgentes. Aparecem na{' '}
          <strong>Central do Atendente</strong> (tela do SAC, antes de buscar o associado) para quem
          for endereçado. Com <strong>leitura obrigatoria</strong>, ficam em destaque ate a pessoa dar
          ciencia — e voce acompanha quantos leram.
        </p>
        <Button onClick={() => setForm(memoVazio())}><Plus className="h-4 w-4" /> Novo comunicado</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Comunicado</th>
              <th className="px-4 py-2">Para quem</th>
              <th className="px-4 py-2">Ciencia</th>
              <th className="px-4 py-2">Publicado</th>
              <th className="px-4 py-2 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Carregando...</td></tr>}
            {(memos ?? []).map((m) => {
              const cat = categoriaMeta(m.categoria);
              const pri = prioridadeMeta(m.prioridade);
              return (
                <tr key={m.id} className={`border-b border-slate-50 last:border-0 ${m.publicado ? '' : 'opacity-60'}`}>
                  <td className="px-4 py-2">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cat.cor}`}>{cat.rotulo}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${pri.cor}`}>{pri.rotulo}</span>
                      {m.exige_leitura && (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                          ciencia obrigatoria
                        </span>
                      )}
                      {!m.publicado && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">arquivado</span>
                      )}
                    </span>
                    <span className="mt-1 block font-medium text-slate-800">{m.titulo}</span>
                    <span className="block max-w-xl truncate text-[11px] text-slate-400">{m.mensagem}</span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {m.regional ?? 'Todas as unidades'}
                    <span className="block text-[11px] text-slate-400">
                      {m.papeis?.length ? m.papeis.map(papelMemoRotulo).join(', ') : 'Todos os papeis'}
                    </span>
                    {/* endereço sem ninguem ativo: o comunicado nao chega a tela de
                        pessoa alguma, e isso precisa aparecer aqui e nao virar duvida */}
                    {m.destinatarios === 0 && (
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-rose-600">
                        <AlertTriangle className="h-3 w-3" /> nenhum usuario ativo neste endereço
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {m.exige_leitura ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Eye className="h-3.5 w-3.5 text-slate-400" />
                        {resumoLeitura(m.leituras, m.destinatarios)}
                      </span>
                    ) : (
                      <span className="text-slate-400">{m.leituras} leitura(s)</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {formatDate(m.publicado_em)}
                    {m.expira_em && <span className="block text-[11px] text-slate-400">ate {formatDate(m.expira_em)}</span>}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" className="px-2 py-1 text-xs"
                        onClick={() => setForm({
                          id: m.id, titulo: m.titulo, mensagem: m.mensagem, categoria: m.categoria,
                          prioridade: m.prioridade, exige_leitura: m.exige_leitura,
                          regional_id: m.regional_id, papeis: m.papeis,
                          expira_em: m.expira_em, publicado: m.publicado,
                        })}>
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </Button>
                      {m.publicado && (
                        <Button variant="ghost" className="px-2 py-1 text-xs"
                          onClick={() => arquivar.mutate(m.id, {
                            onSuccess: () => toast.success('Comunicado arquivado'),
                            onError: (e) => toast.error(e.message),
                          })}>
                          <Archive className="h-3.5 w-3.5" /> Arquivar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!isLoading && (memos ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                <Megaphone className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                Nenhum comunicado publicado ainda.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {form && (
        <ModalMemo aberto inicial={form} escopo="matriz" onClose={() => setForm(null)} />
      )}
    </div>
  );
}
