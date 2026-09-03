'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlarmClock, CalendarClock, CircleSlash, Loader2, Mail, MapPin, MessageCircle,
  MessageSquare, Phone, Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select } from '@/components/ui/field';
import { useInteracoesLead, useRegistrarInteracao } from '@/hooks/use-vendas';
import {
  RESULTADO_INTERACAO, SELO_AGENDA, TIPO_INTERACAO, rotuloParado, rotuloRetorno,
  diasParado, situacaoAgenda, sugestaoRetorno,
} from '@/lib/agenda';
import { STATUS_LEAD } from '@/lib/crm';
import { formatDateTime } from '@/lib/utils';
import type {
  LeadHistoricoRow, LeadsRow, ResultadoInteracaoLead, TipoInteracaoLead,
} from '@/lib/database.types';

const ICONE_TIPO: Record<TipoInteracaoLead, React.ElementType> = {
  LIGACAO: Phone,
  WHATSAPP: MessageCircle,
  EMAIL: Mail,
  VISITA: MapPin,
  OBSERVACAO: MessageSquare,
};

const ATALHOS_RETORNO: { dias: number; rotulo: string }[] = [
  { dias: 0, rotulo: 'Hoje' },
  { dias: 1, rotulo: 'Amanha' },
  { dias: 2, rotulo: 'Em 2 dias' },
  { dias: 7, rotulo: 'Semana que vem' },
];

/**
 * Contatos e agenda do lead.
 *
 * O CRM sabia em que fase o lead estava, mas nao guardava o trabalho em cima
 * dele: nao havia onde escrever "liguei dia 3, pediu para chamar na sexta".
 * Aqui o vendedor registra o contato e combina o retorno — e a linha do tempo
 * junta isso com as mudancas de etapa, para ler a historia inteira de uma vez.
 */
export function ContatosLead({ lead, historico }: { lead: LeadsRow; historico: LeadHistoricoRow[] }) {
  const { data: interacoes } = useInteracoesLead(lead.id);
  const registrar = useRegistrarInteracao();

  const [tipo, setTipo] = useState<TipoInteracaoLead>('LIGACAO');
  const [resultado, setResultado] = useState<ResultadoInteracaoLead>('FALOU');
  const [observacao, setObservacao] = useState('');
  const [retorno, setRetorno] = useState('');
  const [notaRetorno, setNotaRetorno] = useState('');

  const situacao = situacaoAgenda(lead.proximo_contato_em);
  const parado = diasParado(lead.ultima_interacao_em, lead.created_at);

  function gravar(e: React.FormEvent) {
    e.preventDefault();
    registrar.mutate(
      {
        leadId: lead.id,
        tipo,
        resultado,
        observacao: observacao.trim() || null,
        // datetime-local vem sem fuso; o Date local resolve para o ISO certo.
        proximoContatoEm: retorno ? new Date(retorno).toISOString() : null,
        proximoContatoNota: notaRetorno.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success(retorno ? 'Contato registrado e retorno agendado' : 'Contato registrado');
          setObservacao(''); setRetorno(''); setNotaRetorno(''); setResultado('FALOU');
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  function tirarDaAgenda() {
    registrar.mutate(
      { leadId: lead.id, tipo: 'OBSERVACAO', resultado: 'FALOU',
        observacao: 'Retorno cancelado', limparAgenda: true },
      {
        onSuccess: () => toast.success('Retorno removido da agenda'),
        onError: (err) => toast.error(err.message),
      },
    );
  }

  // Uma linha do tempo so: contatos + mudancas de etapa, do mais novo ao mais velho.
  const linha = [
    ...(interacoes ?? []).map((i) => ({
      chave: `i-${i.id}`,
      quando: i.created_at,
      icone: ICONE_TIPO[i.tipo],
      titulo: TIPO_INTERACAO[i.tipo].label,
      selo: RESULTADO_INTERACAO[i.resultado],
      texto: i.observacao,
      autor: i.usuarios?.nome ?? null,
      retorno: i.proximo_contato_em,
    })),
    ...historico.map((h) => ({
      chave: `h-${h.id}`,
      quando: h.created_at,
      icone: Send,
      titulo: `${h.de ? `${STATUS_LEAD[h.de].curto} -> ` : ''}${STATUS_LEAD[h.para].curto}`,
      selo: null,
      texto: h.obs,
      autor: null,
      retorno: null,
    })),
  ].sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime());

  return (
    <section className="rounded-2xl border border-slate-200 bg-superficie p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <CalendarClock className="h-4 w-4 text-cyan-600" /> Contatos e agenda
        </h2>
        <span className="text-[11px] text-slate-400">{rotuloParado(parado)}</span>
      </header>

      {/* Compromisso vigente */}
      <div className={`mt-3 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-[12px] ${
        situacao === 'ATRASADO' ? 'bg-rose-50 text-rose-800'
          : situacao === 'SEM_AGENDA' ? 'bg-slate-50 text-slate-500' : 'bg-cyan-50 text-cyan-900'
      }`}>
        <AlarmClock className="h-3.5 w-3.5 shrink-0" />
        {situacao === 'SEM_AGENDA' ? (
          <span>Sem retorno marcado — combine um abaixo para o lead nao esfriar.</span>
        ) : (
          <>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${SELO_AGENDA[situacao].cor}`}>
              {SELO_AGENDA[situacao].curto}
            </span>
            <span className="font-medium">Retorno {rotuloRetorno(lead.proximo_contato_em)}</span>
            {lead.proximo_contato_nota && <span className="text-slate-500">— {lead.proximo_contato_nota}</span>}
            <button
              type="button" onClick={tirarDaAgenda} disabled={registrar.isPending}
              className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 underline"
            >
              <CircleSlash className="h-3 w-3" /> Tirar da agenda
            </button>
          </>
        )}
      </div>

      {/* Registrar contato */}
      <form onSubmit={gravar} className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(TIPO_INTERACAO) as TipoInteracaoLead[]).map((t) => {
            const Icone = ICONE_TIPO[t];
            return (
              <button
                key={t} type="button" onClick={() => setTipo(t)}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition ${
                  tipo === t ? 'bg-acao text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Icone className="h-3.5 w-3.5" /> {TIPO_INTERACAO[t].label}
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
          <FormField label="Resultado">
            <Select value={resultado} onChange={(e) => setResultado(e.target.value as ResultadoInteracaoLead)}>
              {(Object.keys(RESULTADO_INTERACAO) as ResultadoInteracaoLead[]).map((r) => (
                <option key={r} value={r}>{RESULTADO_INTERACAO[r].label}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="O que aconteceu">
            <Input
              value={observacao} onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: achou caro, vai comparar com a concorrencia"
            />
          </FormField>
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Proximo retorno {resultado === 'AGENDOU' && <span className="text-rose-500">*</span>}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ATALHOS_RETORNO.map((a) => (
              <button
                key={a.rotulo} type="button" onClick={() => setRetorno(sugestaoRetorno(a.dias))}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-[11.5px] font-medium text-slate-600 transition hover:bg-slate-200"
              >
                {a.rotulo}
              </button>
            ))}
            {retorno && (
              <button
                type="button" onClick={() => { setRetorno(''); setNotaRetorno(''); }}
                className="rounded-full px-2 py-1 text-[11.5px] text-slate-400 underline"
              >
                limpar
              </button>
            )}
          </div>
          <div className="mt-2 grid gap-3 sm:grid-cols-[220px_1fr]">
            <Input type="datetime-local" className="tnum" value={retorno} onChange={(e) => setRetorno(e.target.value)} />
            <Input
              value={notaRetorno} onChange={(e) => setNotaRetorno(e.target.value)}
              placeholder="O que levar nesse retorno (opcional)"
              disabled={!retorno}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={registrar.isPending}>
            {registrar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
            Registrar contato
          </Button>
        </div>
      </form>

      {/* Linha do tempo */}
      {linha.length > 0 && (
        <ol className="mt-4 space-y-2.5 border-t border-slate-100 pt-3">
          {linha.map((e) => {
            const Icone = e.icone;
            return (
              <li key={e.chave} className="flex gap-2">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
                  <Icone className="h-3 w-3" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12.5px] font-medium text-slate-700">{e.titulo}</span>
                    {e.selo && (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${e.selo.cor}`}>{e.selo.label}</span>
                    )}
                    <span className="text-[11px] text-slate-400">{formatDateTime(e.quando)}</span>
                    {e.autor && <span className="text-[11px] text-slate-400">· {e.autor}</span>}
                  </div>
                  {e.texto && <p className="text-[12px] leading-snug text-slate-500">{e.texto}</p>}
                  {e.retorno && (
                    <p className="text-[11px] text-cyan-700">retorno combinado: {formatDateTime(e.retorno)}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
