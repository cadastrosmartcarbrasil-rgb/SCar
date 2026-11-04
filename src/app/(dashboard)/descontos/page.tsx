'use client';

/**
 * DESCONTOS PARA APROVAR (0178): todo desconto na mensalidade (proposta) e todo
 * desconto pedido na edicao de boleto do SCar espera a diretoria aqui. Enquanto
 * o da proposta nao e aprovado, a venda nao entra na base e o carne nao sai.
 */
import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { BadgePercent, CheckCircle2, FileText, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { usePode } from '@/hooks/use-permissoes';
import { useDecidirDesconto, useDescontosPendentes } from '@/hooks/use-descontos';
import { textoValidade } from '@/lib/desconto-mensalidade';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { DescontoPendente } from '@/lib/database.types';

export default function DescontosPage() {
  const podeAprovar = usePode('desconto');
  const { data: linhas = [], isLoading, error } = useDescontosPendentes();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <BadgePercent className="h-6 w-6 text-cyan-600" /> Descontos para aprovar
        </h1>
        <p className="text-sm text-slate-500">
          Desconto na mensalidade das propostas, no cadastro do veículo da base e o pedido na edição de boleto. Enquanto o desconto da
          proposta não é aprovado, a venda não entra na base e os boletos não são emitidos.
        </p>
      </div>

      {!podeAprovar && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Aprovar desconto é da diretoria (alçada “Desconto” nas permissões do perfil).
        </p>
      )}
      {error && <p className="text-sm text-rose-600">Não foi possível ler a fila: {(error as Error).message}</p>}
      {isLoading && <p className="text-sm text-slate-500">Carregando...</p>}
      {!isLoading && linhas.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Nenhum desconto esperando aprovação.
        </p>
      )}

      <div className="space-y-3">
        {linhas.map((l) => <Pedido key={`${l.origem}-${l.id}`} l={l} />)}
      </div>
    </div>
  );
}

function Pedido({ l }: { l: DescontoPendente }) {
  const decidir = useDecidirDesconto();
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const link = l.origem === 'COTACAO' && l.lead_id ? `/vendas/${l.lead_id}`
    : l.origem === 'VEICULO' && l.cliente_id ? `/associados/${l.cliente_id}`
    : l.cliente_id ? `/associados/${l.cliente_id}?aba=financeiro` : null;

  async function acao(aprovar: boolean) {
    if (!aprovar && motivo.trim().length < 3) return toast.error('Informe o motivo da recusa');
    try {
      await decidir.mutateAsync({ origem: l.origem, id: l.id, aprovar, motivo });
      toast.success(aprovar ? 'Desconto aprovado' : 'Desconto recusado');
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-superficie p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {l.origem === 'COTACAO' ? 'Proposta (mensalidade)'
              : l.origem === 'VEICULO' ? 'Veículo da base (próximos boletos)' : 'Edição de boleto'}
            {l.regional ? ` · ${l.regional}` : ''}
          </p>
          {link
            ? <Link href={link} className="font-medium text-slate-800 hover:underline">{l.nome ?? '-'}</Link>
            : <span className="font-medium text-slate-800">{l.nome ?? '-'}</span>}
          {l.placa && <span className="placa ml-2 text-xs text-slate-500">{l.placa}</span>}
          <p className="mt-1 text-sm text-slate-600">
            <span className="tnum line-through text-slate-400">{formatCurrency(Number(l.valor_tabela))}</span>{' '}
            → <b className="tnum">{formatCurrency(Number(l.valor_final))}</b>
            <span className="ml-1 text-xs text-slate-500">
              (− {formatCurrency(Number(l.desconto))} · {Number(l.percentual).toFixed(2).replace('.', ',')}%)
            </span>
          </p>
          <p className="text-xs text-slate-500">
            {l.origem !== 'TITULO'
              ? `Validade: ${textoValidade(l.valido_ate)}`
              : `Boleto com vencimento ${formatDate(l.vencimento)}`}
          </p>
          {l.justificativa && (
            <p className="mt-1 flex items-start gap-1 text-xs text-slate-600">
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {l.justificativa}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-400">
            Pedido por {l.solicitado_por ?? '—'} em {formatDate(l.solicitado_em)}
          </p>
        </div>
        {!recusando && (
          <div className="flex gap-2">
            <Button type="button" disabled={decidir.isPending} onClick={() => acao(true)}>
              {decidir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Aprovar
            </Button>
            <Button type="button" variant="secondary" onClick={() => setRecusando(true)}>
              <XCircle className="h-4 w-4 text-rose-600" /> Recusar
            </Button>
          </div>
        )}
      </div>
      {recusando && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="min-w-[16rem] flex-1">
            <Input placeholder="Motivo da recusa" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <Button type="button" variant="danger" disabled={decidir.isPending} onClick={() => acao(false)}>Recusar</Button>
          <Button type="button" variant="ghost" onClick={() => setRecusando(false)}>Voltar</Button>
        </div>
      )}
    </div>
  );
}
