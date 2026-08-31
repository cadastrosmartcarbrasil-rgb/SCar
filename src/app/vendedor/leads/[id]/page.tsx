'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Camera, FileText, Loader2, MessageCircle, Phone, Receipt,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FotosVistoria } from '@/components/vistoria/fotos-vistoria';
import { LinkDaProposta } from '@/components/hotlink/cotacao-publica';
import { useCotacoes, useLead, useUploadCrlv } from '@/hooks/use-vendas';
import { SELO_STATUS_LEAD } from '@/lib/vendedor';
import { formatCurrency, formatDate } from '@/lib/utils';

/**
 * Ficha do lead no portal do vendedor.
 * O que ele faz aqui e o que so ele pode fazer: falar com o interessado e,
 * com a venda fechada, rodar a VISTORIA no carro — foto a foto, guiado pelo
 * modelo de poses. O resto do fechamento (dados do associado, adesao) segue
 * com a franquia.
 */
export default function LeadVendedorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: lead, isLoading } = useLead(id);
  const { data: cotacoes } = useCotacoes(id);
  const uploadCrlv = useUploadCrlv(id);
  const [vistoriaAberta, setVistoriaAberta] = useState(false);

  if (isLoading) return <p className="text-sm text-slate-400">Carregando…</p>;
  if (!lead) {
    return (
      <div className="space-y-3">
        <Link href="/vendedor/leads" className="inline-flex items-center gap-1 text-sm text-slate-500">
          <ArrowLeft className="h-4 w-4" /> Meus leads
        </Link>
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-900">
          Este lead nao esta na sua carteira.
        </p>
      </div>
    );
  }

  const selo = SELO_STATUS_LEAD[lead.status] ?? SELO_STATUS_LEAD.NOVO;
  const fone = (lead.celular ?? '').replace(/\D/g, '');
  const fechado = lead.status === 'ATIVO' || lead.status === 'APROVADO' || lead.status === 'EM_AUDITORIA';

  return (
    <div className="space-y-4">
      <Link href="/vendedor/leads" className="inline-flex items-center gap-1 text-sm text-slate-500">
        <ArrowLeft className="h-4 w-4" /> Meus leads
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{lead.nome}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {lead.celular}
            {lead.email && <span className="ml-2">{lead.email}</span>}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 ring-inset ${selo.classe}`}>
          {selo.rotulo}
        </span>
      </header>

      <div className="flex gap-2">
        <a
          href={`https://wa.me/55${fone}`} target="_blank" rel="noreferrer"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
        >
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </a>
        <a
          href={`tel:+55${fone}`}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[12.5px] font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          <Phone className="h-4 w-4" /> Ligar
        </a>
      </div>

      <Card>
        <CardHeader><CardTitle>Veiculo cotado</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-[13px] sm:grid-cols-2">
          <Campo rotulo="Placa" valor={lead.placa} mono />
          <Campo rotulo="Marca / modelo" valor={[lead.marca, lead.modelo].filter(Boolean).join(' ')} />
          <Campo rotulo="Ano" valor={lead.ano_modelo ? String(lead.ano_modelo) : null} />
          <Campo rotulo="Valor FIPE" valor={lead.valor_fipe ? formatCurrency(lead.valor_fipe) : null} />
          <Campo rotulo="Cadastrado em" valor={formatDate(lead.created_at)} />
          {lead.perdido_motivo && <Campo rotulo="Motivo da perda" valor={lead.perdido_motivo} />}
        </CardContent>
      </Card>

      {lead.aceite_em && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-[13px] font-bold text-emerald-800">Cliente aceitou a proposta</p>
          <p className="mt-1 text-[12px] leading-relaxed text-emerald-900/80">
            {lead.aceite_nome} aceitou em {formatDate(lead.aceite_em)}. Agora e completar a ficha
            e a vistoria — depois disso a franquia manda para a analise.
          </p>
        </div>
      )}

      {/* A proposta com link proprio: o vendedor manda no WhatsApp e o cliente
          abre na hora, sem depender de e-mail. */}
      {(cotacoes ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Receipt className="h-4 w-4 text-slate-400" /> Proposta do cliente
            </CardTitle>
            <p className="text-xs text-slate-500">
              Link pronto para enviar — o cliente abre, ve os valores e guarda.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {(cotacoes ?? []).slice(0, 1).map((c) => (
              <div key={c.id} className="space-y-3">
                <div className="flex items-baseline justify-between gap-3 rounded-xl bg-brand-50 px-3 py-2.5">
                  <span className="text-[12px] text-slate-500">Mensalidade</span>
                  <span className="tnum text-[17px] font-bold text-brand-700">
                    {formatCurrency(Number(c.total_com_desconto ?? c.total_mensalidade))}
                  </span>
                </div>
                <LinkDaProposta token={c.token} compacto />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Vistoria: o trabalho de campo do vendedor. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Camera className="h-4 w-4 text-slate-400" /> Vistoria do veiculo
          </CardTitle>
          <p className="text-xs text-slate-500">
            Com a venda fechada, fotografe o veiculo seguindo a lista. Sem as fotos obrigatorias
            o carro nao entra na base.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {!vistoriaAberta && !fechado ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
              <p className="text-[12.5px] text-slate-500">
                Fez a venda? Abra a vistoria e tire as fotos com o cliente ainda ao lado do carro.
              </p>
              <Button className="mt-3" onClick={() => setVistoriaAberta(true)}>
                <Camera className="mr-1.5 h-4 w-4" /> Venda fechada — iniciar vistoria
              </Button>
            </div>
          ) : (
            <FotosVistoria leadId={id} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-slate-400" /> CRLV do veiculo
          </CardTitle>
          <p className="text-xs text-slate-500">
            Foto ou PDF do documento. {lead.crlv_url ? 'Ja enviado — envie de novo para substituir.' : ''}
          </p>
        </CardHeader>
        <CardContent>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-[12.5px] font-semibold text-slate-600 transition hover:bg-slate-50">
            {uploadCrlv.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {lead.crlv_url ? 'Substituir CRLV' : 'Enviar CRLV'}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) uploadCrlv.mutate(f, {
                  onSuccess: () => toast.success('CRLV enviado'),
                  onError: (err) => toast.error(err.message),
                });
              }}
            />
          </label>
        </CardContent>
      </Card>
    </div>
  );
}

function Campo({ rotulo, valor, mono }: { rotulo: string; valor?: string | null; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className={`mt-0.5 text-slate-800 ${mono ? 'font-mono uppercase' : ''}`}>{valor || '—'}</p>
    </div>
  );
}
