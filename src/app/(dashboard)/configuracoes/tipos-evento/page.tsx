'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useTiposEvento, useSaveTipoEvento, useDeleteTipoEvento } from '@/hooks/use-config';

export default function TiposEventoPage() {
  const { data: tipos, isLoading } = useTiposEvento();
  const salvar = useSaveTipoEvento();
  const excluir = useDeleteTipoEvento();
  const [novo, setNovo] = useState('');

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-slate-500">
        Cadastre os tipos de evento (sinistro) usados na abertura de protocolos: colisao, roubo,
        furto, danos a terceiros, etc.
      </p>

      <div className="flex gap-2">
        <Input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          placeholder="Ex.: Colisao"
          className="mt-0"
        />
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

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {isLoading && <li className="px-4 py-3 text-sm text-slate-400">Carregando...</li>}
        {(tipos ?? []).map((t) => (
          <li key={t.id} className="flex items-center justify-between px-4 py-2 text-sm">
            <span className="inline-flex items-center gap-2 text-slate-700">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> {t.nome}
            </span>
            <button
              onClick={() => {
                if (confirm(`Excluir o tipo "${t.nome}"?`))
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
