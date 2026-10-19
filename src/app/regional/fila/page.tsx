'use client';

import { FilaCobranca } from '@/components/cobrancas/fila-cobranca';
import { useUnidadeAtual } from '@/components/regional/contexto-unidade';

/**
 * A Fila de Cobranca da matriz (0098), travada na unidade do portal. O gestor
 * so ve e trabalha os associados da propria unidade: `cobranca_escopo()` decide
 * no banco (a fila, a ficha e o registro de contato), nao a tela.
 */
export default function FilaCobrancaRegionalPage() {
  const { regionalId, nome } = useUnidadeAtual();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Fila de Cobranca</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {nome} — quem cobrar agora, na ordem: promessa quebrada, retorno atrasado, retorno de hoje e quem
          ainda nao foi contatado. Todo contato fica no historico — e nao se apaga.
        </p>
      </header>
      {regionalId ? <FilaCobranca unidade={{ id: regionalId, nome }} /> : null}
    </div>
  );
}
