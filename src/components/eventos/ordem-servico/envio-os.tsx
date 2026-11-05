'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { FileDown, Mail, MessageCircle, RefreshCw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useAcaoRotaOS, useOrdensServicoEvento, useRegistrarEnvioOS } from '@/hooks/use-ordens-servico';
import { linkWhatsApp } from '@/lib/assistencia';
import { formatDateTime } from '@/lib/utils';

const CANAL: Record<string, string> = { WHATSAPP: 'WhatsApp', EMAIL: 'E-mail', MANUAL: 'Registro manual', DOWNLOAD: 'Download' };

/** Envio da OS ao prestador: PDF, WhatsApp (link assinado de 7 dias), e-mail e registro manual. */
export function EnvioOS({ osId, eventoId }: { osId: string; eventoId: string }) {
  const lista = useOrdensServicoEvento(eventoId);
  const os = (lista.data ?? []).find((o) => o.id === osId) ?? null;
  const rota = useAcaoRotaOS();
  const registrar = useRegistrarEnvioOS();
  const [email, setEmail] = useState<string | null>(null);
  const [manual, setManual] = useState('');

  if (!os) return <div className="h-24 animate-pulse rounded-lg bg-slate-100" />;
  const temPdf = !!os.termos_emitidos?.pdf_path;
  const encerrada = os.status === 'CANCELADA' || os.status === 'SUBSTITUIDA';
  const para = email ?? os.fornecedores?.email ?? '';
  const urlPdf = `/api/v1/termos/pdf?emitido=${os.termo_emitido_id}`;

  async function whatsapp() {
    try {
      const r = await rota.mutateAsync({ acao: 'link', os_id: os!.id });
      const url = linkWhatsApp(r.telefone ?? null, r.mensagem ?? '')
        ?? `https://wa.me/?text=${encodeURIComponent(r.mensagem ?? '')}`;
      window.open(url, '_blank');
      await registrar.mutateAsync({ os: os!, canal: 'WHATSAPP', observacao: `link válido por 7 dias` });
      toast.success('WhatsApp aberto e envio registrado no histórico do evento.');
    } catch (e) { toast.error((e as Error).message); }
  }

  async function enviarEmail() {
    try {
      await rota.mutateAsync({ acao: 'email', os_id: os!.id, para, evento_id: eventoId });
      toast.success(`E-mail enviado a ${para} com o PDF anexo.`);
    } catch (e) { toast.error((e as Error).message, { duration: 10000 }); }
  }

  async function registrarManual() {
    if (!manual.trim()) return toast.error('Descreva como a OS foi entregue ao prestador.');
    try {
      await registrar.mutateAsync({ os: os!, canal: 'MANUAL', observacao: manual.trim() });
      setManual('');
      toast.success('Envio registrado.');
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {temPdf ? (
          <>
            <a href={urlPdf} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-superficie px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
              <FileDown className="h-4 w-4" /> Ver PDF
            </a>
            <a href={`${urlPdf}&baixar=1`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-superficie px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
              <FileDown className="h-4 w-4" /> Baixar
            </a>
          </>
        ) : (
          <Button variant="secondary" disabled={rota.isPending}
            onClick={() => rota.mutate({ acao: 'gerar_pdf', os_id: os.id, evento_id: eventoId },
              { onSuccess: () => toast.success('PDF gerado.'), onError: (e) => toast.error((e as Error).message) })}>
            <RefreshCw className="h-4 w-4" /> Gerar PDF
          </Button>
        )}
        {!encerrada && temPdf && (
          <Button variant="accent" onClick={whatsapp} disabled={rota.isPending || registrar.isPending}>
            <MessageCircle className="h-4 w-4" /> Enviar por WhatsApp
          </Button>
        )}
      </div>

      {!encerrada && temPdf && (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input type="email" caixa="original" placeholder="E-mail do prestador" value={para}
            onChange={(e) => setEmail(e.target.value)} />
          <Button variant="secondary" onClick={enviarEmail} disabled={rota.isPending || !para}>
            <Mail className="h-4 w-4" /> Enviar por e-mail
          </Button>
        </div>
      )}
      {!encerrada && (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input caixa="original" placeholder="Entregue em mãos / impresso / outro meio (registro manual)" value={manual}
            onChange={(e) => setManual(e.target.value)} />
          <Button variant="secondary" onClick={registrarManual} disabled={registrar.isPending}>
            <Send className="h-4 w-4" /> Registrar envio
          </Button>
        </div>
      )}
      <p className="text-[0.6875rem] text-slate-500">
        O e-mail sai do endereço de avisos do sistema; a resposta do prestador vai ao e-mail do Departamento de Eventos.
        No modo teste do módulo de e-mails, só envia para a lista de teste.
      </p>

      {(os.ordens_servico_envios ?? []).length > 0 && (
        <ul className="space-y-0.5 text-xs text-slate-600">
          {[...(os.ordens_servico_envios ?? [])].sort((a, b) => b.enviado_em.localeCompare(a.enviado_em)).map((e) => (
            <li key={e.id}>
              {formatDateTime(e.enviado_em)} · {CANAL[e.canal] ?? e.canal}{e.destino ? ` · ${e.destino}` : ''}{e.observacao ? ` · ${e.observacao}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
