'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Wallet, MessageCircle, Mail, Pencil, Barcode, QrCode, Copy, RefreshCw, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Textarea, MoneyInput } from '@/components/ui/field';
import {
  useTitulosCliente, useAjustarTitulo, useReemitirTitulo,
} from '@/hooks/use-protocolos';
import {
  linkWhatsAppAssociado, mensagemPadrao, assuntoPadrao, linkEmail,
  valorAjustado, tituloEditavel, validarAjuste,
} from '@/lib/protocolos';
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
  const { data: titulos, isLoading } = useTitulosCliente(clienteId, veiculoId ?? null);
  const reemitir = useReemitirTitulo();
  const [editando, setEditando] = useState<TituloCliente | null>(null);

  return (
    <Modal open onClose={onClose} title={`Historico financeiro${placa ? ` — ${placa}` : ''}`} tamanho="lg">
      {isLoading && <p className="text-sm text-slate-400">Carregando...</p>}
      {!isLoading && (titulos ?? []).length === 0 && (
        <p className="text-sm text-slate-400">Nenhum boleto para este associado.</p>
      )}

      <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
        {(titulos ?? []).map((t) => (
          <li key={t.id} className="rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
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
                <p className="text-xs text-slate-500">
                  Vence {formatDate(t.data_vencimento)}
                  {t.placa ? ` · ${t.placa}` : ' · fatura do associado'}
                  {t.status === 'vencido' && t.dias_atraso > 0 ? ` · ${t.dias_atraso} dia(s) em atraso` : ''}
                </p>
              </div>
              <span className={`rounded px-2 py-0.5 text-xs ${STATUS_COR[t.status] ?? ''}`}>{t.status}</span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {t.url_boleto && (
                <a href={t.url_boleto} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600">
                  <Barcode className="h-3.5 w-3.5" /> PDF
                </a>
              )}
              {t.linha_digitavel && (
                <button
                  onClick={() => { navigator.clipboard?.writeText(t.linha_digitavel ?? ''); toast.success('Linha digitavel copiada'); }}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600"
                >
                  <Copy className="h-3.5 w-3.5" /> Linha digitavel
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
              {tituloEditavel(t.status) && (
                <>
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEditando(t)}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-xs"
                    disabled={reemitir.isPending}
                    onClick={() =>
                      reemitir.mutate(t.id, {
                        onSuccess: () => toast.success('Boleto liberado para 2a via (entra na proxima remessa)'),
                        onError: (e) => toast.error(e.message),
                      })
                    }
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> 2a via
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {editando && <ModalEditarBoleto titulo={editando} onClose={() => setEditando(null)} />}
    </Modal>
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
          <FormField label="Acrescimo (juros/multa)">
            <MoneyInput value={form.acrescimo} onChange={(v) => setForm({ ...form, acrescimo: v })} />
          </FormField>
          <FormField label="Observacao" className="sm:col-span-2">
            <Input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              placeholder="Ex.: negociado no atendimento" />
          </FormField>
        </div>

        <p className={`rounded-lg p-3 text-sm ${erro ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-600'}`}>
          {erro ?? <>Novo valor do boleto: <strong className="tnum">{formatCurrency(final)}</strong></>}
          <span className="mt-1 block text-xs text-slate-500">
            O valor e sempre recalculado a partir do original — ajustes nao se acumulam. Ao mudar o
            vencimento, gere a 2a via para o associado receber o boleto novo.
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
            O associado nao tem celular valido no cadastro — atualize a ficha para disparar pelo WhatsApp.
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
            O associado nao tem e-mail valido no cadastro — atualize a ficha para enviar.
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
