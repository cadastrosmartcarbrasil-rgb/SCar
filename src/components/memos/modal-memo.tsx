'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Megaphone, Loader2, Building2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select, Textarea } from '@/components/ui/field';
import { useRegionais } from '@/hooks/use-config';
import { opcoesParaEscolher } from '@/lib/regional';
import { useSalvarMemo, type FormMemo } from '@/hooks/use-memos';
import { CATEGORIAS, PRIORIDADES, PAPEIS_MEMO, PAPEIS_DIRETORIA } from '@/lib/memos';

// Os papeis endereçaveis moram em `src/lib/memos.ts` (o mural tambem os usa
// para escrever o destino do comunicado); reexportados aqui para as telas que
// ja os importavam deste arquivo.
export { PAPEIS_MEMO, PAPEIS_DIRETORIA };

export function memoVazio(): FormMemo {
  return {
    titulo: '', mensagem: '', categoria: 'COMUNICADO', prioridade: 'MEDIA',
    exige_leitura: false, regional_id: null, papeis: null, expira_em: null, publicado: true,
  };
}

/**
 * Formulario unico do comunicado — usado pela MATRIZ (Configuracoes >
 * Comunicados) e pela FRANQUIA (portal). O que muda e o alcance:
 *   . matriz  : escolhe unidade (ou todas) e os papeis livremente;
 *   . franquia: dois destinos, "minha equipe" ou "diretoria" — mesma regra que
 *               o banco aplica em `salvar_memo` (0056).
 */
export function ModalMemo({
  aberto, inicial, escopo, unidadeDaFranquia, onClose,
}: {
  aberto: boolean;
  inicial: FormMemo;
  escopo: 'matriz' | 'franquia';
  /** obrigatorio no escopo franquia: a unidade de quem publica */
  unidadeDaFranquia?: string | null;
  onClose: () => void;
}) {
  const salvar = useSalvarMemo();
  const { data: regionais } = useRegionais();
  const [form, setForm] = useState<FormMemo>(inicial);
  const [destino, setDestino] = useState<'EQUIPE' | 'DIRETORIA'>(
    inicial.regional_id ? 'EQUIPE' : inicial.papeis?.length ? 'DIRETORIA' : 'EQUIPE',
  );

  const franquia = escopo === 'franquia';

  function alternarPapel(papel: string, marcado: boolean) {
    setForm((f) => {
      const atuais = new Set(f.papeis ?? []);
      if (marcado) atuais.add(papel); else atuais.delete(papel);
      return { ...f, papeis: atuais.size ? [...atuais] : null };
    });
  }

  function escolherDestino(d: 'EQUIPE' | 'DIRETORIA') {
    setDestino(d);
    setForm((f) => d === 'DIRETORIA'
      ? { ...f, regional_id: null, papeis: PAPEIS_DIRETORIA }
      : { ...f, regional_id: unidadeDaFranquia ?? null, papeis: null });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titulo.trim()) return toast.error('Informe o titulo');
    if (!form.mensagem.trim()) return toast.error('Escreva a mensagem');

    // No portal da franquia o destino manda: ou a equipe da unidade, ou a
    // diretoria. O banco recusa qualquer outra combinacao, mas a tela nao deve
    // deixar a pessoa descobrir isso pelo erro.
    const payload: FormMemo = franquia
      ? destino === 'DIRETORIA'
        ? { ...form, regional_id: null, papeis: PAPEIS_DIRETORIA }
        : { ...form, regional_id: unidadeDaFranquia ?? null }
      : form;

    if (franquia && destino === 'EQUIPE' && !payload.regional_id) {
      return toast.error('Sua unidade nao foi identificada — recarregue o portal.');
    }

    salvar.mutate(payload, {
      onSuccess: () => { toast.success(form.id ? 'Comunicado salvo' : 'Comunicado publicado'); onClose(); },
      onError: (err) => toast.error(err.message),
    });
  }

  return (
    <Modal open={aberto} onClose={onClose} tamanho="lg"
      title={form.id ? 'Editar comunicado' : 'Novo comunicado'}
      subtitulo="Aparece na Central do Atendente de quem for endereçado.">
      <form onSubmit={submit} className="space-y-3">
        <FormField label="Titulo *">
          <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            placeholder="Ex.: Falta de material na unidade" />
        </FormField>
        <FormField label="Mensagem *">
          <Textarea rows={5} value={form.mensagem}
            onChange={(e) => setForm({ ...form, mensagem: e.target.value })}
            placeholder="O texto que a pessoa vai ler no mural." />
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

        {franquia ? (
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-2 text-sm font-medium text-slate-600">Para quem</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => escolherDestino('EQUIPE')}
                className={`flex items-start gap-2 rounded-lg border p-3 text-left transition ${
                  destino === 'EQUIPE' ? 'border-cyan-400 bg-cyan-50/40' : 'border-slate-200 hover:border-slate-300'}`}>
                <Users className="mt-0.5 h-4 w-4 text-cyan-600" />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">Minha equipe</span>
                  <span className="block text-[11px] text-slate-500">Quem trabalha nesta unidade</span>
                </span>
              </button>
              <button type="button" onClick={() => escolherDestino('DIRETORIA')}
                className={`flex items-start gap-2 rounded-lg border p-3 text-left transition ${
                  destino === 'DIRETORIA' ? 'border-cyan-400 bg-cyan-50/40' : 'border-slate-200 hover:border-slate-300'}`}>
                <Building2 className="mt-0.5 h-4 w-4 text-brand-600" />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">Diretoria / administracao</span>
                  <span className="block text-[11px] text-slate-500">A matriz (admin e financeiro)</span>
                </span>
              </button>
            </div>
            {destino === 'EQUIPE' && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-slate-500">
                  Papeis da equipe (nenhum marcado = todos)
                </p>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {PAPEIS_MEMO.filter((p) => !PAPEIS_DIRETORIA.includes(p.valor)).map((p) => (
                    <label key={p.valor} className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={form.papeis?.includes(p.valor) ?? false}
                        onChange={(e) => alternarPapel(p.valor, e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300" />
                      {p.rotulo}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <FormField label="Unidade">
              <Select value={form.regional_id ?? ''}
                onChange={(e) => setForm({ ...form, regional_id: e.target.value || null })}>
                <option value="">Todas as unidades</option>
                {opcoesParaEscolher(regionais, form.regional_id).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
              </Select>
            </FormField>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-sm font-medium text-slate-600">Papeis destinatarios</p>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {PAPEIS_MEMO.map((p) => (
                  <label key={p.valor} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={form.papeis?.includes(p.valor) ?? false}
                      onChange={(e) => alternarPapel(p.valor, e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300" />
                    {p.rotulo}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-400">Nenhum marcado = todos os papeis recebem.</p>
            </div>
          </>
        )}

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
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={salvar.isPending}>
            {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
            {form.id ? 'Salvar' : 'Publicar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
