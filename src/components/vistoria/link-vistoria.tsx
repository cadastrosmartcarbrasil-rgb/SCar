'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Link2, Loader2, MessageCircle, Smartphone } from 'lucide-react';
import { useGerarLinkVistoria } from '@/hooks/use-vendas';
import { linkWhatsApp, mensagemDaVistoria } from '@/lib/venda-publica';
import { formatDate } from '@/lib/utils';

/**
 * "Mande o cliente fotografar o carro dele" (0076).
 *
 * Ate aqui a vistoria dependia de alguem LOGADO estar com o carro na frente —
 * o que, na venda a distancia, e ninguem. Este botao gera o link publico
 * (`/vistoria/<token>`, 7 dias) e entrega os dois caminhos que a operacao usa:
 * copiar e WhatsApp.
 *
 * O link so e gerado no CLIQUE, nunca ao abrir a tela: criar a vistoria e
 * carimbar o prazo sao efeitos, e prazo que comeca a correr sozinho vence sem
 * ninguem ter mandado nada.
 */
export function LinkDaVistoria({ leadId, celular, nome, compacto }: {
  leadId: string;
  celular?: string | null;
  nome?: string | null;
  compacto?: boolean;
}) {
  const gerar = useGerarLinkVistoria();
  const [link, setLink] = useState<{ url: string; expiraEm: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  function gerarLink() {
    gerar.mutate(leadId, {
      onSuccess: (l) => {
        setLink({ url: `${window.location.origin}/vistoria/${l.token}`, expiraEm: l.expira_em });
        // "Reaproveitado" nao e detalhe tecnico: quem clica de novo precisa
        // saber que o link ja enviado continua valendo, senao reenvia achando
        // que o anterior morreu.
        toast.success(l.reaproveitado ? 'Este link ja estava valendo' : 'Link da vistoria gerado');
      },
      onError: (e) => toast.error(e.message),
    });
  }

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      window.prompt('Copie o link da vistoria:', link.url);
    }
  }

  if (!link) {
    return (
      <button
        type="button"
        onClick={gerarLink}
        disabled={gerar.isPending}
        className={`flex items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-cyan-800 transition hover:bg-cyan-100 disabled:opacity-60 ${
          compacto ? '' : 'w-full'
        }`}
      >
        {gerar.isPending
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Smartphone className="h-4 w-4" />}
        Enviar link da vistoria ao cliente
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-3">
      <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-cyan-900">
        <Link2 className="h-3.5 w-3.5" /> O cliente fotografa pelo celular dele
      </p>
      <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{link.url}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button" onClick={copiar}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-superficie px-3 py-1.5 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copiado ? 'Copiado!' : 'Copiar'}
        </button>
        <a
          href={linkWhatsApp(mensagemDaVistoria(link.url, nome, link.expiraEm), celular)}
          target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
        >
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
        </a>
        <a
          href={link.url} target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-slate-500 transition hover:text-slate-700"
        >
          Abrir
        </a>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Vale ate {formatDate(link.expiraEm)}. Depois disso e so gerar outro aqui.
      </p>
    </div>
  );
}
