import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ProtocoloDetail } from '@/components/sinistros/protocolo-detail';

export default function ProtocoloPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-4">
      <Link
        href="/sinistros"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar ao pipeline
      </Link>
      <ProtocoloDetail eventoId={params.id} />
    </div>
  );
}
