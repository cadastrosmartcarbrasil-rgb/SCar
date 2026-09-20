'use client';

import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { textoDaDivergencia } from '@/lib/adicional-risco';
import type { DivergenciaRegionalPreco } from '@/lib/database.types';

/**
 * A unidade que VENDEU nem sempre é a que PRECIFICA (0081).
 *
 * Quem precifica é o ASSOCIADO — não existe de-para CEP → regional neste
 * sistema, então `clientes.regional_id` é o dado mais próximo do endereço que
 * temos. Quando o vendedor é de outra unidade, o preço segue o do associado, e
 * a diferença tem de estar NA TELA de quem fecha: preço que muda sozinho entre
 * a cotação e o fechamento, sem ninguém dizer por quê, vira chamado.
 *
 * Ele avisa, não trava — o preço mais alto já é o correto para o risco, então
 * não há dinheiro se perdendo por seguir em frente.
 */
export function DivergenciaRegional({ leadId }: { leadId: string }) {
  const supabase = createClient();
  const { data } = useQuery<DivergenciaRegionalPreco | null>({
    queryKey: ['vendas', 'divergencia-regional', leadId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('divergencia_regional_preco', {
        p_lead_id: leadId,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  if (!data?.divergente) return null;

  const texto = textoDaDivergencia(data.regional_preco_nome, data.regional_lead_nome);
  if (!texto) return null;

  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">Unidade de preço diferente da unidade da venda</p>
        <p className="mt-0.5 text-xs">{texto}</p>
      </div>
    </div>
  );
}
