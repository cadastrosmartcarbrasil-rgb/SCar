'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Save, Satellite, Info, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MoneyInput } from '@/components/ui/field';
import { useRegrasRastreadorDoTipo, useSalvarRegraRastreadorRegional } from '@/hooks/use-regra-rastreador';
import { usePode } from '@/hooks/use-permissoes';
import { formatCurrency } from '@/lib/utils';
import type { RegraRastreadorLinha } from '@/lib/database.types';

/**
 * REGRA DO RASTREADOR POR REGIONAL (0173) — ao lado da regra da matriz, na aba
 * Tabela de Precos. Uma linha por unidade, para o tipo escolhido. A unidade sem
 * regra propria segue a da matriz; "Personalizar" grava as tres variaveis
 * (inclusive "nao exige") so para ela.
 */
function Linha({ linha, tipoVeiculoId, matriz, podeEditar }: {
  linha: RegraRastreadorLinha; tipoVeiculoId: string; podeEditar: boolean;
  matriz: { exige: boolean; limite: number; valor: number };
}) {
  const [exige, setExige] = useState(linha.exige);
  const [limite, setLimite] = useState<number | null>(linha.limite);
  const [valor, setValor] = useState<number | null>(linha.valor);
  const salvar = useSalvarRegraRastreadorRegional();
  useEffect(() => { setExige(linha.exige); setLimite(linha.limite); setValor(linha.valor); }, [linha]);

  const sujo = exige !== linha.exige || (limite ?? 0) !== linha.limite || (valor ?? 0) !== linha.valor;
  const igualMatriz = exige === matriz.exige && (limite ?? 0) === matriz.limite && (valor ?? 0) === matriz.valor;

  function gravar() {
    salvar.mutate(
      {
        regionalId: linha.regional_id, tipoVeiculoId,
        regra: igualMatriz ? null : { exige, limite: limite ?? 0, valor: valor ?? 0 },
      },
      {
        onSuccess: () => toast.success(igualMatriz
          ? `${linha.regional_nome} segue a regra da matriz.`
          : `${linha.regional_nome}: regra do rastreador salva.`),
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="px-2 py-2">
        <span className="font-medium text-slate-700">{linha.regional_nome}</span>
        {!linha.regional_ativa && <span className="ml-1 text-xs text-slate-400">(inativa)</span>}
        <div className="text-xs">
          {linha.personalizada
            ? <span className="text-cyan-700">Regra própria</span>
            : <span className="text-slate-400">Segue a matriz</span>}
        </div>
      </td>
      <td className="px-2 py-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={exige} disabled={!podeEditar}
            onChange={(e) => setExige(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          {exige ? 'Exige' : 'Não exige'}
        </label>
      </td>
      <td className="px-2 py-2">
        <MoneyInput value={limite} onChange={setLimite} disabled={!podeEditar || !exige} className="w-36" />
      </td>
      <td className="px-2 py-2">
        <MoneyInput value={valor} onChange={setValor} disabled={!podeEditar || !exige} className="w-28" />
      </td>
      <td className="px-2 py-2">
        {podeEditar && (
          <div className="flex gap-1">
            <Button type="button" variant="secondary" disabled={!sujo || salvar.isPending} onClick={gravar}
              title="Salvar a regra desta unidade">
              <Save className="h-4 w-4" />
            </Button>
            {linha.personalizada && (
              <Button type="button" variant="secondary" disabled={salvar.isPending} title="Voltar à regra da matriz"
                onClick={() => salvar.mutate(
                  { regionalId: linha.regional_id, tipoVeiculoId, regra: null },
                  {
                    onSuccess: () => toast.success(`${linha.regional_nome} voltou à regra da matriz.`),
                    onError: (e) => toast.error(e.message),
                  },
                )}>
                <Undo2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

export function RastreadorRegional({ tipoVeiculoId, matriz }: {
  tipoVeiculoId: string;
  matriz: { exige: boolean; limite: number; valor: number };
}) {
  const { data, isLoading, error } = useRegrasRastreadorDoTipo(tipoVeiculoId);
  const podeEditar = usePode('precificacao.editar');
  const linhas = data ?? [];
  const proprias = linhas.filter((l) => l.personalizada).length;

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
          Veículo que já está na base não muda de mensalidade.
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
              {linhas.map((l) => (
                <Linha key={l.regional_id} linha={l} tipoVeiculoId={tipoVeiculoId} matriz={matriz} podeEditar={podeEditar} />
              ))}
              {linhas.length === 0 && (
                <tr><td colSpan={5} className="px-2 py-3 text-sm text-slate-400">Nenhuma unidade cadastrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
