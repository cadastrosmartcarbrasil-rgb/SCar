'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, FileOutput, RefreshCw } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField, Input } from '@/components/ui/field';
import { Vazio } from '@/components/financeiro/ui-financeiro';
import { useApurarComissoes, useComissoesPrevia, useGerarContasPagarComissoes } from '@/hooks/use-comissoes';
import { formatCurrency, formatDate } from '@/lib/utils';
import { somarMoeda } from '@/lib/money';
import { vencimentoSugerido } from '@/lib/comissoes';

const rotuloComp = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * O financeiro escolhe a DATA de vencimento e gera o contas a pagar das
 * comissoes pendentes ate a competencia: 1 titulo por favorecido (consultor
 * ou regional) x regional, categoria 3.2.01 — Comissoes de Vendas.
 */
export function GerarContasPagarModal({
  open,
  onClose,
  competencia,
  regionalId,
  regionalNome,
  diaPadrao,
}: {
  open: boolean;
  onClose: () => void;
  competencia: string;
  regionalId: string | null;
  regionalNome: string;
  diaPadrao: number;
}) {
  const [vencimento, setVencimento] = useState(() => vencimentoSugerido(competencia, diaPadrao));
  useEffect(() => {
    if (open) setVencimento(vencimentoSugerido(competencia, diaPadrao));
  }, [open, competencia, diaPadrao]);

  const { data: previa, isLoading, refetch, isFetching } = useComissoesPrevia(competencia, regionalId, open);
  const apurar = useApurarComissoes();
  const gerar = useGerarContasPagarComissoes();

  const total = useMemo(() => somarMoeda(...(previa ?? []).map((p) => Number(p.valor_comissao))), [previa]);
  const consultores = (previa ?? []).filter((p) => p.beneficiario === 'VENDEDOR');
  const regionais = (previa ?? []).filter((p) => p.beneficiario === 'REGIONAL');

  function recalcular() {
    apurar.mutate(
      { competencia, regionalId },
      {
        onSuccess: (r) => {
          toast.success(`Competencia recalculada: ${formatCurrency(Number(r?.valor_total ?? 0))}`);
          refetch();
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  function confirmar() {
    if (!vencimento) return toast.error('Escolha a data de vencimento');
    gerar.mutate(
      { competencia, vencimento, regionalId },
      {
        onSuccess: (lote) => {
          toast.success(
            `${lote.qtd_lancamentos} conta(s) a pagar gerada(s) — ${formatCurrency(Number(lote.valor_total))} com vencimento em ${formatDate(lote.data_vencimento)}`,
          );
          onClose();
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Gerar contas a pagar de comissoes"
      subtitulo={`Competencia ${rotuloComp(competencia)} · ${regionalNome}`}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 px-3.5 py-2.5 text-xs leading-relaxed text-slate-600">
          Comissao <b>recorrente</b> sobre o valor <b>recebido</b> dos boletos (adesao nao e paga). Entram as
          comissoes pendentes ate {rotuloComp(competencia)}, inclusive boletos de meses anteriores pagos com
          atraso. O que ja foi enviado ao financeiro nao e lancado de novo.
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">Favorecido</th>
                <th className="px-3 py-2">Regional</th>
                <th className="px-3 py-2 text-right">Boletos</th>
                <th className="px-3 py-2 text-right">Base recebida</th>
                <th className="px-3 py-2 text-right">Comissao</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-400">Carregando previa...</td>
                </tr>
              )}
              {[...consultores, ...regionais].map((p) => (
                <tr key={`${p.beneficiario}-${p.vendedor_id ?? ''}-${p.regional_id ?? ''}`} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-800">{p.favorecido}</span>
                    <span
                      className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        p.beneficiario === 'VENDEDOR' ? 'bg-brand-50 text-brand-700' : 'bg-cyan-50 text-cyan-700'
                      }`}
                    >
                      {p.beneficiario === 'VENDEDOR' ? 'Consultor' : 'Regional'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{p.regional_nome ?? '-'}</td>
                  <td className="tnum px-3 py-2 text-right text-slate-600">{p.qtd_itens}</td>
                  <td className="tnum px-3 py-2 text-right text-slate-600">{formatCurrency(Number(p.base_calculo))}</td>
                  <td className="tnum px-3 py-2 text-right font-semibold text-slate-900">{formatCurrency(Number(p.valor_comissao))}</td>
                </tr>
              ))}
            </tbody>
            {(previa ?? []).length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                  <td className="px-3 py-2" colSpan={4}>
                    {(previa ?? []).length} titulo(s) a pagar
                  </td>
                  <td className="tnum px-3 py-2 text-right text-brand-700">{formatCurrency(total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          {!isLoading && (previa ?? []).length === 0 && (
            <Vazio
              icon={FileOutput}
              titulo="Nada pendente"
              descricao="Nao ha comissao pendente ate esta competencia. Se um boleto foi baixado agora ou uma taxa mudou, clique em Recalcular."
            />
          )}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <FormField label="Vencimento do contas a pagar *" className="w-56">
            <div className="relative">
              <CalendarClock className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input type="date" className="pl-8" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </div>
          </FormField>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={recalcular} disabled={apurar.isPending || isFetching}>
              <RefreshCw className={`h-4 w-4 ${apurar.isPending ? 'animate-spin' : ''}`} /> Recalcular
            </Button>
            <Button onClick={confirmar} disabled={gerar.isPending || total <= 0}>
              <FileOutput className="h-4 w-4" />
              {gerar.isPending ? 'Gerando...' : `Gerar ${formatCurrency(total)}`}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
