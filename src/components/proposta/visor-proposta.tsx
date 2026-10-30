'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Download, Loader2, MessageCircle, ThumbsUp, X } from 'lucide-react';
import { ALTURA_FOLHA, COR, LARGURA_FOLHA } from './documento';
import { formatarDocumento } from '@/lib/documento';

const ESPACO = 24;

/**
 * As folhas de 794px escaladas para caber na largura (sem rolagem horizontal
 * no celular) + a barra fixa: Aceitar proposta · WhatsApp do consultor · PDF.
 */
export function VisorProposta({
  children, folhas, token, whatsapp, aceite, placa,
}: {
  children: ReactNode;
  folhas: number;
  token: string;
  whatsapp: string | null;
  aceite: { feito: boolean; em: string | null; desatualizada: boolean };
  placa: string | null;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);
  const [aceitando, setAceitando] = useState(false);
  const [aceito, setAceito] = useState<{ vistoria: string | null } | null>(null);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setEscala(Math.min(1, el.clientWidth / LARGURA_FOLHA));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const alturaTotal = folhas * ALTURA_FOLHA + (folhas - 1) * ESPACO;
  const msg = encodeURIComponent(`Olá! Vi a proposta de proteção do veículo ${placa ?? ''}. Quero tirar uma dúvida.`.trim());

  return (
    <div className="min-h-screen pb-28" style={{ background: COR.fundoTela }}>
      <div ref={caixa} className="mx-auto w-full max-w-[842px] px-3 py-4 sm:px-6 sm:py-8">
        <div style={{ height: alturaTotal * escala, position: 'relative' }}>
          <div className="proposta-folhas" style={{ width: LARGURA_FOLHA, transform: `scale(${escala})`, transformOrigin: 'top left',
            position: 'absolute', left: 0, top: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: ESPACO }}>{children}</div>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t px-3 py-3 print:hidden" style={{ background: COR.branco, borderColor: COR.linha }}>
        <div className="mx-auto flex max-w-[842px] flex-wrap items-center gap-2">
          {aceito || (aceite.feito && aceite.em) ? (
            <span className="flex flex-1 items-center gap-2 text-sm font-semibold" style={{ color: COR.verde }}>
              <CheckCircle2 className="h-5 w-5" /> Proposta aceita{aceite.em && !aceito ? ` em ${aceite.em}` : ''}
              {aceito?.vistoria && (
                <a href={`/vistoria/${aceito.vistoria}`} className="ml-2 underline" style={{ color: COR.smartTexto }}>Fotografar o veículo agora</a>
              )}
            </span>
          ) : aceite.desatualizada ? (
            <span className="flex-1 text-sm" style={{ color: COR.chumbo }}>Esta proposta foi atualizada. Peça ao consultor o link da versão nova.</span>
          ) : aceite.feito ? (
            <span className="flex-1 text-sm" style={{ color: COR.chumbo }}>Este atendimento já tem uma proposta aceita.</span>
          ) : (
            <button type="button" onClick={() => setAceitando(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white sm:flex-none"
              style={{ background: COR.navy }}>
              <ThumbsUp className="h-4 w-4" /> Aceitar proposta
            </button>
          )}
          {whatsapp && (
            <a href={`https://wa.me/55${whatsapp}?text=${msg}`} target="_blank" rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white"
              style={{ background: COR.whatsapp }}>
              <MessageCircle className="h-4 w-4" /> <span className="hidden sm:inline">WhatsApp do consultor</span><span className="sm:hidden">WhatsApp</span>
            </a>
          )}
          <a href={`/api/v1/cotacoes/pdf?token=${token}`} target="_blank" rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold"
            style={{ borderColor: COR.bordaCampo, color: COR.navy }}>
            <Download className="h-4 w-4" /> PDF
          </a>
        </div>
      </div>

      {aceitando && (
        <ModalAceite token={token} onFechar={() => setAceitando(false)} onAceito={(v) => { setAceito(v); setAceitando(false); }} />
      )}
    </div>
  );
}

function ModalAceite({ token, onFechar, onAceito }: {
  token: string; onFechar: () => void; onAceito: (r: { vistoria: string | null }) => void;
}) {
  const [nome, setNome] = useState('');
  const [doc, setDoc] = useState('');
  const [marcado, setMarcado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch('/api/v1/cotacoes/aceite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, nome, documento: doc }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? 'Não foi possível registrar o aceite.');
      onAceito({ vistoria: j.vistoria ?? null });
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  const campo = 'mt-1 w-full rounded-lg border px-3 py-2.5 text-sm';
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 p-3 sm:items-center">
      <form onSubmit={enviar} className="w-full max-w-md rounded-2xl p-5" style={{ background: COR.branco, color: COR.navy }}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Aceitar a proposta</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        <p className="mt-1 text-sm" style={{ color: COR.chumbo }}>
          Ao aceitar, você solicita a adesão com os dados deste veículo. A proteção começa depois da vistoria e da aprovação do cadastro.
        </p>
        <label className="mt-4 block text-sm font-semibold">Nome completo
          <input className={campo} style={{ borderColor: COR.bordaCampo }} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
        </label>
        <label className="mt-3 block text-sm font-semibold">CPF ou CNPJ
          <input className={campo} style={{ borderColor: COR.bordaCampo }} inputMode="numeric" value={doc}
            onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 14); setDoc(formatarDocumento(d, d.length > 11 ? 'PJ' : 'PF')); }} />
        </label>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={marcado} onChange={(e) => setMarcado(e.target.checked)} className="mt-0.5 h-4 w-4" />
          Li a proposta e quero aderir à proteção veicular nestas condições.
        </label>
        {erro && <p className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ background: COR.alertaFundo, color: COR.alerta }}>{erro}</p>}
        <button type="submit" disabled={!marcado || enviando}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          style={{ background: COR.navy }}>
          {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar o aceite
        </button>
      </form>
    </div>
  );
}
