'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { HandCoins, Info, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FormField, Input } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { RelatorioConsultores } from '@/components/comissoes/relatorio-consultores';
import { useUnidadeAtual } from '@/components/regional/contexto-unidade';
import { useComissaoDaMatriz, useGerarRepasseFranquia } from '@/hooks/use-comissoes';
import { formatCurrency } from '@/lib/utils';

const dataBR = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

function diasDepois(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * O que a franquia recebe da matriz no período (pela data do crédito): a taxa
 * da unidade sobre o recebido da carteira — a mesma conta da Gestão de comissões.
 */
function ComissaoDaMatrizCard({ regionalId, periodo }: { regionalId: string | null; periodo: { inicio: string; fim: string } }) {
  const { data, isLoading } = useComissaoDaMatriz(regionalId, periodo.inicio, periodo.fim);
  if (isLoading || !data || data.destino !== 'FRANQUIA') return null;
  const pct = `${(data.taxa * 100).toFixed(2).replace('.', ',').replace(',00', '')}%`;
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2 pt-4 text-sm">
        <span className="flex items-center gap-2 font-semibold text-slate-800">
          <Landmark className="h-4 w-4 text-cyan-600" aria-hidden /> A receber da matriz no período
        </span>
        <span className="tnum">
          <span className="text-slate-500">Recebido da carteira </span>{formatCurrency(data.base_recebida)}
          <span className="text-slate-500"> × {pct} = </span>
          <b className="text-slate-900">{formatCurrency(data.valor_estimado)}</b>
        </span>
        <span className="tnum text-xs text-slate-500">
          Lançado pela matriz: {formatCurrency(data.apurado)} · a pagar {formatCurrency(data.a_pagar)} · pago {formatCurrency(data.pago)}
        </span>
      </CardContent>
    </Card>
  );
}

function GerarRepasse({
  regionalId, nome, periodo, aRepassar, invertido,
}: {
  regionalId: string | null; nome: string; periodo: { inicio: string; fim: string }; aRepassar: number; invertido: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [vencimento, setVencimento] = useState(() => diasDepois(5));
  const gerar = useGerarRepasseFranquia();

  function confirmar() {
    gerar.mutate({ regionalId, ...periodo, vencimento }, {
      onSuccess: (l) => {
        toast.success(`${l.qtd_lancamentos} título(s) no contas a pagar da unidade — ${formatCurrency(l.valor_total)}`);
        setAberto(false);
      },
      onError: (e: unknown) => toast.error((e as Error).message),
    });
  }

  return (
    <>
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="text-sm">
            <p className="flex items-center gap-1.5 font-semibold text-slate-800">
              <HandCoins className="h-4 w-4 text-amber-600" aria-hidden /> Repasse aos consultores
            </p>
            <p className="text-xs text-slate-500">
              Um título por consultor no contas a pagar da unidade, com tudo o que creditou de {dataBR(periodo.inicio)} a{' '}
              {dataBR(periodo.fim)} e ainda não foi repassado. A baixa é feita em Financeiro.
            </p>
          </div>
          <Button onClick={() => setAberto(true)} disabled={invertido || aRepassar <= 0}>
            Gerar repasse ({formatCurrency(aRepassar)})
          </Button>
        </CardContent>
      </Card>

      <Modal open={aberto} onClose={() => setAberto(false)} title="Gerar repasse do período">
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">
            {nome}: <b>{formatCurrency(aRepassar)}</b> a repassar, crédito de {dataBR(periodo.inicio)} a {dataBR(periodo.fim)}.
            Cada consultor ganha um título com os boletos dele; cancelar o título devolve os boletos para o próximo repasse.
          </p>
          <FormField label="Vencimento dos títulos">
            <Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAberto(false)}>Voltar</Button>
            <Button onClick={confirmar} disabled={!vencimento || gerar.isPending}>
              {gerar.isPending ? 'Gerando…' : 'Gerar no contas a pagar'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export default function ComissoesRegionalPage() {
  const { regionalId, nome } = useUnidadeAtual();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Comissões</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          A comissão recorrente da equipe, pelo dia em que o recebimento creditou no banco — os mesmos números da matriz.
        </p>
      </header>

      <RelatorioConsultores
        matriz={false}
        regionais={[]}
        unidade={{ id: regionalId, nome }}
        extra={({ periodo, aRepassar, invertido }) => (
          <div className="space-y-3">
            <ComissaoDaMatrizCard regionalId={regionalId} periodo={periodo} />
            <GerarRepasse regionalId={regionalId} nome={nome} periodo={periodo} aRepassar={aRepassar} invertido={invertido} />
          </div>
        )}
      />

      <p className="flex items-start gap-1.5 rounded-xl border border-slate-200 bg-superficie px-3 py-2.5 text-xs text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        A adesão não entra aqui: ela é cobrada em boleto avulso próprio e nunca se mistura com a recorrência.
      </p>
    </div>
  );
}
