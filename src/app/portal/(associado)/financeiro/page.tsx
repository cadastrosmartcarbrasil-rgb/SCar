'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, Check, Copy, Download, FileText, Loader2, Receipt,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { usePortalFinanceiro, usePortalTitulos, useSegundaVia } from '@/hooks/use-portal';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { PortalSegundaVia, PortalTitulo } from '@/lib/database.types';

const SELO: Record<string, { rotulo: string; classe: string }> = {
  pago: { rotulo: 'Pago', classe: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  vencido: { rotulo: 'Vencido', classe: 'bg-rose-50 text-rose-700 ring-rose-200' },
  aberto: { rotulo: 'A vencer', classe: 'bg-sky-50 text-sky-700 ring-sky-200' },
  cancelado: { rotulo: 'Cancelado', classe: 'bg-slate-100 text-slate-400 ring-slate-200' },
};

const FILTROS = [
  { chave: 'todos', rotulo: 'Todos' },
  { chave: 'aberto', rotulo: 'A vencer' },
  { chave: 'vencido', rotulo: 'Vencidos' },
  { chave: 'pago', rotulo: 'Pagos' },
];

export default function PortalFinanceiroPage() {
  const { data: fin } = usePortalFinanceiro();
  const { data: titulos, isLoading } = usePortalTitulos();
  const [filtro, setFiltro] = useState('todos');
  const [aberto, setAberto] = useState<PortalTitulo | null>(null);

  const lista = useMemo(
    () => (titulos ?? []).filter((t) => filtro === 'todos' || t.situacao === filtro),
    [titulos, filtro],
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[22px] font-bold tracking-tight text-brand-800">Financeiro</h1>
        <p className="mt-0.5 text-[13px] text-slate-500">
          Todos os seus boletos — pagos, a vencer e em atraso.
        </p>
      </header>

      {fin && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Indicador rotulo="Em aberto" valor={formatCurrency(fin.em_aberto)}
            nota={fin.qtd_vencidos > 0 ? `${fin.qtd_vencidos} em atraso` : 'nenhum atraso'}
            tom={fin.qtd_vencidos > 0 ? 'alerta' : 'neutro'} />
          <Indicador rotulo="Proximo vencimento"
            valor={fin.proximo_vencimento ? formatDate(fin.proximo_vencimento) : '—'}
            nota={fin.proximo_valor ? formatCurrency(fin.proximo_valor) : 'sem boleto a vencer'} />
          <Indicador rotulo="Pago em 12 meses" valor={formatCurrency(fin.pago_12_meses)}
            nota="somando as mensalidades quitadas" tom="ok" />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.chave} onClick={() => setFiltro(f.chave)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
              filtro === f.chave
                ? 'bg-acao text-white'
                : 'bg-superficie text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
          >
            {f.rotulo}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-superficie" />)}
        </div>
      ) : lista.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Receipt className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-[13px] text-slate-500">Nenhum boleto neste filtro.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {lista.map((t) => {
            const selo = SELO[t.situacao] ?? SELO.aberto;
            const pagavel = t.situacao === 'aberto' || t.situacao === 'vencido';
            return (
              <li key={t.id} className="rounded-2xl border border-slate-200/80 bg-superficie p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="tnum text-[16px] font-bold text-brand-800">
                      {formatCurrency(t.valor)}
                    </p>
                    <p className="text-[12.5px] text-slate-600">
                      Vence em {formatDate(t.data_vencimento)}
                      {t.placa && <span className="ml-2 font-mono uppercase text-slate-500">{t.placa}</span>}
                    </p>
                    {t.situacao === 'pago' && t.data_pagamento && (
                      <p className="text-[11.5px] text-emerald-700">
                        Pago em {formatDate(t.data_pagamento)}
                      </p>
                    )}
                    {t.dias_atraso > 0 && (
                      <p className="flex items-center gap-1 text-[11.5px] text-rose-600">
                        <AlertTriangle className="h-3 w-3" /> {t.dias_atraso} dia(s) de atraso
                      </p>
                    )}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${selo.classe}`}>
                    {selo.rotulo}
                  </span>
                </div>

                {pagavel && (
                  <button
                    onClick={() => setAberto(t)}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-2 text-[12.5px] font-bold text-navy transition hover:bg-cyan-400"
                  >
                    <Download className="h-3.5 w-3.5" /> 2a via do boleto
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {aberto && <ModalSegundaVia titulo={aberto} onClose={() => setAberto(null)} />}
    </div>
  );
}

function Indicador({ rotulo, valor, nota, tom = 'neutro' }: {
  rotulo: string; valor: string; nota?: string; tom?: 'neutro' | 'alerta' | 'ok';
}) {
  const cor = { neutro: 'text-brand-800', alerta: 'text-rose-700', ok: 'text-emerald-700' }[tom];
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-superficie p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className={`tnum mt-1.5 text-[20px] font-bold leading-none ${cor}`}>{valor}</p>
      {nota && <p className="mt-1 text-[11.5px] text-slate-400">{nota}</p>}
    </div>
  );
}

/** 2a via: mostra o que o banco ja devolveu, e diz quando ainda nao ha nada. */
function ModalSegundaVia({ titulo, onClose }: { titulo: PortalTitulo; onClose: () => void }) {
  const segunda = useSegundaVia();
  const [dados, setDados] = useState<PortalSegundaVia | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  // Busca UMA vez ao abrir. Disparar isto no corpo do componente faria a
  // chamada a cada render (e entraria em loop com o setState do resultado).
  const buscar = segunda.mutate;
  useEffect(() => {
    buscar(titulo.id, { onSuccess: (d) => setDados(d) });
  }, [buscar, titulo.id]);

  async function copiar(texto: string, qual: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(qual);
      setTimeout(() => setCopiado(null), 2500);
    } catch {
      toast.error('Nao consegui copiar. Selecione o texto manualmente.');
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-black/50 p-0 sm:place-items-center sm:p-4"
      onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl bg-superficie p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Boleto de {formatDate(titulo.data_vencimento)}
        </p>
        <p className="tnum mt-0.5 text-[24px] font-bold text-brand-800">
          {formatCurrency(titulo.valor)}
        </p>

        {segunda.isPending && (
          <p className="mt-4 flex items-center gap-2 text-[13px] text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Buscando o boleto…
          </p>
        )}

        {dados && !dados.disponivel && (
          <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-amber-900">
            {dados.aviso}
          </p>
        )}

        {dados?.disponivel && (
          <div className="mt-4 space-y-2.5">
            {dados.linha_digitavel && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Linha digitavel
                </p>
                <p className="tnum mt-1 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-[12px] text-slate-700">
                  {dados.linha_digitavel}
                </p>
                <button
                  onClick={() => copiar(dados.linha_digitavel!, 'linha')}
                  className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  {copiado === 'linha' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiado === 'linha' ? 'Copiado!' : 'Copiar linha digitavel'}
                </button>
              </div>
            )}

            {dados.pix_copia_cola && (
              <button
                onClick={() => copiar(dados.pix_copia_cola!, 'pix')}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2.5 text-[12.5px] font-bold text-emerald-700 transition hover:bg-emerald-100"
              >
                {copiado === 'pix' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiado === 'pix' ? 'PIX copiado!' : 'Copiar codigo PIX'}
              </button>
            )}

            {dados.url_boleto && (
              <a
                href={dados.url_boleto} target="_blank" rel="noreferrer"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-acao px-3 py-2.5 text-[12.5px] font-bold text-white transition hover:bg-acao-escura"
              >
                <FileText className="h-4 w-4" /> Abrir boleto em PDF
              </a>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-lg py-2 text-[12.5px] font-semibold text-slate-500 hover:text-slate-700"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
