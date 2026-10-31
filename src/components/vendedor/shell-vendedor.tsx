'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import {
  Building2, Copy, HandCoins, LayoutDashboard, LogOut, Share2, UserRound, Zap,
} from 'lucide-react';
import { LogoNaCabine } from '@/components/hotlink/marca';
import { createClient } from '@/lib/supabase/client';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { temAcessoGlobal } from '@/lib/unidade';

const ITENS = [
  { href: '/vendedor', label: 'Painel', icon: LayoutDashboard },
  { href: '/vendedor/leads', label: 'Meus Leads', icon: Zap },
  { href: '/vendedor/comissoes', label: 'Comissões', icon: HandCoins },
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
    if (!url) return toast.error('Seu código de vendas ainda não foi gerado');
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado');
    } catch {
      toast.error(`Copie manualmente: ${url}`);
    }
  }

  async function compartilhar() {
    const url = linkHotlink(codigo);
    if (!url) return toast.error('Seu código de vendas ainda não foi gerado');
    const texto = `Faça sua cotação de proteção veicular Smart Car Brasil: ${url}`;
    // Web Share API no celular; no desktop cai no WhatsApp Web.
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Proteção veicular Smart Car Brasil', text: texto, url });
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
        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-2 text-[0.75rem] font-semibold text-navy transition hover:bg-cyan-400"
      >
        <Share2 className="h-3.5 w-3.5" /> Compartilhar meu link
      </button>
      <button
        onClick={copiar}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-[0.75rem] font-semibold text-slate-600 transition hover:bg-slate-50"
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
export function ShellVendedor({ nome, unidade, codigo, logoUrl, papelStaff, children }: {
  nome: string; unidade: string | null; codigo: string | null;
  logoUrl?: string | null;
  /** Papel em `usuarios` de quem esta olhando — quem administra tem porta de volta. */
  papelStaff?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  async function sair() {
    await createClient().auth.signOut();
    window.location.href = '/login';
  }

  const ativo = (href: string) =>
    href === '/vendedor' ? pathname === href : pathname.startsWith(href);

  // Quem tem outro chapeu volta para a casa DELE: a matriz para o painel de
  // gestao, o gestor para o portal da franquia, os demais papeis de operacao
  // para o sistema. O consultor de vendas nao tem outra casa.
  const outraCasa = temAcessoGlobal(papelStaff ?? '')
    ? { href: '/dashboard', label: 'Sistema da matriz' }
    : papelStaff === 'gestor_regional'
      ? { href: '/regional', label: 'Portal da franquia' }
      // 23/10/2026: cobranca, supervisor, eventos, 24h, auditoria tambem tem casa.
      : papelStaff && papelStaff !== 'consultor_vendas'
        ? { href: '/dashboard', label: 'Sistema' }
        : null;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* topo mobile */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-superficie px-4 py-3 md:hidden">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-brand-700">{nome}</p>
          <p className="truncate text-[0.6875rem] text-slate-400">{unidade ?? 'Smart Car Brasil'}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
        <ThemeToggle />
        <button
          onClick={sair}
          className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[0.75rem] font-semibold text-slate-500 hover:bg-slate-100 hover:text-rose-600"
        >
          <LogOut className="h-4 w-4" /> Sair
        </button>
        </div>
      </div>

      {/* sidebar desktop */}
      <aside className="cockpit hidden w-60 shrink-0 md:sticky md:top-0 md:block md:h-screen md:overflow-y-auto">
        <div className="cockpit-stripe px-4 py-5">
          <LogoNaCabine url={logoUrl} />
          <p className="mt-2.5 text-center text-[0.6875rem] font-medium uppercase tracking-wide text-cyan-300">
            Portal do Vendedor
          </p>
        </div>

        <div className="mx-3 mb-3 rounded-xl bg-white/5 px-3 py-2.5">
          <p className="truncate text-[0.8125rem] font-semibold text-white">{nome}</p>
          <p className="truncate text-[0.6875rem] text-white/50">{unidade ?? 'Smart Car Brasil'}</p>
          {codigo && (
            <p className="mt-1 font-mono text-[0.6875rem] tracking-wide text-cyan-300">/v/{codigo}</p>
          )}
          <button
            onClick={sair}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/15 px-2 py-1.5 text-[0.6875rem] font-semibold text-white/80 transition hover:border-rose-400/40 hover:bg-rose-500/15 hover:text-white"
          >
            <LogOut className="h-3 w-3" /> Sair da conta
          </button>
        </div>

        <nav className="space-y-0.5 px-3 pb-4">
          {ITENS.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[0.8125rem] transition ${
                ativo(i.href)
                  ? 'bg-white/10 font-semibold text-white shadow-[inset_2px_0_0_0_#0BACE2]'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <i.icon className="h-4 w-4" />
              {i.label}
            </Link>
          ))}
          {/* Quem tambem administra a empresa nao pode ficar preso aqui: o
              portal do vendedor e um dos chapeus dele, nao a casa dele.
              Mesmo atalho que a sidebar da franquia oferece. */}
          {outraCasa && (
            <Link
              href={outraCasa.href}
              className="mt-2 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[0.8125rem] text-white/50 transition hover:bg-white/5 hover:text-white"
            >
              <Building2 className="h-4 w-4" /> {outraCasa.label}
            </Link>
          )}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 bg-fundo pb-20 md:pb-0">
        <div className="mx-auto max-w-5xl p-4 md:p-8">{children}</div>
      </div>

      {/* barra inferior mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-superficie md:hidden">
        {ITENS.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-[0.6562rem] font-medium transition ${
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
