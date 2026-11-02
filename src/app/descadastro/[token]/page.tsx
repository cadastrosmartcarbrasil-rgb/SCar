import { logoOficial } from '@/lib/marca-server';
import { lerTokenDescadastro } from '@/lib/comunicacao/servidor';
import { MolduraAcesso } from '@/components/portal/moldura-acesso';
import { ConfirmarDescadastro } from './confirmar';

// Pagina publica do link "nao quero receber" dos comunicados informativos (0171).
// Abrir a pagina nao descadastra (antivirus abre link); so o botao.
export const dynamic = 'force-dynamic';

function mascarar(email: string) {
  const [u, d] = email.split('@');
  return `${u.slice(0, 2)}${'*'.repeat(Math.max(1, u.length - 2))}@${d}`;
}

export default async function DescadastroPage({ params }: { params: { token: string } }) {
  const email = lerTokenDescadastro(params.token, (process.env.EMAIL_LINK_SECRET ?? '').trim());
  const logoUrl = await logoOficial();
  if (!email) {
    return (
      <MolduraAcesso logoUrl={logoUrl} titulo="Link inválido">
        <p className="text-sm text-slate-600">Este link não é válido. Use o link do próprio e-mail que você recebeu.</p>
      </MolduraAcesso>
    );
  }
  return (
    <MolduraAcesso logoUrl={logoUrl} titulo="Não quero receber comunicados" subtitulo={mascarar(email)}>
      <ConfirmarDescadastro token={params.token} />
    </MolduraAcesso>
  );
}
