'use client';

import { useQuery } from '@tanstack/react-query';
import { FileDown, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { urlPdfTermo } from '@/hooks/use-termos';
import { rotuloTipoTermo } from '@/lib/termos';
import { formatDate } from '@/lib/utils';

// Meus documentos (0123): os termos emitidos para o associado e os documentos
// gerais da associacao (Regimento, Regulamento) publicados no portal.
export default function PortalDocumentosPage() {
  const supabase = createClient();
  const docs = useQuery({
    queryKey: ['portal', 'documentos'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('portal_documentos');
      if (error) throw error;
      return data ?? [];
    },
  });
  const meus = (docs.data ?? []).filter((d) => d.origem === 'EMITIDO');
  const gerais = (docs.data ?? []).filter((d) => d.origem === 'GERAL');

  function Lista({ itens, vazio }: { itens: typeof meus; vazio: string }) {
    if (!itens.length) return <p className="text-sm text-slate-500">{vazio}</p>;
    return (
      <ul className="divide-y divide-slate-100">
        {itens.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 py-3">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-5 w-5 text-cyan-600" />
              <div>
                <p className="font-medium text-slate-800">{d.titulo}</p>
                <p className="text-xs text-slate-500">
                  {rotuloTipoTermo(d.tipo)}
                  {d.placa ? ` · ${d.placa}` : ''}
                  {d.protocolo ? ` · ${d.protocolo}` : ''} · {formatDate(d.data)}
                </p>
              </div>
            </div>
            {d.tem_pdf ? (
              <a href={urlPdfTermo(d.origem === 'EMITIDO' ? { emitido: d.id } : { versao: d.id })}
                target="_blank" rel="noreferrer"
                className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-brand-700 hover:bg-slate-50">
                <FileDown className="h-4 w-4" /> Baixar
              </a>
            ) : <span className="text-xs text-slate-400">em preparação</span>}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-4">
      {docs.isError && <p className="text-sm text-rose-700">Não foi possível carregar os documentos agora.</p>}
      <Card>
        <CardHeader><CardTitle>Meus documentos</CardTitle></CardHeader>
        <CardContent>
          {docs.isLoading ? <div className="h-20 animate-pulse rounded bg-slate-100" />
            : <Lista itens={meus} vazio="Nenhum documento emitido para você ainda." />}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Documentos da associação</CardTitle></CardHeader>
        <CardContent>
          {docs.isLoading ? <div className="h-20 animate-pulse rounded bg-slate-100" />
            : <Lista itens={gerais} vazio="Nenhum documento publicado." />}
        </CardContent>
      </Card>
    </div>
  );
}
