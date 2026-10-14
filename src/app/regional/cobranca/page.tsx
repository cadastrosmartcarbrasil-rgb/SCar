'use client';

import { PainelInadimplencia } from '@/components/cobrancas/painel-inadimplencia';
import { useUnidadeAtual } from '@/components/regional/contexto-unidade';

/**
 * O painel de Inadimplencia e Cobrancas da matriz (0097), travado na unidade do
 * portal. O gestor so le a propria: `cobranca_escopo()` decide no banco, nao a
 * tela — pedir outra unidade devolve vazio.
 */
export default function CobrancaRegionalPage() {
  const { regionalId, nome } = useUnidadeAtual();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Inadimplencia e Cobrancas</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {nome} — quem precisa ser cobrado, quanto, e como o recebimento evolui. Boleto que ainda nao
          venceu nao entra em nenhuma taxa; todo numero abre os boletos que o compoem.
        </p>
      </header>
      {regionalId ? <PainelInadimplencia unidade={{ id: regionalId, nome }} /> : null}
    </div>
  );
}
