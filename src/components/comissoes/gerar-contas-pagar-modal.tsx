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
 * comissoes pendentes ate a competencia: 1 titulo por favorecido (franquia ou
 * consultor), categoria de comissao a pagar. Pagou atrasado? Entra aqui.
 */
export function GerarContasPagarModal({
  open, onClose, competencia, regionalId, regionalNome, diaPadrao,
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

  const { data: previa, isLoading, isFetching, refetch } = useComissoesPrevia(competencia, regionalId, open);
  const apurar = useApurarComissoes();
  const gerar = useGerarContasPagarComissoes();
  const total = useMemo(() => somarMoeda(...(previa ?? []).map((p) => Number(p.valor_comissao))), [previa]);

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
            `${lote.qtd_lancamentos} conta(s) a pagar gerada(s): ${formatCurrency(Number(lote.valor_total))}, vencimento ${formatDate(lote.data_vencimento)}`,
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
      tamanho="lg"
      title="Gerar contas a pagar das comissões"
      subtitulo={`Competência ${rotuloComp(competencia)} · ${regionalNome}`}
    >
      <div className="space-y-4">
        <p className="rounded-lg border border-cyan-200 bg-cyan-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-600">
          Comissão <b>recorrente</b> sobre o valor <b>recebido</b> (boletos do SCar e do Mutual) — adesão não é paga.
          Entram as comissões pendentes até {rotuloComp(competencia)}, inclusive boletos de meses anteriores pagos
          com atraso. O que já foi enviado não é lançado de novo. A geração recalcula antes de lançar.
        </p>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Favorecido</th>
                <th className="px-3 py-2">Regional</th>
                <th className="px-3 py-2 text-right">Boletos</th>
                <th className="px-3 py-2 text-right">Base recebida</th>
                <th className="px-3 py-2 text-right">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">Carregando prévia...</td></tr>
              )}
              {(previa ?? []).map((p) => (
                <tr key={`${p.beneficiario}-${p.regional_id}-${p.vendedor_id ?? ''}`} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-800">{p.favorecido}</span>
                    <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      p.beneficiario === 'FRANQUIA' ? 'bg-cyan-50 text-cyan-700' : 'bg-slate-100 text-slate-600'}`}>
                      {p.beneficiario === 'FRANQUIA' ? 'Franquia' : 'Consultor'}
                    </span>
                    {p.beneficiario === 'VENDEDOR' && !p.chave_pix && (
                      <span className="ml-1 text-[10px] text-amber-600">sem PIX no cadastro</span>
                    )}
                    {p.competencia_min < competencia && (
                      <span className="block text-[11px] text-slate-400">inclui atrasados desde {rotuloComp(p.competencia_min)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{p.regional_nome}</td>
                  <td className="tnum px-3 py-2 text-right text-slate-600">{p.qtd_itens}</td>
                  <td className="tnum px-3 py-2 text-right text-slate-600">{formatCurrency(Number(p.base_calculo))}</td>
                  <td className="tnum px-3 py-2 text-right font-semibold text-slate-900">{formatCurrency(Number(p.valor_comissao))}</td>
                </tr>
              ))}
            </tbody>
            {(previa ?? []).length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                  <td className="px-3 py-2" colSpan={4}>{(previa ?? []).length} título(s) a pagar</td>
                  <td className="tnum px-3 py-2 text-right text-slate-900">{formatCurrency(total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          {!isLoading && (previa ?? []).length === 0 && (
            <Vazio
              icon={FileOutput}
              titulo="Nada pendente na prévia"
              descricao="Clique em Recalcular para apurar a competência com os boletos recebidos até agora e as taxas atuais dos cadastros."
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
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={recalcular} disabled={apurar.isPending || isFetching}>
              <RefreshCw className={`h-4 w-4 ${apurar.isPending ? 'animate-spin' : ''}`} /> Recalcular
            </Button>
            <Button onClick={confirmar} disabled={gerar.isPending || !vencimento}>
              <FileOutput className="h-4 w-4" />
              {gerar.isPending ? 'Gerando...' : 'Gerar contas a pagar'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
