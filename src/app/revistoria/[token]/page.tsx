import { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { logoOficial } from '@/lib/marca-server';
import { RevistoriaPublica } from '@/components/revistoria/revistoria-publica';

export const metadata: Metadata = { title: 'Revistoria do veículo' };
export const dynamic = 'force-dynamic';

/**
 * A revistoria do boleto vencido no celular do ASSOCIADO (0137): foto da
 * frente, da traseira e um video de ate 30 s dando a volta no carro. Sem
 * login — a capacidade e o token, conferido no servidor com `service_role`,
 * no mesmo padrao de `/vistoria/<token>` e `/comunicar/<token>`.
 */
export default async function RevistoriaPublicaPage({ params }: { params: { token: string } }) {
  const admin = createAdminClient();
  const token = /^[0-9a-f-]{36}$/i.test(params.token) ? params.token : '00000000-0000-0000-0000-000000000000';
  const { data: sessoes } = await admin.rpc('revistoria_por_token', { p_token: token });
  const s = sessoes?.[0] ?? null;
  const itens = s?.valida ? (await admin.rpc('revistoria_itens_publica', { p_token: token })).data ?? [] : [];
  const logoUrl = await logoOficial();

  return (
    <RevistoriaPublica
      token={token}
      sessao={s}
      itensIniciais={itens}
      logoUrl={logoUrl}
    />
  );
}
