// 0162 — o que o HOTLINK oferece de cada plano: so os planos do tipo do
// veiculo e, em cada um, os opcionais pre-marcados que atendem o tipo e que o
// plano ja nao inclui. A pagina publica nao deixa trocar opcional: o cliente
// leva o pacote sugerido e o consultor ajusta depois, na negociacao.
import type { createAdminClient } from '@/lib/supabase/admin';
import { planoAtendeTipo, type SugestoesPorPlano, type TiposPorPlano } from '@/lib/planos-oferta';

type Admin = ReturnType<typeof createAdminClient>;

export async function ofertaDosPlanos(admin: Admin, tipoVeiculoId: string) {
  const [{ data: tp }, { data: sug }, { data: inc }, { data: prods }, { data: ptv }] = await Promise.all([
    admin.from('plano_tipos_veiculo').select('plano_id, tipo_veiculo_id'),
    admin.from('plano_sugestoes').select('plano_id, produto_id'),
    admin.from('plano_produtos').select('plano_id, produto_id'),
    admin.from('produtos').select('id, status, obrigatorio'),
    admin.from('produto_tipos_veiculo').select('produto_id, tipo_veiculo_id'),
  ]);
  const tiposPorPlano: TiposPorPlano = {};
  for (const r of tp ?? []) (tiposPorPlano[r.plano_id] ??= []).push(r.tipo_veiculo_id);
  const sugestoes: SugestoesPorPlano = {};
  for (const r of sug ?? []) (sugestoes[r.plano_id] ??= []).push(r.produto_id);
  const tiposDoProduto: Record<string, string[]> = {};
  for (const r of ptv ?? []) (tiposDoProduto[r.produto_id] ??= []).push(r.tipo_veiculo_id);
  const ativos = new Set((prods ?? []).filter((p) => p.status && !p.obrigatorio).map((p) => p.id));
  const atende = (id: string) => !tiposDoProduto[id]?.length || tiposDoProduto[id].includes(tipoVeiculoId);

  return {
    atende: (planoId: string) => planoAtendeTipo(planoId, tipoVeiculoId, tiposPorPlano),
    avulsosDo: (planoId: string) => {
      const incluidos = (inc ?? []).filter((r) => r.plano_id === planoId).map((r) => r.produto_id);
      return (sugestoes[planoId] ?? []).filter((id) => ativos.has(id) && atende(id) && !incluidos.includes(id));
    },
  };
}
