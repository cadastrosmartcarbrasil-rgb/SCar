'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, HandCoins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select } from '@/components/ui/field';
import { useFornecedores } from '@/hooks/use-fornecedores';
import { usePlanoContas } from '@/hooks/use-config';
import {
  useLancamentos, useSaveLancamento, useBaixas, useAddBaixa, useContasBancarias, useCentrosCusto,
  type LancamentoComRel,
} from '@/hooks/use-financeiro';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { LancamentosFinanceirosRow, BaixasFinanceirasRow, TipoMovimentacao, StatusLancamento, FormaPagamento } from '@/lib/database.types';

const STATUS_COR: Record<StatusLancamento, string> = {
  pendente: 'bg-amber-50 text-amber-700',
  pago_parcial: 'bg-sky-50 text-sky-700',
  quitado: 'bg-emerald-50 text-emerald-700',
  cancelado: 'bg-slate-100 text-slate-500',
  atrasado: 'bg-rose-50 text-rose-700',
};
const STATUS_LABEL: Record<StatusLancamento, string> = {
  pendente: 'Pendente', pago_parcial: 'Pago Parcial', quitado: 'Quitado', cancelado: 'Cancelado', atrasado: 'Atrasado',
};
const FORMAS: FormaPagamento[] = ['PIX', 'BOLETO', 'TRANSFERENCIA', 'CARTAO', 'DINHEIRO'];

export function ContasFinanceiro() {
  const [tipoFiltro, setTipoFiltro] = useState<TipoMovimentacao | ''>('');
  const [centroFiltro, setCentroFiltro] = useState('');
  const { data: lancamentos, isLoading } = useLancamentos({
    tipo: tipoFiltro || undefined,
    centroCustoId: centroFiltro || null,
  });
  const { data: fornecedores } = useFornecedores();
  const { data: categorias } = usePlanoContas();
  const { data: centros } = useCentrosCusto();
  const salvar = useSaveLancamento();

  const [novo, setNovo] = useState<Partial<LancamentosFinanceirosRow> | null>(null);
  const [baixando, setBaixando] = useState<LancamentoComRel | null>(null);

  const hoje = new Date().toISOString().slice(0, 10);

  function abrirNovo() {
    setNovo({ tipo: 'DESPESA', data_emissao: hoje, data_vencimento: hoje, valor_original: 0 });
  }
  function submitNovo(e: React.FormEvent) {
    e.preventDefault();
    if (!novo?.descricao) return toast.error('Informe a descricao');
    if (!novo?.valor_original || novo.valor_original <= 0) return toast.error('Informe o valor');
    salvar.mutate(novo, {
      onSuccess: () => { toast.success('Lancamento criado'); setNovo(null); },
      onError: (err) => toast.error(err.message),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['', 'DESPESA', 'RECEITA'] as const).map((t) => (
            <button key={t} onClick={() => setTipoFiltro(t)}
              className={`rounded-md px-3 py-1.5 text-sm ${tipoFiltro === t ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {t === '' ? 'Todos' : t === 'DESPESA' ? 'A Pagar' : 'A Receber'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Select value={centroFiltro} onChange={(e) => setCentroFiltro(e.target.value)} className="mt-0 w-56">
            <option value="">Todos os centros de custo</option>
            {(centros ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
          <Button onClick={abrirNovo}><Plus className="h-4 w-4" /> Novo Lancamento</Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Descricao</th>
              <th className="px-4 py-2">Favorecido / Pagador</th>
              <th className="px-4 py-2">Centro de custo</th>
              <th className="px-4 py-2">Vencimento</th>
              <th className="px-4 py-2 text-right">Valor</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">Carregando...</td></tr>}
            {(lancamentos ?? []).map((l) => (
              <tr key={l.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${l.tipo === 'RECEITA' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                    {l.tipo === 'RECEITA' ? 'Receber' : 'Pagar'}
                  </span>
                </td>
                <td className="px-4 py-2 font-medium text-slate-800">{l.descricao}</td>
                <td className="px-4 py-2 text-slate-600">{l.fornecedores?.razao_social ?? l.clientes?.nome_razao_social ?? '-'}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{l.centros_custo?.nome ?? '-'}</td>
                <td className="px-4 py-2 text-slate-600">{formatDate(l.data_vencimento)}</td>
                <td className="px-4 py-2 text-right font-medium">{formatCurrency(l.valor_original)}</td>
                <td className="px-4 py-2"><span className={`rounded px-2 py-0.5 text-xs ${STATUS_COR[l.status]}`}>{STATUS_LABEL[l.status]}</span></td>
                <td className="px-4 py-2 text-right">
                  {l.status !== 'quitado' && l.status !== 'cancelado' && (
                    <button onClick={() => setBaixando(l)} className="inline-flex items-center gap-1 rounded border border-emerald-200 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50">
                      <HandCoins className="h-3.5 w-3.5" /> Baixar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && (lancamentos ?? []).length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">Nenhum lancamento.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Novo lancamento */}
      <Modal open={!!novo} onClose={() => setNovo(null)} title="Novo Lancamento">
        <form onSubmit={submitNovo} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Tipo">
              <Select value={novo?.tipo ?? 'DESPESA'} onChange={(e) => setNovo((p) => ({ ...p, tipo: e.target.value as TipoMovimentacao }))}>
                <option value="DESPESA">Conta a Pagar</option>
                <option value="RECEITA">Conta a Receber</option>
              </Select>
            </FormField>
            <FormField label="Fornecedor">
              <Select value={novo?.fornecedor_id ?? ''} onChange={(e) => setNovo((p) => ({ ...p, fornecedor_id: e.target.value || null }))}>
                <option value="">-- Nenhum --</option>
                {(fornecedores ?? []).map((f) => <option key={f.id} value={f.id}>{f.razao_social}</option>)}
              </Select>
            </FormField>
          </div>
          <FormField label="Descricao *"><Input value={novo?.descricao ?? ''} onChange={(e) => setNovo((p) => ({ ...p, descricao: e.target.value }))} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Categoria (DRE)">
              <Select value={novo?.categoria_dre_id ?? ''} onChange={(e) => setNovo((p) => ({ ...p, categoria_dre_id: e.target.value || null }))}>
                <option value="">--</option>
                {(categorias ?? []).map((c) => <option key={c.id} value={c.id}>{c.codigo_estruturado} - {c.nome}</option>)}
              </Select>
            </FormField>
            <FormField label="Centro de custo">
              <Select value={novo?.centro_custo_id ?? ''} onChange={(e) => setNovo((p) => ({ ...p, centro_custo_id: e.target.value || null }))}>
                <option value="">--</option>
                {(centros ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <FormField label="Valor (R$) *"><Input type="number" step="0.01" value={novo?.valor_original ?? 0} onChange={(e) => setNovo((p) => ({ ...p, valor_original: Number(e.target.value) }))} /></FormField>
            <FormField label="Emissao"><Input type="date" value={novo?.data_emissao ?? hoje} onChange={(e) => setNovo((p) => ({ ...p, data_emissao: e.target.value }))} /></FormField>
            <FormField label="Vencimento *"><Input type="date" value={novo?.data_vencimento ?? hoje} onChange={(e) => setNovo((p) => ({ ...p, data_vencimento: e.target.value }))} /></FormField>
            <FormField label="Forma prevista">
              <Select value={novo?.forma_pagamento_prevista ?? ''} onChange={(e) => setNovo((p) => ({ ...p, forma_pagamento_prevista: (e.target.value || null) as FormaPagamento }))}>
                <option value="">--</option>
                {FORMAS.map((f) => <option key={f} value={f}>{f}</option>)}
              </Select>
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setNovo(null)}>Cancelar</Button>
            <Button type="submit" disabled={salvar.isPending}>{salvar.isPending ? 'Salvando...' : 'Criar'}</Button>
          </div>
        </form>
      </Modal>

      {baixando && <BaixaModal lancamento={baixando} onClose={() => setBaixando(null)} />}
    </div>
  );
}

function BaixaModal({ lancamento, onClose }: { lancamento: LancamentoComRel; onClose: () => void }) {
  const { data: baixas } = useBaixas(lancamento.id);
  const { data: contas } = useContasBancarias();
  const add = useAddBaixa();
  const hoje = new Date().toISOString().slice(0, 10);

  const saldo = useMemo(() => {
    const b = baixas ?? [];
    const pago = b.reduce((s, x) => s + Number(x.valor_pago), 0);
    const desc = b.reduce((s, x) => s + Number(x.desconto), 0);
    const juros = b.reduce((s, x) => s + Number(x.juros_multa), 0);
    return Number(lancamento.valor_original) + juros - pago - desc;
  }, [baixas, lancamento]);

  const [form, setForm] = useState<Partial<BaixasFinanceirasRow>>({ data_pagamento: hoje, valor_pago: 0, desconto: 0, juros_multa: 0 });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.valor_pago || form.valor_pago <= 0) return toast.error('Informe o valor pago');
    add.mutate({ ...form, lancamento_id: lancamento.id }, {
      onSuccess: () => { toast.success('Baixa registrada'); onClose(); },
      onError: (err) => toast.error(err.message.includes('excede') ? 'Valor excede o saldo devedor' : err.message),
    });
  }

  return (
    <Modal open onClose={onClose} title={`Baixa - ${lancamento.descricao}`}>
      <div className="mb-3 rounded-lg bg-slate-50 p-3 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">Valor original</span><span>{formatCurrency(lancamento.valor_original)}</span></div>
        <div className="flex justify-between font-semibold text-brand-700"><span>Saldo devedor</span><span>{formatCurrency(saldo)}</span></div>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-4 gap-3">
          <FormField label="Data"><Input type="date" value={form.data_pagamento ?? hoje} onChange={(e) => setForm({ ...form, data_pagamento: e.target.value })} /></FormField>
          <FormField label="Valor pago"><Input type="number" step="0.01" value={form.valor_pago ?? 0} onChange={(e) => setForm({ ...form, valor_pago: Number(e.target.value) })} /></FormField>
          <FormField label="Desconto"><Input type="number" step="0.01" value={form.desconto ?? 0} onChange={(e) => setForm({ ...form, desconto: Number(e.target.value) })} /></FormField>
          <FormField label="Juros/Multa"><Input type="number" step="0.01" value={form.juros_multa ?? 0} onChange={(e) => setForm({ ...form, juros_multa: Number(e.target.value) })} /></FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Conta bancaria">
            <Select value={form.conta_bancaria_id ?? ''} onChange={(e) => setForm({ ...form, conta_bancaria_id: e.target.value || null })}>
              <option value="">--</option>
              {(contas ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </FormField>
          <FormField label="ID transacao / PIX (E2E)"><Input value={form.end_to_end_id_pix ?? ''} onChange={(e) => setForm({ ...form, end_to_end_id_pix: e.target.value })} placeholder="Reconciliacao futura" /></FormField>
        </div>
        <p className="text-xs text-slate-400">
          Liquido: {formatCurrency((form.valor_pago ?? 0) - (form.desconto ?? 0) + (form.juros_multa ?? 0))}. Baixas parciais mantem o saldo pendente.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={add.isPending}>{add.isPending ? 'Registrando...' : 'Registrar baixa'}</Button>
        </div>
      </form>
    </Modal>
  );
}
