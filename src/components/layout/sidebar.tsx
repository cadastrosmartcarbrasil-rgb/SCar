'use client';

import { useEffect, useState } from 'react';
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
  Database,
  ChevronDown,
  LayoutList,
  DoorOpen,
  Gauge,
  PhoneCall,
  ScanEye,
  CalendarDays,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import type { PapelUsuario } from '@/lib/database.types';
import { abasConfiguracoesPermitidas, moduloDaRota } from '@/lib/permissoes';
import { useRevistoriasEmAnaliseContagem } from '@/hooks/use-revistoria';

/** `contador`: numero vermelho ao lado do item (o que espera alguem agir). */
export type Item = { href: string; label: string; icon: React.ElementType; contador?: 'revistorias' };
/** Item com sub-itens (Regionais e Cobranca). */
type Grupo = { label: string; icon: React.ElementType; itens: Item[] };
type Entrada = Item | Grupo;
const ehGrupo = (e: Entrada): e is Grupo => 'itens' in e;

export const OPERACAO: Item[] = [
  { href: '/dashboard', label: 'Visão Geral', icon: LayoutDashboard },
  { href: '/sac', label: 'SAC / Atendimento', icon: Headset },
  { href: '/protocolos', label: 'Protocolos', icon: Ticket },
  { href: '/assistencia', label: 'Assistência 24h', icon: LifeBuoy },
  { href: '/vendas', label: 'Vendas / CRM', icon: Target },
  { href: '/associados', label: 'Associados', icon: Users },
  { href: '/veiculos', label: 'Veículos', icon: Car },
  { href: '/rastreadores', label: 'Rastreadores', icon: Satellite },
  { href: '/eventos', label: 'Eventos', icon: AlertTriangle },
];
export const GESTAO: Entrada[] = [
  // COBRANCA virou grupo (0097): o painel de inadimplencia, o calendario dos 6
  // ciclos e a emissao (faturas, lote e remessas) sao tres trabalhos diferentes.
  {
    label: 'Cobrança',
    icon: Receipt,
    itens: [
      { href: '/cobrancas/painel', label: 'Painel de Inadimplência', icon: Gauge },
      { href: '/cobrancas/fila', label: 'Fila de Cobrança', icon: PhoneCall },
      { href: '/cobrancas/revistorias', label: 'Revistorias', icon: ScanEye, contador: 'revistorias' },
      { href: '/cobrancas/calendario', label: 'Calendário de Vencimentos', icon: CalendarDays },
      { href: '/cobrancas/boletos', label: 'Boletos e Remessas', icon: Receipt },
    ],
  },
  { href: '/precificacao', label: 'Precificação', icon: Calculator },
  { href: '/fornecedores', label: 'Fornecedores', icon: Store },
  { href: '/financeiro', label: 'Financeiro / DRE', icon: DollarSign },
];

// Marca da cabine: usa a logo cadastrada em Configuracoes -> Empresa. Como a
// logo tem tinta escura, vai numa placa branca para aparecer sobre o navy.
// Sem logo cadastrada, cai no wordmark em texto.
function Brand({ logoUrl }: { logoUrl?: string | null }) {
  if (!logoUrl) return <Wordmark />;
  return (
    <div className="rounded-lg bg-white px-3 py-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoUrl} alt="Smart Car Brasil" className="mx-auto max-h-12 w-auto object-contain" />
    </div>
  );
}

// Marca em texto (fallback quando nao ha logo cadastrada).
function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
        <svg viewBox="0 0 32 32" width="22" height="22" fill="none" aria-hidden>
          <path d="M4 21c6-1 9-4 12-9 2-3.4 4.6-6 8-7-1.6 2.2-2.2 4.4-2.6 7-0.6 4.2-3.4 7.6-8 9-3 .9-6 .6-9.4 0z" fill="#0BACE2" />
          <path d="M7 24c5-.4 8.4-2 11-5.4-1 3.4-3.4 5.8-7 6.4-1.4.2-2.8.1-4-1z" fill="#fff" fillOpacity=".85" />
        </svg>
      </span>
      <span className="leading-none">
        <span className="font-display text-[15px] font-extrabold tracking-tight text-white">
          SMART<span className="text-cyan-400">CAR</span>BRASIL
        </span>
        <span className="mt-1 block text-[10px] font-medium text-white/60">
          Proteção veicular
        </span>
      </span>
    </div>
  );
}

const ehAtivo = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(href + '/');

function NavLink({ item, pathname, onNav, sub, compacto }: {
  item: Item; pathname: string; onNav?: () => void; sub?: boolean; compacto?: boolean;
}) {
  const active = ehAtivo(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNav}
      title={compacto ? item.label : undefined}
      aria-label={compacto ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center rounded-lg transition-colors',
        compacto ? 'h-10 justify-center' : sub ? 'gap-3 py-2 pl-3 pr-3 text-[13px]' : 'gap-3 px-3 py-2.5 text-[13.5px]',
        active
          ? 'bg-cyan-500 font-semibold text-navy'
          : 'font-medium text-white/80 hover:bg-white/10 hover:text-white',
      )}
    >
      <span className="relative shrink-0">
        <item.icon className={cn(sub && !compacto ? 'h-4 w-4' : 'h-[18px] w-[18px]')} />
        {compacto && item.contador && <ContadorMenu tipo={item.contador} ponto />}
      </span>
      {!compacto && <span className="flex-1">{item.label}</span>}
      {!compacto && item.contador && <ContadorMenu tipo={item.contador} />}
    </Link>
  );
}

/** O numero vermelho do menu. Vive num componente proprio: so consulta quem VE o item. */
function ContadorMenu({ tipo, ponto }: { tipo: NonNullable<Item['contador']>; ponto?: boolean }) {
  const q = useRevistoriasEmAnaliseContagem();
  const n = tipo === 'revistorias' ? q.data ?? 0 : 0;
  if (n <= 0) return null;
  const titulo = `${n} revistoria(s) esperando análise`;
  if (ponto) {
    return <span title={titulo} className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-navy" />;
  }
  return (
    <span title={titulo} className="tnum min-w-[1.25rem] rounded-full bg-rose-600 px-1.5 text-center text-[11px] font-bold leading-5 text-white">
      {n > 99 ? '99+' : n}
    </span>
  );
}

/**
 * Grupo do menu. Nasce ABERTO quando a pessoa esta dentro dele — esconder o
 * item que mostra onde ela esta e esconder a propria localizacao.
 */
function NavGrupo({ grupo, pathname, onNav, compacto }: {
  grupo: Grupo; pathname: string; onNav?: () => void; compacto?: boolean;
}) {
  const dentro = grupo.itens.some((i) => ehAtivo(pathname, i.href));
  const [aberto, setAberto] = useState(dentro);
  const mostrar = aberto || dentro;
  // Recolhida, a barra só tem ícones: o grupo vira a lista dos seus itens.
  if (compacto) {
    return (
      <div className="space-y-1 border-t border-white/10 pt-2">
        {grupo.itens.map((i) => (
          <NavLink key={i.href} item={i} pathname={pathname} onNav={onNav} compacto />
        ))}
      </div>
    );
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setAberto(!mostrar)}
        aria-expanded={mostrar}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] transition-colors',
          dentro ? 'font-semibold text-white' : 'font-medium text-white/80 hover:bg-white/10 hover:text-white',
        )}
      >
        <grupo.icon className="h-[18px] w-[18px] shrink-0" />
        <span className="flex-1 text-left">{grupo.label}</span>
        {/* Grupo fechado: o numero sobe para o grupo, senao ninguem ve. */}
        {!mostrar && grupo.itens.filter((i) => i.contador).map((i) => <ContadorMenu key={i.href} tipo={i.contador!} />)}
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', mostrar && 'rotate-180')} />
      </button>
      {mostrar && (
        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-white/15 pl-2">
          {grupo.itens.map((i) => (
            <NavLink key={i.href} item={i} pathname={pathname} onNav={onNav} sub />
          ))}
        </div>
      )}
    </div>
  );
}

/** O item aparece? Modulo editavel pede o VER do perfil (0111); sem lista, mostra. */
function visivel(href: string, permissoes: string[] | null): boolean {
  const m = moduloDaRota(href);
  if (!m || m.fixo || !permissoes) return true;
  return permissoes.includes(`${m.chave}.ver`);
}

function filtrar(entradas: Entrada[], permissoes: string[] | null): Entrada[] {
  return entradas.flatMap((e): Entrada[] => {
    if (!ehGrupo(e)) return visivel(e.href, permissoes) ? [e] : [];
    const itens = e.itens.filter((i) => visivel(i.href, permissoes));
    return itens.length ? [{ ...e, itens }] : [];
  });
}

function Nav({ pathname, menuGestao, onNav, permissoes, compacto }: {
  pathname: string; menuGestao: Entrada[]; onNav?: () => void; permissoes: string[] | null; compacto?: boolean;
}) {
  const titulo = 'px-3 pb-1.5 pt-4 text-xs font-semibold text-white/60';
  return (
    <nav className={cn('flex-1 space-y-1 overflow-y-auto py-2', compacto ? 'px-2' : 'px-3')} aria-label="Menu principal">
      {!compacto && <p className={titulo}>Operação</p>}
      {(filtrar(OPERACAO, permissoes) as Item[]).map((i) => (
        <NavLink key={i.href} item={i} pathname={pathname} onNav={onNav} compacto={compacto} />
      ))}
      {compacto ? <div className="my-2 border-t border-white/10" /> : <p className={titulo}>Gestão</p>}
      {filtrar(menuGestao, permissoes).map((e) => (ehGrupo(e)
        ? <NavGrupo key={e.label} grupo={e} pathname={pathname} onNav={onNav} compacto={compacto} />
        : <NavLink key={e.href} item={e} pathname={pathname} onNav={onNav} compacto={compacto} />))}
    </nav>
  );
}

export function Sidebar({ papel, logoUrl, permissoes = null }: {
  papel?: PapelUsuario; logoUrl?: string | null; permissoes?: string[] | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [aberto, setAberto] = useState(false);
  // Barra recolhida (só ícones): preferência de quem usa, guardada no navegador.
  const [recolhida, setRecolhida] = useState(false);
  useEffect(() => {
    try { setRecolhida(localStorage.getItem('scar:menu-recolhido') === '1'); } catch { /* sem storage */ }
  }, []);
  function alternarMenu() {
    setRecolhida((v) => {
      try { localStorage.setItem('scar:menu-recolhido', v ? '0' : '1'); } catch { /* sem storage */ }
      return !v;
    });
  }
  // Integracao com o Mutual: consulta e importacao sao da MATRIZ (o banco tambem
  // exige tem_acesso_global em mutual_registrar_captura).
  const integracao = ['admin', 'financeiro'].includes(papel ?? '')
    ? [{ href: '/integracao/mutual', label: 'Integração Mutual', icon: Database }]
    : [];
  // Configuracoes: o admin abre tudo; os demais veem o atalho quando o perfil
  // ou um extra libera alguma aba (0141) ou os modelos de Termos (0123).
  const abasConfig = papel === 'admin' ? null : abasConfiguracoesPermitidas(false, permissoes);
  const gestao = papel === 'admin'
    ? [...GESTAO, ...integracao, { href: '/configuracoes', label: 'Configurações', icon: Settings }]
    : abasConfig && abasConfig.length > 0
      ? [...GESTAO, ...integracao, { href: abasConfig[0], label: 'Configurações', icon: Settings }]
      : [...GESTAO, ...integracao];

  // REGIONAIS e um grupo, nao um link: o painel (leitura consolidada de todas
  // as unidades, /regionais) e a porta de entrada de UMA unidade (/regional,
  // o portal da franquia) sao coisas diferentes e viviam no mesmo item.
  // O portal do Vendedor segue link direto (o layout de /vendedor confere o
  // cadastro no banco).
  const portais: Entrada[] = [
    ...(['gestor_regional', 'admin', 'financeiro'].includes(papel ?? '')
      ? [{
          label: 'Regionais',
          icon: Building2,
          itens: [
            { href: '/regionais', label: 'Dashboard', icon: LayoutList },
            { href: '/regional', label: 'Acesso as Regionais', icon: DoorOpen },
          ],
        } satisfies Grupo] : []),
    ...(['consultor_vendas', 'admin'].includes(papel ?? '')
      ? [{ href: '/vendedor', label: 'Meu Portal de Vendas', icon: UserRound }] : []),
  ];
  const menuGestao: Entrada[] = [...portais, ...gestao];

  async function sair() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

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
            <Nav pathname={pathname} menuGestao={menuGestao} permissoes={permissoes} onNav={() => setAberto(false)} />
            <button onClick={sair} className="flex items-center gap-3 border-t border-white/10 px-5 py-3.5 text-sm text-white/80 hover:text-white">
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </aside>
        </div>
      )}

      {/* Sidebar desktop (cabine) */}
      <aside
        className={cn(
          'cockpit hidden shrink-0 flex-col transition-[width] duration-200 motion-reduce:transition-none md:sticky md:top-0 md:flex md:h-screen',
          recolhida ? 'w-[72px]' : 'w-64',
        )}
      >
        <div className={cn('py-5', recolhida ? 'px-2' : 'px-4')}>
          {recolhida ? (
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15" title="Smart Car Brasil">
              <svg viewBox="0 0 32 32" width="22" height="22" fill="none" aria-hidden>
                <path d="M4 21c6-1 9-4 12-9 2-3.4 4.6-6 8-7-1.6 2.2-2.2 4.4-2.6 7-0.6 4.2-3.4 7.6-8 9-3 .9-6 .6-9.4 0z" fill="#0BACE2" />
                <path d="M7 24c5-.4 8.4-2 11-5.4-1 3.4-3.4 5.8-7 6.4-1.4.2-2.8.1-4-1z" fill="#fff" fillOpacity=".85" />
              </svg>
            </div>
          ) : (
            <Brand logoUrl={logoUrl} />
          )}
        </div>
        <Nav pathname={pathname} menuGestao={menuGestao} permissoes={permissoes} compacto={recolhida} />
        <div className="border-t border-white/10 p-2">
          <button
            type="button"
            onClick={alternarMenu}
            aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
            title={recolhida ? 'Expandir menu' : 'Recolher menu'}
            className={cn(
              'flex h-10 w-full items-center rounded-lg text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white',
              recolhida ? 'justify-center' : 'gap-3 px-3',
            )}
          >
            {recolhida ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
            {!recolhida && 'Recolher menu'}
          </button>
          <button
            type="button"
            onClick={sair}
            title={recolhida ? 'Sair' : undefined}
            aria-label="Sair"
            className={cn(
              'flex h-10 w-full items-center rounded-lg text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white',
              recolhida ? 'justify-center' : 'gap-3 px-3',
            )}
          >
            <LogOut className="h-[18px] w-[18px]" />
            {!recolhida && 'Sair'}
          </button>
        </div>
      </aside>
    </>
  );
}
