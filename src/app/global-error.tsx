'use client';

import { TelaErro } from '@/components/ui/tela-erro';

// Ultimo recurso: erro no proprio layout raiz. Precisa de <html> e <body>.
export default function ErroGlobal(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body className="bg-fundo p-6">
        <TelaErro {...props} />
      </body>
    </html>
  );
}
