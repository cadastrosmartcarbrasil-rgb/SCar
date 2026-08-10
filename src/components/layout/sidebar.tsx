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
  Settings,
  LogOut,
  ShieldCheck,
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
  { href: '/financeiro', label: 'Financeiro / DRE', icon: DollarSign },
];

export function Sidebar({ papel }: { papel?: PapelUsuario }) {
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
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
        <div className="rounded-lg bg-brand-600 p-1.5 text-white">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <span className="font-semibold text-slate-900">SCar</span>
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
