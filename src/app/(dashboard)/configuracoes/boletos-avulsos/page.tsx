'use client';

// Tipos de BOLETO AVULSO do SAC (0150). Cada tipo leva a conta do plano de
// contas em que o DRE lanca o recebimento. Tipo ja usado nao se apaga: inativa
// (sai do SAC e continua nos relatorios).
import { useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select } from '@/components/ui/field';
import { usePlanoContas } from '@/hooks/use-config';
import { useSalvarTipoBoletoAvulso, useTiposBoletoAvulso, type TipoBoletoAvulso } from '@/hooks/use-renegociacao';

type Edicao = { id?: string; nome: string; categoria_dre_id: string; exige_veiculo: boolean; ativo: boolean; ordem: number };

export default function BoletosAvulsosPage() {
  const tipos = useTiposBoletoAvulso();
  const { data: contas } = usePlanoContas();
  const salvar = useSalvarTipoBoletoAvulso();
  const [ed, setEd] = useState<Edicao | null>(null);
  const receitas = (contas ?? []).filter((c) => c.tipo === 'RECEITA' && c.ativo);

  function editar(t: TipoBoletoAvulso) {
    setEd({ id: t.id, nome: t.nome, categoria_dre_id: t.categoria_dre_id ?? '', exige_veiculo: t.exige_veiculo, ativo: t.ativo, ordem: t.ordem });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ed) return;
    if (ed.nome.trim().length < 2) return toast.error('Informe o nome do tipo.');
    salvar.mutate(
      { ...ed, categoria_dre_id: ed.categoria_dre_id || null },
      {
        onSuccess: () => { toast.success('Tipo salvo'); setEd(null); },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  const proxima = Math.max(0, ...(tipos.data ?? []).map((t) => t.ordem)) + 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-500">
          Tipos oferecidos no SAC em <b>Emitir boleto avulso</b> (o que não é mensalidade). A conta do plano de
          contas decide onde o DRE lança o recebimento. Tipo já usado não se exclui: inative para tirá-lo do SAC.
        </p>
        <Button onClick={() => setEd({ nome: '', categoria_dre_id: '', exige_veiculo: false, ativo: true, ordem: proxima })}>
          <Plus className="h-4 w-4" /> Novo tipo
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Ordem</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Conta do DRE</th>
              <th className="px-4 py-2">Veículo</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {tipos.isLoading && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Carregando...</td></tr>}
            {(tipos.data ?? []).map((t) => (
              <tr key={t.id} className="border-b border-slate-50 last:border-0">
                <td className="tnum px-4 py-2 text-slate-500">{t.ordem}</td>
                <td className="px-4 py-2 font-medium text-slate-800">{t.nome}</td>
                <td className="px-4 py-2 text-slate-600">
                  {t.categorias_dre
                    ? <><span className="font-mono text-xs text-slate-400">{t.categorias_dre.codigo_estruturado}</span> {t.categorias_dre.nome}</>
                    : <span className="text-amber-700">Sem conta (vai para Outras Receitas)</span>}
                </td>
                <td className="px-4 py-2 text-slate-600">{t.exige_veiculo ? 'Obrigatório' : 'Opcional'}</td>
                <td className="px-4 py-2">
                  <span className={t.ativo ? 'text-emerald-600' : 'text-slate-400'}>{t.ativo ? 'Ativo' : 'Inativo'}</span>
                </td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => editar(t)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="Editar">
                    <Pencil className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!ed} onClose={() => setEd(null)} title={ed?.id ? 'Editar tipo de boleto avulso' : 'Novo tipo de boleto avulso'}>
        {ed && (
          <form onSubmit={submit} className="space-y-3">
            <FormField label="Nome">
              <Input value={ed.nome} maxLength={60} onChange={(e) => setEd({ ...ed, nome: e.target.value })} required />
            </FormField>
            <FormField label="Conta do plano de contas (receita)">
              <Select value={ed.categoria_dre_id} onChange={(e) => setEd({ ...ed, categoria_dre_id: e.target.value })}>
                <option value="">— Outras Receitas —</option>
                {receitas.map((c) => <option key={c.id} value={c.id}>{c.codigo_estruturado} · {c.nome}</option>)}
              </Select>
            </FormField>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Ordem na lista">
                <Input type="number" min={0} value={ed.ordem} onChange={(e) => setEd({ ...ed, ordem: Number(e.target.value) || 0 })} />
              </FormField>
              <div className="space-y-2 pt-6 text-sm text-slate-700">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={ed.exige_veiculo} onChange={(e) => setEd({ ...ed, exige_veiculo: e.target.checked })} />
                  Exige o veículo
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={ed.ativo} onChange={(e) => setEd({ ...ed, ativo: e.target.checked })} />
                  Ativo (oferecido no SAC)
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEd(null)}>Cancelar</Button>
              <Button type="submit" disabled={salvar.isPending}>Salvar</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
