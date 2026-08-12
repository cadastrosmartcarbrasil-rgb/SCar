'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2, Users, Landmark, ListTree, Car, BadgeDollarSign, AlertTriangle, Truck, Package, Building, Wallet, Percent,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/configuracoes/empresa', label: 'Empresa', icon: Building },
  { href: '/configuracoes/regionais', label: 'Regionais', icon: Building2 },
  { href: '/configuracoes/usuarios', label: 'Usuarios & Perfis', icon: Users },
  { href: '/configuracoes/vendedores', label: 'Vendedores', icon: BadgeDollarSign },
  { href: '/configuracoes/marcas-modelos', label: 'Marcas & Modelos', icon: Car },
  { href: '/configuracoes/tipos-veiculo', label: 'Tipos de Veiculo', icon: Truck },
  { href: '/configuracoes/cotas-participacao', label: 'Cotas de Participacao', icon: Percent },
  { href: '/configuracoes/tipos-evento', label: 'Tipos de Evento', icon: AlertTriangle },
  { href: '/configuracoes/produtos', label: 'Produtos', icon: Package },
  { href: '/configuracoes/contas-bancarias', label: 'Contas Bancarias', icon: Wallet },
  { href: '/configuracoes/integracoes', label: 'Integracoes Bancarias', icon: Landmark },
  { href: '/configuracoes/plano-contas', label: 'Plano de Contas', icon: ListTree },
];

export function ConfigTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition',
              active
                ? 'border-brand-600 font-medium text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
