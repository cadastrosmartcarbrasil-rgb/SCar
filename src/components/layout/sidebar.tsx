'use client';

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
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { PapelUsuario } from '@/lib/database.types';

const NAV = [
  { href: '/dashboard', label: 'Visao Geral', icon: LayoutDashboard },
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
  const nav = papel === 'admin'
    ? [...NAV, { href: '/configuracoes', label: 'Configuracoes', icon: Settings }]
    : NAV;

  async function sair() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Logo" className="max-h-9 max-w-[180px] object-contain" />
        ) : (
          <img src="/logo-smartcar.svg" alt="SmartCar" className="max-h-9 max-w-[180px] object-contain" />
        )}
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                active
                  ? 'bg-brand-50 font-medium text-brand-700'
                  : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={sair}
        className="flex items-center gap-3 border-t border-slate-200 px-5 py-3 text-sm text-slate-500 hover:text-rose-600"
      >
        <LogOut className="h-4 w-4" />
        Sair
      </button>
    </aside>
  );
}
