'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UploadAnexos } from '@/components/sinistros/upload-anexos';
import { TIPO_EVENTO_LABEL } from '@/types/domain';
import type { TipoEvento, VeiculosRow } from '@/lib/database.types';

// Portal: abertura de sinistro pelo associado, com upload de fotos pelo celular.
export default function NovoSinistroPage() {
  const supabase = createClient();
  const [veiculoId, setVeiculoId] = useState('');
  const [tipo, setTipo] = useState<TipoEvento>('COLISAO');
  const [dataOcorrencia, setDataOcorrencia] = useState(new Date().toISOString().slice(0, 10));
  const [descricao, setDescricao] = useState('');
  const [eventoCriado, setEventoCriado] = useState<string | null>(null);

  const { data: veiculos } = useQuery<Pick<VeiculosRow, 'id' | 'placa' | 'modelo' | 'cliente_id' | 'regional_id'>[]>({
    queryKey: ['portal', 'veiculos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('veiculos')
        .select('id, placa, modelo, cliente_id, regional_id')
        .eq('status', 'ativo');
      if (error) throw error;
      return data ?? [];
    },
  });

  const abrir = useMutation({
    mutationFn: async () => {
      const veiculo = veiculos?.find((v) => v.id === veiculoId);
      if (!veiculo) throw new Error('Selecione um veiculo');
      const { data: novoEvento, error } = await supabase
        .from('eventos_sinistro')
        .insert({
          veiculo_id: veiculo.id,
          cliente_id: veiculo.cliente_id,
          regional_id: veiculo.regional_id,
          data_ocorrencia: dataOcorrencia,
          tipo_evento: tipo,
          descricao,
          status: 'ABERTO',
        })
        .select('id, numero_protocolo')
        .single();
      if (error) throw error;
      return novoEvento;
    },
    onSuccess: (evt) => {
      toast.success(`Sinistro aberto: ${evt.numero_protocolo}`);
      setEventoCriado(evt.id);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <Link href="/portal" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Abrir novo sinistro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!eventoCriado ? (
            <>
              <div>
                <label className="text-sm text-slate-600">Veiculo</label>
                <select
                  value={veiculoId}
                  onChange={(e) => setVeiculoId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Selecione...</option>
                  {(veiculos ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.placa} - {v.modelo}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-slate-600">Tipo de evento</label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as TipoEvento)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    {Object.entries(TIPO_EVENTO_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-slate-600">Data da ocorrencia</label>
                  <input
                    type="date"
                    value={dataOcorrencia}
                    onChange={(e) => setDataOcorrencia(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-slate-600">Descricao do ocorrido</label>
                <textarea
                  rows={4}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Conte o que aconteceu..."
                />
              </div>
              <button
                onClick={() => abrir.mutate()}
                disabled={abrir.isPending || !veiculoId}
                className="w-full rounded-md bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {abrir.isPending ? 'Abrindo...' : 'Abrir sinistro'}
              </button>
            </>
          ) : (
            <div className="space-y-4">
              <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
                Sinistro aberto com sucesso! Agora envie fotos e documentos.
              </p>
              <UploadAnexos eventoId={eventoCriado} />
              <Link
                href="/portal"
                className="block rounded-md bg-slate-800 py-2 text-center text-sm text-white"
              >
                Concluir
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
