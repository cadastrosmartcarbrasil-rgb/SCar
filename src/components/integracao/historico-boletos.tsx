'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErroLeitura } from '@/components/integracao/erro-leitura';
import {
  useCobrancaHistoricoResumo, useImportarHistoricoBoletos, type ProgressoImportacao,
} from '@/hooks/use-cobranca-painel';
import { DIAS_DADO_DEFASADO, diasDesde } from '@/lib/cobranca-painel';
import { formatDate, formatDateTime } from '@/lib/utils';

const inteiro = new Intl.NumberFormat('pt-BR');

/**
 * HISTORICO DE BOLETOS (0097, caminho B). Os boletos de MENSALIDADE do Mutual
 * dos associados ja carregados entram em `boletos_historico` — tabela propria,
 * NAO `titulos_financeiros` (la contariam no DRE e travariam a 24h). E o que
 * alimenta o Painel de Inadimplencia com a historia de pagamento de cada um.
 *
 * Ordem certa: puxar "Faturas (INVOICE)" em "Puxar dados" -> importar aqui.
 * Re-executavel: so regrava o boleto que mudou. Rodar de novo depois de cada
 * recaptura (e de cada carga de unidade) mantem o painel em dia.
 */
export function HistoricoBoletos() {
  const q = useCobrancaHistoricoResumo();
  const [prog, setProg] = useState<ProgressoImportacao | null>(null);
  const importar = useImportarHistoricoBoletos(setProg);
  const r = q.data;
  const idade = diasDesde(r?.ultima_captura);

  const rodar = () => {
    setProg(null);
    importar.mutate(undefined, {
      onSuccess: (t) => toast.success(
        `Historico atualizado: ${inteiro.format(t.gravados)} boletos novos ou alterados.`,
      ),
      onError: (e) => toast.error((e as Error).message ?? 'Falha ao importar.'),
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-slate-500">
        Traz os boletos de <strong>mensalidade</strong> do Mutual dos associados <strong>ja carregados</strong>{' '}
        para o historico do SCar — e o que mostra a <strong>qualidade do pagador</strong> no{' '}
        <Link href="/cobrancas/painel" className="font-medium text-cyan-700 underline">Painel de Inadimplencia</Link>.
        Eles <strong>nao viram titulo</strong>: nao entram no DRE, nao geram cobranca e nao travam a 24h.
        Depois do corte de dezembro o historico <strong>fica</strong> — e a historia de pagamento de cada um.
      </p>
      <ErroLeitura q={q} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Numero rotulo="Boletos no historico" valor={inteiro.format(r?.boletos ?? 0)}
          detalhe={`${inteiro.format(r?.associados ?? 0)} associados`} />
        <Numero rotulo="Pagos · abertos · cancelados"
          valor={`${inteiro.format(r?.pagos ?? 0)} · ${inteiro.format(r?.abertos ?? 0)} · ${inteiro.format(r?.cancelados ?? 0)}`} />
        <Numero rotulo="Vencimentos" valor={r?.primeiro_vencimento ? `${formatDate(r.primeiro_vencimento)} a ${formatDate(r.ultimo_vencimento)}` : '—'} />
        <Numero rotulo="Faturas capturadas (INVOICE)" valor={inteiro.format(r?.boletos_capturados ?? 0)}
          detalhe={r?.ultima_captura ? `captura de ${formatDateTime(r.ultima_captura)}` : 'nunca puxadas'}
          alerta={idade !== null && idade > DIAS_DADO_DEFASADO} />
      </div>

      {idade !== null && idade > DIAS_DADO_DEFASADO && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          A captura das faturas tem {idade} dias. Puxe <strong>Faturas (INVOICE)</strong> em “Puxar dados” antes de
          importar — senao o painel mostra como em aberto o que ja foi pago no Mutual.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={rodar} disabled={importar.isPending || !r?.boletos_capturados}>
          {importar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
          {importar.isPending ? 'Importando…' : 'Importar / atualizar historico'}
        </Button>
        {r?.ultima_importacao && (
          <span className="text-xs text-slate-500">Ultima atualizacao: {formatDateTime(r.ultima_importacao)}</span>
        )}
      </div>

      {prog && (
        <p className="tnum text-xs text-slate-600">
          {inteiro.format(prog.lidos)} faturas lidas · {inteiro.format(prog.mensalidades)} mensalidades ·{' '}
          <b>{inteiro.format(prog.gravados)} gravadas</b> · {inteiro.format(prog.semAssociado)} de associado ainda nao
          carregado (ficam de fora)
          {prog.statusDesconhecido > 0 && <> · <b className="text-amber-700">{inteiro.format(prog.statusDesconhecido)} com situacao desconhecida</b> (nao entram — avisar)</>}
          {prog.fim ? ' · concluido.' : '…'}
        </p>
      )}
    </div>
  );
}

function Numero({ rotulo, valor, detalhe, alerta }: { rotulo: string; valor: string; detalhe?: string; alerta?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${alerta ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200'}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className="tnum mt-1 text-sm font-semibold text-slate-900">{valor}</p>
      {detalhe && <p className="mt-0.5 text-[11px] text-slate-500">{detalhe}</p>}
    </div>
  );
}
