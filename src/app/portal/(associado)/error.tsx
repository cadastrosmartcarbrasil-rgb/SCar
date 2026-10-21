'use client';

import { TelaErro } from '@/components/ui/tela-erro';

export default function Erro(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="p-4 sm:p-6"><TelaErro {...props} /></div>;
}
