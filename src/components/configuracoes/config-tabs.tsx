'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2, Users, Landmark, ListTree, Car, BadgeDollarSign, AlertTriangle, Truck, Package, Building, Wallet, Percent, Layers, Bell, Megaphone, Palette, Target, FileCheck2, FileSignature,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/configuracoes/empresa', label: 'Empresa', icon: Building },
  { href: '/configuracoes/regionais', label: 'Regionais', icon: Building2 },
  { href: '/configuracoes/usuarios', label: 'Usuários e Permissões', icon: Users },
  { href: '/configuracoes/vendedores', label: 'Vendedores', icon: BadgeDollarSign },
  { href: '/configuracoes/marcas-modelos', label: 'Marcas & Modelos', icon: Car },
  { href: '/configuracoes/tipos-veiculo', label: 'Tipos de Veículo', icon: Truck },
  { href: '/configuracoes/cores', label: 'Cores', icon: Palette },
  { href: '/configuracoes/cotas-participacao', label: 'Cotas de Participação', icon: Percent },
  { href: '/configuracoes/tipos-evento', label: 'Tipos de Evento', icon: AlertTriangle },
  { href: '/configuracoes/documentos-evento', label: 'Prazos e Documentos do Evento', icon: FileCheck2 },
  { href: '/configuracoes/alertas', label: 'Alertas', icon: Bell },
  { href: '/configuracoes/comunicados', label: 'Comunicados', icon: Megaphone },
  { href: '/configuracoes/termos', label: 'Termos', icon: FileSignature },
  { href: '/configuracoes/produtos', label: 'Produtos', icon: Package },
  { href: '/configuracoes/planos', label: 'Planos & Combos', icon: Layers },
  { href: '/configuracoes/contas-bancarias', label: 'Contas Bancárias', icon: Wallet },
  { href: '/configuracoes/integracoes', label: 'Integrações Bancárias', icon: Landmark },
  { href: '/configuracoes/plano-contas', label: 'Plano de Contas', icon: ListTree },
  { href: '/configuracoes/centros-custo', label: 'Centros de Custo', icon: Target },
];

export function ConfigTabs({ somente }: { somente?: string[] } = {}) {
  const pathname = usePathname();
  const tabs = somente ? TABS.filter((t) => somente.includes(t.href)) : TABS;
  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map((t) => {
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
