'use client';

/**
 * AUDITORIA DE DOCUMENTOS DO ASSOCIADO (0177): o que espera conferencia, as CNHs
 * vencidas (com evento em aberto primeiro) e as que vencem em 30 dias.
 */
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, FileText, MessageCircle, Search, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { usePode } from '@/hooks/use-permissoes';
import { useAdiado } from '@/hooks/use-adiado';
import {
  useConferirDocumento, useFilaDocumentos, useResumoAuditoriaDocumentos, useUrlsDocumentos,
  type FiltroAuditoriaDocumentos,
} from '@/hooks/use-documentos-associado';
import { mensagemPedirNovaCnh, rotuloTipoDocumento, situacaoCnh } from '@/lib/documentos-associado';
import { linkWhatsApp } from '@/lib/assistencia';
import { formatarDocumento } from '@/lib/documento';
import { formatDate } from '@/lib/utils';
import type { FilaDocumentoAssociado } from '@/lib/database.types';

const ABAS: { id: FiltroAuditoriaDocumentos; rotulo: string; chave: 'aguardando' | 'cnh_vencida' | 'cnh_a_vencer' | 'recusados' }[] = [
  { id: 'AGUARDANDO', rotulo: 'Aguardando conferência', chave: 'aguardando' },
  { id: 'CNH_VENCIDA', rotulo: 'CNH vencida', chave: 'cnh_vencida' },
  { id: 'CNH_A_VENCER', rotulo: 'CNH vence em 30 dias', chave: 'cnh_a_vencer' },
  { id: 'RECUSADO', rotulo: 'Recusados', chave: 'recusados' },
];

export default function AuditoriaDocumentosPage() {
  const [filtro, setFiltro] = useState<FiltroAuditoriaDocumentos>('AGUARDANDO');
  const [busca, setBusca] = useState('');
  const buscaAdiada = useAdiado(busca);
  const { data: resumo } = useResumoAuditoriaDocumentos();
  const { data: linhas = [], isLoading, error } = useFilaDocumentos(filtro, buscaAdiada);
  const { data: urls = {} } = useUrlsDocumentos(linhas.map((l) => l.url));
  const podeAuditar = usePode('vendas.fechar');

  return (
    <div className="space-y-5">
      <Link href="/associados" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Voltar aos associados
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Auditoria de documentos</h1>
        <p className="text-sm text-slate-500">
          Identidade, CNH e comprovante de endereço dos associados. A CNH vencida entra aqui sozinha — quem tem
          evento em aberto aparece primeiro.
          {!podeAuditar && ' Conferir e recusar é da auditoria.'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {ABAS.map((a) => (
          <button key={a.id} type="button" onClick={() => setFiltro(a.id)}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${filtro === a.id
                    ? 'border-brand-600 bg-brand-50 font-medium text-brand-700'
                    : 'border-slate-200 bg-superficie text-slate-600 hover:bg-slate-50'}`}>
            {a.rotulo} <span className="tnum ml-1 font-semibold">{resumo?.[a.chave] ?? 0}</span>
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou CPF/CNPJ" className="pl-8" />
        </div>
      </div>

      {error && <p className="text-sm text-rose-600">Não foi possível ler a fila: {String((error as Error).message ?? error)}</p>}
      {isLoading && <p className="text-sm text-slate-500">Carregando...</p>}
      {!isLoading && linhas.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Nada nesta fila.</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-superficie">
        {linhas.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-superficie-alta text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Associado</th>
                <th className="px-3 py-2">Documento</th>
                <th className="px-3 py-2">Situação</th>
                <th className="px-3 py-2">Enviado</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => <Linha key={l.documento_id} l={l} url={urls[l.url]} podeAuditar={podeAuditar} />)}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Linha({ l, url, podeAuditar }: { l: FilaDocumentoAssociado; url?: string; podeAuditar: boolean }) {
  const conferir = useConferirDocumento();
  const [motivo, setMotivo] = useState('');
  const [recusando, setRecusando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const sit = l.tipo === 'CNH' ? situacaoCnh(l.validade) : null;
  const zap = sit?.nivel === 'vencida' ? linkWhatsApp(l.celular, mensagemPedirNovaCnh(l.associado, l.validade)) : null;
  const ficha = l.cliente_id ? `/associados/${l.cliente_id}?aba=anexos` : l.lead_id ? `/vendas/${l.lead_id}` : null;

  async function acao(aprovar: boolean) {
    setErro(null);
    try {
      await conferir.mutateAsync({ id: l.documento_id, aprovar, motivo });
      setRecusando(false);
    } catch (e) { setErro((e as Error).message); }
  }

  return (
    <tr className="border-t border-slate-200 align-top">
      <td className="px-3 py-2">
        {ficha ? <Link href={ficha} className="font-medium text-slate-800 hover:underline">{l.associado ?? '-'}</Link>
               : <span className="font-medium">{l.associado ?? '-'}</span>}
        <p className="text-xs text-slate-500">
          {l.cpf_cnpj ? formatarDocumento(l.cpf_cnpj, l.cpf_cnpj.length > 11 ? "PJ" : "PF") : '-'}{l.regional ? ` · ${l.regional}` : ''}
          {!l.cliente_id && ' · venda em andamento'}
        </p>
        {l.evento_aberto && <span className="mt-1 inline-block rounded bg-rose-100 px-1.5 text-[0.6875rem] font-medium text-rose-800">Evento em aberto</span>}
      </td>
      <td className="px-3 py-2">
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-700 hover:underline">
          <FileText className="h-4 w-4" /> {rotuloTipoDocumento(l.tipo)}
        </a>
        {l.descricao && <p className="text-xs text-slate-500">{l.descricao}</p>}
        {sit && <p className={`text-xs font-medium ${sit.nivel === 'vencida' ? 'text-rose-700' : sit.nivel === 'a_vencer' ? 'text-amber-700' : 'text-slate-600'}`}>{sit.texto}</p>}
      </td>
      <td className="px-3 py-2 text-xs text-slate-600">
        {l.situacao === 'RECUSADO' ? <>Recusado{l.motivo_recusa ? `: ${l.motivo_recusa}` : ''}</>
          : l.situacao === 'CONFERIDO' ? 'Conferido' : 'Aguardando conferência'}
      </td>
      <td className="px-3 py-2 text-xs text-slate-500">{formatDate(l.enviado_em)}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap justify-end gap-2">
          {zap && (
            <a href={zap} target="_blank" rel="noreferrer"
               className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700">
              <MessageCircle className="h-3.5 w-3.5" /> Pedir a CNH nova
            </a>
          )}
          {podeAuditar && l.situacao === 'AGUARDANDO' && !recusando && (
            <>
              <Button type="button" variant="secondary" disabled={conferir.isPending} onClick={() => acao(true)}>
                <CheckCircle2 className="mr-1 h-4 w-4 text-emerald-600" /> Conferido
              </Button>
              <Button type="button" variant="secondary" onClick={() => setRecusando(true)}>
                <XCircle className="mr-1 h-4 w-4 text-rose-600" /> Recusar
              </Button>
            </>
          )}
        </div>
        {recusando && (
          <div className="mt-2 flex items-center gap-2">
            <Input placeholder="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            <Button type="button" variant="danger" onClick={() => acao(false)}>Recusar</Button>
            <Button type="button" variant="ghost" onClick={() => setRecusando(false)}>Voltar</Button>
          </div>
        )}
        {erro && <p className="mt-1 text-right text-xs text-rose-600">{erro}</p>}
      </td>
    </tr>
  );
}
