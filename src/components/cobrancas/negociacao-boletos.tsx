'use client';

// 2a via vencida e boleto NEGOCIADO NA HORA (0121). Decisao do usuario: o
// boleto NOVO e do SCar, registrado no Sicredi ali mesmo, e os originais (do
// Mutual ou do SCar) recebem baixa no banco. A mesma tela serve o SAC, as
// fichas do associado/veiculo e a Fila de Cobranca.
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2, Copy, FileText, Loader2, Mail, MessageCircle, RefreshCw, Repeat2, TriangleAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, MoneyInput } from '@/components/ui/field';
import { createClient } from '@/lib/supabase/client';
import { useQuery } from '@tanstack/react-query';
import {
  useBaixarOriginais, useCriarRenegociacao, useEnviarBoletoEmail, useRenegociacoes,
} from '@/hooks/use-renegociacao';
import { useCobrancaAcordosCliente } from '@/hooks/use-cobranca-fila';
import {
  baixasPendentes, mensagemDoBoleto, parcelasDaNegociacao, ROTULO_BAIXA, totalOriginais,
  validarNegociacao, valorNegociado, type ParcelaNegociada,
} from '@/lib/renegociacao';
import { linkWhatsAppAssociado } from '@/lib/protocolos';
import { addDias } from '@/lib/financeiro';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { BoletoRenegociacao, RenegociacaoCliente, TituloCliente } from '@/lib/database.types';
import { RevistoriaNecessaria, useBloqueioRevistoria } from '@/components/revistoria/revistoria-necessaria';

function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

/** Contato do associado para o envio (nome, celular, e-mail). */
export function useContatoAssociado(clienteId: string | null | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['associado', 'contato', clienteId ?? ''],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes')
        .select('nome_razao_social, celular, telefone, email').eq('id', clienteId as string).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

// ---------------------------------------------------------------------------
// O modal: escolher vencimento/valor (ou parcelar), emitir e enviar
// ---------------------------------------------------------------------------
export function ModalNegociarBoletos({
  clienteId, selecionados, onClose,
}: {
  clienteId: string;
  selecionados: TituloCliente[];
  onClose: () => void;
}) {
  const hoje = hojeSP();
  const criar = useCriarRenegociacao();
  const acordos = useCobrancaAcordosCliente(clienteId);
  const renegs = useRenegociacoes(clienteId);
  const original = totalOriginais(selecionados.map((s) => ({ valor: Number(s.valor) })));
  const contato = useContatoAssociado(clienteId);
  // 0137: vencido acima de N dias so sai com revistoria aprovada (o banco recusa de qualquer jeito).
  const revistoria = useBloqueioRevistoria(
    clienteId, selecionados.map((s) => ({ origem: s.origem === 'MUTUAL' ? 'MUTUAL' : 'SCAR', id: s.id })),
  );
  const algumVencido = selecionados.some((s) => s.status === 'vencido');

  // Acordo em andamento ainda sem boletos: as parcelas vem dele.
  const acordoLivre = useMemo(() => {
    const usados = new Set((renegs.data ?? []).filter((r) => r.situacao !== 'ERRO').map((r) => r.acordo_id));
    return (acordos.data ?? []).find((a) => a.status === 'EM_ANDAMENTO' && !usados.has(a.acordo_id)) ?? null;
  }, [acordos.data, renegs.data]);

  const [modo, setModo] = useState<'SEGUNDA_VIA' | 'ACORDO'>('SEGUNDA_VIA');
  const [usarAcordo, setUsarAcordo] = useState(false);
  const [vencimento, setVencimento] = useState(addDias(hoje, 2));
  const [acrescimo, setAcrescimo] = useState<number | null>(0);
  const [desconto, setDesconto] = useState<number | null>(0);
  const [qtd, setQtd] = useState(2);
  const [obs, setObs] = useState('');
  const [resultado, setResultado] = useState<string | null>(null);

  const total = valorNegociado(original, acrescimo ?? 0, desconto ?? 0);
  const parcelas: ParcelaNegociada[] = usarAcordo && acordoLivre
    ? acordoLivre.parcelas.map((p) => ({ vencimento: p.vencimento, valor: Number(p.valor) }))
    : modo === 'SEGUNDA_VIA'
      ? [{ vencimento, valor: total }]
      : parcelasDaNegociacao(total, qtd, vencimento);
  const tipo = usarAcordo ? 'ACORDO' : modo;
  const erro = validarNegociacao({ origens: selecionados.length, parcelas, hoje });

  if (resultado) {
    return (
      <Modal open onClose={onClose} title="Boleto emitido" tamanho="lg">
        <ResultadoEmissao clienteId={clienteId} renegociacaoId={resultado} onClose={onClose} />
      </Modal>
    );
  }

  function emitir() {
    if (erro) return toast.error(erro);
    if (revistoria.bloqueia) return toast.error('Falta a revistoria do veículo (veja o quadro acima do botão).');
    criar.mutate(
      {
        cliente_id: clienteId,
        tipo,
        origens: selecionados.map((s) => ({ origem: s.origem === 'MUTUAL' ? 'MUTUAL' : 'SCAR', id: s.id })),
        parcelas,
        acordo_id: usarAcordo && acordoLivre ? acordoLivre.acordo_id : null,
        observacao: obs || null,
      },
      {
        onSuccess: (r) => {
          if (r.erros_baixa > 0) toast.warning(`Boleto emitido, mas ${r.erros_baixa} original(is) não foram baixados — veja abaixo.`);
          else toast.success('Boleto emitido no Sicredi e originais baixados.');
          setResultado(r.renegociacao_id);
        },
        onError: (e) => toast.error(e.message, { duration: 10000 }),
      },
    );
  }

  return (
    <Modal open onClose={onClose} title={algumVencido ? 'Negociar boleto vencido' : '2a via / negociar boleto'} tamanho="lg">
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Boletos que serão substituídos</p>
          <ul className="space-y-0.5 text-sm">
            {selecionados.map((s) => (
              <li key={s.id} className="flex justify-between tnum">
                <span className="text-slate-700">
                  Vence {formatDate(s.data_vencimento)}{s.placa ? ` · ${s.placa}` : ''}
                  {s.origem === 'MUTUAL' && <span className="ml-1 rounded bg-brand-50 px-1.5 text-[11px] text-brand-600">Mutual</span>}
                  {s.status === 'vencido' && <span className="ml-1 text-xs text-rose-600">{s.dias_atraso}d em atraso</span>}
                </span>
                <span>{formatCurrency(Number(s.valor))}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 flex justify-between border-t border-slate-100 pt-1 text-sm font-semibold tnum">
            <span>Total original</span><span>{formatCurrency(original)}</span>
          </p>
        </div>

        {acordoLivre && (
          <label className="flex items-start gap-2 rounded-lg border border-cyan-200 bg-cyan-50/50 p-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={usarAcordo} onChange={(e) => setUsarAcordo(e.target.checked)} />
            <span>
              <b>Gerar os boletos do acordo de {formatDate(acordoLivre.data_base)}</b> — {acordoLivre.parcelas.length} parcela(s),
              {' '}{formatCurrency(Number(acordoLivre.valor_total))}. Pagar estes boletos cumpre o acordo.
            </span>
          </label>
        )}

        {!usarAcordo && (
          <>
            <div className="flex gap-2">
              <Button variant={modo === 'SEGUNDA_VIA' ? 'primary' : 'secondary'} onClick={() => setModo('SEGUNDA_VIA')}>
                Boleto único (2a via)
              </Button>
              <Button variant={modo === 'ACORDO' ? 'primary' : 'secondary'} onClick={() => setModo('ACORDO')}>
                Parcelar
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label={modo === 'ACORDO' ? '1o vencimento' : 'Novo vencimento'}>
                <Input type="date" value={vencimento} min={hoje} onChange={(e) => setVencimento(e.target.value)} />
              </FormField>
              {modo === 'ACORDO' && (
                <FormField label="Parcelas (mensais)">
                  <Input type="number" min={2} max={36} value={qtd} onChange={(e) => setQtd(Math.max(2, Math.min(36, Number(e.target.value) || 2)))} />
                </FormField>
              )}
              <FormField label="Acréscimo (juros/multa)">
                <MoneyInput value={acrescimo} onChange={setAcrescimo} />
              </FormField>
              <FormField label="Desconto">
                <MoneyInput value={desconto} onChange={setDesconto} />
              </FormField>
            </div>
          </>
        )}

        <FormField label="Observação (fica no histórico)">
          <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: negociado por telefone" />
        </FormField>

        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="mb-1 font-medium text-slate-700">{parcelas.length > 1 ? `${parcelas.length} boletos novos` : 'Boleto novo'}</p>
          <ul className="space-y-0.5 tnum text-slate-600">
            {parcelas.map((p, i) => (
              <li key={i} className="flex justify-between">
                <span>{parcelas.length > 1 ? `${i + 1}a · ` : ''}vence {formatDate(p.vencimento)}</span>
                <span className="font-medium text-slate-800">{formatCurrency(p.valor)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            Ao confirmar, o boleto novo e registrado no Sicredi (boleto + PIX) e os originais recebem BAIXA no banco —
            o associado não consegue pagar os dois.
          </p>
          {erro && <p className="mt-1 text-xs font-medium text-rose-700">{erro}</p>}
        </div>

        <RevistoriaNecessaria
          linhas={revistoria.q.data ?? []}
          nome={contato.data?.nome_razao_social}
          celular={contato.data?.celular ?? contato.data?.telefone}
        />
        {revistoria.q.error && (
          <p className="text-xs text-rose-700">Não consegui conferir a revistoria: {(revistoria.q.error as Error).message}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={emitir} disabled={criar.isPending || !!erro || revistoria.bloqueia || revistoria.carregando}>
            {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat2 className="h-4 w-4" />}
            Emitir e substituir
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ResultadoEmissao({ clienteId, renegociacaoId, onClose }: { clienteId: string; renegociacaoId: string; onClose: () => void }) {
  const q = useRenegociacoes(clienteId);
  const r = (q.data ?? []).find((x) => x.id === renegociacaoId);
  if (q.isLoading) return <p className="text-sm text-slate-400">Carregando...</p>;
  if (!r) return <p className="text-sm text-slate-500">Emitido. Atualize a tela para ver os boletos.</p>;
  return (
    <div className="space-y-3">
      <CartaoRenegociacao clienteId={clienteId} r={r} destaque />
      <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Fechar</Button></div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A lista do que ja foi negociado (com envio e "tentar baixa de novo")
// ---------------------------------------------------------------------------
export function BoletosNegociados({ clienteId }: { clienteId: string }) {
  const q = useRenegociacoes(clienteId);
  const lista = (q.data ?? []).filter((r) => r.situacao === 'EMITIDA'
    && (r.boletos.some((b) => b.status !== 'pago' && b.status !== 'cancelado') || baixasPendentes(r.origens) > 0));
  const recusadas = (q.data ?? []).filter((r) => r.situacao === 'ERRO').slice(0, 1);
  if (lista.length === 0 && recusadas.length === 0) return null;
  return (
    <div className="mb-3 space-y-2">
      {lista.map((r) => <CartaoRenegociacao key={r.id} clienteId={clienteId} r={r} />)}
      {recusadas.map((r) => (
        <p key={r.id} className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <TriangleAlert className="mr-1 inline h-3.5 w-3.5" />
          Última tentativa de {formatDate(r.created_at)} recusada pelo banco: {r.erro}. Os boletos originais não foram alterados.
        </p>
      ))}
    </div>
  );
}

function CartaoRenegociacao({ clienteId, r, destaque }: { clienteId: string; r: RenegociacaoCliente; destaque?: boolean }) {
  const baixar = useBaixarOriginais();
  const pend = baixasPendentes(r.origens);
  const abertos = r.boletos.filter((b) => b.status !== 'cancelado');
  return (
    <div className={`rounded-xl border p-3 ${destaque ? 'border-emerald-300 bg-emerald-50/40' : 'border-cyan-200 bg-cyan-50/30'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">
          <CheckCircle2 className="mr-1 inline h-4 w-4 text-emerald-600" />
          {r.tipo === 'ACORDO' ? `Acordo em ${r.boletos.length}x` : r.tipo === 'PRO_RATA' ? (r.boletos.length ? 'Pró-rata' : 'Baixa por cancelamento') : '2a via negociada'} · {formatCurrency(Number(r.valor_total))}
          <span className="ml-2 text-xs font-normal text-slate-500">
            substitui {r.origens.length} boleto(s) de {formatCurrency(Number(r.valor_original))} · {formatDate(r.created_at)}
            {r.criado_por ? ` · ${r.criado_por}` : ''}
          </span>
        </p>
      </div>
      <ul className="mt-2 space-y-1.5">
        {abertos.map((b) => <LinhaBoletoNovo key={b.id} b={b} varios={abertos.length > 1} />)}
      </ul>
      <EnvioBoletos clienteId={clienteId} boletos={abertos.filter((b) => b.status !== 'pago')} />
      {pend > 0 && (
        <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="font-medium">{pend} boleto(s) original(is) ainda sem baixa no banco — o associado ainda consegue paga-lo(s).</p>
          <ul className="mt-1">
            {r.origens.filter((o) => o.baixa_status === 'ERRO' || o.baixa_status === 'PENDENTE').map((o) => (
              <li key={o.id}>
                Vence {formatDate(o.vencimento)} · {formatCurrency(Number(o.valor))} · {ROTULO_BAIXA[o.baixa_status]}
                {o.baixa_erro ? `: ${o.baixa_erro}` : ''}
              </li>
            ))}
          </ul>
          <Button variant="secondary" className="mt-1 px-2 py-1 text-xs" disabled={baixar.isPending}
            onClick={() => baixar.mutate(r.id, {
              onSuccess: (x) => (x.erros_baixa ? toast.warning(`${x.erros_baixa} ainda recusado(s)`) : toast.success('Originais baixados')),
              onError: (e) => toast.error(e.message),
            })}>
            {baixar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Tentar a baixa de novo
          </Button>
        </div>
      )}
    </div>
  );
}

function LinhaBoletoNovo({ b, varios }: { b: BoletoRenegociacao; varios: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="tnum text-slate-700">
        {varios ? `${b.parcela}a · ` : ''}vence {formatDate(b.vencimento)} · <b>{formatCurrency(Number(b.valor))}</b>
        <span className={`ml-2 rounded px-1.5 text-[11px] ${b.status === 'pago' ? 'bg-emerald-50 text-emerald-700' : b.status === 'vencido' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{b.status}</span>
      </span>
      {b.status !== 'pago' && (
        <span className="flex flex-wrap gap-1">
          {b.linha_digitavel && (
            <button onClick={() => { navigator.clipboard?.writeText(b.linha_digitavel ?? ''); toast.success('Linha digitável copiada'); }}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600">
              <Copy className="h-3.5 w-3.5" /> Linha
            </button>
          )}
          {b.pix_copia_cola && (
            <button onClick={() => { navigator.clipboard?.writeText(b.pix_copia_cola ?? ''); toast.success('PIX copiado'); }}
              className="inline-flex items-center gap-1 rounded-lg bg-cyan-50 px-2 py-1 text-xs text-cyan-700">
              <Copy className="h-3.5 w-3.5" /> PIX
            </button>
          )}
          {b.linha_digitavel && (
            <a href={`/api/v1/cobrancas/boleto?titulo_id=${b.id}`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600">
              <FileText className="h-3.5 w-3.5" /> PDF
            </a>
          )}
        </span>
      )}
    </li>
  );
}

/** Envio na hora: WhatsApp (texto com linha + PIX) e e-mail (com o PDF). */
export function EnvioBoletos({ clienteId, boletos }: { clienteId: string; boletos: BoletoRenegociacao[] }) {
  const contato = useContatoAssociado(clienteId);
  const email = useEnviarBoletoEmail();
  if (boletos.length === 0) return null;
  const texto = mensagemDoBoleto({ nome: contato.data?.nome_razao_social ?? '', boletos });
  const zap = linkWhatsAppAssociado(contato.data?.celular ?? contato.data?.telefone, texto);
  return (
    <div className="mt-2 flex flex-wrap gap-2 border-t border-slate-100 pt-2">
      {zap ? (
        <a href={zap} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
          <MessageCircle className="h-3.5 w-3.5" /> Enviar no WhatsApp
        </a>
      ) : (
        <span className="text-xs text-amber-700">Sem celular válido no cadastro.</span>
      )}
      <Button variant="secondary" className="px-3 py-1.5 text-xs" disabled={email.isPending || !contato.data?.email}
        title={contato.data?.email ? `Para ${contato.data.email}` : 'Associado sem e-mail no cadastro'}
        onClick={() => email.mutate({ titulo_ids: boletos.map((b) => b.id) }, {
          onSuccess: (r) => (r.enviado ? toast.success(`E-mail enviado para ${r.para}`) : toast.warning(r.aviso ?? 'E-mail não enviado')),
          onError: (e) => toast.error(e.message),
        })}>
        {email.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Enviar por e-mail
      </Button>
      <Button variant="ghost" className="px-3 py-1.5 text-xs"
        onClick={() => { navigator.clipboard?.writeText(texto); toast.success('Mensagem copiada'); }}>
        <Copy className="h-3.5 w-3.5" /> Copiar mensagem
      </Button>
    </div>
  );
}
