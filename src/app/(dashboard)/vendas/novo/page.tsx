'use client';

import { useRouter } from 'next/navigation';
import { NovoLeadCotacao } from '@/components/vendas/novo-lead-cotacao';

// Novo lead pelo CRM. A tela mora em <NovoLeadCotacao> — a mesma que o portal
// do vendedor usa; aqui o lead nasce por insert direto (staff).
export default function NovoLeadPage() {
  const router = useRouter();
  return (
    <NovoLeadCotacao
      voltarPara={{ href: '/vendas', rotulo: 'Voltar' }}
      aoConcluir={(leadId) => router.push(`/vendas/${leadId}`)}
    />
  );
}
