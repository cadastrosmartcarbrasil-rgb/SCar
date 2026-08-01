'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { STATUS_VEICULO_LABEL } from '@/types/domain';
import type { ClientesRow, VeiculosRow } from '@/lib/database.types';

type ClienteComVeiculos = ClientesRow & { veiculos: Pick<VeiculosRow, 'id' | 'placa' | 'modelo' | 'status'>[] };

function useClientes() {
  const supabase = createClient();
  return useQuery<ClienteComVeiculos[]>({
    queryKey: ['clientes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nome_razao_social, cpf_cnpj, tipo_pessoa, status, email, telefone, veiculos(id, placa, modelo, status)')
        .order('nome_razao_social')
        .limit(100);
      if (error) throw error;
      return (data ?? []) as never;
    },
  });
}

export default function ClientesPage() {
  const { data: clientes, isLoading } = useClientes();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Clientes & Veiculos</h1>
      {isLoading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(clientes ?? []).map((c) => (
            <Card key={c.id}>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{c.nome_razao_social}</p>
                    <p className="text-xs text-slate-500">
                      {c.tipo_pessoa} · {c.cpf_cnpj}
                    </p>
                  </div>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                    {c.status}
                  </span>
                </div>
                <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
                  {c.veiculos?.map((v) => (
                    <li key={v.id} className="flex justify-between text-slate-600">
                      <span className="font-mono">{v.placa}</span>
                      <span className="text-slate-400">
                        {v.modelo} · {STATUS_VEICULO_LABEL[v.status]}
                      </span>
                    </li>
                  ))}
                  {(c.veiculos ?? []).length === 0 && (
                    <li className="text-xs text-slate-400">Sem veiculos cadastrados</li>
                  )}
                </ul>
              </CardContent>
            </Card>
          ))}
          {(clientes ?? []).length === 0 && (
            <p className="text-sm text-slate-400">Nenhum cliente cadastrado ainda.</p>
          )}
        </div>
      )}
    </div>
  );
}
