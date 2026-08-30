'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { History, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, MoneyInput, Select } from '@/components/ui/field';
import { useAddBaixa, useBaixas, useContasBancarias, type LancamentoComRel } from '@/hooks/use-financeiro';
import { diasAtraso } from '@/lib/financeiro';
import { somarMoeda } from '@/lib/money';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { BaixasFinanceirasRow } from '@/lib/database.types';

/**
 * Liquidacao (baixa) de um titulo. Aceita baixa parcial, desconto e
 * juros/multa; o banco recalcula saldo e status e barra pagamento a maior.
 */
export function BaixaModal({ lancamento, onClose }: { lancamento: LancamentoComRel; onClose: () => void }) {
  const { data: baixas } = useBaixas(lancamento.id);
  const { data: contas } = useContasBancarias();
  const add = useAddBaixa();
  const hoje = new Date().toISOString().slice(0, 10);
  const receita = lancamento.tipo === 'RECEITA';

  const [form, setForm] = useState<Partial<BaixasFinanceirasRow>>({ data_pagamento: hoje });
  // A baixa quase sempre e do valor cheio, entao o campo ja nasce preenchido
  // com o saldo devedor — quem paga parcial edita, quem paga tudo so confirma.
  const preenchido = useRef(false);

  const atraso = diasAtraso(lancamento.data_vencimento);

  // Saldo em aberto considerando os juros/desconto que estao sendo digitados.
  const saldoAtual = useMemo(() => {
    const registradas = baixas ?? [];
    const pago = somarMoeda(...registradas.map((x) => Number(x.valor_pago)));
    const desc = somarMoeda(...registradas.map((x) => Number(x.desconto)));
    const juros = somarMoeda(...registradas.map((x) => Number(x.juros_multa)));
    return somarMoeda(Number(lancamento.valor_original), juros, -pago, -desc);
  }, [baixas, lancamento.valor_original]);

  const saldoComEncargos = somarMoeda(saldoAtual, form.juros_multa ?? 0, -(form.desconto ?? 0));
  const liquido = somarMoeda(form.valor_pago ?? 0, -(form.desconto ?? 0), form.juros_multa ?? 0);
  const restante = somarMoeda(saldoComEncargos, -(form.valor_pago ?? 0));

  useEffect(() => {
    if (preenchido.current || !baixas || saldoAtual <= 0) return;
    preenchido.current = true;
    setForm((p) => ({ ...p, valor_pago: saldoAtual }));
  }, [baixas, saldoAtual]);

  function preencherTotal() {
    setForm((p) => ({ ...p, valor_pago: somarMoeda(saldoAtual, p.juros_multa ?? 0, -(p.desconto ?? 0)) }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.valor_pago || form.valor_pago <= 0) return toast.error('Informe o valor pago');
    add.mutate(
      { ...form, lancamento_id: lancamento.id, valor_liquido: liquido },
      {
        onSuccess: () => { toast.success('Baixa registrada'); onClose(); },
        onError: (err) =>
          toast.error(err.message.includes('excede') ? 'O valor informado excede o saldo devedor.' : err.message),
      },
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      tamanho="lg"
      title={receita ? 'Receber titulo' : 'Pagar titulo'}
      subtitulo={lancamento.descricao}
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Resumo rotulo="Valor original" valor={formatCurrency(lancamento.valor_original)} />
        <Resumo rotulo="Ja liquidado" valor={formatCurrency(Number(lancamento.valor_original) - saldoAtual)} />
        <Resumo
          rotulo="Saldo devedor"
          valor={formatCurrency(saldoAtual)}
          destaque
          nota={atraso > 0 ? `${atraso} dia(s) em atraso` : `Vence em ${formatDate(lancamento.data_vencimento)}`}
          alerta={atraso > 0}
        />
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <FormField label="Data do pagamento">
            <Input type="date" className="tnum" value={form.data_pagamento ?? hoje} onChange={(e) => setForm({ ...form, data_pagamento: e.target.value })} />
          </FormField>
          <FormField label="Valor pago *">
            <MoneyInput value={form.valor_pago ?? null} onChange={(v) => setForm({ ...form, valor_pago: v ?? 0 })} autoFocus />
          </FormField>
          <FormField label="Desconto">
            <MoneyInput value={form.desconto ?? null} onChange={(v) => setForm({ ...form, desconto: v ?? 0 })} />
          </FormField>
          <FormField label="Juros / multa">
            <MoneyInput value={form.juros_multa ?? null} onChange={(v) => setForm({ ...form, juros_multa: v ?? 0 })} />
          </FormField>
        </div>

        {Math.abs((form.valor_pago ?? 0) - saldoComEncargos) > 0.004 && (
          <button
            type="button"
            onClick={preencherTotal}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Usar o saldo total ({formatCurrency(saldoComEncargos)})
          </button>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={receita ? 'Conta que recebeu' : 'Conta que pagou'}>
            <Select value={form.conta_bancaria_id ?? ''} onChange={(e) => setForm({ ...form, conta_bancaria_id: e.target.value || null })}>
              <option value="">-- Selecione a conta --</option>
              {(contas ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </FormField>
          <FormField label="Identificador da transacao / PIX (E2E)">
            <Input
              value={form.end_to_end_id_pix ?? ''}
              onChange={(e) => setForm({ ...form, end_to_end_id_pix: e.target.value })}
              placeholder="Usado na conciliacao bancaria"
            />
          </FormField>
        </div>

        <div className="tnum flex flex-wrap justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
          <span className="text-slate-500">Valor liquido da baixa <b className="text-slate-800">{formatCurrency(liquido)}</b></span>
          <span className={restante > 0.004 ? 'text-amber-700' : 'text-emerald-700'}>
            {restante > 0.004 ? `Restara ${formatCurrency(restante)} em aberto` : 'Titulo sera quitado'}
          </span>
        </div>

        {(baixas ?? []).length > 0 && (
          <div className="rounded-xl border border-slate-200">
            <p className="flex items-center gap-1.5 border-b border-slate-200 px-3 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
              <History className="h-3.5 w-3.5" /> Baixas ja registradas
            </p>
            <table className="w-full text-xs">
              <tbody>
                {(baixas ?? []).map((b) => (
                  <tr key={b.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-1.5 text-slate-600">{formatDate(b.data_pagamento)}</td>
                    <td className="px-3 py-1.5 text-slate-400">
                      {Number(b.desconto) > 0 && `desc. ${formatCurrency(b.desconto)} `}
                      {Number(b.juros_multa) > 0 && `juros ${formatCurrency(b.juros_multa)}`}
                    </td>
                    <td className="tnum px-3 py-1.5 text-right font-medium text-slate-800">{formatCurrency(b.valor_pago)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={add.isPending}>{add.isPending ? 'Registrando...' : 'Registrar baixa'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function Resumo({
  rotulo, valor, nota, destaque, alerta,
}: { rotulo: string; valor: string; nota?: string; destaque?: boolean; alerta?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${destaque ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-white'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className={`tnum mt-1 text-lg font-bold ${destaque ? 'text-brand-700' : 'text-slate-800'}`}>{valor}</p>
      {nota && <p className={`mt-0.5 text-[11px] ${alerta ? 'text-rose-600' : 'text-slate-400'}`}>{nota}</p>}
    </div>
  );
}
