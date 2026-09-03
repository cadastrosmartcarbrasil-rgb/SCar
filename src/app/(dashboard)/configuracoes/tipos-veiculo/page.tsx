'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useTiposVeiculo, useSaveTipoVeiculo, useDeleteTipoVeiculo } from '@/hooks/use-precificacao';

export default function TiposVeiculoPage() {
  const { data: tipos, isLoading } = useTiposVeiculo();
  const salvar = useSaveTipoVeiculo();
  const excluir = useDeleteTipoVeiculo();
  const [novo, setNovo] = useState('');

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-slate-500">
        Categorias de veiculo que determinam a matriz de precos (ex.: Passeio, Moto, Pick-up/Van,
        Diesel Leve).
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
          <li key={t.id} className="flex items-center justify-between px-4 py-2 text-sm">
            <span className="inline-flex items-center gap-2 text-slate-700">
              <Truck className="h-4 w-4 text-brand-500" /> {t.nome}
            </span>
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
