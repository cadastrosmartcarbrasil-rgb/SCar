'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Wallet, Landmark, PiggyBank, Banknote, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, MoneyInput, Select } from '@/components/ui/field';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useContasBancarias, useSaveContaBancaria, useDeleteContaBancaria } from '@/hooks/use-financeiro';
import type { ContasBancariasRow } from '@/lib/database.types';
import { ModalOperadoresConta, NomesOperadores } from '@/components/financeiro/operadores-conta';
import { CLASSES_FLUXO } from '@/lib/plano-contas';

const TIPOS = [
  { v: 'corrente', l: 'Conta Corrente', icon: Landmark },
  { v: 'poupanca', l: 'Poupança', icon: PiggyBank },
  { v: 'caixa', l: 'Caixa (Dinheiro)', icon: Banknote },
];
const tipoMeta = (t: string | null) => TIPOS.find((x) => x.v === t) ?? TIPOS[0];

export default function ContasBancariasPage() {
  const { data: contas, isLoading } = useContasBancarias();
  const salvar = useSaveContaBancaria();
  const excluir = useDeleteContaBancaria();
  const [aberto, setAberto] = useState(false);
  const [ed, setEd] = useState<Partial<ContasBancariasRow> | null>(null);
  const [operadores, setOperadores] = useState<ContasBancariasRow | null>(null);

  function novo() {
    setEd({ nome: '', tipo: 'corrente', ativo: true, saldo_inicial: 0, saldo_inicial_em: null });
    setAberto(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ed?.nome) return toast.error('Informe o nome da conta');
    if (Number(ed.saldo_inicial ?? 0) !== 0 && !ed.saldo_inicial_em) {
      return toast.error('Informe a data base do saldo inicial');
    }
    salvar.mutate(ed, {
      onSuccess: () => { toast.success('Conta salva'); setAberto(false); },
      onError: (err) => toast.error(err.message),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Cadastre as contas bancárias e o caixa da empresa. São usadas nas baixas financeiras
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
                    <p className="text-xs text-slate-400">
                      {meta.l} · {CLASSES_FLUXO.find((x) => x.valor === c.classe_fluxo)?.rotulo ?? 'Banco Conta Corrente'}
                    </p>
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
              <p className="mt-2 text-xs text-slate-500">
                Saldo inicial: <span className="tnum font-medium text-slate-700">{formatCurrency(Number(c.saldo_inicial ?? 0))}</span>
                {c.saldo_inicial_em
                  ? <> em {formatDate(c.saldo_inicial_em)}</>
                  : <span className="text-amber-700"> · sem data base</span>}
              </p>
              <NomesOperadores contaId={c.id} />
              <div className="mt-3 flex justify-end gap-1 border-t border-slate-100 pt-2">
                <button onClick={() => setOperadores(c)} className="mr-auto flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-cyan-700 hover:bg-cyan-50" title="Liberar a conta para quem não é da matriz">
                  <Users className="h-3.5 w-3.5" /> Quem opera
                </button>
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

      {operadores && <ModalOperadoresConta conta={operadores} onClose={() => setOperadores(null)} />}

      <Modal open={aberto} onClose={() => setAberto(false)} title={ed?.id ? 'Editar Conta' : 'Nova Conta'} tamanho="lg">
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Nome / apelido *">
              <Input value={ed?.nome ?? ''} onChange={(e) => setEd((p) => ({ ...p, nome: e.target.value }))} placeholder="Ex.: Conta Principal, Caixa Interno" />
            </FormField>
            <FormField label="Tipo">
              <Select value={ed?.tipo ?? 'corrente'} onChange={(e) => {
                const tipo = e.target.value;
                setEd((p) => ({ ...p, tipo, classe_fluxo: tipo === 'caixa' ? 'DINHEIRO' : tipo === 'poupanca' ? 'INVESTIMENTO' : p?.classe_fluxo === 'DINHEIRO' ? 'CONTA_CORRENTE' : p?.classe_fluxo }));
              }}>
                {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </Select>
            </FormField>
          </div>
          <FormField label="Linha no fluxo de caixa e no balancete">
            <Select value={ed?.classe_fluxo ?? 'CONTA_CORRENTE'}
              onChange={(e) => setEd((p) => ({ ...p, classe_fluxo: e.target.value as ContasBancariasRow['classe_fluxo'] }))}>
              {CLASSES_FLUXO.map((c) => (
                <option key={c.valor} value={c.valor}>{c.conta ? `${c.conta} · ${c.rotulo}` : `${c.rotulo} (conta 1.1.1.02)`}</option>
              ))}
            </Select>
          </FormField>
          {ed?.tipo !== 'caixa' && (
            <>
              <FormField label="Banco">
                <Input value={ed?.banco ?? ''} onChange={(e) => setEd((p) => ({ ...p, banco: e.target.value }))} placeholder="Ex.: Banco do Brasil, Itau, Inter" />
              </FormField>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label="Agência"><Input value={ed?.agencia ?? ''} onChange={(e) => setEd((p) => ({ ...p, agencia: e.target.value }))} /></FormField>
                <FormField label="Conta"><Input value={ed?.conta ?? ''} onChange={(e) => setEd((p) => ({ ...p, conta: e.target.value }))} /></FormField>
              </div>
              <FormField label="Chave PIX"><Input value={ed?.chave_pix ?? ''} onChange={(e) => setEd((p) => ({ ...p, chave_pix: e.target.value }))} /></FormField>
            </>
          )}
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-900">Saldo inicial</p>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Saldo do banco no fim do dia">
                <MoneyInput value={ed?.saldo_inicial ?? 0} onChange={(v) => setEd((p) => ({ ...p, saldo_inicial: v ?? 0 }))} />
              </FormField>
              <FormField label="Data base">
                <Input type="date" value={ed?.saldo_inicial_em ?? ''} onChange={(e) => setEd((p) => ({ ...p, saldo_inicial_em: e.target.value || null }))} />
              </FormField>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              O saldo da conta passa a ser este valor mais os movimentos <b>depois</b> da data base. Movimentos até
              essa data não entram no cálculo (já estão dentro do saldo). Use o saldo do extrato do banco no fim do
              dia anterior ao primeiro movimento registrado no sistema — no Sicredi, 12/10/2026.
            </p>
          </div>
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
