import { logoOficial } from '@/lib/marca-server';
import { NovaSenha } from './nova-senha';

// Criar a nova senha pelo link do e-mail. FORA de `(associado)`: a sessao so nasce
// quando o associado confirma (o token e conferido no clique, nao ao abrir a pagina,
// para o "abrir o link" do antivirus do e-mail nao gastar o link de uso unico).
export const dynamic = 'force-dynamic';

export default async function PortalNovaSenhaPage({ searchParams }: { searchParams: { token_hash?: string } }) {
  return <NovaSenha logoUrl={await logoOficial()} tokenHash={searchParams.token_hash ?? null} />;
}
