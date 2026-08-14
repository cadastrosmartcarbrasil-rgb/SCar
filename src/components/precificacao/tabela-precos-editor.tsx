'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Save, Percent, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import {
  useTiposVeiculo, useProdutos, useTabelaPrecos, useParticipacoes, useAdesoes, useSalvarTabela,
  useSalvarRegraRastreador,
} from '@/hooks/use-precificacao';

interface Banda {
  fipe_minimo: number;
  fipe_maximo: number;
  participacao_tipo: 'VALOR' | 'PERCENTUAL';
  participacao_valor: number; // se PERCENTUAL, em % (ex.: 4)
  adesao: number; // taxa de adesao (cobranca unica) da faixa, R$
  valores: Record<string, number>; // produtoId -> R$
}

export function TabelaPrecosEditor() {
  const { data: tipos } = useTiposVeiculo();
  const { data: produtos } = useProdutos();
  const [tipoId, setTipoId] = useState('');
  const { data: tabela } = useTabelaPrecos(tipoId || undefined);
  const { data: participacoes } = useParticipacoes(tipoId || undefined);
  const { data: adesoes } = useAdesoes(tipoId || undefined);
  const salvar = useSalvarTabela();
  const salvarRegra = useSalvarRegraRastreador();

  const tipoSel = useMemo(() => (tipos ?? []).find((t) => t.id === tipoId), [tipos, tipoId]);
  const [regra, setRegra] = useState({ exige: false, limite: 0, valor: 0 });
  useEffect(() => {
    if (tipoSel) setRegra({
      exige: tipoSel.exige_rastreador,
      limite: Number(tipoSel.valor_limite_isencao ?? 0),
      valor: Number(tipoSel.valor_mensalidade_rastreador ?? 0),
    });
  }, [tipoSel]);

  const faixaProdutos = useMemo(
    () => (produtos ?? []).filter((p) => p.metodo_preco === 'FAIXA_FIPE' && p.status),
    [produtos],
  );

  const [bandas, setBandas] = useState<Banda[]>([]);
  const [reaj, setReaj] = useState(0);

  // Reconstroi as bandas quando o tipo/dados mudam.
  useEffect(() => {
    if (!tipoId) return;
    const keys = new Map<string, { min: number; max: number }>();
    (participacoes ?? []).forEach((p) => keys.set(`${p.fipe_minimo}_${p.fipe_maximo}`, { min: Number(p.fipe_minimo), max: Number(p.fipe_maximo) }));
    (adesoes ?? []).forEach((a) => keys.set(`${a.fipe_minimo}_${a.fipe_maximo}`, { min: Number(a.fipe_minimo), max: Number(a.fipe_maximo) }));
    (tabela ?? []).forEach((t) => keys.set(`${t.fipe_minimo}_${t.fipe_maximo}`, { min: Number(t.fipe_minimo), max: Number(t.fipe_maximo) }));
    const lista = [...keys.values()].sort((a, b) => a.min - b.min);

    setBandas(
      lista.map(({ min, max }) => {
        const valores: Record<string, number> = {};
        (tabela ?? [])
          .filter((t) => Number(t.fipe_minimo) === min && Number(t.fipe_maximo) === max)
          .forEach((t) => { valores[t.produto_id] = Number(t.valor_mensal); });
        const part = (participacoes ?? []).find((p) => Number(p.fipe_minimo) === min && Number(p.fipe_maximo) === max);
        const ades = (adesoes ?? []).find((a) => Number(a.fipe_minimo) === min && Number(a.fipe_maximo) === max);
        const tipoPart = (part?.tipo_valor ?? 'VALOR') as 'VALOR' | 'PERCENTUAL';
        return {
          fipe_minimo: min,
          fipe_maximo: max,
          participacao_tipo: tipoPart,
          participacao_valor: tipoPart === 'PERCENTUAL' ? Number(part?.valor ?? 0) * 100 : Number(part?.valor ?? 0),
          adesao: Number(ades?.valor ?? 0),
          valores,
        };
      }),
    );
  }, [tipoId, tabela, participacoes, adesoes]);

  function setBanda(i: number, patch: Partial<Banda>) {
    setBandas((bs) => bs.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function setValor(i: number, produtoId: string, val: number) {
    setBandas((bs) => bs.map((b, idx) => (idx === i ? { ...b, valores: { ...b.valores, [produtoId]: val } } : b)));
  }
  function addBanda() {
    const ultima = bandas[bandas.length - 1];
    const min = ultima ? ultima.fipe_maximo + 1 : 0;
    setBandas((bs) => [...bs, { fipe_minimo: min, fipe_maximo: min + 5000, participacao_tipo: 'VALOR', participacao_valor: 0, adesao: ultima?.adesao ?? 0, valores: {} }]);
  }
  function removeBanda(i: number) {
    setBandas((bs) => bs.filter((_, idx) => idx !== i));
  }

  function aplicarReajuste() {
    if (!reaj) return;
    const fator = 1 + reaj / 100;
    setBandas((bs) =>
      bs.map((b) => ({
        ...b,
        participacao_valor: b.participacao_tipo === 'VALOR' ? round2(b.participacao_valor * fator) : b.participacao_valor,
        adesao: round2(b.adesao * fator),
        valores: Object.fromEntries(Object.entries(b.valores).map(([k, v]) => [k, round2(v * fator)])),
      })),
    );
    toast.success(`Reajuste de ${reaj}% aplicado (revise e clique em Salvar)`);
  }

  function salvarTudo() {
    if (!tipoId) return toast.error('Selecione o tipo de veiculo');
    for (const b of bandas) {
      if (b.fipe_maximo < b.fipe_minimo) return toast.error('Ha faixa com FIPE maximo menor que o minimo');
    }
    const faixas = bandas.flatMap((b) =>
      faixaProdutos.map((p) => ({
        produto_id: p.id,
        fipe_minimo: b.fipe_minimo,
        fipe_maximo: b.fipe_maximo,
        valor_mensal: b.valores[p.id] ?? 0,
        tipo_valor: 'VALOR',
      })),
    );
    const participacoesPayload = bandas.map((b) => ({
      fipe_minimo: b.fipe_minimo,
      fipe_maximo: b.fipe_maximo,
      valor: b.participacao_tipo === 'PERCENTUAL' ? b.participacao_valor / 100 : b.participacao_valor,
      tipo_valor: b.participacao_tipo,
    }));
    const adesoesPayload = bandas.map((b) => ({
      fipe_minimo: b.fipe_minimo,
      fipe_maximo: b.fipe_maximo,
      valor: b.adesao,
    }));
    salvar.mutate(
      { tipoVeiculoId: tipoId, faixas, participacoes: participacoesPayload, adesoes: adesoesPayload },
      { onSuccess: () => toast.success('Tabela salva'), onError: (e) => toast.error(e.message) },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-64">
          <label className="text-xs text-slate-500">Tipo de veiculo</label>
          <Select value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
            <option value="">-- Selecione --</option>
            {(tipos ?? []).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </Select>
        </div>
        {tipoId && (
          <div className="flex items-end gap-2">
            <div>
              <label className="text-xs text-slate-500">Reajuste (%)</label>
              <div className="flex items-center gap-1">
                <input type="number" step="0.1" value={reaj} onChange={(e) => setReaj(Number(e.target.value))}
                  className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                <Button variant="secondary" onClick={aplicarReajuste} type="button"><Percent className="h-4 w-4" /> Aplicar</Button>
              </div>
            </div>
            <Button variant="secondary" type="button" onClick={addBanda}><Plus className="h-4 w-4" /> Faixa</Button>
            <Button type="button" onClick={salvarTudo} disabled={salvar.isPending}>
              {salvar.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
            </Button>
          </div>
        )}
      </div>

      {tipoId && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={regra.exige} onChange={(e) => setRegra({ ...regra, exige: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
              Exige rastreador (gatilho de isencao)
            </label>
            <div>
              <label className="text-xs text-slate-500">Isento ate FIPE (R$)</label>
              <NumInput value={regra.limite} onChange={(v) => setRegra({ ...regra, limite: v })} w="w-28" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Mensalidade rastreador (R$)</label>
              <NumInput value={regra.valor} onChange={(v) => setRegra({ ...regra, valor: v })} w="w-28" />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={salvarRegra.isPending}
              onClick={() =>
                salvarRegra.mutate(
                  { tipoVeiculoId: tipoId, exige: regra.exige, limite: regra.limite, valor: regra.valor },
                  { onSuccess: () => toast.success('Regra de rastreador salva'), onError: (e) => toast.error(e.message) },
                )
              }
            >
              <Save className="h-4 w-4" /> Salvar regra
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Acima do limite FIPE, o rastreador entra automaticamente na cotacao base. Abaixo, e isento (R$ 0).
          </p>
        </div>
      )}

      {!tipoId ? (
        <p className="text-sm text-slate-400">Selecione um tipo de veiculo para editar a matriz de precos.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="px-2 py-2">FIPE min</th>
                <th className="px-2 py-2">FIPE max</th>
                {faixaProdutos.map((p) => <th key={p.id} className="px-2 py-2">{p.nome}</th>)}
                <th className="px-2 py-2">Particip.</th>
                <th className="px-2 py-2">Adesao (R$)</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {bandas.map((b, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="px-2 py-1"><NumInput value={b.fipe_minimo} onChange={(v) => setBanda(i, { fipe_minimo: v })} w="w-24" /></td>
                  <td className="px-2 py-1"><NumInput value={b.fipe_maximo} onChange={(v) => setBanda(i, { fipe_maximo: v })} w="w-24" /></td>
                  {faixaProdutos.map((p) => (
                    <td key={p.id} className="px-2 py-1"><NumInput value={b.valores[p.id] ?? 0} onChange={(v) => setValor(i, p.id, v)} w="w-20" /></td>
                  ))}
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-1">
                      <NumInput value={b.participacao_valor} onChange={(v) => setBanda(i, { participacao_valor: v })} w="w-20" />
                      <select value={b.participacao_tipo} onChange={(e) => setBanda(i, { participacao_tipo: e.target.value as 'VALOR' | 'PERCENTUAL' })}
                        className="rounded border border-slate-300 px-1 py-1 text-xs">
                        <option value="VALOR">R$</option>
                        <option value="PERCENTUAL">% FIPE</option>
                      </select>
                    </div>
                  </td>
                  <td className="px-2 py-1"><NumInput value={b.adesao} onChange={(v) => setBanda(i, { adesao: v })} w="w-20" /></td>
                  <td className="px-2 py-1">
                    <button onClick={() => removeBanda(i)}><Trash2 className="h-4 w-4 text-rose-400 hover:text-rose-600" /></button>
                  </td>
                </tr>
              ))}
              {bandas.length === 0 && (
                <tr><td colSpan={faixaProdutos.length + 5} className="px-2 py-6 text-center text-slate-400">Nenhuma faixa. Clique em Faixa para adicionar.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-400">
        Os valores por produto sao mensais (R$). O reajuste multiplica todos os valores; revise e clique em Salvar.
        Salvar substitui a tabela do tipo selecionado de forma atomica.
      </p>
    </div>
  );
}

function NumInput({ value, onChange, w }: { value: number; onChange: (v: number) => void; w: string }) {
  return (
    <input type="number" step="0.01" value={value}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      className={`${w} rounded border border-slate-300 px-2 py-1 text-sm`} />
  );
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
