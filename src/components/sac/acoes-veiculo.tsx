'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Wallet, MessageCircle, Mail, Pencil, Barcode, QrCode, Copy, Repeat2, Loader2, Calculator, Ban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Textarea, MoneyInput } from '@/components/ui/field';
import { useTitulosCliente, useAjustarTitulo } from '@/hooks/use-protocolos';
import { BoletosNegociados, ModalNegociarBoletos, useContatoAssociado } from '@/components/cobrancas/negociacao-boletos';
import { ModalBoletoProRata } from '@/components/veiculos/cancelamento-veiculo';
import { usePode } from '@/hooks/use-permissoes';
import { ehBoletoAvulso, ehLinhaSicredi, mensagemDoBoleto, motivoNaoCancelavel, motivoNaoNegociavel } from '@/lib/renegociacao';
import { ModalCancelarBoletos } from '@/components/cobrancas/cancelar-boletos';
import {
  linkWhatsAppAssociado, mensagemPadrao, assuntoPadrao, linkEmail,
  valorAjustado, validarAjuste,
} from '@/lib/protocolos';
import { editavelNoScar } from '@/lib/historico-financeiro';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { ClientesRow, TituloCliente } from '@/lib/database.types';

const STATUS_COR: Record<string, string> = {
  aberto: 'bg-amber-50 text-amber-700',
  pago: 'bg-emerald-50 text-emerald-700',
  vencido: 'bg-rose-50 text-rose-700',
  cancelado: 'bg-slate-100 text-slate-500',
};

// ---------------------------------------------------------------------------
// VCard: Historico financeiro (com edicao do boleto em aberto)
// ---------------------------------------------------------------------------
export function ModalHistoricoFinanceiro({
  clienteId, veiculoId, placa, onClose,
}: {
  clienteId: string;
  veiculoId?: string | null;
  placa?: string | null;
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} title={`Histórico financeiro${placa ? ` — ${placa}` : ''}`} tamanho="lg">
      <HistoricoFinanceiroLista clienteId={clienteId} veiculoId={veiculoId} />
    </Modal>
  );
}

/**
 * A lista de boletos do associado (ou de um veiculo) com as DUAS fontes (0099)
 * e a edicao do boleto em aberto do SCar. Mesma lista no SAC (modal), na ficha
 * do associado e na ficha do veiculo.
 */
export function HistoricoFinanceiroLista({
  clienteId, veiculoId, limite = 60, alturaMaxima = true,
}: {
  clienteId: string;
  veiculoId?: string | null;
  limite?: number;
  alturaMaxima?: boolean;
}) {
  const { data: titulos, isLoading, error } = useTitulosCliente(clienteId, veiculoId ?? null, limite);
  const [editando, setEditando] = useState<TituloCliente | null>(null);
  const contato = useContatoAssociado(clienteId);
  // 0121: selecao dos boletos em aberto para 2a via / negociacao (Mutual e SCar).
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [negociando, setNegociando] = useState<TituloCliente[] | null>(null);
  // 0144: boleto pro-rata avulso, pela data de vencimento do veiculo.
  const [proRata, setProRata] = useState(false);
  const podeCobranca = usePode('cobranca.ver');
  // 0157: cancelar boleto(s) com motivo — celula `cobranca.cancelar` (perfil ou extra).
  const podeCancelar = usePode('cobranca.cancelar');
  const [cancelando, setCancelando] = useState<TituloCliente[] | null>(null);
  const cancelavel = (t: TituloCliente) => podeCancelar && !motivoNaoCancelavel(t);
  const marcavel = (t: TituloCliente) => !motivoNaoNegociavel(t) || cancelavel(t);
  const negociaveis = (titulos ?? []).filter(marcavel);
  const selecionados = negociaveis.filter((t) => marcados.has(t.id));
  const selecaoNegociavel = selecionados.length > 0 && selecionados.every((t) => !motivoNaoNegociavel(t));
  const selecaoCancelavel = selecionados.length > 0 && selecionados.every(cancelavel);
  const alternar = (id: string) => setMarcados((m) => {
    const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });

  return (
    <>
      {error && <p className="text-sm text-rose-600">Não foi possível carregar o financeiro: {(error as Error).message}</p>}
      {isLoading && <p className="text-sm text-slate-400">Carregando...</p>}
      {!isLoading && (titulos ?? []).length === 0 && (
        <p className="text-sm text-slate-400">Nenhum boleto encontrado — nem no SCar, nem no histórico do Mutual.</p>
      )}
      <BoletosNegociados clienteId={clienteId} />
      {veiculoId && podeCobranca && (
        <div className="mb-2 flex justify-end">
          <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => setProRata(true)}>
            <Calculator className="h-3.5 w-3.5" /> Boleto pró-rata
          </Button>
        </div>
      )}
      {negociaveis.length > 0 && (
        <div className="sticky top-0 z-10 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-200 bg-superficie px-3 py-2">
          <p className="text-xs text-slate-600">
            {selecionados.length > 0
              ? <>Selecionados: <b className="tnum">{selecionados.length}</b> · {formatCurrency(selecionados.reduce((s, t) => s + Number(t.valor), 0))}</>
              : <>Marque os boletos em aberto para gerar a 2a via ou negociar (um boleto novo, ou parcelado){podeCancelar ? ', ou para cancelar' : ''}.</>}
          </p>
          <span className="flex gap-1">
            {selecionados.length === 0 && negociaveis.some((t) => t.status === 'vencido') && (
              <Button variant="ghost" className="px-2 py-1 text-xs"
                onClick={() => setMarcados(new Set(negociaveis.filter((t) => t.status === 'vencido').map((t) => t.id)))}>
                Marcar os vencidos
              </Button>
            )}
            <Button className="px-2.5 py-1 text-xs" disabled={!selecaoNegociavel} onClick={() => setNegociando(selecionados)}
              title={selecionados.length > 0 && !selecaoNegociavel ? 'Há boleto avulso na seleção: avulso não vira 2a via' : undefined}>
              <Repeat2 className="h-3.5 w-3.5" /> 2a via / negociar
            </Button>
            {podeCancelar && (
              <Button variant="danger" className="px-2.5 py-1 text-xs" disabled={!selecaoCancelavel}
                onClick={() => setCancelando(selecionados)}>
                <Ban className="h-3.5 w-3.5" /> Cancelar
              </Button>
            )}
          </span>
        </div>
      )}
      {(titulos ?? []).some((t) => t.origem === 'MUTUAL') && (
        <p className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Os boletos <b>Mutual</b> foram emitidos pelo sistema anterior. A 2a via vencida e a negociação geram um
          boleto NOVO do SCar no Sicredi, e o original recebe baixa no banco.
        </p>
      )}

      <ul className={`space-y-2 ${alturaMaxima ? 'max-h-[60vh] overflow-y-auto' : ''}`}>
        {(titulos ?? []).map((t) => (
          <li key={t.id} className={`rounded-xl border p-3 ${marcados.has(t.id) ? 'border-cyan-400 bg-cyan-50/40' : 'border-slate-200'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-start gap-2">
                {marcavel(t) && (
                  <input type="checkbox" className="mt-1 h-4 w-4" checked={marcados.has(t.id)} onChange={() => alternar(t.id)}
                    aria-label="Selecionar para 2a via / negociação" />
                )}
                <div>
                <p className="text-sm font-semibold text-slate-800">
                  {formatCurrency(Number(t.valor))}
                  {(Number(t.desconto) > 0 || Number(t.acrescimo) > 0) && (
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      (original {formatCurrency(Number(t.valor_original))}
                      {Number(t.desconto) > 0 ? ` · desc. ${formatCurrency(Number(t.desconto))}` : ''}
                      {Number(t.acrescimo) > 0 ? ` · acresc. ${formatCurrency(Number(t.acrescimo))}` : ''})
                    </span>
                  )}
                </p>
                {ehBoletoAvulso(t.observacao) && (
                  <p className="text-xs font-medium text-teal-700">{t.observacao}</p>
                )}
                {t.status === 'cancelado' && t.observacao?.includes('Cancelado: ') && (
                  <p className="text-xs text-slate-500">
                    {t.observacao.slice(t.observacao.indexOf('Cancelado: '))}
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  Vence {formatDate(t.data_vencimento)}
                  {t.placa ? ` · ${t.placa}` : ' · fatura do associado'}
                  {t.status === 'vencido' && t.dias_atraso > 0 ? ` · ${t.dias_atraso} dia(s) em atraso` : ''}
                </p>
                {t.status === 'pago' && (
                  <p className="text-xs font-medium text-emerald-700">
                    {t.data_pagamento ? `Pago em ${formatDate(t.data_pagamento)}` : 'Pago (data não informada)'}
                    {t.valor_pago != null && Number(t.valor_pago) !== Number(t.valor)
                      ? ` · ${formatCurrency(Number(t.valor_pago))}` : ''}
                  </p>
                )}
                </div>
              </div>
              <span className="flex items-center gap-1">
                {t.origem === 'MUTUAL' && (
                  <span className="rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-600" title="Boleto emitido pelo Mutual (mesmo beneficiário Sicredi)">
                    Mutual
                  </span>
                )}
                {t.em_serasa && <span className="rounded bg-rose-50 px-2 py-0.5 text-xs text-rose-700">Serasa</span>}
                <span className={`rounded px-2 py-0.5 text-xs ${STATUS_COR[t.status] ?? ''}`}>{t.status}</span>
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {t.linha_digitavel && ehLinhaSicredi(t.linha_digitavel) && t.status !== 'pago' && t.status !== 'cancelado' && (
                <a href={t.origem === 'MUTUAL' ? `/api/v1/cobrancas/boleto?boleto_historico_id=${t.id}` : `/api/v1/cobrancas/boleto?titulo_id=${t.id}`}
                  target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600">
                  <Barcode className="h-3.5 w-3.5" /> PDF (Sicredi)
                </a>
              )}
              {t.linha_digitavel && t.status === 'aberto' && (
                <a href={linkWhatsAppAssociado(contato.data?.celular ?? contato.data?.telefone, mensagemDoBoleto({
                    nome: contato.data?.nome_razao_social ?? '', substitui: false,
                    boletos: [{ parcela: 1, vencimento: t.data_vencimento, valor: Number(t.valor),
                      linha_digitavel: t.linha_digitavel, pix_copia_cola: t.pix_copia_cola }] })) ?? undefined}
                  target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                  <MessageCircle className="h-3.5 w-3.5" /> Enviar 2a via
                </a>
              )}
              {t.url_boleto && (
                <a href={t.url_boleto} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600">
                  <Barcode className="h-3.5 w-3.5" /> PDF
                </a>
              )}
              {t.linha_digitavel && (
                <button
                  onClick={() => { navigator.clipboard?.writeText(t.linha_digitavel ?? ''); toast.success('Linha digitável copiada'); }}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600"
                >
                  <Copy className="h-3.5 w-3.5" /> Linha digitável
                </button>
              )}
              {t.pix_copia_cola && (
                <button
                  onClick={() => { navigator.clipboard?.writeText(t.pix_copia_cola ?? ''); toast.success('PIX copiado'); }}
                  className="inline-flex items-center gap-1 rounded-lg bg-cyan-50 px-2 py-1 text-xs text-cyan-700"
                >
                  <QrCode className="h-3.5 w-3.5" /> PIX
                </button>
              )}
              {t.origem === 'MUTUAL' && t.url_pagamento && t.status !== 'pago' && t.status !== 'cancelado' && (
                <a href={t.url_pagamento} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-cyan-50 px-2 py-1 text-xs text-cyan-700">
                  <QrCode className="h-3.5 w-3.5" /> Página de pagamento (Mutual)
                </a>
              )}
              {!motivoNaoNegociavel(t) && (
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setNegociando([t])}>
                  <Repeat2 className="h-3.5 w-3.5" /> {t.status === 'vencido' ? '2a via (novo boleto)' : 'Negociar'}
                </Button>
              )}
              {cancelavel(t) && (
                <Button variant="ghost" className="px-2 py-1 text-xs text-rose-600" onClick={() => setCancelando([t])}>
                  <Ban className="h-3.5 w-3.5" /> Cancelar
                </Button>
              )}
              {/* Ja registrado no banco: mudar valor/vencimento aqui desencontraria do boleto — use "Negociar". */}
              {editavelNoScar(t) && !t.linha_digitavel && (
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEditando(t)}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {proRata && veiculoId && (
        <ModalBoletoProRata veiculoId={veiculoId} placa={(titulos ?? []).find((t) => t.veiculo_id === veiculoId)?.placa}
          onClose={() => setProRata(false)} />
      )}
      {editando && <ModalEditarBoleto titulo={editando} onClose={() => setEditando(null)} />}
      {cancelando && (
        <ModalCancelarBoletos clienteId={clienteId} selecionados={cancelando}
          onClose={() => { setCancelando(null); setMarcados(new Set()); }} />
      )}
      {negociando && (
        <ModalNegociarBoletos clienteId={clienteId} selecionados={negociando}
          onClose={() => { setNegociando(null); setMarcados(new Set()); }} />
      )}
    </>
  );
}

function ModalEditarBoleto({ titulo, onClose }: { titulo: TituloCliente; onClose: () => void }) {
  const ajustar = useAjustarTitulo();
  const [form, setForm] = useState({
    vencimento: titulo.data_vencimento,
    desconto: Number(titulo.desconto) as number | null,
    acrescimo: Number(titulo.acrescimo) as number | null,
    observacao: titulo.observacao ?? '',
  });

  const original = Number(titulo.valor_original);
  const final = valorAjustado(original, form.desconto ?? 0, form.acrescimo ?? 0);
  const erro = validarAjuste(original, form.desconto ?? 0, form.acrescimo ?? 0);

  return (
    <Modal open onClose={onClose} title="Editar boleto em aberto" tamanho="lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (erro) return toast.error(erro);
          ajustar.mutate(
            {
              titulo_id: titulo.id,
              vencimento: form.vencimento,
              desconto: form.desconto ?? 0,
              acrescimo: form.acrescimo ?? 0,
              observacao: form.observacao || null,
            },
            {
              onSuccess: (t) => { toast.success(`Boleto atualizado — ${formatCurrency(Number(t.valor))}`); onClose(); },
              onError: (err) => toast.error(err.message),
            },
          );
        }}
        className="space-y-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Vencimento">
            <Input type="date" value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} />
          </FormField>
          <FormField label="Valor original">
            <Input value={formatCurrency(original)} disabled />
          </FormField>
          <FormField label="Desconto">
            <MoneyInput value={form.desconto} onChange={(v) => setForm({ ...form, desconto: v })} />
          </FormField>
          <FormField label="Acréscimo (juros/multa)">
            <MoneyInput value={form.acrescimo} onChange={(v) => setForm({ ...form, acrescimo: v })} />
          </FormField>
          <FormField label="Observação" className="sm:col-span-2">
            <Input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              placeholder="Ex.: negociado no atendimento" />
          </FormField>
        </div>

        <p className={`rounded-lg p-3 text-sm ${erro ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-600'}`}>
          {erro ?? <>Novo valor do boleto: <strong className="tnum">{formatCurrency(final)}</strong></>}
          <span className="mt-1 block text-xs text-slate-500">
            O valor é sempre recalculado a partir do original — ajustes não se acumulam. Este boleto ainda não
            foi ao banco: ele sai com estes valores. Boleto já registrado se muda por &ldquo;Negociar&rdquo;.
          </span>
        </p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={ajustar.isPending || !!erro}>
            {ajustar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// VCards: WhatsApp e E-mail
// ---------------------------------------------------------------------------
export function ModalWhatsApp({
  associado, placa, onClose,
}: {
  associado: ClientesRow;
  placa?: string | null;
  onClose: () => void;
}) {
  const [texto, setTexto] = useState(mensagemPadrao({ associado: associado.nome_razao_social, placa }));
  const telefone = associado.celular ?? associado.telefone;
  const link = linkWhatsAppAssociado(telefone, texto);

  return (
    <Modal open onClose={onClose} title="Enviar WhatsApp">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          {associado.nome_razao_social}
          {telefone ? ` · ${telefone}` : ''}
        </p>
        <FormField label="Mensagem">
          <Textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </FormField>
        {!link && (
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            O associado não tem celular válido no cadastro — atualize a ficha para disparar pelo WhatsApp.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { navigator.clipboard?.writeText(texto); toast.success('Mensagem copiada'); }}>
            <Copy className="h-4 w-4" /> Copiar
          </Button>
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <MessageCircle className="h-4 w-4" /> Abrir WhatsApp
            </a>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function ModalEmail({
  associado, placa, onClose,
}: {
  associado: ClientesRow;
  placa?: string | null;
  onClose: () => void;
}) {
  const [assunto, setAssunto] = useState(assuntoPadrao({ associado: associado.nome_razao_social, placa }));
  const [corpo, setCorpo] = useState(
    `${mensagemPadrao({ associado: associado.nome_razao_social, placa })}\n\nAtenciosamente,\nEquipe Smart Car Brasil`,
  );
  const destino = associado.email ?? associado.email_adicional;
  const link = linkEmail(destino, assunto, corpo);

  return (
    <Modal open onClose={onClose} title="Enviar e-mail">
      <div className="space-y-3">
        <FormField label="Para">
          <Input value={destino ?? ''} disabled placeholder="Associado sem e-mail no cadastro" />
        </FormField>
        <FormField label="Assunto">
          <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} />
        </FormField>
        <FormField label="Mensagem">
          <Textarea rows={6} value={corpo} onChange={(e) => setCorpo(e.target.value)} />
        </FormField>
        {!link && (
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            O associado não tem e-mail válido no cadastro — atualize a ficha para enviar.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { navigator.clipboard?.writeText(corpo); toast.success('Mensagem copiada'); }}>
            <Copy className="h-4 w-4" /> Copiar
          </Button>
          {link && (
            <a
              href={link}
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-lg bg-acao px-3.5 py-2 text-sm font-medium text-white hover:bg-acao-escura"
            >
              <Mail className="h-4 w-4" /> Abrir e-mail
            </a>
          )}
        </div>
      </div>
    </Modal>
  );
}

// Icones exportados para o menu de servicos do SAC.
export const ICONES_ACOES = { Wallet, MessageCircle, Mail, Pencil };
