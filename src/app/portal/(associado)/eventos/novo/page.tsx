import Link from 'next/link';
import { ArrowLeft, PhoneCall } from 'lucide-react';

// Portal: a abertura de evento pelo associado esta FECHADA por decisao do usuario
// (17/10/2026: "o associado nao vera a tela de eventos por enquanto"). O evento
// e aberto pela equipe (SAC -> Evento). A versao anterior desta tela (upload pelo
// celular) esta no historico do git; ao reabrir, corrigir antes a FK de
// historico_protocolo.usuario_origem_id (o login do associado nao esta em usuarios).
export default function NovoEventoPortalPage() {
  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <Link href="/portal" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      <div className="rounded-2xl border border-slate-200 bg-superficie p-6 text-center">
        <PhoneCall className="mx-auto h-8 w-8 text-brand-600" />
        <h1 className="mt-3 text-lg font-semibold text-slate-900">Comunicar um evento</h1>
        <p className="mt-2 text-sm text-slate-600">
          Para comunicar um evento (colisão, roubo, furto ou outro), fale com a nossa central de atendimento. A equipe
          registra o evento e orienta sobre os documentos necessários.
        </p>
      </div>
    </div>
  );
}
