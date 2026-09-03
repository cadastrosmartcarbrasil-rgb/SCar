'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select, Textarea } from '@/components/ui/field';
import { useTiposAlerta, useSaveTipoAlerta } from '@/hooks/use-veiculo-ficha';
import type { SeveridadeAlerta, TiposAlertaRow } from '@/lib/database.types';

const SEV: Record<SeveridadeAlerta, string> = {
  ALTA: 'bg-rose-50 text-rose-700',
  MEDIA: 'bg-amber-50 text-amber-700',
  BAIXA: 'bg-slate-100 text-slate-600',
};

export default function AlertasPage() {
  const { data: alertas, isLoading } = useTiposAlerta(true);
  const salvar = useSaveTipoAlerta();
  const [aberto, setAberto] = useState(false);
  const [ed, setEd] = useState<Partial<TiposAlertaRow> | null>(null);

  function novo() {
    setEd({ nome: '', descricao: '', severidade: 'MEDIA', ativo: true });
    setAberto(true);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ed?.nome?.trim()) return toast.error('Informe o nome do alerta');
    salvar.mutate(ed, {
      onSuccess: () => { toast.success('Alerta salvo'); setAberto(false); },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="max-w-2xl text-sm text-slate-500">
          Alertas reutilizaveis (ex.: falta de documentos, atualizar cadastro). Depois de cadastrados,
          podem ser vinculados a qualquer veiculo e abrem automaticamente no SAC.
        </p>
        <Button onClick={novo}><Plus className="h-4 w-4" /> Novo Alerta</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Alerta</th>
              <th className="px-4 py-2">Severidade</th>
              <th className="px-4 py-2">Descricao</th>
              <th className="px-4 py-2">Ativo</th>
              <th className="px-4 py-2 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Carregando...</td></tr>}
            {(alertas ?? []).map((a) => (
              <tr key={a.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2 font-medium text-slate-800"><span className="inline-flex items-center gap-2"><Bell className="h-4 w-4 text-amber-500" /> {a.nome}</span></td>
                <td className="px-4 py-2"><span className={`rounded px-2 py-0.5 text-xs font-medium ${SEV[a.severidade]}`}>{a.severidade}</span></td>
                <td className="px-4 py-2 text-slate-500">{a.descricao ?? '—'}</td>
                <td className="px-4 py-2">{a.ativo ? <span className="text-emerald-600">Sim</span> : <span className="text-slate-400">Nao</span>}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => { setEd(a); setAberto(true); }} className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
            {!isLoading && (alertas ?? []).length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Nenhum alerta cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={aberto} onClose={() => setAberto(false)} title={ed?.id ? 'Editar Alerta' : 'Novo Alerta'}>
        <form onSubmit={submit} className="space-y-3">
          <FormField label="Nome *">
            <Input value={ed?.nome ?? ''} onChange={(e) => setEd((p) => ({ ...p, nome: e.target.value }))} placeholder="Ex.: Falta de documentos" />
          </FormField>
          <FormField label="Severidade">
            <Select value={ed?.severidade ?? 'MEDIA'} onChange={(e) => setEd((p) => ({ ...p, severidade: e.target.value as SeveridadeAlerta }))}>
              <option value="ALTA">Alta</option>
              <option value="MEDIA">Media</option>
              <option value="BAIXA">Baixa</option>
            </Select>
          </FormField>
          <FormField label="Descricao">
            <Textarea rows={2} value={ed?.descricao ?? ''} onChange={(e) => setEd((p) => ({ ...p, descricao: e.target.value }))} />
          </FormField>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={ed?.ativo ?? true} onChange={(e) => setEd((p) => ({ ...p, ativo: e.target.checked }))} className="h-4 w-4 rounded border-slate-300" />
            Ativo
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button type="submit" disabled={salvar.isPending}>{salvar.isPending ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
