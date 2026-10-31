'use client';

import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { GESTAO, OPERACAO, type Item } from '@/components/layout/sidebar';

// Rotas que não estão no menu principal, mas têm tela própria.
const EXTRAS: { href: string; label: string; area: string }[] = [
  { href: '/configuracoes', label: 'Configurações', area: 'Gestão' },
  { href: '/integracao/mutual', label: 'Integração Mutual', area: 'Gestão' },
  { href: '/regionais', label: 'Regionais', area: 'Gestão' },
  { href: '/regional', label: 'Acesso às regionais', area: 'Gestão' },
  { href: '/vendedor', label: 'Meu portal de vendas', area: 'Gestão' },
];

function achatar(): { href: string; label: string; area: string }[] {
  const lista: { href: string; label: string; area: string }[] = [];
  OPERACAO.forEach((i: Item) => lista.push({ href: i.href, label: i.label, area: 'Operação' }));
  GESTAO.forEach((e) => {
    if ('itens' in e) e.itens.forEach((i) => lista.push({ href: i.href, label: i.label, area: e.label }));
    else lista.push({ href: e.href, label: e.label, area: 'Gestão' });
  });
  return [...lista, ...EXTRAS];
}

/** A rota mais específica que casa com o endereço atual. */
export function localizarRota(pathname: string) {
  return achatar()
    .filter((r) => pathname === r.href || pathname.startsWith(r.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function Topbar({ nome, papel }: { nome: string | null; papel: string }) {
  const pathname = usePathname();
  const rota = localizarRota(pathname);
  const iniciais = (nome ?? '?').slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-30 hidden h-14 items-center justify-between border-b border-slate-200 bg-superficie px-8 md:flex">
      <div className="min-w-0 leading-tight">
        {rota ? (
          <>
            <p className="text-xs text-slate-500">{rota.area}</p>
            <h1 className="truncate font-display text-[0.9375rem] font-semibold text-slate-900">{rota.label}</h1>
          </>
        ) : (
          <h1 className="font-display text-[0.9375rem] font-semibold text-slate-900">Painel de gestão</h1>
        )}
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <div className="text-right leading-tight">
          <p className="text-[0.8125rem] font-semibold text-slate-800">{nome}</p>
          <p className="text-xs capitalize text-slate-500">{papel}</p>
        </div>
        {/* tokens que não invertem: o texto é branco nos dois temas */}
        <span className="grid h-9 w-9 place-items-center rounded-full bg-acao text-xs font-bold text-white">
          {iniciais}
        </span>
      </div>
    </header>
  );
}
