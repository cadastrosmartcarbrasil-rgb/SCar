'use client';

import { ArrowRight, Car, Check, ShieldAlert, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import type { PlanoComparado } from '@/hooks/use-vendas';

// ---------------------------------------------------------------------------
// Cartao de plano para APRESENTAR ao cliente (31/10/2026).
//
// O vendedor vira a tela para quem esta comprando, entao o cartao precisa ser
// lido de longe: nome grande, o preco como protagonista e UM botao claro. Vive
// dentro de um painel que e escuro nos DOIS temas (`bg-faixa`), por isso usa
// branco e ciano direto — nao os tokens `slate-*`/`brand-*`, que invertem.
// So a logica de mostrar/esconder valor e a escolha continuam na tela-mae.
// ---------------------------------------------------------------------------

/** O icone conta o tipo de plano de relance, sem depender de cadastro. */
export function iconeDoPlano(nome: string) {
  const n = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (n.includes('roubo') || n.includes('furto')) return ShieldAlert;
  if (n.includes('completo') || n.includes('premium') || n.includes('ouro')) return Zap;
  if (n.includes('basico') || n.includes('essencial')) return Car;
  return ShieldCheck;
}

/** "218,50" -> ['218', '50']: o centavo vai menor, o numero respira. */
function partesDoPreco(valor: number): [string, string] {
  const s = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor);
  const i = s.lastIndexOf(',');
  return [s.slice(0, i), s.slice(i + 1)];
}

export function CartaoDoPlano({ plano, ativo, mostraValor, selo, onEscolher }: {
  plano: PlanoComparado;
  ativo: boolean;
  mostraValor: boolean;
  /** 'preferencial' | 'sugerido' | null */
  selo: 'preferencial' | 'sugerido' | null;
  onEscolher: () => void;
}) {
  const Icone = iconeDoPlano(plano.nome);
  const [inteiro, centavos] = partesDoPreco(plano.mensalidade);

  return (
    <button
      type="button"
      onClick={onEscolher}
      aria-pressed={ativo}
      className={cn(
        'group relative w-full overflow-hidden rounded-2xl p-5 text-left ring-1 transition duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 sm:p-6',
        ativo
          ? 'bg-gradient-to-br from-cyan-500/25 via-white/[0.07] to-white/[0.03] shadow-lg shadow-cyan-500/20 ring-2 ring-cyan-400'
          : 'bg-white/[0.05] ring-white/15 hover:bg-white/[0.09] hover:ring-cyan-300/60',
      )}
    >
      <div className="flex items-start gap-4">
        <span
          className={cn(
            'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ring-1',
            ativo ? 'bg-cyan-500/25 text-cyan-200 ring-cyan-300/50' : 'bg-white/10 text-cyan-300 ring-white/15',
          )}
        >
          <Icone className="h-7 w-7" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="font-display text-xl font-bold leading-tight text-white">{plano.nome}</p>
            {selo && (
              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/20 px-2.5 py-0.5 text-xs font-bold text-cyan-200 ring-1 ring-cyan-300/40">
                <Sparkles className="h-3 w-3" /> {selo === 'preferencial' ? 'Recomendado' : 'Sugerido'}
              </span>
            )}
          </div>
          {plano.descricao && (
            <p className="mt-1 max-w-prose text-sm leading-snug text-white/70">{plano.descricao}</p>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        {mostraValor ? (
          <p className="flex items-baseline gap-1 text-white">
            <span className="text-sm text-white/60">R$</span>
            <span className="tnum font-display text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">{inteiro}</span>
            <span className="tnum font-display text-xl font-bold leading-none">,{centavos}</span>
            <span className="ml-1 text-sm text-white/60">por mês</span>
          </p>
        ) : (
          <p className="text-sm text-white/60">Toque para ver o valor deste plano</p>
        )}
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold transition',
            ativo
              ? 'bg-cyan-400 text-faixa'
              : 'bg-white/10 text-white ring-1 ring-white/20 group-hover:bg-cyan-400 group-hover:text-faixa',
          )}
        >
          {ativo ? <><Check className="h-4 w-4" /> Selecionado</> : <>{mostraValor ? 'Escolher plano' : 'Ver valor'} <ArrowRight className="h-4 w-4" /></>}
        </span>
      </div>

      {ativo && (
        <div className="mt-5 border-t border-white/15 pt-4">
          {plano.itens.length > 0 && (
            <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {plano.itens.map((i) => (
                <li key={i.nome} className="flex items-start gap-2 text-sm text-white/90">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" /> {i.nome}
                </li>
              ))}
            </ul>
          )}
          {(plano.adesao > 0 || plano.participacao > 0 || plano.desconto_base > 0) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {plano.adesao > 0 && <Fato rotulo="Adesão única" valor={formatCurrency(plano.adesao)} />}
              {plano.participacao > 0 && <Fato rotulo="Participação no evento" valor={formatCurrency(plano.participacao)} />}
              {plano.desconto_base > 0 && <Fato rotulo="Desconto do plano" valor={formatCurrency(plano.desconto_base)} />}
            </div>
          )}
        </div>
      )}
    </button>
  );
}

function Fato({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/80 ring-1 ring-white/15">
      {rotulo}: <b className="tnum text-white">{valor}</b>
    </span>
  );
}
