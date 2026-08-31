'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import {
  Copy, HandCoins, LayoutDashboard, LogOut, Share2, UserRound, Zap,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const ITENS = [
  { href: '/vendedor', label: 'Painel', icon: LayoutDashboard },
  { href: '/vendedor/leads', label: 'Meus Leads', icon: Zap },
  { href: '/vendedor/comissoes', label: 'Comissoes', icon: HandCoins },
  { href: '/vendedor/perfil', label: 'Meu Perfil', icon: UserRound },
];

export function linkHotlink(codigo: string | null) {
  if (!codigo || typeof window === 'undefined') return null;
  return `${window.location.origin}/v/${codigo}`;
}

/** Copiar / compartilhar o hotlink — o botao mais usado do portal. */
export function BotoesHotlink({ codigo, compacto }: { codigo: string | null; compacto?: boolean }) {
  async function copiar() {
    const url = linkHotlink(codigo);
    if (!url) return toast.error('Seu codigo de vendas ainda nao foi gerado');
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado');
    } catch {
      toast.error(`Copie manualmente: ${url}`);
    }
  }

  async function compartilhar() {
    const url = linkHotlink(codigo);
    if (!url) return toast.error('Seu codigo de vendas ainda nao foi gerado');
    const texto = `Faca sua cotacao de protecao veicular Smart Car Brasil: ${url}`;
    // Web Share API no celular; no desktop cai no WhatsApp Web.
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Protecao veicular Smart Car Brasil', text: texto, url });
        return;
      } catch {
        /* usuario cancelou: segue para o WhatsApp */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
  }

  return (
    <div className={`flex gap-2 ${compacto ? '' : 'flex-col sm:flex-row'}`}>
      <button
        onClick={compartilhar}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-2 text-[12px] font-semibold text-brand-800 transition hover:bg-cyan-400"
      >
        <Share2 className="h-3.5 w-3.5" /> Compartilhar meu link
      </button>
      <button
        onClick={copiar}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-50"
      >
        <Copy className="h-3.5 w-3.5" /> Copiar
      </button>
    </div>
  );
}

/**
 * Casca do portal do vendedor.
 * Mobile-first de proposito: o vendedor trabalha no celular, entao a navegacao
 * vira barra inferior no telefone e sidebar cockpit no desktop.
 */
export function ShellVendedor({ nome, unidade, codigo, children }: {
  nome: string; unidade: string | null; codigo: string | null; children: React.ReactNode;
}) {
  const pathname = usePathname();

  async function sair() {
    await createClient().auth.signOut();
    window.location.href = '/login';
  }

  const ativo = (href: string) =>
    href === '/vendedor' ? pathname === href : pathname.startsWith(href);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* topo mobile */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-brand-700">{nome}</p>
          <p className="truncate text-[11px] text-slate-400">{unidade ?? 'Smart Car Brasil'}</p>
        </div>
        <button
          onClick={sair}
          className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-rose-600"
        >
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </div>

      {/* sidebar desktop */}
      <aside className="cockpit hidden w-60 shrink-0 md:block">
        <div className="cockpit-stripe px-5 py-5">
          <p className="text-base font-bold tracking-tight text-white">
            SMART<span className="text-cyan-400">CAR</span>BRASIL
          </p>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-cyan-300">
            Portal do Vendedor
          </p>
        </div>

        <div className="mx-3 mb-3 rounded-xl bg-white/5 px-3 py-2.5">
          <p className="truncate text-[13px] font-semibold text-white">{nome}</p>
          <p className="truncate text-[11px] text-white/50">{unidade ?? 'Smart Car Brasil'}</p>
          {codigo && (
            <p className="mt-1 font-mono text-[11px] tracking-wide text-cyan-300">/v/{codigo}</p>
          )}
          <button
            onClick={sair}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/15 px-2 py-1.5 text-[11px] font-semibold text-white/80 transition hover:border-rose-400/40 hover:bg-rose-500/15 hover:text-white"
          >
            <LogOut className="h-3 w-3" /> Sair da conta
          </button>
        </div>

        <nav className="space-y-0.5 px-3 pb-4">
          {ITENS.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition ${
                ativo(i.href)
                  ? 'bg-white/10 font-semibold text-white shadow-[inset_2px_0_0_0_#22A7E4]'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <i.icon className="h-4 w-4" />
              {i.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 bg-[#eef2f8] pb-20 md:pb-0">
        <div className="mx-auto max-w-5xl p-4 md:p-8">{children}</div>
      </div>

      {/* barra inferior mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white md:hidden">
        {ITENS.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-[10.5px] font-medium transition ${
              ativo(i.href) ? 'text-cyan-600' : 'text-slate-400'
            }`}
          >
            <i.icon className="h-5 w-5" />
            {i.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
