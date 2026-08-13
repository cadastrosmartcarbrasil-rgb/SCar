'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Phone, Mail, Car, Copy, Send, CheckCircle2, XCircle, ShieldCheck, Loader2, ExternalLink,
} from 'lucide-react';
import {
  useLead, useCotacoes, useHistoricoLead, useAvancarStatus, useAutorizarEntrada, useMeuPapel,
} from '@/hooks/use-vendas';
import { Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { ESTEIRA, STATUS_LEAD, proximoStatus } from '@/lib/crm';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { StatusLead } from '@/lib/database.types';

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: lead, isLoading } = useLead(id);
  const { data: cotacoes } = useCotacoes(id);
  const { data: historico } = useHistoricoLead(id);
  const { data: papel } = useMeuPapel();
  const avancar = useAvancarStatus();
  const autorizar = useAutorizarEntrada();

  const [cpf, setCpf] = useState('');

  if (isLoading) return <p className="py-10 text-center text-sm text-slate-400">Carregando...</p>;
  if (!lead) return <p className="py-10 text-center text-sm text-slate-400">Lead nao encontrado.</p>;

  const podeAuditar = papel === 'auditoria' || papel === 'admin';
  const prox = proximoStatus(lead.status);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  function mudar(status: StatusLead, motivo?: string) {
    avancar.mutate({ id: lead!.id, status, perdido_motivo: motivo }, {
      onSuccess: () => toast.success('Status atualizado'),
      onError: (e) => toast.error(e.message),
    });
  }

  function autorizarEntrada() {
    autorizar.mutate({ leadId: lead!.id, cpfCnpj: cpf || lead!.cpf_cnpj || null }, {
      onSuccess: () => toast.success('Entrada autorizada - veiculo cadastrado na base'),
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-10">
      <Link href="/vendas" className="inline-flex items-center gap-1 text-sm text-slate-500">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      {/* Cabecalho */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-lg font-semibold text-slate-900">{lead.nome}</h1>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_LEAD[lead.status].cor}`}>
            {STATUS_LEAD[lead.status].label}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
          <a href={`https://wa.me/55${lead.celular.replace(/\D/g, '')}`} className="inline-flex items-center gap-1 text-emerald-600">
            <Phone className="h-3.5 w-3.5" /> {lead.celular}
          </a>
          {lead.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {lead.email}</span>}
        </div>
        {(lead.marca || lead.modelo) && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-sm text-slate-600">
            <Car className="h-3.5 w-3.5" /> {[lead.marca, lead.modelo].filter(Boolean).join(' ')} {lead.ano_modelo ?? ''}
            {lead.valor_fipe != null && <span className="ml-2 text-slate-400">FIPE {formatCurrency(lead.valor_fipe)}</span>}
          </div>
        )}
      </div>

      {/* Esteira */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-xs font-medium uppercase text-slate-400">Esteira</p>
        <ol className="flex items-center justify-between gap-1">
          {ESTEIRA.map((s) => {
            const idx = ESTEIRA.indexOf(s);
            const atual = ESTEIRA.indexOf(lead.status);
            const done = atual >= idx && lead.status !== 'PERDIDO';
            return (
              <li key={s} className="flex flex-1 flex-col items-center gap-1 text-center">
                <span className={`h-2.5 w-2.5 rounded-full ${done ? 'bg-brand-600' : 'bg-slate-200'}`} />
                <span className={`text-[9px] leading-tight ${done ? 'text-brand-700' : 'text-slate-400'}`}>{STATUS_LEAD[s].curto}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Acoes de status */}
      {lead.status !== 'ATIVO' && lead.status !== 'PERDIDO' && (
        <div className="flex flex-wrap gap-2">
          {prox && lead.status !== 'EM_AUDITORIA' && lead.status !== 'PROPOSTA_ENVIADA' && (
            <Button variant="secondary" onClick={() => mudar(prox)} disabled={avancar.isPending}>
              Avancar para {STATUS_LEAD[prox].curto}
            </Button>
          )}
          {lead.status === 'ORCAMENTO_GERADO' && (
            <Button variant="secondary" onClick={() => mudar('PROPOSTA_ENVIADA')} disabled={avancar.isPending}>
              <Send className="h-4 w-4" /> Marcar proposta enviada
            </Button>
          )}
          {lead.status === 'PROPOSTA_ENVIADA' && (
            <Button onClick={() => mudar('APROVADO')} disabled={avancar.isPending}>
              <CheckCircle2 className="h-4 w-4" /> Cliente aprovou (-&gt; Auditoria)
            </Button>
          )}
          <Button variant="ghost" onClick={() => mudar('PERDIDO', 'Marcado como perdido')} disabled={avancar.isPending} className="text-rose-500">
            <XCircle className="h-4 w-4" /> Perdido
          </Button>
        </div>
      )}

      {/* Trava de Auditoria */}
      {lead.status === 'EM_AUDITORIA' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <ShieldCheck className="h-4 w-4" /> Aguardando Auditoria
          </p>
          <p className="mt-1 text-xs text-amber-700">
            O veiculo e o associado NAO entram na base ate a Auditoria conferir os dados e autorizar.
          </p>
          {podeAuditar ? (
            <div className="mt-3 space-y-2">
              <label className="text-xs text-amber-800">CPF/CNPJ do titular (confirme antes de autorizar)</label>
              <Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder={lead.cpf_cnpj ?? 'Somente numeros'} className="mt-0" />
              <Button onClick={autorizarEntrada} disabled={autorizar.isPending} className="w-full">
                {autorizar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Autorizar entrada na base
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-amber-700">Somente a equipe de Auditoria pode autorizar a entrada.</p>
          )}
        </div>
      )}

      {lead.status === 'ATIVO' && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> Ativo na base.
          {lead.veiculo_id && <Link href="/veiculos" className="ml-auto font-medium underline">Ver veiculo</Link>}
        </div>
      )}

      {/* Cotacoes */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-xs font-medium uppercase text-slate-400">Cotacoes</p>
        {(cotacoes ?? []).length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma cotacao gerada.</p>
        ) : (
          <ul className="space-y-2">
            {(cotacoes ?? []).map((c) => {
              const link = `${origin}/cotacao/${c.token}`;
              return (
                <li key={c.id} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold text-brand-700">{formatCurrency(c.total_mensalidade)}/mes</span>
                    <span className="text-[10px] uppercase text-slate-400">{c.modo_envio === 'CONSOLIDADA' ? 'Consolidada' : 'Detalhada'}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">{formatDate(c.created_at)}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => { navigator.clipboard?.writeText(link); toast.success('Link copiado'); }}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copiar link
                    </button>
                    <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600">
                      <ExternalLink className="h-3.5 w-3.5" /> Abrir
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Link href="/vendas/novo" className="mt-3 inline-block text-xs font-medium text-brand-600">+ Nova cotacao (novo lead)</Link>
      </div>

      {/* Historico */}
      {(historico ?? []).length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-xs font-medium uppercase text-slate-400">Historico</p>
          <ul className="space-y-1.5 text-xs text-slate-500">
            {(historico ?? []).map((h) => (
              <li key={h.id} className="flex items-center gap-2">
                <span className="text-slate-300">{formatDate(h.created_at)}</span>
                <span>{h.de ? `${STATUS_LEAD[h.de].curto} -> ` : ''}<b className="text-slate-600">{STATUS_LEAD[h.para].curto}</b></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
