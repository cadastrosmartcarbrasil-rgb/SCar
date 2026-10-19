'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FilePlus2, FileSignature, Globe, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useSalvarTermoModelo, useTermosModelos } from '@/hooks/use-termos';
import { usePode } from '@/hooks/use-permissoes';
import { rotuloTipoTermo } from '@/lib/termos';
import { formatDate } from '@/lib/utils';

// Configuracoes -> Termos (0123): os modelos de documento da associacao.
export default function TermosPage() {
  const router = useRouter();
  const modelos = useTermosModelos();
  const salvar = useSalvarTermoModelo();
  const podeCriar = usePode('termos_modelos.criar');

  async function novo() {
    try {
      const m = await salvar.mutateAsync({ nome: 'NOVO TERMO', tipo: 'CONTRATO', rascunho_html: '<p></p>' });
      router.push(`/configuracoes/termos/${m.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Termos e documentos</h2>
          <p className="max-w-3xl text-sm text-slate-500">
            Modelos dos documentos da associação (Termo de Adesão, Regimento, Termo do rastreador...).
            O texto leva os campos do cadastro, que viram os dados do associado e do veículo na emissão.
            Editar não muda o que já foi emitido: só vale depois de <strong>publicar</strong> uma versão nova.
          </p>
        </div>
        {podeCriar && (
          <Button onClick={novo} disabled={salvar.isPending}>
            <FilePlus2 className="mr-1 h-4 w-4" /> Novo termo
          </Button>
        )}
      </div>

      {modelos.isError && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          Não foi possível ler os termos: {(modelos.error as Error).message}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Termo</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Para quem</th>
              <th className="px-3 py-2">Versão</th>
              <th className="px-3 py-2">Situação</th>
              <th className="px-3 py-2">Atualizado</th>
            </tr>
          </thead>
          <tbody>
            {(modelos.data ?? []).map((m) => (
              <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2">
                  <Link href={`/configuracoes/termos/${m.id}`} className="flex items-center gap-2 font-medium text-brand-700 hover:underline">
                    <FileSignature className="h-4 w-4" /> {m.nome}
                  </Link>
                  {m.descricao && <p className="text-xs text-slate-500">{m.descricao}</p>}
                </td>
                <td className="px-3 py-2 text-slate-600">{rotuloTipoTermo(m.tipo)}</td>
                <td className="px-3 py-2 text-slate-600">
                  {m.escopo === 'GERAL' ? 'Todos (documento geral)' : 'Por associado/veículo'}
                  {m.visivel_portal && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded bg-cyan-50 px-1.5 text-xs text-cyan-700">
                      <Globe className="h-3 w-3" /> portal
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {m.versao_atual_id ? 'Publicada' : <span className="text-amber-700">Rascunho (não publicada)</span>}
                </td>
                <td className="px-3 py-2">
                  {m.ativo
                    ? <span className="rounded bg-emerald-50 px-1.5 text-xs text-emerald-700">Ativo</span>
                    : <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 text-xs text-slate-500"><Lock className="h-3 w-3" /> Inativo</span>}
                </td>
                <td className="px-3 py-2 text-slate-500">{formatDate(m.updated_at)}</td>
              </tr>
            ))}
            {modelos.data && modelos.data.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                Nenhum termo ainda. {podeCriar ? 'Clique em "Novo termo" e importe o Word.' : ''}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
