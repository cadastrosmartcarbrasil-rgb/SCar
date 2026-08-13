'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Car,
  AlertTriangle,
  DollarSign,
  Calculator,
  Store,
  Settings,
  LogOut,
  Target,
  Menu,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { PapelUsuario } from '@/lib/database.types';

const NAV = [
  { href: '/dashboard', label: 'Visao Geral', icon: LayoutDashboard },
  { href: '/vendas', label: 'Vendas / CRM', icon: Target },
  { href: '/associados', label: 'Associados', icon: Users },
  { href: '/veiculos', label: 'Veiculos', icon: Car },
  { href: '/sinistros', label: 'Sinistros', icon: AlertTriangle },
  { href: '/precificacao', label: 'Precificacao', icon: Calculator },
  { href: '/fornecedores', label: 'Fornecedores', icon: Store },
  { href: '/financeiro', label: 'Financeiro / DRE', icon: DollarSign },
];

export function Sidebar({ papel, logoUrl }: { papel?: PapelUsuario; logoUrl?: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [aberto, setAberto] = useState(false);
  const nav = papel === 'admin'
    ? [...NAV, { href: '/configuracoes', label: 'Configuracoes', icon: Settings }]
    : NAV;

  async function sair() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const logo = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt="Logo" className="max-h-9 max-w-[160px] object-contain" />
  ) : (
    <img src="/logo-smartcar.svg" alt="SmartCar" className="max-h-9 max-w-[160px] object-contain" />
  );

  const Links = ({ onNav }: { onNav?: () => void }) => (
    <nav className="flex-1 space-y-1 p-3">
      {nav.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNav}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition',
              active ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600 hover:bg-slate-50',
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Topbar mobile */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <button onClick={() => setAberto(true)} aria-label="Menu" className="text-slate-600">
          <Menu className="h-6 w-6" />
        </button>
        {logo}
        <span className="w-6" />
      </header>

      {/* Drawer mobile */}
      {aberto && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setAberto(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
              {logo}
              <button onClick={() => setAberto(false)} aria-label="Fechar" className="text-slate-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <Links onNav={() => setAberto(false)} />
            <button onClick={sair} className="flex items-center gap-3 border-t border-slate-200 px-5 py-3 text-sm text-slate-500 hover:text-rose-600">
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </aside>
        </div>
      )}

      {/* Sidebar desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4">{logo}</div>
        <Links />
        <button onClick={sair} className="flex items-center gap-3 border-t border-slate-200 px-5 py-3 text-sm text-slate-500 hover:text-rose-600">
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </aside>
    </>
  );
}
