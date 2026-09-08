'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Megaphone, Archive, Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select, Textarea } from '@/components/ui/field';
import { useRegionais } from '@/hooks/use-config';
import {
  useMemosGestao, useSalvarMemo, useArquivarMemo, type FormMemo,
} from '@/hooks/use-memos';
import { CATEGORIAS, PRIORIDADES, categoriaMeta, prioridadeMeta, resumoLeitura } from '@/lib/memos';
import { formatDate } from '@/lib/utils';

// Papeis que podem receber um comunicado enderecado. Espelha `papel_usuario`.
const PAPEIS: { valor: string; rotulo: string }[] = [
  { valor: 'admin', rotulo: 'Administrador' },
  { valor: 'gestor_regional', rotulo: 'Gestor Regional' },
  { valor: 'consultor_vendas', rotulo: 'Consultor de Vendas' },
  { valor: 'financeiro', rotulo: 'Financeiro' },
  { valor: 'sinistro', rotulo: 'Sinistro' },
  { valor: 'cotador', rotulo: 'Cotador' },
  { valor: 'auditoria', rotulo: 'Auditoria' },
  { valor: 'assistencia_24h', rotulo: 'Assistencia 24h' },
];

const vazio = (): FormMemo => ({
  titulo: '', mensagem: '', categoria: 'COMUNICADO', prioridade: 'MEDIA',
  exige_leitura: false, regional_id: null, papeis: null, expira_em: null, publicado: true,
});

export default function ComunicadosPage() {
  const { data: memos, isLoading } = useMemosGestao();
  const { data: regionais } = useRegionais();
  const salvar = useSalvarMemo();
  const arquivar = useArquivarMemo();
  const [form, setForm] = useState<FormMemo | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.titulo.trim()) return toast.error('Informe o titulo');
    if (!form.mensagem.trim()) return toast.error('Escreva a mensagem');
    salvar.mutate(form, {
      onSuccess: () => { toast.success('Comunicado publicado'); setForm(null); },
      onError: (err) => toast.error(err.message),
    });
  }

  function alternarPapel(papel: string, marcado: boolean) {
    setForm((f) => {
      if (!f) return f;
      const atuais = new Set(f.papeis ?? []);
      if (marcado) atuais.add(papel); else atuais.delete(papel);
      return { ...f, papeis: atuais.size ? [...atuais] : null };
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-500">
          Mural interno: comunicados, scripts de atendimento e avisos urgentes. Aparecem na{' '}
          <strong>Central do Atendente</strong> (tela do SAC, antes de buscar o associado) para quem
          for endereçado. Com <strong>leitura obrigatoria</strong>, ficam em destaque ate a pessoa dar
          ciencia — e voce acompanha quantos leram.
        </p>
        <Button onClick={() => setForm(vazio())}><Plus className="h-4 w-4" /> Novo comunicado</Button>
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
                      {m.papeis?.length
                        ? m.papeis.map((p) => PAPEIS.find((x) => x.valor === p)?.rotulo ?? p).join(', ')
                        : 'Todos os papeis'}
                    </span>
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

      <Modal open={!!form} onClose={() => setForm(null)} tamanho="lg"
        title={form?.id ? 'Editar comunicado' : 'Novo comunicado'}
        subtitulo="Aparece na Central do Atendente para quem voce endereçar.">
        {form && (
          <form onSubmit={submit} className="space-y-3">
            <FormField label="Titulo *">
              <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Ex.: Nova regra de cadastramento" />
            </FormField>
            <FormField label="Mensagem *">
              <Textarea rows={5} value={form.mensagem}
                onChange={(e) => setForm({ ...form, mensagem: e.target.value })}
                placeholder="O texto que a equipe vai ler no mural." />
            </FormField>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label="Categoria">
                <Select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                  {CATEGORIAS.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
                </Select>
              </FormField>
              <FormField label="Prioridade">
                <Select value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })}>
                  {PRIORIDADES.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
                </Select>
              </FormField>
              <FormField label="Vale ate (opcional)">
                <Input type="date" value={form.expira_em ?? ''}
                  onChange={(e) => setForm({ ...form, expira_em: e.target.value || null })} />
              </FormField>
            </div>

            <FormField label="Unidade">
              <Select value={form.regional_id ?? ''}
                onChange={(e) => setForm({ ...form, regional_id: e.target.value || null })}>
                <option value="">Todas as unidades</option>
                {(regionais ?? []).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
              </Select>
            </FormField>

            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-sm font-medium text-slate-600">Papeis destinatarios</p>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {PAPEIS.map((p) => (
                  <label key={p.valor} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={form.papeis?.includes(p.valor) ?? false}
                      onChange={(e) => alternarPapel(p.valor, e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300" />
                    {p.rotulo}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Nenhum marcado = todos os papeis recebem.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.exige_leitura}
                onChange={(e) => setForm({ ...form, exige_leitura: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300" />
              Exigir ciencia de leitura (fica em destaque ate a pessoa marcar como lido)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.publicado}
                onChange={(e) => setForm({ ...form, publicado: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300" />
              Publicado (desmarque para guardar sem mostrar no mural)
            </label>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
              <Button type="submit" disabled={salvar.isPending}>
                {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
                {form.id ? 'Salvar' : 'Publicar'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
