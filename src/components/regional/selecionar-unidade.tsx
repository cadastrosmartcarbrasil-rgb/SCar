'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, Search, Building2 } from 'lucide-react';
import { LogoSmartCar } from '@/components/hotlink/marca';
import { COOKIE_UNIDADE, MAX_AGE_UNIDADE } from '@/lib/unidade';

export interface UnidadeEscolhivel {
  id: string;
  nome: string;
  local: string;      // "CUIABA — MT"
  codigo: string | null;
  matriz: boolean;
}

/**
 * "Selecione a unidade" — a porta do Portal da Franquia para quem e da MATRIZ.
 *
 * O sistema de gestao e a matriz; a franquia se administra pelo portal dela.
 * Quem tem acesso global entra em qualquer unidade, mas sempre em UMA por vez —
 * a tela do portal e a operacao de uma franquia, nao um consolidado.
 */
export function SelecionarUnidade({
  unidades, nome, logoUrl,
}: {
  unidades: UnidadeEscolhivel[];
  nome: string;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState('');
  const [entrando, setEntrando] = useState<string | null>(null);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return unidades;
    return unidades.filter(
      (u) => u.nome.toLowerCase().includes(t) || u.local.toLowerCase().includes(t),
    );
  }, [unidades, busca]);

  function entrar(u: UnidadeEscolhivel) {
    setEntrando(u.id);
    // O cookie so diz QUAL unidade a tela mostra. Quem garante o dado e o
    // `escopo_regional()` no banco — para quem nao e da matriz, ele ignora o id.
    document.cookie = `${COOKIE_UNIDADE}=${u.id}; path=/; max-age=${MAX_AGE_UNIDADE}; samesite=lax`;
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-fundo px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-superficie p-6 shadow-[0_20px_60px_-30px_rgba(20,33,61,0.35)]">
        <div className="flex flex-col items-center text-center">
          <LogoSmartCar url={logoUrl} className="h-12" />
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">
            Portal da Franquia
          </p>
          <h1 className="mt-3 text-xl font-bold uppercase tracking-tight text-slate-900">
            Selecione a unidade
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Acesso da matriz — escolha qual franquia visualizar. Você entra como{' '}
            <strong className="text-slate-600">{nome}</strong>.
          </p>
        </div>

        {unidades.length > 6 && (
          <div className="relative mt-5">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar unidade ou cidade"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
            />
          </div>
        )}

        <ul className="mt-5 space-y-2">
          {filtradas.map((u) => (
            <li key={u.id}>
              <button
                onClick={() => entrar(u)}
                disabled={!!entrando}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-cyan-400 hover:bg-cyan-50/40 disabled:opacity-60"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold uppercase text-slate-900">{u.nome}</span>
                    {u.matriz && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                        MATRIZ
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs uppercase text-slate-500">
                    {u.local || 'Local nao informado'}
                    {u.codigo ? ` · ${u.codigo}` : ''}
                  </span>
                </span>
                <ArrowRight className={`h-4 w-4 shrink-0 ${entrando === u.id ? 'animate-pulse text-cyan-600' : 'text-slate-400'}`} />
              </button>
            </li>
          ))}
          {filtradas.length === 0 && (
            <li className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
              <Building2 className="mx-auto mb-2 h-5 w-5 text-slate-300" />
              {unidades.length === 0
                ? 'Nenhuma unidade cadastrada. Cadastre em Configuracoes > Regionais.'
                : 'Nenhuma unidade com esse nome.'}
            </li>
          )}
        </ul>

        <Link
          href="/dashboard"
          className="mt-5 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          <ChevronLeft className="h-4 w-4" /> Voltar ao sistema de gestao
        </Link>
      </div>
    </main>
  );
}
