import { logoOficial } from '@/lib/marca-server';
import { LoginAssociado } from './login-associado';

// Entrada do Portal do Associado. FICA FORA de `(associado)` de proposito: o
// guard daquele layout exige sessao (ver o gotcha no CLAUDE.md). A pagina e
// SERVER so para buscar a logo oficial; o formulario e client.
export const dynamic = 'force-dynamic';

export default async function PortalLoginPage() {
  return <LoginAssociado logoUrl={await logoOficial()} />;
}
