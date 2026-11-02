'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Save, Satellite, Info, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MoneyInput } from '@/components/ui/field';
import { useRegrasRastreadorDoTipo, useSalvarRegraRastreadorRegional } from '@/hooks/use-regra-rastreador';
import { usePode } from '@/hooks/use-permissoes';
import { formatCurrency } from '@/lib/utils';
import { alteracoesRegraRastreador, type RascunhoRegra } from '@/lib/produtos';
import type { RegraRastreadorLinha } from '@/lib/database.types';

/**
 * REGRA DO RASTREADOR POR REGIONAL (0173) — ao lado da regra da matriz, na aba
 * Tabela de Precos. Uma linha por unidade, para o tipo escolhido.
 *
 * O que se digita fica num RASCUNHO do painel (nao na linha), e so sai dele
 * quando e gravado: recarregar a grade (o "Salvar" da tabela de faixas faz
 * isso) nao apaga mais o que foi digitado. O botao do proprio painel grava
 * todas as unidades alteradas de uma vez. (02/11/2026: o usuario editava aqui e
 * clicava no "Salvar" da tabela, que nao grava este painel.)
 */
export function RastreadorRegional({ tipoVeiculoId, matriz }: {
  tipoVeiculoId: string;
  matriz: { exige: boolean; limite: number; valor: number };
}) {
  const { data, isLoading, error } = useRegrasRastreadorDoTipo(tipoVeiculoId);
  const podeEditar = usePode('precificacao.editar');
  const salvar = useSalvarRegraRastreadorRegional();
  const [rascunho, setRascunho] = useState<Record<string, RascunhoRegra>>({});
  const [gravando, setGravando] = useState(false);

  const linhas = useMemo(() => data ?? [], [data]);
  const proprias = linhas.filter((l) => l.personalizada).length;
  const alteracoes = useMemo(
    () => alteracoesRegraRastreador(linhas, rascunho, matriz),
    [linhas, rascunho, matriz],
  );

  const valorDe = (l: RegraRastreadorLinha): RascunhoRegra =>
    rascunho[l.regional_id] ?? { exige: l.exige, limite: l.limite, valor: l.valor };
  const mudar = (l: RegraRastreadorLinha, patch: Partial<RascunhoRegra>) =>
    setRascunho((r) => ({ ...r, [l.regional_id]: { ...valorDe(l), ...patch } }));

  async function gravarTudo() {
    if (alteracoes.length === 0) return;
    setGravando(true);
    const falhas: string[] = [];
    for (const a of alteracoes) {
      try {
        await salvar.mutateAsync({ regionalId: a.regional_id, tipoVeiculoId, regra: a.regra });
      } catch (e) {
        falhas.push(`${a.nome}: ${(e as Error).message}`);
      }
    }
    setGravando(false);
    if (falhas.length) {
      toast.error(`Não gravou: ${falhas.join(' · ')}`);
      return;
    }
    setRascunho({});
    toast.success(`Regra do rastreador gravada em ${alteracoes.length} unidade(s).`);
  }

  function voltarMatriz(l: RegraRastreadorLinha) {
    salvar.mutate(
      { regionalId: l.regional_id, tipoVeiculoId, regra: null },
      {
        onSuccess: () => {
          setRascunho((r) => { const n = { ...r }; delete n[l.regional_id]; return n; });
          toast.success(`${l.regional_nome} voltou à regra da matriz.`);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <Satellite className="h-4 w-4 text-cyan-600" />
          Rastreador por regional
        </h4>
        <p className="tnum text-xs text-slate-500">
          Matriz: {matriz.exige ? `exige acima de ${formatCurrency(matriz.limite)} · ${formatCurrency(matriz.valor)}/mês` : 'não exige'}
          {proprias > 0 && ` · ${proprias} unidade(s) com regra própria`}
        </p>
      </div>
      <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Cada unidade pode ter o próprio limite de FIPE, valor da mensalidade do rastreador ou não exigir.
          Acima do limite o rastreador já entra nos <strong>produtos contratados</strong> da cotação; abaixo
          (ou sem exigência) ele é oferecido como <strong>opcional</strong>. Deixar igual à matriz = seguir a matriz.
          <strong> Grave pelo botão deste painel</strong> — o “Salvar” da tabela de faixas não grava esta parte.
        </span>
      </p>

      {error ? (
        <p className="mt-2 text-sm text-red-600">Não foi possível ler as regras: {(error as Error).message}</p>
      ) : isLoading ? (
        <p className="mt-2 text-sm text-slate-400">Carregando...</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-superficie">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="px-2 py-2">Unidade</th>
                <th className="px-2 py-2">Rastreador</th>
                <th className="px-2 py-2">Isento até FIPE</th>
                <th className="px-2 py-2">Mensalidade</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const v = valorDe(l);
                const pendente = alteracoes.some((a) => a.regional_id === l.regional_id);
                return (
                  <tr key={l.regional_id} className={`border-b border-slate-100 last:border-0 ${pendente ? 'bg-amber-50' : ''}`}>
                    <td className="px-2 py-2">
                      <span className="font-medium text-slate-700">{l.regional_nome}</span>
                      {!l.regional_ativa && <span className="ml-1 text-xs text-slate-400">(inativa)</span>}
                      <div className="text-xs">
                        {pendente
                          ? <span className="font-medium text-amber-700">Alterado — falta gravar</span>
                          : l.personalizada
                            ? <span className="text-cyan-700">Regra própria</span>
                            : <span className="text-slate-400">Segue a matriz</span>}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={v.exige} disabled={!podeEditar}
                          onChange={(e) => mudar(l, { exige: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
                        {v.exige ? 'Exige' : 'Não exige'}
                      </label>
                    </td>
                    <td className="px-2 py-2">
                      <MoneyInput value={v.limite} onChange={(x) => mudar(l, { limite: x ?? 0 })}
                        disabled={!podeEditar || !v.exige} className="w-36" />
                    </td>
                    <td className="px-2 py-2">
                      <MoneyInput value={v.valor} onChange={(x) => mudar(l, { valor: x ?? 0 })}
                        disabled={!podeEditar || !v.exige} className="w-28" />
                    </td>
                    <td className="px-2 py-2">
                      {podeEditar && l.personalizada && (
                        <Button type="button" variant="secondary" disabled={salvar.isPending || gravando}
                          title="Voltar à regra da matriz" onClick={() => voltarMatriz(l)}>
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {linhas.length === 0 && (
                <tr><td colSpan={5} className="px-2 py-3 text-sm text-slate-400">Nenhuma unidade cadastrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {podeEditar && (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          {alteracoes.length > 0 && (
            <>
              <span className="text-xs font-medium text-amber-700">
                {alteracoes.length} unidade(s) alterada(s) ainda não gravada(s)
              </span>
              <Button type="button" variant="secondary" disabled={gravando} onClick={() => setRascunho({})}>
                Descartar
              </Button>
            </>
          )}
          <Button type="button" disabled={alteracoes.length === 0 || gravando} onClick={gravarTudo}>
            <Save className="h-4 w-4" /> {gravando ? 'Gravando...' : 'Gravar regras das unidades'}
          </Button>
        </div>
      )}
    </div>
  );
}
