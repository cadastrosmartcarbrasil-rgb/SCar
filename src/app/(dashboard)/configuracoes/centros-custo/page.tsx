'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input } from '@/components/ui/field';
import {
  useCentrosCusto, useExcluirCentroCusto, useSaveCentroCusto, useUsoCentrosCusto,
} from '@/hooks/use-financeiro';
import { useAcoesNaAba } from '@/hooks/use-permissoes';
import { ehCentroDoSistema, podeExcluirCentro, validarCentroCusto } from '@/lib/centros-custo';
import type { CentrosCustoRow } from '@/lib/database.types';

type Edicao = { id?: string; nome: string; codigo: string; ativo: boolean };

export default function CentrosCustoPage() {
  const { data: centros, isLoading } = useCentrosCusto();
  const { data: uso } = useUsoCentrosCusto((centros ?? []).map((c) => c.id));
  const salvar = useSaveCentroCusto();
  const excluir = useExcluirCentroCusto();
  const pode = useAcoesNaAba('cfg_centros_custo');
  const [ed, setEd] = useState<Edicao | null>(null);

  const original = ed?.id ? (centros ?? []).find((c) => c.id === ed.id) : undefined;
  const travado = !!original && ehCentroDoSistema(original);

  function editar(c: CentrosCustoRow) {
    setEd({ id: c.id, nome: c.nome, codigo: c.codigo ?? '', ativo: c.ativo });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ed) return;
    const erro = validarCentroCusto(ed, centros ?? []);
    if (erro) return toast.error(erro);
    salvar.mutate(
      { id: ed.id, nome: ed.nome, codigo: ed.codigo || null, ativo: ed.ativo },
      {
        onSuccess: () => { toast.success('Centro de custo salvo'); setEd(null); },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Centros de custo classificam os lançamentos do Financeiro e filtram o DRE. Os inativos deixam de
          ser oferecidos em lançamento novo, mas continuam nos relatórios.
        </p>
        {pode.criar && (
          <Button onClick={() => setEd({ nome: '', codigo: '', ativo: true })}>
            <Plus className="h-4 w-4" /> Novo centro de custo
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2 text-right">Lançamentos</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Carregando...</td></tr>
            )}
            {(centros ?? []).map((c) => {
              const n = uso?.[c.id];
              const sistema = ehCentroDoSistema(c);
              const podeExcluir = n !== undefined && podeExcluirCentro(c, n);
              return (
                <tr key={c.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{c.codigo ?? '-'}</td>
                  <td className="px-4 py-2 font-medium text-slate-800">
                    <span className="inline-flex items-center gap-1.5">
                      {c.nome}
                      {sistema && (
                        <span title="Usado pela Assistência 24h" className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                          <Lock className="h-3 w-3" /> sistema
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="tnum px-4 py-2 text-right text-slate-600">{n ?? '…'}</td>
                  <td className="px-4 py-2">
                    <span className={c.ativo ? 'text-emerald-600' : 'text-slate-400'}>{c.ativo ? 'Ativo' : 'Inativo'}</span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      {pode.editar && (
                      <button onClick={() => editar(c)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="Editar">
                        <Pencil className="h-4 w-4" />
                      </button>
                      )}
                      {pode.excluir && (
                      <button
                        disabled={!podeExcluir}
                        title={
                          sistema ? 'Centro da Assistência 24h: não pode ser excluído'
                            : podeExcluir ? 'Excluir' : 'Tem lançamentos: inative em vez de excluir'
                        }
                        onClick={() => {
                          if (confirm(`Excluir o centro de custo "${c.nome}"?`))
                            excluir.mutate(c.id, {
                              onSuccess: () => toast.success('Centro de custo excluído'),
                              onError: (err) => toast.error((err as Error).message),
                            });
                        }}
                        className="rounded p-1.5 text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!isLoading && (centros ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Nenhum centro de custo cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={!!ed} onClose={() => setEd(null)} title={ed?.id ? 'Editar centro de custo' : 'Novo centro de custo'}>
        {ed && (
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label="Código">
                <Input value={ed.codigo} disabled={travado} placeholder="ADM"
                  onChange={(e) => setEd({ ...ed, codigo: e.target.value })} />
              </FormField>
              <FormField label="Nome *" className="sm:col-span-2">
                <Input value={ed.nome} onChange={(e) => setEd({ ...ed, nome: e.target.value })} />
              </FormField>
            </div>
            {travado && (
              <p className="text-xs text-slate-500">
                O código ASSIST24 e usado pela Assistência 24h para lançar o custo das OS; ele fica travado.
              </p>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={ed.ativo} onChange={(e) => setEd({ ...ed, ativo: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300" />
              Centro de custo ativo
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEd(null)}>Cancelar</Button>
              <Button type="submit" disabled={salvar.isPending}>{salvar.isPending ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
