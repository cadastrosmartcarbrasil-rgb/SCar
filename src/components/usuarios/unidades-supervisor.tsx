'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useRegionais } from '@/hooks/use-config';
import { Button } from '@/components/ui/button';

/**
 * As unidades pelas quais o SUPERVISOR responde (0097). Grava na hora, por
 * `definir_regionais_supervisor` — so o admin consegue (o banco recusa os
 * demais). Unidade inativa continua listada se ja estava marcada.
 */
export function UnidadesSupervisor({ usuarioId }: { usuarioId: string }) {
  const supabase = createClient();
  const qc = useQueryClient();
  const { data: regionais } = useRegionais();
  const atuais = useQuery<string[]>({
    queryKey: ['supervisor', 'regionais', usuarioId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('regionais_do_supervisor', { p_usuario_id: usuarioId });
      if (error) throw error;
      return data ?? [];
    },
  });
  const [marcadas, setMarcadas] = useState<string[]>([]);
  useEffect(() => { if (atuais.data) setMarcadas(atuais.data); }, [atuais.data]);

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('definir_regionais_supervisor', {
        p_usuario_id: usuarioId, p_regionais: marcadas,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Unidades do supervisor salvas.');
      qc.invalidateQueries({ queryKey: ['supervisor', 'regionais', usuarioId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const lista = (regionais ?? []).filter((r) => r.ativo || marcadas.includes(r.id));
  const mudou = JSON.stringify([...marcadas].sort()) !== JSON.stringify([...(atuais.data ?? [])].sort());

  return (
    <div className="rounded-xl border border-cyan-200 bg-cyan-50/40 p-3">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Unidades do supervisor</p>
      <p className="mb-2 mt-0.5 text-[11.5px] leading-relaxed text-slate-500">
        O supervisor enxerga a cobranca dessas unidades (painel, calendario e comparativos).
      </p>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
        {lista.map((r) => (
          <label key={r.id} className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300"
              checked={marcadas.includes(r.id)}
              onChange={(e) => setMarcadas(e.target.checked ? [...marcadas, r.id] : marcadas.filter((x) => x !== r.id))} />
            {r.nome}{!r.ativo && <span className="text-[11px] text-slate-400">(inativa)</span>}
          </label>
        ))}
      </div>
      <div className="mt-2 flex justify-end">
        <Button type="button" variant="secondary" disabled={!mudou || salvar.isPending} onClick={() => salvar.mutate()}>
          {salvar.isPending ? 'Salvando…' : 'Salvar unidades'}
        </Button>
      </div>
    </div>
  );
}
