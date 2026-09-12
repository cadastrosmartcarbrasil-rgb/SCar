import { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { VistoriaPublica } from '@/components/vistoria/vistoria-publica';

export const metadata: Metadata = { title: 'Fotos do seu veiculo' };
export const dynamic = 'force-dynamic';

/**
 * A vistoria no celular do CLIENTE — a etapa que faltava no fluxo do hotlink.
 *
 * Ate a 0076 a venda pela pagina publica parava no aceite: as fotos so
 * existiam se alguem LOGADO abrisse o lead. Agora o aceite libera este link, e
 * quem esta com o carro na frente fotografa na hora.
 *
 * Server component com `service_role`, no mesmo padrao de `/v/<codigo>` e
 * `/cotacao/<token>`: o visitante nao tem sessao, e a capacidade e o token.
 */
export default async function VistoriaPublicaPage({ params }: { params: { token: string } }) {
  const admin = createAdminClient();
  const { data: sessoes } = await admin.rpc('vistoria_por_token', { p_token: params.token });
  const s = sessoes?.[0];

  const poses = s?.valida && s.lead_id
    ? (await admin.rpc('fotos_vistoria_lead', { p_lead_id: s.lead_id })).data ?? []
    : [];

  return (
    <VistoriaPublica
      token={params.token}
      valida={Boolean(s?.valida)}
      motivo={s?.motivo ?? 'LINK_INVALIDO'}
      nome={s?.nome ?? null}
      veiculo={{ placa: s?.placa ?? null, marca: s?.marca ?? null, modelo: s?.modelo ?? null }}
      expiraEm={s?.expira_em ?? null}
      posesIniciais={poses}
    />
  );
}
