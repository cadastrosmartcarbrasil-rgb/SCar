'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarDays, Info, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, MoneyInput, Select, Textarea } from '@/components/ui/field';
import { useFornecedores } from '@/hooks/use-fornecedores';
import { useAssociados } from '@/hooks/use-associados';
import { usePlanoContas, useRegionais } from '@/hooks/use-config';
import { useCentrosCusto, useSaveLancamento } from '@/hooks/use-financeiro';
import { gerarParcelas, type Periodicidade } from '@/lib/financeiro';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { FormaPagamento, LancamentosFinanceirosRow, TipoMovimentacao } from '@/lib/database.types';

const FORMAS: FormaPagamento[] = ['PIX', 'BOLETO', 'TRANSFERENCIA', 'CARTAO', 'DINHEIRO'];
const PERIODICIDADES: { valor: Periodicidade; rotulo: string }[] = [
  { valor: 'MENSAL', rotulo: 'Mensal' },
  { valor: 'QUINZENAL', rotulo: 'Quinzenal' },
  { valor: 'SEMANAL', rotulo: 'Semanal' },
  { valor: 'ANUAL', rotulo: 'Anual' },
];

type Form = Partial<LancamentosFinanceirosRow>;

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <span className="h-px flex-1 bg-slate-200" aria-hidden />
        {titulo}
        <span className="h-px flex-1 bg-slate-200" aria-hidden />
      </h4>
      {children}
    </section>
  );
}

/**
 * Cadastro de titulo a pagar/receber.
 * Todo o dinheiro passa pelo <MoneyInput> (campo comeca vazio com placeholder
 * 0,00 e aceita digitacao corrida) e o parcelamento e pre-visualizado antes
 * de gravar.
 */
export function LancamentoModal({
  aberto,
  onClose,
  inicial,
}: {
  aberto: boolean;
  onClose: () => void;
  inicial?: Form | null;
}) {
  const hoje = new Date().toISOString().slice(0, 10);
  const edicao = !!inicial?.id;

  const [form, setForm] = useState<Form>(
    inicial ?? { tipo: 'DESPESA', data_emissao: hoje, data_vencimento: hoje, competencia: hoje },
  );
  const [parcelas, setParcelas] = useState(1);
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>('MENSAL');
  const [repetirValor, setRepetirValor] = useState(false);

  const { data: fornecedores } = useFornecedores();
  const { data: associados } = useAssociados();
  const { data: categorias } = usePlanoContas();
  const { data: centros } = useCentrosCusto();
  const { data: regionais } = useRegionais();
  const salvar = useSaveLancamento();

  const set = (patch: Form) => setForm((p) => ({ ...p, ...patch }));
  const receita = form.tipo === 'RECEITA';

  // Categorias coerentes com o tipo do lancamento (receita x custo/despesa).
  const categoriasDoTipo = useMemo(
    () => (categorias ?? []).filter((c) => (receita ? c.tipo === 'RECEITA' : c.tipo !== 'RECEITA')),
    [categorias, receita],
  );

  const previa = useMemo(() => {
    if (parcelas <= 1 || !form.valor_original) return [];
    return gerarParcelas({
      valorTotal: form.valor_original,
      quantidade: parcelas,
      primeiroVencimento: form.data_vencimento ?? hoje,
      competenciaInicial: form.competencia ?? form.data_vencimento ?? hoje,
      periodicidade,
      repetirValor,
    });
  }, [parcelas, form.valor_original, form.data_vencimento, form.competencia, periodicidade, repetirValor, hoje]);

  const totalGerado = previa.reduce((s, p) => s + p.valor, 0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.descricao?.trim()) return toast.error('Informe a descricao do lancamento');
    if (!form.valor_original || form.valor_original <= 0) return toast.error('Informe um valor maior que zero');
    if (!form.data_vencimento) return toast.error('Informe a data de vencimento');

    salvar.mutate(
      { ...form, parcelas: previa.length > 1 ? previa : undefined },
      {
        onSuccess: () => {
          toast.success(
            edicao ? 'Lancamento atualizado' : previa.length > 1 ? `${previa.length} parcelas geradas` : 'Lancamento criado',
          );
          onClose();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <Modal
      open={aberto}
      onClose={onClose}
      size="2xl"
      title={edicao ? 'Editar lancamento' : receita ? 'Nova conta a receber' : 'Nova conta a pagar'}
      subtitulo="Os campos marcados com * sao obrigatorios."
    >
      <form onSubmit={submit} className="space-y-6">
        <Secao titulo="Identificacao">
          <div className="grid gap-3 sm:grid-cols-4">
            <FormField label="Natureza *">
              <Select
                value={form.tipo ?? 'DESPESA'}
                onChange={(e) => set({ tipo: e.target.value as TipoMovimentacao, categoria_dre_id: null })}
              >
                <option value="DESPESA">Conta a Pagar</option>
                <option value="RECEITA">Conta a Receber</option>
              </Select>
            </FormField>
            <FormField label="Descricao *" className="sm:col-span-2">
              <Input
                value={form.descricao ?? ''}
                onChange={(e) => set({ descricao: e.target.value })}
                placeholder={receita ? 'Ex.: Mensalidade avulsa' : 'Ex.: Aluguel da sede'}
              />
            </FormField>
            <FormField label="Documento / NF">
              <Input
                value={form.numero_documento ?? ''}
                onChange={(e) => set({ numero_documento: e.target.value })}
                placeholder="Opcional"
              />
            </FormField>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {receita ? (
              <FormField label="Pagador (associado)">
                <Select value={form.cliente_id ?? ''} onChange={(e) => set({ cliente_id: e.target.value || null })}>
                  <option value="">-- Nao vinculado --</option>
                  {(associados ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.nome_razao_social}</option>
                  ))}
                </Select>
              </FormField>
            ) : (
              <FormField label="Favorecido (fornecedor)">
                <Select value={form.fornecedor_id ?? ''} onChange={(e) => set({ fornecedor_id: e.target.value || null })}>
                  <option value="">-- Nao vinculado --</option>
                  {(fornecedores ?? []).map((f) => (
                    <option key={f.id} value={f.id}>{f.razao_social}</option>
                  ))}
                </Select>
              </FormField>
            )}
            <FormField label="Regional (rateio e permissao de acesso)">
              <Select value={form.regional_id ?? ''} onChange={(e) => set({ regional_id: e.target.value || null })}>
                <option value="">-- Matriz (visivel so p/ admin e financeiro) --</option>
                {(regionais ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{r.nome}</option>
                ))}
              </Select>
            </FormField>
          </div>
        </Secao>

        <Secao titulo="Classificacao contabil">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Categoria do DRE">
              <Select value={form.categoria_dre_id ?? ''} onChange={(e) => set({ categoria_dre_id: e.target.value || null })}>
                <option value="">-- Nao classificado --</option>
                {categoriasDoTipo.map((c) => (
                  <option key={c.id} value={c.id}>{c.codigo_estruturado} · {c.nome}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Centro de custo">
              <Select value={form.centro_custo_id ?? ''} onChange={(e) => set({ centro_custo_id: e.target.value || null })}>
                <option value="">-- Nenhum --</option>
                {(centros ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </Select>
            </FormField>
          </div>
          {!form.categoria_dre_id && (
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" />
              Sem categoria o valor aparece no DRE como &quot;nao classificado&quot;. Classifique para o relatorio ficha gerencial.
            </p>
          )}
        </Secao>

        <Secao titulo="Valores e prazos">
          <div className="grid gap-3 sm:grid-cols-4">
            <FormField label="Valor (R$) *">
              <MoneyInput
                value={form.valor_original ?? null}
                onChange={(v) => set({ valor_original: v ?? 0 })}
                autoFocus
              />
            </FormField>
            <FormField label="Emissao">
              <Input type="date" className="tnum" value={form.data_emissao ?? hoje} onChange={(e) => set({ data_emissao: e.target.value })} />
            </FormField>
            <FormField label="1o vencimento *">
              <Input type="date" className="tnum" value={form.data_vencimento ?? hoje} onChange={(e) => set({ data_vencimento: e.target.value, competencia: form.competencia ?? e.target.value })} />
            </FormField>
            <FormField label="Competencia">
              <Input type="date" className="tnum" value={form.competencia ?? form.data_vencimento ?? hoje} onChange={(e) => set({ competencia: e.target.value })} />
            </FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Forma de pagamento prevista">
              <Select
                value={form.forma_pagamento_prevista ?? ''}
                onChange={(e) => set({ forma_pagamento_prevista: (e.target.value || null) as FormaPagamento })}
              >
                <option value="">-- A definir --</option>
                {FORMAS.map((f) => <option key={f} value={f}>{f}</option>)}
              </Select>
            </FormField>
            <FormField label="Observacoes">
              <Textarea rows={2} value={form.observacoes ?? ''} onChange={(e) => set({ observacoes: e.target.value })} placeholder="Detalhes internos, contrato, competencia especial..." />
            </FormField>
          </div>
        </Secao>

        {!edicao && (
          <Secao titulo="Parcelamento / recorrencia">
            <div className="grid gap-3 sm:grid-cols-4">
              <FormField label="Parcelas">
                <Input
                  type="number"
                  min={1}
                  max={120}
                  className="tnum"
                  value={parcelas}
                  onChange={(e) => setParcelas(Math.min(120, Math.max(1, Number(e.target.value) || 1)))}
                />
              </FormField>
              <FormField label="Periodicidade">
                <Select value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value as Periodicidade)} disabled={parcelas <= 1}>
                  {PERIODICIDADES.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
                </Select>
              </FormField>
              <FormField label="Modo" className="sm:col-span-2">
                <Select
                  value={repetirValor ? 'repetir' : 'dividir'}
                  onChange={(e) => setRepetirValor(e.target.value === 'repetir')}
                  disabled={parcelas <= 1}
                >
                  <option value="dividir">Dividir o valor entre as parcelas</option>
                  <option value="repetir">Repetir o valor em cada parcela (recorrente)</option>
                </Select>
              </FormField>
            </div>

            {previa.length > 1 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
                  <Layers className="h-3.5 w-3.5" /> Previa · {previa.length} titulos · total {formatCurrency(totalGerado)}
                </p>
                <div className="max-h-36 overflow-y-auto">
                  <table className="w-full text-xs">
                    <tbody>
                      {previa.map((p) => (
                        <tr key={p.parcela_numero} className="border-b border-slate-200/70 last:border-0">
                          <td className="py-1 pr-2 text-slate-500">{p.parcela_numero}/{p.parcela_total}</td>
                          <td className="py-1 pr-2 text-slate-600">
                            <CalendarDays className="mr-1 inline h-3 w-3 text-slate-400" />
                            {formatDate(p.data_vencimento)}
                          </td>
                          <td className="tnum py-1 text-right font-medium text-slate-800">{formatCurrency(p.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Secao>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <p className="tnum text-sm text-slate-500">
            Total do documento{' '}
            <b className={receita ? 'text-emerald-700' : 'text-rose-700'}>
              {formatCurrency(previa.length > 1 ? totalGerado : form.valor_original ?? 0)}
            </b>
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending ? 'Salvando...' : edicao ? 'Salvar alteracoes' : 'Lancar'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
