import { Metadata } from 'next';
import { logoOficial } from '@/lib/marca-server';
import { ComunicacaoPublica } from '@/components/eventos/comunicacao/comunicacao-publica';

export const metadata: Metadata = { title: 'Comunicação de evento' };
export const dynamic = 'force-dynamic';

/**
 * A comunicacao do evento pelo celular do ENVOLVIDO (0129) — associado,
 * condutor, terceiro, passageiro ou testemunha. Sem login: a capacidade e o
 * token, e tudo passa por `/api/v1/comunicar`, que confere de novo a cada
 * chamada. A pagina so carrega a logo; os dados vem do cliente, depois do aviso
 * de privacidade (e, para o associado, da confirmacao de identidade).
 */
export default async function ComunicarPage({ params }: { params: { token: string } }) {
  const logo = await logoOficial();
  return <ComunicacaoPublica token={params.token} logoUrl={logo} />;
}
