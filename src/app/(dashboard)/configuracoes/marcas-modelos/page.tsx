'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import {
  useMarcas,
  useModelos,
  useSaveMarca,
  useDeleteMarca,
  useSaveModelo,
  useDeleteModelo,
} from '@/hooks/use-config';

export default function MarcasModelosPage() {
  const { data: marcas, isLoading } = useMarcas();
  const [marcaSel, setMarcaSel] = useState<string | null>(null);
  const { data: modelos } = useModelos(marcaSel ?? undefined);

  const salvarMarca = useSaveMarca();
  const excluirMarca = useDeleteMarca();
  const salvarModelo = useSaveModelo();
  const excluirModelo = useDeleteModelo();

  const [novaMarca, setNovaMarca] = useState('');
  const [novoModelo, setNovoModelo] = useState('');

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Cadastre as marcas e, dentro de cada uma, os modelos. Essa lista alimenta as sugestoes no
        cadastro de veiculos.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Marcas */}
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
            Marcas
          </div>
          <div className="flex gap-2 p-3">
            <Input
              value={novaMarca}
              onChange={(e) => setNovaMarca(e.target.value)}
              placeholder="Ex.: Toyota"
              className="mt-0"
            />
            <Button
              onClick={() => {
                if (!novaMarca.trim()) return;
                salvarMarca.mutate(novaMarca.trim(), {
                  onSuccess: () => {
                    setNovaMarca('');
                    toast.success('Marca adicionada');
                  },
                  onError: (e) => toast.error((e as Error).message),
                });
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {isLoading && <li className="px-4 py-3 text-sm text-slate-400">Carregando...</li>}
            {(marcas ?? []).map((m) => (
              <li
                key={m.id}
                onClick={() => setMarcaSel(m.id)}
                className={`flex cursor-pointer items-center justify-between border-t border-slate-50 px-4 py-2 text-sm ${
                  marcaSel === m.id ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-50'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <Car className="h-4 w-4 text-slate-400" /> {m.nome}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Excluir a marca "${m.nome}" e seus modelos?`))
                      excluirMarca.mutate(m.id, { onError: (er) => toast.error((er as Error).message) });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-400 hover:text-rose-600" />
                </button>
              </li>
            ))}
            {!isLoading && (marcas ?? []).length === 0 && (
              <li className="px-4 py-3 text-sm text-slate-400">Nenhuma marca.</li>
            )}
          </ul>
        </div>

        {/* Modelos */}
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
            Modelos {marcaSel && <span className="text-slate-400">da marca selecionada</span>}
          </div>
          {!marcaSel ? (
            <p className="p-4 text-sm text-slate-400">Selecione uma marca a esquerda.</p>
          ) : (
            <>
              <div className="flex gap-2 p-3">
                <Input
                  value={novoModelo}
                  onChange={(e) => setNovoModelo(e.target.value)}
                  placeholder="Ex.: Corolla"
                  className="mt-0"
                />
                <Button
                  onClick={() => {
                    if (!novoModelo.trim()) return;
                    salvarModelo.mutate(
                      { marca_id: marcaSel, nome: novoModelo.trim() },
                      {
                        onSuccess: () => {
                          setNovoModelo('');
                          toast.success('Modelo adicionado');
                        },
                        onError: (e) => toast.error((e as Error).message),
                      },
                    );
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <ul className="max-h-80 overflow-y-auto">
                {(modelos ?? []).map((mo) => (
                  <li
                    key={mo.id}
                    className="flex items-center justify-between border-t border-slate-50 px-4 py-2 text-sm"
                  >
                    {mo.nome}
                    <button
                      onClick={() =>
                        excluirModelo.mutate(mo.id, { onError: (er) => toast.error((er as Error).message) })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-400 hover:text-rose-600" />
                    </button>
                  </li>
                ))}
                {(modelos ?? []).length === 0 && (
                  <li className="px-4 py-3 text-sm text-slate-400">Nenhum modelo nesta marca.</li>
                )}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
