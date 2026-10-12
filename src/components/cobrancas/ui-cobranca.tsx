'use client';

import { useMemo } from 'react';
import { Download, Loader2, Search } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Vazio, baixarCsv } from '@/components/financeiro/ui-financeiro';
import { ErroLeitura } from '@/components/integracao/erro-leitura';
import { useRegionais } from '@/hooks/use-config';
import { useCobrancaBoletos, useCobrancaEscopo, type FiltroListaBoletos } from '@/hooks/use-cobranca-painel';
import {
  ROTULO_SEMAFORO, ROTULO_SITUACAO, type Semaforo, type SituacaoBoleto,
} from '@/lib/cobranca-painel';
import { formatCurrency, formatDate } from '@/lib/utils';

// Paleta do sistema (a mesma dos paineis da 24h e das Regionais).
export const COR = {
  acento: '#139AD6',
  verde: '#12A150',
  ambar: '#C77700',
  vermelho: '#E5484D',
  cinza: '#64748B',
} as const;

export const COR_SEMAFORO: Record<Semaforo, string> = {
  verde: COR.verde, ambar: COR.ambar, vermelho: COR.vermelho, sem_dados: COR.cinza,
};

const CLASSE_SEMAFORO: Record<Semaforo, string> = {
  verde: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  ambar: 'bg-amber-50 text-amber-700 ring-amber-200',
  vermelho: 'bg-rose-50 text-rose-700 ring-rose-200',
  sem_dados: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export function SeloSemaforo({ s }: { s: Semaforo }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${CLASSE_SEMAFORO[s]}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: COR_SEMAFORO[s] }} />
      {ROTULO_SEMAFORO[s]}
    </span>
  );
}

const CHIP: Record<string, string> = {
  cyan: 'bg-cyan-50 text-cyan-600',
  navy: 'bg-brand-50 text-brand-600',
  rose: 'bg-rose-50 text-rose-600',
  amber: 'bg-amber-50 text-amber-600',
  green: 'bg-emerald-50 text-emerald-600',
  slate: 'bg-slate-100 text-slate-500',
};

/**
 * Cartao de indicador. Com `onAbrir`, o cartao inteiro vira botao: todo numero
 * do painel abre os boletos que o compoem (criterio de aceite "Detalhamento").
 */
export function TileCobranca({
  titulo, valor, detalhe, rodape, icon: Icon, tom = 'cyan', carregando, onAbrir, rotuloAcao = 'ver boletos →',
}: {
  titulo: string; valor: string; detalhe?: React.ReactNode; rodape?: React.ReactNode;
  icon: React.ElementType; tom?: keyof typeof CHIP; carregando?: boolean; onAbrir?: () => void;
  rotuloAcao?: string;
}) {
  const corpo = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11.5px] font-semibold uppercase leading-tight tracking-wide text-slate-500">{titulo}</p>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] ${CHIP[tom]}`}>
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
      </div>
      {carregando ? (
        <div className="mt-3 h-7 w-24 animate-pulse rounded bg-slate-100" />
      ) : (
        <p className="tnum mt-2.5 text-[23px] font-bold leading-none text-slate-900">{valor}</p>
      )}
      {detalhe && <div className="mt-2 text-[11.5px] leading-tight text-slate-500">{detalhe}</div>}
      {rodape && <div className="mt-1.5">{rodape}</div>}
      {onAbrir && <p className="mt-2 text-[11px] font-medium text-cyan-600">{rotuloAcao}</p>}
    </>
  );
  const classe = 'rounded-2xl border border-slate-200/80 bg-superficie p-4 text-left shadow-[0_1px_2px_rgba(20,33,61,0.04),0_10px_26px_-16px_rgba(20,33,61,0.18)]';
  if (!onAbrir) return <div className={classe}>{corpo}</div>;
  return (
    <button type="button" onClick={onAbrir} className={`${classe} transition hover:border-cyan-300 hover:shadow-md`}>
      {corpo}
    </button>
  );
}

/**
 * Seletor de unidade limitado ao ESCOPO de quem olha: a matriz e a cobranca
 * nacional veem todas; supervisor, as dele; gestor, a propria. O banco faz a
 * mesma conta — aqui e so para nao oferecer o que vai voltar vazio.
 */
export function FiltroUnidadeCobranca({
  valor, onChange,
}: { valor: string | null; onChange: (id: string | null) => void }) {
  const { data: regionais } = useRegionais();
  const { data: escopo } = useCobrancaEscopo();
  const opcoes = useMemo(() => {
    const todas = regionais ?? [];
    if (!escopo) return [];
    return escopo.global ? todas : todas.filter((r) => escopo.regionais.includes(r.id));
  }, [regionais, escopo]);

  return (
    <label className="block min-w-[190px]">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Regional</span>
      <select
        value={valor ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
      >
        <option value="">{escopo?.global ? 'Brasil (todas)' : 'Todas as minhas'}</option>
        {opcoes.map((r) => (
          <option key={r.id} value={r.id}>{r.nome}{r.ativo === false ? ' (inativa)' : ''}</option>
        ))}
      </select>
    </label>
  );
}

/** Quem nao tem escopo nenhum ve isto, em vez de um painel zerado que mente. */
export function SemAcessoCobranca() {
  return (
    <Vazio
      icon={Search}
      titulo="Sem acesso a cobranca"
      descricao="Este painel e da matriz, da equipe de cobranca, dos supervisores e dos gestores regionais. Se voce deveria ver, peca ao administrador para revisar o seu papel em Configuracoes → Usuarios."
    />
  );
}

const CLASSE_SITUACAO: Record<string, string> = {
  a_vencer: 'bg-slate-100 text-slate-600',
  vence_hoje: 'bg-cyan-50 text-cyan-700',
  vencido: 'bg-rose-50 text-rose-700',
  pago_no_prazo: 'bg-emerald-50 text-emerald-700',
  pago_em_atraso: 'bg-amber-50 text-amber-700',
  cancelado: 'bg-slate-100 text-slate-400 line-through',
};

/**
 * O DETALHAMENTO. Mostra a quantidade e a soma do FILTRO (vem do banco, entao
 * vale mesmo quando a lista e cortada no limite) e exporta CSV.
 */
export function ModalBoletos({ filtro, onClose }: { filtro: FiltroListaBoletos | null; onClose: () => void }) {
  const q = useCobrancaBoletos(filtro);
  const linhas = q.data ?? [];
  const total = linhas[0]?.total_registros ?? 0;
  const soma = linhas[0]?.total_valor ?? 0;
  const cortado = total > linhas.length;

  const exportar = () => {
    baixarCsv(`cobranca-${(filtro?.titulo ?? 'boletos').toLowerCase().replace(/\W+/g, '-')}.csv`, [
      ['Associado', 'CPF/CNPJ', 'Placa', 'Regional', 'Origem', 'Competencia', 'Vencimento', 'Ciclo',
        'Valor', 'Valor pago', 'Pago em', 'Situacao', 'Dias em atraso', 'Serasa'],
      ...linhas.map((l) => [
        l.associado, l.cpf_cnpj, l.placa ?? '', l.regional, l.origem,
        l.competencia ? formatDate(l.competencia) : '', formatDate(l.vencimento), l.ciclo,
        Number(l.valor), l.valor_pago === null ? '' : Number(l.valor_pago),
        l.data_pagamento ? formatDate(l.data_pagamento) : '',
        ROTULO_SITUACAO[l.situacao as SituacaoBoleto] ?? l.situacao, l.dias_atraso, l.em_serasa ? 'sim' : '',
      ]),
    ]);
  };

  return (
    <Modal open={!!filtro} onClose={onClose} title={filtro?.titulo ?? 'Boletos'} tamanho="xl"
      subtitulo={filtro?.inicio && filtro?.fim ? `Vencimento de ${formatDate(filtro.inicio)} a ${formatDate(filtro.fim)}` : undefined}>
      <ErroLeitura q={q} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-600">
          <b className="tnum text-slate-900">{total.toLocaleString('pt-BR')}</b> boletos ·{' '}
          <b className="tnum text-slate-900">{formatCurrency(Number(soma))}</b>
          {cortado && <span className="ml-2 text-amber-700">(mostrando os {linhas.length} de maior atraso e valor)</span>}
        </span>
        <button type="button" onClick={exportar} disabled={!linhas.length}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-superficie disabled:opacity-50">
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
      </div>
      {q.isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> carregando…</div>
      ) : !linhas.length ? (
        <Vazio icon={Search} titulo="Nenhum boleto" descricao="Nada compoe este numero no filtro atual." />
      ) : (
        <div className="max-h-[60vh] overflow-auto rounded-xl border border-slate-200">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Associado</th>
                <th className="px-3 py-2">Placa</th>
                <th className="px-3 py-2">Regional</th>
                <th className="px-3 py-2">Vencimento</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2">Situacao</th>
                <th className="px-3 py-2 text-right">Atraso</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.boleto_id} className="border-t border-slate-100">
                  <td className="px-3 py-1.5">
                    <p className="font-medium text-slate-800">{l.associado}</p>
                    <p className="tnum text-[11px] text-slate-400">{l.cpf_cnpj} · {l.origem === 'MUTUAL' ? 'historico Mutual' : 'SCar'}</p>
                  </td>
                  <td className="px-3 py-1.5 text-slate-600">{l.placa ?? '—'}</td>
                  <td className="px-3 py-1.5 text-slate-600">{l.regional}</td>
                  <td className="tnum px-3 py-1.5 text-slate-600">{formatDate(l.vencimento)} <span className="text-slate-400">· c{l.ciclo}</span></td>
                  <td className="tnum px-3 py-1.5 text-right text-slate-800">{formatCurrency(Number(l.valor))}</td>
                  <td className="px-3 py-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CLASSE_SITUACAO[l.situacao] ?? ''}`}>
                      {ROTULO_SITUACAO[l.situacao as SituacaoBoleto] ?? l.situacao}
                    </span>
                    {l.em_serasa && <span className="ml-1 text-[10.5px] font-semibold text-rose-600">SERASA</span>}
                    {l.data_pagamento && <span className="ml-1 text-[11px] text-slate-400">pago {formatDate(l.data_pagamento)}</span>}
                  </td>
                  <td className="tnum px-3 py-1.5 text-right text-slate-600">{l.dias_atraso > 0 ? `${l.dias_atraso} d` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
