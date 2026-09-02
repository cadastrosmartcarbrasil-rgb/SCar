'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Car, CreditCard, LogOut, Receipt, UserRound } from 'lucide-react';
import { LogoSmartCar } from '@/components/hotlink/marca';
import { createClient } from '@/lib/supabase/client';

const ITENS = [
  { href: '/portal', label: 'Meus veiculos', icon: Car },
  { href: '/portal/financeiro', label: 'Financeiro', icon: Receipt },
  { href: '/portal/pagamento', label: 'Pagamento', icon: CreditCard },
  { href: '/portal/perfil', label: 'Meu perfil', icon: UserRound },
];

/**
 * Casca do Portal do Associado.
 *
 * Segue a mesma linha da pagina publica de venda: logo no branco, faixa navy e
 * o ciano como acento. E a mesma marca que a pessoa viu quando contratou —
 * mudar de cara depois da venda passa a impressao de outro lugar.
 * Mobile-first: barra inferior no celular, menu horizontal no desktop.
 */
export function ShellPortal({ nome, logoUrl, children }: {
  nome: string; logoUrl?: string | null; children: React.ReactNode;
}) {
  const pathname = usePathname();
  const ativo = (href: string) =>
    href === '/portal' ? pathname === href : pathname.startsWith(href);

  async function sair() {
    await createClient().auth.signOut();
    window.location.href = '/portal/login';
  }

  return (
    <div className="min-h-screen bg-[#eef2f8] pb-20 md:pb-0">
      <header className="bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <LogoSmartCar url={logoUrl} className="h-11 w-auto object-contain" />
          <div className="flex items-center gap-3">
            <span className="hidden text-right text-[12px] leading-tight text-slate-500 sm:block">
              <span className="block font-semibold text-slate-800">{nome}</span>
              Area do associado
            </span>
            <button
              onClick={sair}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-rose-600"
            >
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
        </div>

        {/* menu horizontal no desktop */}
        <nav className="hidden bg-brand-700 md:block">
          <div className="mx-auto flex max-w-4xl gap-1 px-4">
            {ITENS.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-[13px] font-semibold transition ${
                  ativo(i.href)
                    ? 'border-cyan-400 text-white'
                    : 'border-transparent text-white/60 hover:text-white'
                }`}
              >
                <i.icon className="h-4 w-4" />
                {i.label}
              </Link>
            ))}
          </div>
        </nav>
        <div className="h-1 bg-brand-700 md:hidden" />
      </header>

      <main className="mx-auto max-w-4xl px-4 py-5">{children}</main>

      {/* barra inferior no celular */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white md:hidden">
        {ITENS.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition ${
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
