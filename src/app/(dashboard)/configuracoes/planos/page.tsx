'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input } from '@/components/ui/field';
import {
  usePlanos, useProdutos, usePlanoProdutos, useSavePlano, useDeletePlano,
} from '@/hooks/use-precificacao';
import type { PlanosProtecaoRow } from '@/lib/database.types';

interface Edicao {
  id?: string;
  nome: string;
  descricao_comercial: string;
  nivel: number;
  ativo: boolean;
  produtosIds: Set<string>;
}

export default function PlanosPage() {
  const { data: planos, isLoading } = usePlanos();
  const { data: produtos } = useProdutos();
  const salvar = useSavePlano();
  const excluir = useDeletePlano();

  const [aberto, setAberto] = useState(false);
  const [ed, setEd] = useState<Edicao | null>(null);
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const { data: vinculos } = usePlanoProdutos(editId);

  // Ao abrir edicao de um plano existente, carrega os produtos vinculados.
  useEffect(() => {
    if (editId && vinculos && ed && ed.id === editId) {
      setEd((e) => (e ? { ...e, produtosIds: new Set(vinculos) } : e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vinculos, editId]);

  // Opcionais disponiveis para compor um combo (produtos nao-obrigatorios ativos).
  const opcionais = (produtos ?? []).filter((p) => !p.obrigatorio && p.status);

  function novo() {
    setEditId(undefined);
    setEd({ nome: '', descricao_comercial: '', nivel: (planos?.length ?? 0) + 1, ativo: true, produtosIds: new Set() });
    setAberto(true);
  }

  function editar(p: PlanosProtecaoRow) {
    setEditId(p.id);
    setEd({
      id: p.id,
      nome: p.nome,
      descricao_comercial: p.descricao_comercial ?? '',
      nivel: p.nivel ?? 0,
      ativo: p.ativo,
      produtosIds: new Set(),
    });
    setAberto(true);
  }

  function toggleProduto(id: string) {
    setEd((e) => {
      if (!e) return e;
      const n = new Set(e.produtosIds);
      n.has(id) ? n.delete(id) : n.add(id);
      return { ...e, produtosIds: n };
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ed?.nome.trim()) return toast.error('Informe o nome do plano');
    salvar.mutate(
      {
        id: ed.id,
        nome: ed.nome,
        descricao_comercial: ed.descricao_comercial || null,
        nivel: ed.nivel,
        ativo: ed.ativo,
        produtosIds: [...ed.produtosIds],
      },
      {
        onSuccess: () => { toast.success('Plano salvo'); setAberto(false); },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  function remover(p: PlanosProtecaoRow) {
    if (!confirm(`Excluir o plano "${p.nome}"?`)) return;
    excluir.mutate(p.id, {
      onSuccess: () => toast.success('Plano excluido'),
      onError: (err) => toast.error(err.message),
    });
  }

  const nomeProduto = (id: string) => (produtos ?? []).find((p) => p.id === id)?.nome ?? '';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="max-w-2xl text-sm text-slate-500">
          Combos comerciais (ex.: Prata, Ouro, Diamante). Todo plano ja inclui a cotacao base
          (casco + taxa admin + assistencia 24h + rastreador se aplicavel); aqui voce amarra os
          opcionais que compoem cada nivel.
        </p>
        <Button onClick={novo}><Plus className="h-4 w-4" /> Novo Plano</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {isLoading && <p className="text-sm text-slate-400">Carregando...</p>}
        {(planos ?? []).map((p) => (
          <PlanoCard key={p.id} plano={p} onEdit={() => editar(p)} onDelete={() => remover(p)} />
        ))}
        {!isLoading && (planos ?? []).length === 0 && (
          <p className="text-sm text-slate-400">Nenhum plano cadastrado.</p>
        )}
      </div>

      <Modal open={aberto} onClose={() => setAberto(false)} title={ed?.id ? 'Editar Plano' : 'Novo Plano'}>
        {ed && (
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <FormField label="Nome do plano *">
                  <Input value={ed.nome} onChange={(e) => setEd({ ...ed, nome: e.target.value })} placeholder="Ex.: Plano Ouro" />
                </FormField>
              </div>
              <FormField label="Nivel (ordem)">
                <Input type="number" value={ed.nivel} onChange={(e) => setEd({ ...ed, nivel: Number(e.target.value) || 0 })} />
              </FormField>
            </div>
            <FormField label="Descricao comercial">
              <textarea
                value={ed.descricao_comercial}
                onChange={(e) => setEd({ ...ed, descricao_comercial: e.target.value })}
                rows={2}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Texto exibido na proposta"
              />
            </FormField>

            <div>
              <p className="mb-1 text-sm font-medium text-slate-600">Opcionais inclusos no plano</p>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {opcionais.length === 0 && <p className="p-2 text-xs text-slate-400">Nenhum opcional cadastrado em Produtos.</p>}
                {opcionais.map((p) => (
                  <label key={p.id} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                    <span className="flex items-center gap-2 text-slate-700">
                      <input
                        type="checkbox"
                        checked={ed.produtosIds.has(p.id)}
                        onChange={() => toggleProduto(p.id)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      {p.nome}
                      <span className="rounded bg-slate-100 px-1.5 text-[10px] uppercase text-slate-500">{p.categoria}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-400">A cotacao base entra automaticamente; marque apenas os adicionais.</p>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={ed.ativo} onChange={(e) => setEd({ ...ed, ativo: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
              Ativo
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setAberto(false)}>Cancelar</Button>
              <Button type="submit" disabled={salvar.isPending}>{salvar.isPending ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function PlanoCard({ plano, onEdit, onDelete }: { plano: PlanosProtecaoRow; onEdit: () => void; onDelete: () => void }) {
  const { data: vinculos } = usePlanoProdutos(plano.id);
  const { data: produtos } = useProdutos();
  const nomes = (vinculos ?? []).map((id) => (produtos ?? []).find((p) => p.id === id)?.nome).filter(Boolean);
  return (
    <div className="rounded-xl border border-slate-200 bg-superficie p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-brand-500" />
          <h3 className="font-semibold text-slate-800">{plano.nome}</h3>
          {!plano.ativo && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">inativo</span>}
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
          <button onClick={onDelete} className="rounded p-1.5 text-rose-400 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      {plano.descricao_comercial && <p className="mt-1 text-xs text-slate-500">{plano.descricao_comercial}</p>}
      <div className="mt-3">
        <p className="text-[10px] font-medium uppercase text-slate-400">Opcionais</p>
        {nomes.length === 0 ? (
          <p className="text-xs text-slate-400">Somente cotacao base.</p>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-1">
            {nomes.map((n) => (
              <li key={n} className="rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-700">{n}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
