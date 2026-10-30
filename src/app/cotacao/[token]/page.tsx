import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { carregarProposta, qrDaProposta } from '@/lib/proposta-server';
import { origemDaRequisicao } from '@/lib/api-externa-doc';
import { PropostaCapa, PropostaCondicoes, PropostaPlano } from '@/components/proposta/documento';
import { VisorProposta } from '@/components/proposta/visor-proposta';
import { createAdminClient } from '@/lib/supabase/admin';

// Proposta publica (link enviado ao cliente), sem login. PROPOSTA v2
// (30/10/2026): as 3 folhas A4 da proposta comercial, as mesmas do PDF
// (/api/v1/cotacoes/pdf). Leitura via service_role restrita ao token.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Proposta de proteção veicular', robots: { index: false } };

export default async function CotacaoPublicaPage({ params }: { params: { token: string } }) {
  const proposta = await carregarProposta(params.token, origemDaRequisicao(headers()));
  if (!proposta) notFound();
  const { dados } = proposta;

  const [qr, { data: empresa }] = await Promise.all([
    qrDaProposta(dados.link),
    createAdminClient().from('empresa').select('whatsapp_principal').limit(1).maybeSingle(),
  ]);
  const logo = proposta.logoUrl ?? '/logo-smartcar.svg';
  // WhatsApp: o do consultor; sem ele, o da empresa.
  const whatsapp = (dados.consultor?.telefone ?? empresa?.whatsapp_principal ?? '').replace(/\D/g, '');

  return (
    <VisorProposta folhas={3} token={dados.token} whatsapp={whatsapp.length >= 10 ? whatsapp : null}
      aceite={dados.aceite} placa={dados.veiculo.placa}>
      <PropostaCapa d={dados} logo={logo} />
      <PropostaPlano d={dados} logo={logo} />
      <PropostaCondicoes d={dados} logo={logo} qr={qr} />
    </VisorProposta>
  );
}
