'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { TerceiroForm } from '@/components/eventos/terceiro-form';
import { VinculoTerceiro } from '@/components/eventos/terceiros-evento';
import { useEvento } from '@/hooks/use-eventos';

// Cadastro de terceiro. Aberto automaticamente apos abrir um evento marcado
// com "ha terceiros envolvidos" e pela aba Terceiros do protocolo.
export default function NovoTerceiroPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { data: evento, isLoading } = useEvento(params.id);

  if (isLoading) return <p className="text-sm text-slate-500">Carregando evento...</p>;
  if (!evento) return <p className="text-sm text-rose-600">Evento não encontrado ou sem permissão.</p>;

  const associado = (evento as { clientes?: { nome_razao_social: string } | null }).clientes?.nome_razao_social ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/eventos/${params.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Voltar ao evento
      </Link>
      <h1 className="text-2xl font-semibold text-slate-900">Novo terceiro</h1>
      <VinculoTerceiro codigo={null} protocolo={evento.numero_protocolo} associado={associado} eventoId={params.id} />
      <TerceiroForm
        eventoId={params.id}
        clienteId={evento.cliente_id}
        onSalvo={(r) => router.push(`/eventos/${params.id}/terceiros/${r.id}`)}
        onCancelar={() => router.push(`/eventos/${params.id}`)}
      />
    </div>
  );
}
