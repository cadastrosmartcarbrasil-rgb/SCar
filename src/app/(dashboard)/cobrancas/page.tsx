import { redirect } from 'next/navigation';

// /cobrancas virou grupo (0097): a porta de entrada e o painel.
export default function CobrancasIndex() {
  redirect('/cobrancas/painel');
}
