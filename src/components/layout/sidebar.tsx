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
  Headset,
  Receipt,
  LifeBuoy,
  Ticket,
  Menu,
  X,
  Building2,
  UserRound,
  Satellite,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import type { PapelUsuario } from '@/lib/database.types';

type Item = { href: string; label: string; icon: React.ElementType };

const OPERACAO: Item[] = [
  { href: '/dashboard', label: 'Visao Geral', icon: LayoutDashboard },
  { href: '/sac', label: 'SAC / Atendimento', icon: Headset },
  { href: '/protocolos', label: 'Protocolos', icon: Ticket },
  { href: '/assistencia', label: 'Assistencia 24h', icon: LifeBuoy },
  { href: '/vendas', label: 'Vendas / CRM', icon: Target },
  { href: '/associados', label: 'Associados', icon: Users },
  { href: '/veiculos', label: 'Veiculos', icon: Car },
  { href: '/rastreadores', label: 'Rastreadores', icon: Satellite },
  { href: '/sinistros', label: 'Sinistros', icon: AlertTriangle },
];
const GESTAO: Item[] = [
  { href: '/cobrancas', label: 'Cobranca', icon: Receipt },
  { href: '/precificacao', label: 'Precificacao', icon: Calculator },
  { href: '/fornecedores', label: 'Fornecedores', icon: Store },
  { href: '/financeiro', label: 'Financeiro / DRE', icon: DollarSign },
];

// Marca da cabine: usa a logo cadastrada em Configuracoes -> Empresa. Como a
// logo tem tinta escura, vai numa placa branca para aparecer sobre o navy.
// Sem logo cadastrada, cai no wordmark em texto.
function Brand({ logoUrl }: { logoUrl?: string | null }) {
  if (!logoUrl) return <Wordmark />;
  return (
    <div className="rounded-xl bg-superficie px-3 py-2.5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.35)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoUrl} alt="Smart Car Brasil" className="mx-auto max-h-12 w-auto object-contain" />
    </div>
  );
}

// Marca em texto (fallback quando nao ha logo cadastrada).
function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[radial-gradient(120%_120%_at_30%_20%,#20406e,#12203c)] shadow-[0_0_0_1px_rgba(255,255,255,0.07),0_8px_18px_-8px_#26aeea]">
        <svg viewBox="0 0 32 32" width="22" height="22" fill="none" aria-hidden>
          <path d="M4 21c6-1 9-4 12-9 2-3.4 4.6-6 8-7-1.6 2.2-2.2 4.4-2.6 7-0.6 4.2-3.4 7.6-8 9-3 .9-6 .6-9.4 0z" fill="#4FC0F2" />
          <path d="M7 24c5-.4 8.4-2 11-5.4-1 3.4-3.4 5.8-7 6.4-1.4.2-2.8.1-4-1z" fill="#fff" fillOpacity=".85" />
        </svg>
      </span>
      <span className="leading-none">
        <span className="text-[15px] font-extrabold tracking-tight text-white">
          SMART<span className="text-cyan-400">CAR</span>BRASIL
        </span>
        <span className="mt-1 block text-[8.5px] font-semibold tracking-[0.3em] text-white/55">
          PROTECAO VEICULAR
        </span>
      </span>
    </div>
  );
}

export function Sidebar({ papel, logoUrl }: { papel?: PapelUsuario; logoUrl?: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [aberto, setAberto] = useState(false);
  const gestao = papel === 'admin'
    ? [...GESTAO, { href: '/configuracoes', label: 'Configuracoes', icon: Settings }]
    : GESTAO;

  // Portais: o da Franquia para quem gerencia uma unidade; o do Vendedor para
  // o consultor de vendas (o layout de /vendedor confere o cadastro no banco).
  const portais = [
    ...(['gestor_regional', 'admin', 'financeiro'].includes(papel ?? '')
      ? [{ href: '/regional', label: 'Portal da Franquia', icon: Building2 }] : []),
    ...(['consultor_vendas', 'admin'].includes(papel ?? '')
      ? [{ href: '/vendedor', label: 'Meu Portal de Vendas', icon: UserRound }] : []),
  ];
  const menuGestao = [...portais, ...gestao];

  async function sair() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const NavLink = ({ item, onNav }: { item: Item; onNav?: () => void }) => {
    const active = pathname === item.href || pathname.startsWith(item.href + '/');
    return (
      <Link
        href={item.href}
        onClick={onNav}
        className={cn(
          'relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] transition',
          active
            ? "bg-cyan-500/15 font-semibold text-white before:absolute before:-left-3 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r before:bg-cyan-400 before:shadow-[0_0_10px_#26aeea] before:content-['']"
            : 'font-medium text-white/80 hover:bg-white/5 hover:text-white',
        )}
      >
        <item.icon className="h-[18px] w-[18px] shrink-0 opacity-90" />
        {item.label}
      </Link>
    );
  };

  const Nav = ({ onNav }: { onNav?: () => void }) => (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
      <p className="px-3 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">Operacao</p>
      {OPERACAO.map((i) => <NavLink key={i.href} item={i} onNav={onNav} />)}
      <p className="px-3 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">Gestao</p>
      {menuGestao.map((i) => <NavLink key={i.href} item={i} onNav={onNav} />)}
    </nav>
  );

  const mobileLogo = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt="Logo" className="max-h-9 max-w-[160px] object-contain" />
  ) : (
    <img src="/logo-smartcar.svg" alt="SmartCar" className="max-h-9 max-w-[160px] object-contain" />
  );

  return (
    <>
      {/* Topbar mobile (fundo claro) */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-superficie px-4 py-3 md:hidden">
        <button onClick={() => setAberto(true)} aria-label="Menu" className="text-slate-600">
          <Menu className="h-6 w-6" />
        </button>
        {mobileLogo}
        <ThemeToggle />
      </header>

      {/* Drawer mobile (cabine) */}
      {aberto && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setAberto(false)} />
          <aside className="cockpit absolute left-0 top-0 flex h-full w-72 flex-col shadow-xl">
            <div className="flex items-center justify-between gap-3 px-4 py-4">
              <div className="min-w-0 flex-1"><Brand logoUrl={logoUrl} /></div>
              <button onClick={() => setAberto(false)} aria-label="Fechar" className="text-white/80 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <Nav onNav={() => setAberto(false)} />
            <button onClick={sair} className="flex items-center gap-3 border-t border-white/10 px-5 py-3.5 text-sm text-white/80 hover:text-white">
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </aside>
        </div>
      )}

      {/* Sidebar desktop (cabine) */}
      <aside className="cockpit hidden w-64 shrink-0 flex-col md:flex">
        <div className="px-4 py-5">
          <Brand logoUrl={logoUrl} />
        </div>
        <Nav />
        <button onClick={sair} className="flex items-center gap-3 border-t border-white/10 px-5 py-3.5 text-sm text-white/80 transition hover:text-white">
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </aside>
    </>
  );
}
