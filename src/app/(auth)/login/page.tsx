import { logoOficial } from '@/lib/marca-server';
import { LoginStaff } from './login-staff';

// Login do painel administrativo. A pagina e SERVER so para buscar a logo
// oficial (antes do login a sessao nao le `empresa`); o formulario e client.
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  return <LoginStaff logoUrl={await logoOficial()} />;
}
