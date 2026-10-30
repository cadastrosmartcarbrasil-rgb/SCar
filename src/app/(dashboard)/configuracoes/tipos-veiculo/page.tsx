'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useTiposVeiculo, useSaveTipoVeiculo, useDeleteTipoVeiculo, useSaveKmReboqueTipo } from '@/hooks/use-precificacao';
import type { TiposVeiculoRow } from '@/lib/database.types';

export default function TiposVeiculoPage() {
  const { data: tipos, isLoading } = useTiposVeiculo();
  const salvar = useSaveTipoVeiculo();
  const excluir = useDeleteTipoVeiculo();
  const [novo, setNovo] = useState('');

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-slate-500">
        Categorias de veículo que determinam a matriz de preços (ex.: Passeio, Moto, Pick-up/Van,
        Diesel Leve). O <b>km do reboque</b> (ida e volta) é o limite da Assistência 24h que a proposta
        mostra ao cliente; em branco, a proposta diz &quot;conforme o tipo do veículo&quot;.
      </p>
      <div className="flex gap-2">
        <Input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Ex.: Passeio" className="mt-0" />
        <Button
          onClick={() => {
            if (!novo.trim()) return;
            salvar.mutate(novo.trim(), {
              onSuccess: () => {
                setNovo('');
                toast.success('Tipo adicionado');
              },
              onError: (e) => toast.error((e as Error).message),
            });
          }}
        >
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </div>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-superficie">
        {isLoading && <li className="px-4 py-3 text-sm text-slate-400">Carregando...</li>}
        {(tipos ?? []).map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
            <span className="inline-flex items-center gap-2 text-slate-700">
              <Truck className="h-4 w-4 text-brand-500" /> {t.nome}
            </span>
            <KmReboque tipo={t} />
            <button
              onClick={() => {
                if (confirm(`Excluir "${t.nome}"?`))
                  excluir.mutate(t.id, { onError: (e) => toast.error((e as Error).message) });
              }}
            >
              <Trash2 className="h-4 w-4 text-rose-400 hover:text-rose-600" />
            </button>
          </li>
        ))}
        {!isLoading && (tipos ?? []).length === 0 && (
          <li className="px-4 py-3 text-sm text-slate-400">Nenhum tipo cadastrado.</li>
        )}
      </ul>
    </div>
  );
}

/** 0164 — km do reboque (ida/volta) que a proposta mostra. Salva ao sair do campo. */
function KmReboque({ tipo }: { tipo: TiposVeiculoRow }) {
  const salvar = useSaveKmReboqueTipo();
  const [ida, setIda] = useState(tipo.km_reboque_ida?.toString() ?? '');
  const [volta, setVolta] = useState(tipo.km_reboque_volta?.toString() ?? '');
  const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v))));
  function gravar() {
    const i = num(ida); const v = num(volta);
    if (i === (tipo.km_reboque_ida ?? null) && v === (tipo.km_reboque_volta ?? null)) return;
    salvar.mutate({ id: tipo.id, ida: i, volta: v }, {
      onSuccess: () => toast.success(`Reboque de ${tipo.nome} salvo`),
      onError: (e) => toast.error((e as Error).message),
    });
  }
  return (
    <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-500">
      Reboque
      <input type="number" min={0} max={5000} value={ida} onChange={(e) => setIda(e.target.value)} onBlur={gravar}
        placeholder="ida" aria-label={`Km de ida do reboque de ${tipo.nome}`}
        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
      +
      <input type="number" min={0} max={5000} value={volta} onChange={(e) => setVolta(e.target.value)} onBlur={gravar}
        placeholder="volta" aria-label={`Km de volta do reboque de ${tipo.nome}`}
        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
      km
    </span>
  );
}
