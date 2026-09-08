'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Megaphone, Plus, Inbox, Send, Check, Archive, Pencil, Eye, Building2, Users, Loader2,
  AlertTriangle, MessagesSquare, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUnidadeAtual } from '@/components/regional/contexto-unidade';
import {
  useMeuMural, useMarcarMemoLido, useMemosGestao, useArquivarMemo, type FormMemo,
} from '@/hooks/use-memos';
import { ModalMemo, memoVazio, PAPEIS_DIRETORIA } from '@/components/memos/modal-memo';
import { categoriaMeta, prioridadeMeta, resumoLeitura, papelMemoRotulo, resumoRespostas } from '@/lib/memos';
import { ConversaMemo } from '@/components/memos/conversa-memo';
import { formatDate } from '@/lib/utils';

type Aba = 'recebidos' | 'enviados';

/**
 * Comunicados no portal da franquia.
 *
 * A unidade nao so RECEBE aviso da matriz: ela tambem precisa mandar recado —
 * para a propria equipe ("escala de sabado") e para a diretoria ("acabou o
 * material"). Sao os dois unicos destinos, e o banco (0056) aplica a mesma
 * regra: publicar para a unidade vizinha ou para o sistema inteiro continua
 * sendo coisa da matriz.
 */
export default function ComunicadosRegionalPage() {
  const { regionalId, nome } = useUnidadeAtual();
  const [aba, setAba] = useState<Aba>('recebidos');
  const [form, setForm] = useState<FormMemo | null>(null);
  const [conversa, setConversa] = useState<string | null>(null);

  const mural = useMeuMural();
  const enviados = useMemosGestao();
  const marcar = useMarcarMemoLido();
  const arquivar = useArquivarMemo();

  // "Recebidos" e o que CHEGOU para a unidade. O que o gestor mandou tem aba
  // propria — a RPC devolve os dois (0057) para que o autor nunca fique sem
  // retorno, e aqui a separacao ja existe na tela.
  const recebidos = (mural.data ?? []).filter((m) => !m.meu);
  const pendentes = recebidos.filter((m) => m.pendente_ciencia).length;

  const abas: { id: Aba; label: string; icon: React.ElementType; contador?: number }[] = [
    { id: 'recebidos', label: 'Recebidos', icon: Inbox, contador: pendentes },
    { id: 'enviados', label: 'Enviados pela unidade', icon: Send },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Comunicados</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {nome} — o que a matriz mandou para a unidade e o que a unidade mandou para a equipe ou
            para a diretoria.
          </p>
        </div>
        <Button onClick={() => setForm({ ...memoVazio(), regional_id: regionalId })}>
          <Plus className="h-4 w-4" /> Novo comunicado
        </Button>
      </header>

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {abas.map((a) => (
          <button key={a.id} onClick={() => setAba(a.id)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${
              aba === a.id ? 'border-brand-600 font-medium text-brand-700'
                           : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <a.icon className="h-4 w-4" /> {a.label}
            {!!a.contador && (
              <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">
                {a.contador}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------ recebidos */}
      {aba === 'recebidos' && (
        <div className="space-y-3">
          {mural.isLoading && <p className="text-sm text-slate-400">Carregando...</p>}
          {!mural.isLoading && recebidos.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
              Nenhum comunicado para voce agora.
            </p>
          )}
          {recebidos.map((m) => {
            const cat = categoriaMeta(m.categoria);
            const pri = prioridadeMeta(m.prioridade);
            return (
              <article key={m.id}
                className={`rounded-xl border p-4 ${m.pendente_ciencia ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-superficie'}`}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cat.cor}`}>{cat.rotulo}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${pri.cor}`}>{pri.rotulo}</span>
                  {m.exige_leitura && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                      ciencia obrigatoria
                    </span>
                  )}
                  {resumoRespostas(m.respostas, m.respostas_nao_lidas) && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      m.respostas_nao_lidas > 0
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-600'}`}>
                      {resumoRespostas(m.respostas, m.respostas_nao_lidas)}
                    </span>
                  )}
                </div>
                <h2 className="mt-1.5 text-sm font-semibold text-slate-800">{m.titulo}</h2>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{m.mensagem}</p>
                <p className="mt-2 text-[11px] text-slate-400">
                  {m.autor} · {formatDate(m.publicado_em)}
                  {m.expira_em ? ` · vale ate ${formatDate(m.expira_em)}` : ''}
                  {m.lido_em ? ' · ciencia dada' : ''}
                </p>
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Responder a quem enviou
                  </p>
                  <ConversaMemo memoId={m.id} modo="minha" compacta />
                </div>
                {m.pendente_ciencia && (
                  <button
                    onClick={() => marcar.mutate(m.id, {
                      onSuccess: () => toast.success('Ciencia registrada'),
                      onError: (e) => toast.error(e.message),
                    })}
                    disabled={marcar.isPending}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-acao px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-acao-escura disabled:opacity-60">
                    {marcar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Marcar como lido
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------- enviados */}
      {aba === 'enviados' && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="px-4 py-2">Comunicado</th>
                <th className="px-4 py-2">Para quem</th>
                <th className="px-4 py-2">Ciencia</th>
                <th className="px-4 py-2 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {enviados.isLoading && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Carregando...</td></tr>
              )}
              {(enviados.data ?? []).map((m) => {
                const cat = categoriaMeta(m.categoria);
                const paraDiretoria = !m.regional_id
                  && !!m.papeis?.length
                  && m.papeis.every((p) => PAPEIS_DIRETORIA.includes(p));
                return (
                  <tr key={m.id} className={`border-b border-slate-50 last:border-0 ${m.publicado ? '' : 'opacity-60'}`}>
                    <td className="px-4 py-2">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cat.cor}`}>{cat.rotulo}</span>
                        {m.exige_leitura && (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                            ciencia
                          </span>
                        )}
                        {!m.publicado && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">arquivado</span>
                        )}
                      </span>
                      <span className="mt-1 block font-medium text-slate-800">{m.titulo}</span>
                      <span className="block max-w-md truncate text-[11px] text-slate-400">{m.mensagem}</span>
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {paraDiretoria ? (
                        <span className="inline-flex items-center gap-1.5 text-brand-700">
                          <Building2 className="h-3.5 w-3.5" /> Diretoria / administracao
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-cyan-600" /> {m.regional ?? 'Todas as unidades'}
                        </span>
                      )}
                      <span className="block text-[11px] text-slate-400">
                        {m.papeis?.length ? m.papeis.map(papelMemoRotulo).join(', ') : 'Todos os papeis'}
                      </span>
                      {m.destinatarios === 0 && (
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-rose-600">
                          <AlertTriangle className="h-3 w-3" /> nenhum usuario ativo neste endereço
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <Eye className="h-3.5 w-3.5 text-slate-400" />
                        {resumoLeitura(m.leituras, m.destinatarios)}
                      </span>
                      <button
                        onClick={() => setConversa(conversa === m.id ? null : m.id)}
                        className={`mt-1 flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-[11px] transition ${
                          m.respostas_nao_lidas > 0
                            ? 'bg-amber-50 font-medium text-amber-800 hover:bg-amber-100'
                            : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                        <MessagesSquare className="h-3 w-3" />
                        {resumoRespostas(m.respostas, m.respostas_nao_lidas) ?? 'Sem resposta'}
                        {conversa === m.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
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
              {/* Quem a unidade mandou o recado ja pode ter devolvido — a conversa
                  abre aqui mesmo, sem sair da aba de enviados. */}
              {(enviados.data ?? []).filter((m) => m.id === conversa).map((m) => (
                <tr key={`${m.id}-conversa`} className="border-b border-slate-50 bg-fundo/60">
                  <td colSpan={4} className="px-4 py-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Conversa · {m.titulo}
                    </p>
                    <ConversaMemo memoId={m.id} modo="autor" />
                  </td>
                </tr>
              ))}
              {!enviados.isLoading && (enviados.data ?? []).length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  <Megaphone className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                  A unidade ainda nao enviou nenhum comunicado.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <ModalMemo aberto inicial={form} escopo="franquia" unidadeDaFranquia={regionalId}
          onClose={() => setForm(null)} />
      )}
    </div>
  );
}
