'use client';

// O CARNE do veiculo (0145): N meses de mensalidade (e o boleto da adesao,
// quando a Smart Car cobra) emitidos de uma vez no Sicredi. Usado na
// aprovacao da Qualidade (Auditoria) e na ficha do veiculo.
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, FileText, Loader2, Mail, MessageCircle, Printer, ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Select } from '@/components/ui/field';
import {
  MESES_CARNE_MAX, MESES_CARNE_PADRAO, mensagemDoCarne, resumoDoCarne, type BoletoDoCarne,
} from '@/lib/carne';
import { linkWhatsAppAssociado } from '@/lib/protocolos';
import { mensagemBoasVindasWhatsApp } from '@/lib/boas-vindas';
import { formatCurrency, formatDate } from '@/lib/utils';

export function useEmitirCarne() {
  const qc = useQueryClient();
  return useMutation<{ boletos: BoletoDoCarne[]; provedor: string }, Error, { veiculo_id: string; meses: number }>({
    mutationFn: async (p) => {
      const r = await fetch('/api/v1/vendas/carne', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? 'Falha ao emitir o carnê');
      return j;
    },
    onSettled: () => {
      for (const k of [['vida'], ['veiculo'], ['sac'], ['cobrancas'], ['cobranca'], ['titulos']]) {
        qc.invalidateQueries({ queryKey: k });
      }
    },
  });
}

export interface VeiculoDoCarne {
  id: string;
  placa: string | null;
  nome: string;
  celular: string | null;
  email?: string | null;
}

/** Seletor de meses (1 a 12). Com `permitirNenhum`, 0 = "não emitir agora". */
export function SeletorMesesCarne({ valor, onChange, permitirNenhum = false }: {
  valor: number; onChange: (n: number) => void; permitirNenhum?: boolean;
}) {
  return (
    <Select value={String(valor)} onChange={(e) => onChange(Number(e.target.value))}>
      {permitirNenhum && <option value="0">Não emitir agora</option>}
      {Array.from({ length: MESES_CARNE_MAX }, (_, i) => i + 1).map((n) => (
        <option key={n} value={n}>{n} {n === 1 ? 'mês' : 'meses'}</option>
      ))}
    </Select>
  );
}

export function ModalCarne({ veiculo, onClose, mesesIniciais, emitirAoAbrir = false, boasVindas = false }: {
  veiculo: VeiculoDoCarne;
  onClose: () => void;
  mesesIniciais?: number;
  emitirAoAbrir?: boolean;
  /** 0161: associado novo — os envios viram as BOAS-VINDAS (portal + boletos). */
  boasVindas?: boolean;
}) {
  const [meses, setMeses] = useState(mesesIniciais ?? MESES_CARNE_PADRAO);
  const emitir = useEmitirCarne();
  const [boletos, setBoletos] = useState<BoletoDoCarne[] | null>(null);
  const disparou = useRef(false);

  async function rodar(n: number) {
    try {
      const r = await emitir.mutateAsync({ veiculo_id: veiculo.id, meses: n });
      setBoletos(r.boletos);
      const res = resumoDoCarne(r.boletos);
      if (res.comErro > 0) toast.error(`${res.comErro} boleto(s) não foram registrados no banco — tente de novo.`);
      else toast.success(`Carnê emitido: ${r.boletos.length} boleto(s).`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  useEffect(() => {
    if (emitirAoAbrir && !disparou.current) {
      disparou.current = true;
      void rodar(meses);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emitirAoAbrir]);

  return (
    <Modal open onClose={onClose} tamanho="lg" title={boasVindas ? 'Boas-vindas e carnê' : 'Carnê de mensalidades'}
      subtitulo={`${veiculo.placa ?? 'Veículo'} · ${veiculo.nome}`}>
      {!boletos ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Gera as mensalidades dos próximos meses deste veículo e registra os boletos (com PIX) no banco agora.
            O primeiro vence no próximo vencimento a pelo menos 2 dias de hoje e cobra só os dias usados desde a ativação (pró-rata). O veículo passa a ter boleto próprio.
          </p>
          <FormField label="Quantos meses">
            <SeletorMesesCarne valor={meses} onChange={setMeses} />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Fechar</Button>
            <Button onClick={() => rodar(meses)} disabled={emitir.isPending}>
              {emitir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}
              Emitir carnê
            </Button>
          </div>
        </div>
      ) : (
        <CarneEmitido veiculo={veiculo} boletos={boletos} boasVindas={boasVindas}
          onTentarDeNovo={() => rodar(meses)} tentando={emitir.isPending} onClose={onClose} />
      )}
      {!boletos && emitir.isPending && (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Registrando os boletos no banco…
        </p>
      )}
    </Modal>
  );
}

function CarneEmitido({ veiculo, boletos, onTentarDeNovo, tentando, onClose, boasVindas = false }: {
  veiculo: VeiculoDoCarne;
  boletos: BoletoDoCarne[];
  onTentarDeNovo: () => void;
  tentando: boolean;
  onClose: () => void;
  boasVindas?: boolean;
}) {
  const r = resumoDoCarne(boletos);
  const portalUrl = typeof window !== 'undefined' ? `${window.location.origin}/portal/login` : '/portal/login';
  const wa = linkWhatsAppAssociado(veiculo.celular, boasVindas
    ? mensagemBoasVindasWhatsApp({ nome: veiculo.nome, placa: veiculo.placa, portalUrl, boletos })
    : mensagemDoCarne(veiculo.nome, veiculo.placa, boletos));
  const [enviando, setEnviando] = useState(false);

  async function boasVindasPorEmail() {
    setEnviando(true);
    try {
      const res = await fetch('/api/v1/vendas/boas-vindas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ veiculo_id: veiculo.id, titulo_ids: boletos.map((b) => b.titulo_id) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'Falha ao enviar');
      if (j.enviado) toast.success(`Boas-vindas enviadas para ${j.para}.`);
      else toast.warning(j.aviso ?? 'O e-mail não saiu.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  async function copiar(texto: string) {
    try { await navigator.clipboard.writeText(texto); toast.success('Copiado'); } catch { toast.error('Não foi possível copiar'); }
  }

  async function porEmail() {
    setEnviando(true);
    try {
      const res = await fetch('/api/v1/cobrancas/boleto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo_ids: boletos.filter((b) => b.linha_digitavel).map((b) => b.titulo_id) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'Falha ao enviar');
      toast.success('Carnê enviado por e-mail.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  function imprimir() {
    const esc = (t: string | null | undefined) =>
      (t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    const w = window.open('', '_blank');
    if (!w) return;
    const blocos = boletos.filter((b) => b.linha_digitavel).map((b) => `
      <div class="b"><div class="t">${b.adesao ? 'TAXA DE ADESÃO' : 'MENSALIDADE'} · ${esc(veiculo.placa)}</div>
      <div class="r"><span>Vencimento <b>${formatDate(b.vencimento)}</b></span><span>Valor <b>${formatCurrency(b.valor)}</b></span></div>
      <div class="l">${esc(b.linha_digitavel)}</div>
      ${b.pix_copia_cola ? `<div class="p">PIX copia e cola: ${esc(b.pix_copia_cola)}</div>` : ''}</div>`).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Carnê ${esc(veiculo.placa)}</title>
      <style>body{font-family:Arial,sans-serif;margin:24px;color:#111}h1{font-size:16px}
      .b{border:1px dashed #555;padding:10px 12px;margin:0 0 10px;page-break-inside:avoid}
      .t{font-weight:bold;font-size:12px}.r{display:flex;gap:24px;font-size:12px;margin:6px 0}
      .l{font-family:monospace;font-size:13px;letter-spacing:.5px}.p{font-family:monospace;font-size:9px;word-break:break-all;margin-top:6px;color:#444}</style>
      </head><body><h1>${esc(veiculo.nome)} — ${esc(veiculo.placa)}</h1>${blocos}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        <b>{r.mensalidades}</b> mensalidade(s){r.primeiro && <> de {formatDate(r.primeiro)} a {formatDate(r.ultimo!)}</>}
        {r.adesao && <> + adesão de {formatCurrency(r.adesao.valor)}</>} · total <b className="tnum">{formatCurrency(r.total)}</b>
      </div>
      {r.comErro > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <span>{r.comErro} boleto(s) não foram registrados no banco.</span>
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={onTentarDeNovo} disabled={tentando}>
            {tentando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Tentar de novo
          </Button>
        </div>
      )}

      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200">
        {boletos.map((b) => (
          <li key={b.titulo_id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            <span className="w-24 font-medium">{b.adesao ? 'Adesão' : 'Mensalidade'}</span>
            <span className="tnum w-24">{formatDate(b.vencimento)}</span>
            <span className="tnum w-24">{formatCurrency(b.valor)}</span>
            {b.linha_digitavel ? (
              <span className="ml-auto flex gap-1">
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => copiar(b.linha_digitavel!)} title="Copiar linha digitável">
                  <Copy className="h-3.5 w-3.5" /> Linha
                </Button>
                {b.pix_copia_cola && (
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => copiar(b.pix_copia_cola!)} title="Copiar PIX">
                    <Copy className="h-3.5 w-3.5" /> PIX
                  </Button>
                )}
                <a href={`/api/v1/cobrancas/boleto?titulo_id=${b.titulo_id}`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-cyan-700 hover:bg-slate-100">
                  <FileText className="h-3.5 w-3.5" /> PDF
                </a>
              </span>
            ) : (
              <span className="ml-auto text-xs text-rose-700">{b.erro}</span>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={imprimir} disabled={r.registrados === 0}>
          <Printer className="h-4 w-4" /> Imprimir carnê
        </Button>
        {boasVindas ? (
          <Button variant="secondary" onClick={boasVindasPorEmail} disabled={enviando}>
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Boas-vindas por e-mail
          </Button>
        ) : (
          <Button variant="secondary" onClick={porEmail} disabled={enviando || r.registrados === 0}>
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Por e-mail
          </Button>
        )}
        {wa && (boasVindas || r.registrados > 0) && (
          <a href={wa} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </a>
        )}
        <Button onClick={onClose}>Concluir</Button>
      </div>
    </div>
  );
}
