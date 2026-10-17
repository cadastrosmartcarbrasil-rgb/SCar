'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, DollarSign, Info, Plus, Wrench } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { TerceiroForm } from '@/components/eventos/terceiro-form';
import { StatusTerceiroBadge, VinculoTerceiro } from '@/components/eventos/terceiros-evento';
import { CotacaoPecas } from '@/components/eventos/cotacao-pecas';
import { EventoFinanceiro } from '@/components/eventos/evento-financeiro';
import { useTerceiro } from '@/hooks/use-terceiros';
import { usePerfilAtual } from '@/hooks/use-config';
import { usePode } from '@/hooks/use-permissoes';
import { PAPEL_LABEL } from '@/lib/terceiros';

type Aba = 'dados' | 'reparo' | 'financeiro';

// Tela propria do terceiro: dados, reparo do veiculo dele e financeiro
// (indenizacao/compras) — sempre sob o vinculo Evento X do Associado Y.
export default function TerceiroPage({ params }: { params: { id: string; terceiroId: string } }) {
  const { data: t, isLoading, error } = useTerceiro(params.terceiroId);
  const [aba, setAba] = useState<Aba>('dados');
  const { data: perfil } = usePerfilAtual();
  const trata = usePode('eventos.editar');

  if (isLoading) return <p className="text-sm text-slate-500">Carregando terceiro...</p>;
  if (error || !t) return <p className="text-sm text-rose-600">Terceiro nao encontrado ou sem permissao.</p>;
  // URL coerente com o vinculo: o terceiro so abre dentro do proprio evento.
  if (t.evento_id !== params.id) {
    return <p className="text-sm text-rose-600">Este terceiro nao pertence ao evento informado.</p>;
  }

  const abas: { id: Aba; label: string; icon: React.ElementType }[] = [
    { id: 'dados', label: 'Dados', icon: Info },
    { id: 'reparo', label: 'Reparo', icon: Wrench },
    { id: 'financeiro', label: 'Financeiro', icon: DollarSign },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <Link href={`/eventos/${params.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Voltar ao evento
        </Link>
        <Link
          href={`/eventos/${params.id}/terceiros/novo`}
          className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
        >
          <Plus className="h-4 w-4" /> Outro terceiro
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">{t.nome}</h1>
        <StatusTerceiroBadge status={t.status} />
        <span className="text-sm text-slate-500">{t.papel ? PAPEL_LABEL[t.papel] : 'Papel a apurar'}</span>
      </div>
      <VinculoTerceiro
        codigo={t.codigo}
        protocolo={t.eventos_sinistro?.numero_protocolo ?? null}
        associado={t.clientes?.nome_razao_social ?? null}
        eventoId={params.id}
      />

      <div className="flex gap-1 border-b border-slate-200">
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${
              aba === a.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <a.icon className="h-4 w-4" />
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'dados' && (
        <TerceiroForm
          key={t.updated_at}
          eventoId={params.id}
          clienteId={t.cliente_id}
          inicial={t}
          onSalvo={() => undefined}
          somenteLeitura={!trata}
        />
      )}
      {aba === 'reparo' && (
        <Card>
          <CardContent className="pt-5">
            <CotacaoPecas eventoId={params.id} tipoReparo="TERCEIRO" terceiroId={t.id} />
          </CardContent>
        </Card>
      )}
      {aba === 'financeiro' && (
        <Card>
          <CardContent className="pt-5">
            <EventoFinanceiro
              eventoId={params.id}
              regionalId={t.regional_id}
              protocolo={t.eventos_sinistro?.numero_protocolo ?? null}
              terceiroId={t.id}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
