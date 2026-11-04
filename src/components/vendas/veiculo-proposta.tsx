'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Car, ChevronDown, Copy, ExternalLink, Handshake, Lock, MessageCircle, Pencil, Percent, Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlanos, useTiposVeiculo } from '@/hooks/use-precificacao';
import { podeEditarCotacao } from '@/lib/crm';
import { ROTULO_SITUACAO_DESCONTO, textoValidade } from '@/lib/desconto-mensalidade';
import { linkWhatsApp, mensagemDaProposta } from '@/lib/venda-publica';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { CotacoesRow, LeadsRow } from '@/lib/database.types';
import type { TextosModelo } from '@/lib/comunicacao/modelos';

/**
 * O veiculo e a proposta do lead, no TOPO da ficha.
 *
 * Antes a lista de cotacoes ficava no fim da pagina, depois do fechamento da
 * venda inteiro, e o "Editar" so mexia em plano/opcionais/FIPE: quem queria
 * corrigir o veiculo e reenviar a proposta nao achava o caminho. Aqui o
 * veiculo e a proposta vigente ficam juntos, com "Ajustar veiculo e proposta"
 * e o reenvio (WhatsApp/link) lado a lado. As cotacoes antigas ficam recolhidas.
 */
export function VeiculoEProposta({
  lead, cotacoes, origin, textoProposta, onEditar, onColherAceite,
}: {
  lead: LeadsRow;
  cotacoes: CotacoesRow[];
  origin: string;
  textoProposta?: TextosModelo;
  /** null = gerar a primeira proposta. */
  onEditar: (c: CotacoesRow | null) => void;
  onColherAceite: (c: CotacoesRow) => void;
}) {
  const { data: tipos } = useTiposVeiculo();
  const { data: planos } = usePlanos();
  const [verAntigas, setVerAntigas] = useState(false);
  const editavel = podeEditarCotacao(lead.status);
  const [vigente, ...antigas] = cotacoes; // ja vem da mais nova para a mais antiga

  const tipo = (tipos ?? []).find((t) => t.id === lead.tipo_veiculo_id)?.nome;
  const veiculo = [lead.marca, lead.modelo].filter(Boolean).join(' ');
  const nomePlano = (id: string | null) => (id ? (planos ?? []).find((p) => p.id === id)?.nome ?? 'Plano' : 'Cobertura base');

  return (
    <section className="rounded-2xl border border-slate-200 bg-superficie p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-slate-400">Veículo e proposta</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700">
            <Car className="h-4 w-4 shrink-0 text-slate-400" />
            {lead.placa && <span className="placa rounded bg-slate-100 px-1.5 py-0.5 text-[0.8125rem] font-semibold">{lead.placa}</span>}
            <span className="font-medium">{veiculo || 'Veículo não informado'}</span>
            {lead.ano_modelo && <span className="text-slate-500">{lead.ano_modelo}</span>}
            {tipo && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6875rem] text-slate-600">{tipo}</span>}
          </p>
          {lead.valor_fipe != null && (
            <p className="mt-0.5 text-xs text-slate-500">
              {lead.valor_fipe_mercado != null
                ? <>Valor protegido <b className="tnum">{formatCurrency(Number(lead.valor_fipe))}</b> · FIPE <span className="tnum">{formatCurrency(Number(lead.valor_fipe_mercado))}</span></>
                : <>FIPE <b className="tnum">{formatCurrency(Number(lead.valor_fipe))}</b></>}
            </p>
          )}
        </div>
        {editavel ? (
          <Button type="button" onClick={() => onEditar(vigente ?? null)}>
            {vigente ? <><Pencil className="h-4 w-4" /> Ajustar veículo e proposta</> : <><Plus className="h-4 w-4" /> Gerar proposta</>}
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
            <Lock className="h-3.5 w-3.5" /> Proposta congelada ({lead.status === 'ATIVO' ? 'na base' : 'na auditoria'})
          </span>
        )}
      </div>

      {vigente ? (
        <div className="mt-3">
          <CartaoCotacao
            c={vigente} lead={lead} origin={origin} textoProposta={textoProposta} plano={nomePlano(vigente.plano_id)}
            editavel={editavel} vigente onColherAceite={onColherAceite}
          />
        </div>
      ) : (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">
          Nenhuma proposta gerada ainda.{editavel && ' Confira o veículo e gere a proposta para enviar ao cliente.'}
        </p>
      )}

      {antigas.length > 0 && (
        <div className="mt-3">
          <button
            type="button" onClick={() => setVerAntigas((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition ${verAntigas ? '' : '-rotate-90'}`} />
            Propostas anteriores ({antigas.length})
          </button>
          {verAntigas && (
            <ul className="mt-2 space-y-2">
              {antigas.map((c) => (
                <li key={c.id}>
                  <CartaoCotacao
                    c={c} lead={lead} origin={origin} textoProposta={textoProposta} plano={nomePlano(c.plano_id)}
                    editavel={editavel} onColherAceite={onColherAceite}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Link href="/vendas/novo" className="mt-3 inline-block text-xs font-medium text-brand-600">
        + Cotar outro veículo (novo lead)
      </Link>
    </section>
  );
}

function CartaoCotacao({
  c, lead, origin, textoProposta, plano, editavel, vigente, onColherAceite,
}: {
  c: CotacoesRow; lead: LeadsRow; origin: string; textoProposta?: TextosModelo; plano: string;
  editavel: boolean; vigente?: boolean; onColherAceite: (c: CotacoesRow) => void;
}) {
  const link = `${origin}/cotacao/${c.token}`;
  return (
    <div className={`rounded-xl border p-3 ${vigente ? 'border-cyan-200 bg-cyan-50/40' : 'border-slate-100'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-base font-semibold text-brand-700">
          {formatCurrency(Number(c.total_com_desconto ?? c.total_mensalidade))}/mês
          {Number(c.desconto_valor_mensalidade) > 0 && (
            <span className="ml-2 text-xs font-normal text-slate-400 line-through">
              {formatCurrency(Number(c.total_mensalidade) + Number(c.valor_assistencia_profissional ?? 0))}
            </span>
          )}
        </span>
        <span className="text-[0.625rem] uppercase text-slate-400">
          {vigente && <span className="mr-2 font-bold text-cyan-700">Vigente</span>}
          {plano} · {c.modo_envio === 'CONSOLIDADA' ? 'Consolidada' : 'Detalhada'}
        </span>
      </div>
      {Number(c.valor_assistencia_profissional) > 0 && (
        <p className="mt-0.5 text-xs text-slate-500">
          Inclui {formatCurrency(Number(c.valor_assistencia_profissional))} de Assistência Profissional
          <span className="text-slate-400"> (uso interno — o cliente não vê)</span>
        </p>
      )}
      {Number(c.desconto_valor_mensalidade) > 0 && (
        <p className={`mt-0.5 inline-flex flex-wrap items-center gap-1 text-xs ${c.desconto_situacao === 'APROVADO'
          ? 'text-emerald-700' : c.desconto_situacao === 'RECUSADO' ? 'text-rose-700' : 'text-amber-700'}`}>
          <Percent className="h-3 w-3" />
          Desconto de {formatCurrency(Number(c.desconto_valor_mensalidade))}/mês
          ({Number(c.desconto_percentual).toFixed(2).replace('.', ',')}%) · {textoValidade(c.desconto_valido_ate)}
          {' — '}{c.desconto_situacao ? ROTULO_SITUACAO_DESCONTO[c.desconto_situacao as 'PENDENTE'] : 'aguardando aprovação'}
          {c.desconto_situacao === 'RECUSADO' && c.desconto_decisao_motivo ? `: ${c.desconto_decisao_motivo}` : ''}
        </p>
      )}
      <p className="mt-0.5 text-xs text-slate-400">
        {formatDate(c.created_at)}
        {c.atualizada_em ? ` · editada em ${formatDate(c.atualizada_em)}` : ''}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <a
          href={linkWhatsApp(mensagemDaProposta(link, lead.nome, textoProposta), lead.celular)}
          target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
        >
          <MessageCircle className="h-3.5 w-3.5" /> {vigente ? 'Reenviar no WhatsApp' : 'WhatsApp'}
        </a>
        <button
          type="button"
          onClick={() => { navigator.clipboard?.writeText(link); toast.success('Link copiado'); }}
          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600"
        >
          <Copy className="h-3.5 w-3.5" /> Copiar link
        </button>
        <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600">
          <ExternalLink className="h-3.5 w-3.5" /> Abrir
        </a>
        {/* Aceite com o cliente na frente: sem depender do celular dele */}
        {editavel && !lead.aceite_em && vigente && (
          <button
            type="button" onClick={() => onColherAceite(c)}
            className="inline-flex items-center gap-1 rounded-lg bg-cyan-500 px-2.5 py-1.5 text-xs font-semibold text-navy hover:bg-cyan-400"
          >
            <Handshake className="h-3.5 w-3.5" /> Colher aceite
          </button>
        )}
      </div>
    </div>
  );
}
