import { logoOficial } from '@/lib/marca-server';
import { RecuperarSenha } from './recuperar-senha';

// "Esqueci minha senha" do portal. FORA de `(associado)`: nao exige sessao.
export const dynamic = 'force-dynamic';

export default async function PortalRecuperarPage() {
  return <RecuperarSenha logoUrl={await logoOficial()} />;
}
