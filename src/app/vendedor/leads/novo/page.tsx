'use client';

import { useRouter } from 'next/navigation';
import { NovoLeadCotacao, type NovoLead } from '@/components/vendas/novo-lead-cotacao';
import { createClient } from '@/lib/supabase/client';

/**
 * Novo lead pelo portal do vendedor — a MESMA tela do CRM.
 * O que muda e o nascimento: aqui o lead passa por `vendedor_criar_lead`, que
 * o amarra a quem cadastrou e a regional dele (o vendedor nao escolhe dono).
 * A ficha do veiculo entra logo em seguida, pela RLS do proprio lead.
 */
export default function NovoLeadVendedorPage() {
  const router = useRouter();

  async function criarLead(d: NovoLead): Promise<{ id: string }> {
    const supabase = createClient();
    const { data: id, error } = await supabase.rpc('vendedor_criar_lead', {
      p_nome: d.nome,
      p_celular: d.celular,
      p_email: d.email ?? null,
      p_placa: d.placa ?? null,
    });
    if (error) throw error;
    if (!id) throw new Error('Nao consegui criar o lead');

    const { error: erroFicha } = await supabase
      .from('leads')
      .update({
        cpf_cnpj: d.cpf_cnpj ?? null,
        tipo_veiculo_id: d.tipo_veiculo_id ?? null,
        marca: d.marca ?? null,
        modelo: d.modelo ?? null,
        ano_modelo: d.ano_modelo ?? null,
        combustivel: d.combustivel ?? null,
        valor_fipe: d.valor_fipe ?? null,
        codigo_fipe: d.codigo_fipe ?? null,
        cota_participacao_id: d.cota_participacao_id ?? null,
        origem_fipe: d.origem_fipe ?? 'MANUAL',
      })
      .eq('id', id);
    if (erroFicha) throw erroFicha;

    return { id };
  }

  return (
    <NovoLeadCotacao
      criarLead={criarLead}
      voltarPara={{ href: '/vendedor/leads', rotulo: 'Meus leads' }}
      aoConcluir={(leadId) => router.push(`/vendedor/leads/${leadId}`)}
    />
  );
}
