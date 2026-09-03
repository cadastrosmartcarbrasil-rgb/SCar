'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Wallet, Landmark, PiggyBank, Banknote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select } from '@/components/ui/field';
import { useContasBancarias, useSaveContaBancaria, useDeleteContaBancaria } from '@/hooks/use-financeiro';
import type { ContasBancariasRow } from '@/lib/database.types';

const TIPOS = [
  { v: 'corrente', l: 'Conta Corrente', icon: Landmark },
  { v: 'poupanca', l: 'Poupanca', icon: PiggyBank },
  { v: 'caixa', l: 'Caixa (Dinheiro)', icon: Banknote },
];
const tipoMeta = (t: string | null) => TIPOS.find((x) => x.v === t) ?? TIPOS[0];

export default function ContasBancariasPage() {
  const { data: contas, isLoading } = useContasBancarias();
  const salvar = useSaveContaBancaria();
  const excluir = useDeleteContaBancaria();
  const [aberto, setAberto] = useState(false);
  const [ed, setEd] = useState<Partial<ContasBancariasRow> | null>(null);

  function novo() {
    setEd({ nome: '', tipo: 'corrente', ativo: true });
    setAberto(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ed?.nome) return toast.error('Informe o nome da conta');
    salvar.mutate(ed, {
      onSuccess: () => { toast.success('Conta salva'); setAberto(false); },
      onError: (err) => toast.error(err.message),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Cadastre as contas bancarias e o caixa da empresa. Sao usadas nas baixas financeiras
          (origem/destino do recurso).
        </p>
        <Button onClick={novo}><Plus className="h-4 w-4" /> Nova Conta</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading && <p className="text-sm text-slate-400">Carregando...</p>}
        {(contas ?? []).map((c) => {
          const meta = tipoMeta(c.tipo);
          return (
            <div key={c.id} className="rounded-xl border border-slate-200 bg-superficie p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-brand-50 p-2 text-brand-600"><meta.icon className="h-5 w-5" /></div>
                  <div>
                    <p className="font-medium text-slate-800">{c.nome}</p>
                    <p className="text-xs text-slate-400">{meta.l}</p>
                  </div>
                </div>
                <span className={`rounded px-2 py-0.5 text-xs ${c.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {c.ativo ? 'Ativa' : 'Inativa'}
                </span>
              </div>
              {c.tipo !== 'caixa' && (
                <div className="mt-3 space-y-0.5 text-sm text-slate-600">
                  {c.banco && <p>{c.banco}</p>}
                  <p className="text-xs text-slate-400">Ag. {c.agencia || '-'} · Conta {c.conta || '-'}</p>
                  {c.chave_pix && <p className="text-xs text-slate-400">PIX: {c.chave_pix}</p>}
                </div>
              )}
              <div className="mt-3 flex justify-end gap-1 border-t border-slate-100 pt-2">
                <button onClick={() => { setEd(c); setAberto(true); }} className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => { if (confirm(`Excluir a conta "${c.nome}"?`)) excluir.mutate(c.id, { onError: (er) => toast.error(er.message) }); }} className="rounded p-1.5 text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          );
        })}
        {!isLoading && (contas ?? []).length === 0 && (
          <div className="col-span-full flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
            <Wallet className="h-8 w-8 text-slate-300" />
            Nenhuma conta cadastrada.
          </div>
        )}
      </div>

      <Modal open={aberto} onClose={() => setAberto(false)} title={ed?.id ? 'Editar Conta' : 'Nova Conta'}>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Nome / apelido *">
              <Input value={ed?.nome ?? ''} onChange={(e) => setEd((p) => ({ ...p, nome: e.target.value }))} placeholder="Ex.: Conta Principal, Caixa Interno" />
            </FormField>
            <FormField label="Tipo">
              <Select value={ed?.tipo ?? 'corrente'} onChange={(e) => setEd((p) => ({ ...p, tipo: e.target.value }))}>
                {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </Select>
            </FormField>
          </div>
          {ed?.tipo !== 'caixa' && (
            <>
              <FormField label="Banco">
                <Input value={ed?.banco ?? ''} onChange={(e) => setEd((p) => ({ ...p, banco: e.target.value }))} placeholder="Ex.: Banco do Brasil, Itau, Inter" />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Agencia"><Input value={ed?.agencia ?? ''} onChange={(e) => setEd((p) => ({ ...p, agencia: e.target.value }))} /></FormField>
                <FormField label="Conta"><Input value={ed?.conta ?? ''} onChange={(e) => setEd((p) => ({ ...p, conta: e.target.value }))} /></FormField>
              </div>
              <FormField label="Chave PIX"><Input value={ed?.chave_pix ?? ''} onChange={(e) => setEd((p) => ({ ...p, chave_pix: e.target.value }))} /></FormField>
            </>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={ed?.ativo ?? true} onChange={(e) => setEd((p) => ({ ...p, ativo: e.target.checked }))} className="h-4 w-4 rounded border-slate-300" />
            Conta ativa
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
