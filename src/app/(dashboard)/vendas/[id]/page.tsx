'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Phone, Mail, Car, Copy, ChevronLeft, ChevronRight, CheckCircle2, XCircle, ShieldCheck,
  Loader2, ExternalLink, Handshake, MessageCircle, Pencil, Percent, RotateCcw, TriangleAlert,
} from 'lucide-react';
import { EditarCotacao } from '@/components/vendas/editar-cotacao';
import {
  useLead, useCotacoes, useHistoricoLead, useMoverLead, useAutorizarEntrada,
} from '@/hooks/use-vendas';
import { FormField, Input, Select } from '@/components/ui/field';
import { ModalCarne, SeletorMesesCarne } from '@/components/cobrancas/carne-veiculo';
import { DIAS_VENCIMENTO, MESES_CARNE_PADRAO, vencimentoPadraoAdesao } from '@/lib/carne';
import { hojeSaoPaulo } from '@/lib/permissoes';
import { Button } from '@/components/ui/button';
import { ESTEIRA, STATUS_LEAD, acoesDoLead, podeEditarCotacao } from '@/lib/crm';
import type { IntencaoAcao } from '@/lib/crm';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { CotacoesRow } from '@/lib/database.types';
import { FechamentoVenda } from '@/components/vendas/fechamento-venda';
import { ChecklistEntrada } from '@/components/vendas/checklist-entrada';
import { ContatosLead } from '@/components/vendas/contatos-lead';
import { ModalPerda } from '@/components/vendas/modal-perda';
import { AceitePresencial } from '@/components/vendas/aceite-presencial';
import { linkWhatsApp, mensagemDaProposta } from '@/lib/venda-publica';
import { useChecklistLead } from '@/hooks/use-vendas';
import { pendencias, situacaoDoAceite, valorDaCotacao } from '@/lib/vendas';
import { usePode } from '@/hooks/use-permissoes';

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: lead, isLoading } = useLead(id);
  const { data: cotacoes } = useCotacoes(id);
  const { data: historico } = useHistoricoLead(id);
  const mover = useMoverLead();
  const autorizar = useAutorizarEntrada();
  const { data: checklist } = useChecklistLead(id);
  const podeAuditar = usePode('vendas.fechar');
  const faltando = pendencias((checklist ?? []).map((c) => ({ ...c, detalhe: c.detalhe ?? null })));

  const [cpf, setCpf] = useState('');
  // 0145: na aprovacao — dia de vencimento, boleto da adesao e o carne.
  const [diaVenc, setDiaVenc] = useState<number>(10);
  const [vencAdesao, setVencAdesao] = useState<string>(() => vencimentoPadraoAdesao(hojeSaoPaulo()));
  const [mesesCarne, setMesesCarne] = useState<number>(MESES_CARNE_PADRAO);
  const [carne, setCarne] = useState<{ veiculoId: string; meses: number; boasVindas?: boolean } | null>(null);
  const [editando, setEditando] = useState<CotacoesRow | null>(null);
  const [perdendo, setPerdendo] = useState(false);
  const [colhendoAceite, setColhendoAceite] = useState<CotacoesRow | null>(null);

  if (isLoading) return <p className="py-10 text-center text-sm text-slate-400">Carregando...</p>;
  if (!lead) return <p className="py-10 text-center text-sm text-slate-400">Lead não encontrado.</p>;

  // Um caminho so, igual ao do Kanban: os dois chamam `mover_lead_status`.
  const acoes = acoesDoLead(lead.status);
  // `aceite_cotacao_id` (0042) existia e nenhuma tela lia — ver `situacaoDoAceite`.
  const aceite = situacaoDoAceite(lead, cotacoes ?? []);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  function mudar(acao: (typeof acoes)[number]) {
    if (acao.intencao === 'perder') return setPerdendo(true);
    mover.mutate({ id: lead!.id, status: acao.destino }, {
      onSuccess: (l) => toast.success(`${lead!.nome} → ${STATUS_LEAD[l.status].label}`),
      onError: (e) => toast.error(e.message),
    });
  }

  const adesaoPelaSmartCar = lead.adesao_forma === 'BOLETO' || lead.adesao_forma === 'PIX';

  function autorizarEntrada() {
    autorizar.mutate({
      leadId: lead!.id, cpfCnpj: cpf || lead!.cpf_cnpj || null,
      diaVencimento: diaVenc, vencimentoAdesao: adesaoPelaSmartCar ? vencAdesao : null,
    }, {
      onSuccess: (veiculoId) => {
        toast.success('Entrada autorizada - veículo cadastrado na base');
        // O carne (e o boleto da adesao) sai NO ATO da aprovacao, e com ele
        // as boas-vindas (0161): e-mail com portal + boletos, e WhatsApp.
        if (veiculoId) setCarne({ veiculoId, meses: mesesCarne, boasVindas: true });
      },
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-10">
      <Link href="/vendas" className="inline-flex items-center gap-1 text-sm text-slate-500">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      {/* Cabecalho */}
      <div className="rounded-2xl border border-slate-200 bg-superficie p-4">
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
      <div className="rounded-2xl border border-slate-200 bg-superficie p-4">
        <p className="mb-3 text-xs font-medium uppercase text-slate-400">Esteira</p>
        <ol className="flex items-center justify-between gap-1">
          {ESTEIRA.map((s) => {
            const idx = ESTEIRA.indexOf(s);
            const atual = ESTEIRA.indexOf(lead.status);
            const done = atual >= idx && lead.status !== 'PERDIDO';
            return (
              <li key={s} className="flex flex-1 flex-col items-center gap-1 text-center">
                <span className={`h-2.5 w-2.5 rounded-full ${done ? 'bg-acao' : 'bg-slate-200'}`} />
                <span className={`text-[9px] leading-tight ${done ? 'text-brand-700' : 'text-slate-400'}`}>{STATUS_LEAD[s].curto}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Aceite do cliente: a venda ja foi fechada, mas o lead SEGUE
          trabalhavel — opcionais, ficha do associado, CRLV e vistoria ainda
          passam pelo vendedor antes da Auditoria. */}
      {aceite && (
        <div className={`rounded-2xl border p-4 ${
          aceite.divergente || aceite.semVinculo
            ? 'border-amber-300 bg-amber-50'
            : 'border-emerald-200 bg-emerald-50'}`}>
          <p className={`flex items-center gap-1.5 text-[13px] font-bold ${
            aceite.divergente || aceite.semVinculo ? 'text-amber-900' : 'text-emerald-800'}`}>
            {aceite.divergente || aceite.semVinculo
              ? <TriangleAlert className="h-4 w-4" />
              : <CheckCircle2 className="h-4 w-4" />}
            {aceite.divergente
              ? 'O aceite e de OUTRA cotação'
              : aceite.semVinculo
                ? 'Aceite registrado — confira a qual cotação ele se refere'
                : 'Proposta aceita pelo cliente'}
          </p>

          <p className={`mt-1 text-[12px] leading-relaxed ${
            aceite.divergente || aceite.semVinculo ? 'text-amber-900/80' : 'text-emerald-900/80'}`}>
            {lead.aceite_nome} ({lead.aceite_documento}) aceitou em{' '}
            {formatDate(lead.aceite_em)}
            {/* O QUE foi aceito — sem isto o banner afirma "aceita" sobre um
                valor que ninguem consentiu (o caso do lead recapturado). */}
            {aceite.aceita && <> <b>{formatCurrency(valorDaCotacao(aceite.aceita))}/mes</b></>}
            {lead.aceite_por === 'VENDEDOR' ? ', com aceite colhido pelo vendedor' : ', pelo próprio celular'}.
            {lead.aceite_ip && <span className="opacity-60"> IP {lead.aceite_ip}.</span>}
          </p>

          {aceite.divergente && (
            <p className="mt-2 rounded-lg bg-amber-100/70 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
              Depois do aceite {aceite.posteriores.length === 1 ? 'entrou' : 'entraram'}{' '}
              <b>{aceite.posteriores.length}</b>{' '}
              {aceite.posteriores.length === 1 ? 'cotação nova' : 'cotações novas'}
              {aceite.posteriores[0] && <> (a mais recente, <b>{formatCurrency(valorDaCotacao(aceite.posteriores[0]))}/mes</b>, de {formatDate(aceite.posteriores[0].created_at)})</>}
              {' '}— e o cliente <b>não aceitou</b> {aceite.posteriores.length === 1 ? 'ela' : 'nenhuma delas'}.
              Mandar assim para a Auditoria e entregar uma prova de consentimento de outro preço.
              Colha um aceite novo ou volte a cotação aceita antes de seguir.
            </p>
          )}

          {aceite.semVinculo && (
            <p className="mt-2 rounded-lg bg-amber-100/70 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
              O registro do aceite não aponta para nenhuma cotação desta lista. Confirme com o
              cliente o valor combinado antes de mandar para a Auditoria.
            </p>
          )}

          <p className={`mt-1.5 text-[11.5px] ${
            aceite.divergente || aceite.semVinculo ? 'text-amber-900/70' : 'text-emerald-900/70'}`}>
            O back-office ajusta, completa a ficha abaixo e manda para a Auditoria.
          </p>
        </div>
      )}

      {/* 0161: o back-office assume em Aguardando vistoria */}
      {lead.status === 'AGUARDANDO_VISTORIA' && (
        <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-[12.5px] leading-relaxed text-teal-900">
          <p className="text-[13px] font-bold">Com o back-office</p>
          <p className="mt-1">
            Mande o link da vistoria (aba <b>Documentos e fotos</b>), complete a ficha e envie para a
            Auditoria.{' '}
            {faltando.length > 0
              ? <>Faltam <b>{faltando.length}</b> item(ns) do checklist — a Auditoria só recebe a ficha completa.</>
              : <b>Checklist completo: pode enviar.</b>}
          </p>
        </div>
      )}

      {/* Acoes de status — as MESMAS transicoes que o Kanban aceita */}
      {acoes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {acoes.map((a) => (
            <Button
              key={a.destino}
              variant={VARIANTE_ACAO[a.intencao]}
              className={a.intencao === 'perder' ? 'text-rose-500 hover:bg-rose-50' : undefined}
              onClick={() => mudar(a)}
              disabled={mover.isPending || (a.destino === 'APROVADO' && faltando.length > 0)}
              title={a.destino === 'APROVADO' && faltando.length > 0 ? 'Complete o checklist antes' : undefined}
            >
              <IconeAcao intencao={a.intencao} /> {a.rotulo}
            </Button>
          ))}
        </div>
      )}

      {/* Contatos e agenda: o trabalho em cima do lead */}
      <ContatosLead lead={lead} historico={historico ?? []} />

      {/* Trava de Auditoria */}
      {lead.status === 'EM_AUDITORIA' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <ShieldCheck className="h-4 w-4" /> Aguardando Auditoria
          </p>
          <p className="mt-1 text-xs text-amber-700">
            O veículo e o associado NÃO entram na base até a Auditoria conferir os dados e autorizar.
          </p>
          {podeAuditar ? (
            <div className="mt-3 space-y-2">
              {faltando.length > 0 && (
                <p className="rounded-lg bg-superficie/70 px-3 py-2 text-[11.5px] leading-relaxed text-amber-900">
                  <b>Faltam {faltando.length} item(ns)</b> para o veículo poder entrar na base:{' '}
                  {faltando.slice(0, 6).join(', ')}
                  {faltando.length > 6 && ` e mais ${faltando.length - 6}`}.
                </p>
              )}
              <label className="text-xs text-amber-800">CPF/CNPJ do titular (confirme antes de autorizar)</label>
              <Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder={lead.cpf_cnpj ?? 'Somente números'} className="mt-0" />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <FormField label="Dia de vencimento da mensalidade">
                  <Select value={String(diaVenc)} onChange={(e) => setDiaVenc(Number(e.target.value))}>
                    {DIAS_VENCIMENTO.map((d) => <option key={d} value={d}>Dia {d}</option>)}
                  </Select>
                </FormField>
                <FormField label="Carnê de mensalidades">
                  <SeletorMesesCarne valor={mesesCarne} onChange={setMesesCarne} permitirNenhum />
                </FormField>
                {adesaoPelaSmartCar && (
                  <FormField label="Vencimento do boleto da adesão">
                    <Input type="date" value={vencAdesao} min={hojeSaoPaulo()} onChange={(e) => setVencAdesao(e.target.value)} />
                  </FormField>
                )}
              </div>
              <p className="text-[11.5px] text-amber-800">
                Adesão de <b className="tnum">{formatCurrency(Number(lead.adesao_valor ?? 0))}</b> pela tabela (cotação aceita)
                {adesaoPelaSmartCar ? ' — o boleto (com PIX) é emitido pela Smart Car junto com o carnê.' : ', recebida pelo consultor (sem boleto).'}
                {' '}A cobertura começa <b>24 horas</b> depois da autorização; o 1º boleto do carnê cobra só os
                dias até o vencimento (pró-rata). Na sequência saem as boas-vindas e, se houver rastreador, o
                pedido de instalação.
              </p>
              <Button
                onClick={autorizarEntrada}
                disabled={autorizar.isPending || faltando.length > 0}
                className="w-full"
                title={faltando.length > 0 ? 'Complete a ficha da venda antes de autorizar' : undefined}
              >
                {autorizar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Autorizar entrada na base
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-amber-700">Somente a equipe de Auditoria pode autorizar a entrada.</p>
          )}
        </div>
      )}

      {carne && (
        <ModalCarne
          veiculo={{ id: carne.veiculoId, placa: lead.placa, nome: lead.nome, celular: lead.celular, email: lead.email }}
          mesesIniciais={carne.meses}
          emitirAoAbrir
          boasVindas={carne.boasVindas}
          onClose={() => setCarne(null)}
        />
      )}

      {lead.status === 'ATIVO' && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> Ativo na base.
          {lead.veiculo_id && (
            <span className="ml-auto flex items-center gap-3">
              <button type="button" className="font-medium underline"
                onClick={() => setCarne({ veiculoId: lead.veiculo_id!, meses: MESES_CARNE_PADRAO })}>
                Carnê / boletos
              </button>
              <Link href={`/veiculos/${lead.veiculo_id}`} className="font-medium underline">Ver veículo</Link>
            </span>
          )}
        </div>
      )}

      {/* Fechamento da venda: a ficha que o veiculo precisa para entrar na base */}
      {lead.status !== 'ATIVO' && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">Fechamento da venda</h2>
          <FechamentoVenda lead={lead} />
        </section>
      )}

      {lead.status === 'ATIVO' && (checklist ?? []).length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">Ficha conferida na entrada</h2>
          <ChecklistEntrada itens={checklist ?? []} />
        </section>
      )}

      {/* Cotacoes */}
      <div className="rounded-2xl border border-slate-200 bg-superficie p-4">
        <p className="mb-2 text-xs font-medium uppercase text-slate-400">Cotações</p>
        {(cotacoes ?? []).length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma cotação gerada.</p>
        ) : (
          <ul className="space-y-2">
            {(cotacoes ?? []).map((c) => {
              const link = `${origin}/cotacao/${c.token}`;
              return (
                <li key={c.id} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold text-brand-700">
                      {formatCurrency(Number(c.total_com_desconto ?? c.total_mensalidade))}/mes
                      {Number(c.desconto_percentual) > 0 && (
                        <span className="ml-2 text-xs font-normal text-slate-400 line-through">
                          {formatCurrency(Number(c.total_mensalidade) + Number(c.valor_assistencia_profissional ?? 0))}
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] uppercase text-slate-400">{c.modo_envio === 'CONSOLIDADA' ? 'Consolidada' : 'Detalhada'}</span>
                  </div>
                  {Number(c.valor_assistencia_profissional) > 0 && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      Inclui {formatCurrency(Number(c.valor_assistencia_profissional))} de Assistência Profissional
                      <span className="text-slate-400"> (uso interno — o cliente não vê)</span>
                    </p>
                  )}
                  {Number(c.desconto_percentual) > 0 && (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-emerald-700">
                      <Percent className="h-3 w-3" />
                      Desconto de {Number(c.desconto_percentual).toFixed(2).replace('.', ',')}%
                      {c.desconto_aprovado_por ? ' (exceção aprovada)' : ''}
                      {c.adesao_com_desconto != null && Number(c.taxa_adesao) > 0
                        ? ` · adesão ${formatCurrency(Number(c.adesao_com_desconto))}`
                        : ''}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-slate-400">
                    {formatDate(c.created_at)}
                    {c.atualizada_em ? ` · editada em ${formatDate(c.atualizada_em)}` : ''}
                  </p>
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
                    {/* Mandar a proposta direto para o celular do lead */}
                    <a
                      href={linkWhatsApp(mensagemDaProposta(link, lead.nome), lead.celular)}
                      target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                    {podeEditarCotacao(lead!.status) && (
                      <button
                        onClick={() => setEditando(c)}
                        className="inline-flex items-center gap-1 rounded-lg bg-acao px-2.5 py-1.5 text-xs font-medium text-white"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </button>
                    )}
                    {/* Aceite com o cliente na frente: sem depender do celular dele */}
                    {podeEditarCotacao(lead!.status) && !lead.aceite_em && (
                      <button
                        onClick={() => setColhendoAceite(c)}
                        className="inline-flex items-center gap-1 rounded-lg bg-cyan-500 px-2.5 py-1.5 text-xs font-semibold text-navy hover:bg-cyan-400"
                      >
                        <Handshake className="h-3.5 w-3.5" /> Colher aceite
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Link href="/vendas/novo" className="mt-3 inline-block text-xs font-medium text-brand-600">+ Nova cotação (novo lead)</Link>
      </div>

      {editando && (
        <EditarCotacao lead={lead} cotacao={editando} onClose={() => setEditando(null)} />
      )}

      {/* Perder exige motivo — mesma janela do Kanban */}
      {perdendo && <ModalPerda lead={lead} onClose={() => setPerdendo(false)} />}

      {colhendoAceite && (
        <AceitePresencial lead={lead} cotacao={colhendoAceite} onClose={() => setColhendoAceite(null)} />
      )}
    </div>
  );
}

const VARIANTE_ACAO: Record<IntencaoAcao, 'primary' | 'secondary' | 'ghost'> = {
  avancar: 'primary',
  voltar: 'ghost',
  perder: 'ghost',
  reabrir: 'secondary',
};

function IconeAcao({ intencao }: { intencao: IntencaoAcao }) {
  if (intencao === 'avancar') return <ChevronRight className="h-4 w-4" />;
  if (intencao === 'voltar') return <ChevronLeft className="h-4 w-4" />;
  if (intencao === 'reabrir') return <RotateCcw className="h-4 w-4" />;
  return <XCircle className="h-4 w-4" />;
}
