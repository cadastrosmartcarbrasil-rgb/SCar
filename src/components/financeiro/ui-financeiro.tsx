'use client';

import { monthRange } from '@/lib/utils';
import { formatarMoedaBR } from '@/lib/money';
import type { SituacaoTitulo } from '@/lib/financeiro';

// ---------------------------------------------------------------------------
// Peças visuais compartilhadas pelas abas do Financeiro (padrão "cockpit").
// ---------------------------------------------------------------------------

export type Tom = 'neutro' | 'receita' | 'despesa' | 'alerta' | 'destaque';

const TOM_VALOR: Record<Tom, string> = {
  neutro: 'text-slate-900',
  receita: 'text-emerald-700',
  despesa: 'text-rose-700',
  alerta: 'text-amber-700',
  destaque: 'text-brand-700',
};
const TOM_ICONE: Record<Tom, string> = {
  neutro: 'bg-slate-100 text-slate-500',
  receita: 'bg-emerald-50 text-emerald-600',
  despesa: 'bg-rose-50 text-rose-600',
  alerta: 'bg-amber-50 text-amber-600',
  destaque: 'bg-cyan-50 text-cyan-600',
};

/** Indicador de painel: rótulo, valor em destaque e uma linha de contexto. */
export function Indicador({
  titulo,
  valor,
  detalhe,
  icon: Icon,
  tom = 'neutro',
  carregando,
}: {
  titulo: string;
  valor: number | null | undefined;
  detalhe?: string;
  icon?: React.ElementType;
  tom?: Tom;
  carregando?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(20,33,61,0.04),0_10px_26px_-16px_rgba(20,33,61,0.18)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
        {Icon && (
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] ${TOM_ICONE[tom]}`}>
            <Icon className="h-4 w-4" strokeWidth={2} />
          </span>
        )}
      </div>
      {carregando ? (
        <div className="mt-3 h-7 w-28 animate-pulse rounded bg-slate-100" />
      ) : (
        <p className={`tnum mt-2.5 text-[23px] font-bold leading-none ${TOM_VALOR[tom]}`}>
          <span className="mr-1 text-[13px] font-semibold text-slate-400">R$</span>
          {formatarMoedaBR(valor ?? 0)}
        </p>
      )}
      {detalhe && <p className="mt-2 text-[11.5px] leading-tight text-slate-500">{detalhe}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Situação do título
// ---------------------------------------------------------------------------
export const SITUACAO: Record<SituacaoTitulo, { rotulo: string; classe: string }> = {
  quitado: { rotulo: 'Quitado', classe: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  pago_parcial: { rotulo: 'Parcial', classe: 'bg-sky-50 text-sky-700 ring-sky-200' },
  atrasado: { rotulo: 'Em atraso', classe: 'bg-rose-50 text-rose-700 ring-rose-200' },
  vence_hoje: { rotulo: 'Vence hoje', classe: 'bg-amber-50 text-amber-700 ring-amber-200' },
  a_vencer: { rotulo: 'A vencer', classe: 'bg-slate-100 text-slate-600 ring-slate-200' },
  cancelado: { rotulo: 'Cancelado', classe: 'bg-slate-100 text-slate-400 ring-slate-200 line-through' },
};

export function Selo({ situacao, detalhe }: { situacao: SituacaoTitulo; detalhe?: string }) {
  const s = SITUACAO[situacao];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${s.classe}`}>
      {s.rotulo}
      {detalhe && <span className="tnum opacity-70">· {detalhe}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Filtro de período com atalhos (evita digitar duas datas toda vez)
// ---------------------------------------------------------------------------
export interface Periodo {
  inicio: string;
  fim: string;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function periodoPreset(chave: string, hoje = new Date()): Periodo {
  const a = hoje.getFullYear();
  const m = hoje.getMonth();
  switch (chave) {
    case 'mes_anterior':
      return { inicio: iso(new Date(a, m - 1, 1)), fim: iso(new Date(a, m, 0)) };
    case 'trimestre':
      return { inicio: iso(new Date(a, m - 2, 1)), fim: iso(new Date(a, m + 1, 0)) };
    case 'semestre':
      return { inicio: iso(new Date(a, m - 5, 1)), fim: iso(new Date(a, m + 1, 0)) };
    case 'ano':
      return { inicio: iso(new Date(a, 0, 1)), fim: iso(new Date(a, 11, 31)) };
    case 'mes':
    default:
      return monthRange(hoje);
  }
}

const PRESETS = [
  { chave: 'mes', rotulo: 'Mes atual' },
  { chave: 'mes_anterior', rotulo: 'Mes anterior' },
  { chave: 'trimestre', rotulo: 'Trimestre' },
  { chave: 'semestre', rotulo: 'Semestre' },
  { chave: 'ano', rotulo: 'Ano' },
];

export function FiltroPeriodo({
  periodo,
  onChange,
  children,
}: {
  periodo: Periodo;
  onChange: (p: Periodo) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(20,33,61,0.04)]">
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => {
          const alvo = periodoPreset(p.chave);
          const ativo = alvo.inicio === periodo.inicio && alvo.fim === periodo.fim;
          return (
            <button
              key={p.chave}
              type="button"
              onClick={() => onChange(alvo)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                ativo ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {p.rotulo}
            </button>
          );
        })}
      </div>
      <div className="flex items-end gap-2">
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">De</span>
          <input
            type="date"
            value={periodo.inicio}
            onChange={(e) => onChange({ ...periodo, inicio: e.target.value })}
            className="tnum mt-1 block rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Ate</span>
          <input
            type="date"
            value={periodo.fim}
            onChange={(e) => onChange({ ...periodo, fim: e.target.value })}
            className="tnum mt-1 block rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          />
        </label>
      </div>
      {children}
    </div>
  );
}

/** Estado vazio com orientacao — evita a sensacao de "tela morta". */
export function Vazio({
  icon: Icon,
  titulo,
  descricao,
  acao,
}: {
  icon: React.ElementType;
  titulo: string;
  descricao: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-1 text-sm font-semibold text-slate-700">{titulo}</p>
      <p className="max-w-sm text-xs leading-relaxed text-slate-500">{descricao}</p>
      {acao && <div className="mt-3">{acao}</div>}
    </div>
  );
}

/** Exporta uma matriz para CSV (separador ";" — abre direto no Excel BR). */
export function baixarCsv(nomeArquivo: string, linhas: (string | number)[][]) {
  const conteudo = linhas
    .map((l) =>
      l
        .map((c) => (typeof c === 'number' ? String(c).replace('.', ',') : `"${String(c ?? '').replace(/"/g, '""')}"`))
        .join(';'),
    )
    .join('\r\n');
  const blob = new Blob([`﻿${conteudo}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}
