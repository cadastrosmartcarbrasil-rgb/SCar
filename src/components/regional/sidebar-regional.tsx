'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  BarChart3, Copy, LayoutDashboard, LogOut, Menu, Users, Wallet, X, Zap,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const ITENS = [
  { href: '/regional', label: 'Painel', icon: LayoutDashboard },
  { href: '/regional/equipe', label: 'Minha Equipe', icon: Users },
  { href: '/regional/leads', label: 'Leads', icon: Zap },
  { href: '/regional/comissoes', label: 'Comissoes', icon: BarChart3 },
  { href: '/regional/financeiro', label: 'Financeiro', icon: Wallet },
];

export function SidebarRegional({ nome, unidade, codigo }: {
  nome: string; unidade: string; codigo: string | null;
}) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);

  function copiarHotlink() {
    if (!codigo) return toast.error('Esta unidade ainda nao tem codigo de hotlink');
    const url = `${window.location.origin}/v/${codigo}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success(`Hotlink da unidade copiado: ${url}`),
      () => toast.error(`Copie manualmente: ${url}`),
    );
  }

  async function sair() {
    await createClient().auth.signOut();
    window.location.href = '/login';
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <span className="text-sm font-bold text-brand-700">{unidade}</span>
        <button onClick={() => setAberto((a) => !a)} aria-label="Menu" className="rounded-lg p-1.5 text-slate-600">
          {aberto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <aside className={`cockpit w-full shrink-0 md:block md:w-60 ${aberto ? 'block' : 'hidden'}`}>
        <div className="cockpit-stripe px-5 py-5">
          <p className="text-base font-bold tracking-tight text-white">
            SMART<span className="text-cyan-400">CAR</span>BRASIL
          </p>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-cyan-300">
            Portal da Franquia
          </p>
        </div>

        <div className="mx-3 mb-3 rounded-xl bg-white/5 px-3 py-2.5">
          <p className="truncate text-[13px] font-semibold text-white">{unidade}</p>
          <p className="truncate text-[11px] text-white/50">{nome}</p>
          {codigo && (
            <button
              onClick={copiarHotlink}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-cyan-500/90 px-2 py-1.5 text-[11px] font-semibold text-brand-800 transition hover:bg-cyan-400"
            >
              <Copy className="h-3 w-3" /> Meu hotlink de vendas
            </button>
          )}
        </div>

        <nav className="space-y-0.5 px-3 pb-4">
          {ITENS.map((i) => {
            const ativo = i.href === '/regional' ? pathname === i.href : pathname.startsWith(i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                onClick={() => setAberto(false)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition ${
                  ativo
                    ? 'bg-white/10 font-semibold text-white shadow-[inset_2px_0_0_0_#22A7E4]'
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                <i.icon className="h-4 w-4" />
                {i.label}
              </Link>
            );
          })}
          <button
            onClick={sair}
            className="mt-2 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-white/50 transition hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </nav>
      </aside>
    </>
  );
}
