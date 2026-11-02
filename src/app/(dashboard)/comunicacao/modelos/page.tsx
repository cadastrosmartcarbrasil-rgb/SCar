'use client';

import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Mail, MessageCircle } from 'lucide-react';
import { ModelosEmail } from '@/components/comunicacao/modelos-email';
import { ModelosWhatsApp } from '@/components/comunicacao/modelos-whatsapp';
import { cn } from '@/lib/utils';

function Conteudo() {
  const params = useSearchParams();
  const router = useRouter();
  const caminho = usePathname();
  const canal = params.get('canal') === 'whatsapp' ? 'whatsapp' : 'email';
  const abas = [
    { id: 'email', rotulo: 'E-mails', icone: Mail },
    { id: 'whatsapp', rotulo: 'WhatsApp', icone: MessageCircle },
  ] as const;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Modelos de mensagens</h1>
        <p className="text-sm text-slate-500">
          {canal === 'email'
            ? 'Os textos dos e-mails que o sistema envia. O visual, os boletos e os botões ficam como estão; aqui se muda o assunto e as frases. Cada gravação vira uma versão e vale para os próximos envios.'
            : 'Os textos que os botões “WhatsApp” do sistema abrem prontos. Cada gravação vira uma versão e passa a valer em todos os botões daquela mensagem.'}
        </p>
      </div>
      <div className="flex gap-1 border-b border-slate-200">
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => router.replace(a.id === 'email' ? caminho : `${caminho}?canal=${a.id}`)}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition',
              canal === a.id ? 'border-cyan-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            <a.icone className="h-4 w-4" /> {a.rotulo}
          </button>
        ))}
      </div>
      {canal === 'email' ? <ModelosEmail /> : <ModelosWhatsApp />}
    </div>
  );
}

export default function ModelosMensagensPage() {
  return (
    <Suspense fallback={null}>
      <Conteudo />
    </Suspense>
  );
}
