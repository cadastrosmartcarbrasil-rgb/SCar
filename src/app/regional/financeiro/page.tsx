'use client';

import { Info } from 'lucide-react';
import { FinanceiroRegional } from '@/components/regional/financeiro-regional';
import { useMinhaRegional } from '@/hooks/use-regional';

/**
 * Financeiro da unidade — proposital e deliberadamente pequeno.
 * A operacao toda (mensalidade, evento, assistencia, fornecedor) e da matriz;
 * a franquia so movimenta comissao. Por isso aqui nao existe plano de contas,
 * centro de custo nem conta bancaria: sao cadastros da matriz.
 */
export default function FinanceiroRegionalPage() {
  const { data } = useMinhaRegional();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Financeiro da unidade</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Comissão a receber da matriz e repasse aos seus vendedores.
        </p>
      </header>

      <p className="flex items-start gap-1.5 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-cyan-900">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" />
        Este financeiro trata <b>só comissão</b> — o que a matriz repassa à sua unidade e o que a sua
        unidade repassa aos vendedores. Plano de contas, centro de custo e contas bancárias são da
        matriz e não são configurados aqui. A separação é feita no banco, não apenas na tela:
        lançamento da matriz nunca aparece nem pode ser baixado por esta página.
      </p>

      <FinanceiroRegional regionalId={data?.perfil?.regional_id ?? null} />
    </div>
  );
}
