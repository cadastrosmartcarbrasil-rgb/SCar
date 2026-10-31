'use client';

// Painel do prazo regulatorio (0113 — Art. 22, CNSP 491/2026): os eventos em
// aberto do mais grave para o menos grave, com os alertas sem ciencia.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { BellRing, Download, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { usePerfilAtual } from '@/hooks/use-config';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { useDarCienciaPrazo, useEventosPrazos } from '@/hooks/use-prazo-eventos';
import { BarraPrazo, SeloPrazo } from './prazo-regulatorio';
import { ORDEM_NIVEL, contarPorNivel, estiloDoNivel, rotuloMarco, textoDoPrazo, type NivelPrazo } from '@/lib/prazo-regulatorio';
import { baixarCsv } from '@/components/financeiro/ui-financeiro';
import { cn, formatDate } from '@/lib/utils';

const CARTOES: NivelPrazo[] = ['VENCIDO', 'CRITICO', 'URGENCIA', 'ATENCAO', 'AVISO', 'NO_PRAZO', 'DOCUMENTACAO_PENDENTE'];

export function PainelPrazos() {
  const [encerrados, setEncerrados] = useState(false);
  const { data, isLoading, error } = useEventosPrazos({ incluirEncerrados: encerrados });
  const ciencia = useDarCienciaPrazo();
  const [nivel, setNivel] = useState<NivelPrazo | null>(null);
  const [unidade, setUnidade] = useState('');
  const { data: perfil } = usePerfilAtual();
  const global = perfil?.papel === 'admin' || perfil?.papel === 'financeiro';
  const qc = useQueryClient();
  const [rodando, setRodando] = useState(false);

  async function rodarRotina() {
    setRodando(true);
    try {
      const res = await fetch('/api/v1/eventos/prazos', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      toast.success(`Rotina rodada: ${j.resumo.alertas_novos} alerta(s) novo(s).${j.email?.aviso ? ' ' + j.email.aviso : ''}`);
      qc.invalidateQueries({ queryKey: ['eventos'] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRodando(false);
    }
  }

  const lista = data ?? [];
  const unidades = useMemo(
    () => Array.from(new Set(lista.map((p) => p.regional_nome ?? 'Matriz (sem unidade)'))).sort(),
    [lista],
  );
  const daUnidade = unidade ? lista.filter((p) => (p.regional_nome ?? 'Matriz (sem unidade)') === unidade) : lista;
  const contagem = contarPorNivel(daUnidade);
  const linhas = nivel ? daUnidade.filter((p) => p.nivel === nivel) : daUnidade;
  const semCiencia = daUnidade.filter((p) => p.alertas_sem_ciencia > 0);

  if (error) return <p className="text-sm text-rose-600">Falha ao ler os prazos: {(error as Error).message}</p>;
  if (isLoading) return <p className="text-sm text-slate-500">Carregando prazos...</p>;

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Art. 22 da Resolução CNSP 491/2026: 90 dias corridos para regular e liquidar, contados do aviso junto com a
        documentação completa. Passou disso, a associação perde o direito de recusa.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {CARTOES.map((n) => {
          const e = estiloDoNivel(n);
          const ativo = nivel === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => setNivel(ativo ? null : n)}
              className={cn(
                'rounded-xl border p-3 text-left transition',
                e.selo,
                ativo ? 'ring-2 ring-cyan-500' : 'hover:brightness-95',
              )}
            >
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wide">{e.rotulo}</p>
              <p className="tnum mt-1 text-2xl font-bold">{contagem[n]}</p>
            </button>
          );
        })}
      </div>

      {semCiencia.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-rose-800">
            <BellRing className="h-4 w-4" /> {semCiencia.length} evento(s) com alerta sem ciência
          </p>
          <ul className="space-y-1.5">
            {semCiencia.slice(0, 12).map((p) => (
              <li key={p.evento_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-rose-900">
                  <Link href={`/eventos/${p.evento_id}`} className="font-mono font-medium hover:underline">
                    {p.numero_protocolo}
                  </Link>{' '}
                  · {p.placa} · alerta de {rotuloMarco(p.maior_marco_sem_ciencia ?? 0)} · {textoDoPrazo(p)}
                </span>
                <Button
                  variant="secondary"
                  className="px-2.5 py-1 text-xs"
                  disabled={ciencia.isPending}
                  onClick={() => ciencia.mutate(p.evento_id, { onError: (er) => toast.error((er as Error).message) })}
                >
                  Dar ciência
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {unidades.length > 1 && (
          <Select value={unidade} onChange={(e) => setUnidade(e.target.value)} className="mt-0 w-auto">
            <option value="">Todas as unidades</option>
            {unidades.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </Select>
        )}
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={encerrados} onChange={(e) => setEncerrados(e.target.checked)} /> Incluir encerrados
        </label>
        {nivel && (
          <button type="button" className="text-sm font-medium text-cyan-700 hover:underline" onClick={() => setNivel(null)}>
            Limpar filtro ({estiloDoNivel(nivel).rotulo})
          </button>
        )}
        {perfil?.papel === 'admin' && (
          <Link href="/configuracoes/documentos-evento" className="ml-auto text-sm font-medium text-cyan-700 hover:underline">
            Configurar marcos e documentos
          </Link>
        )}
        {global && (
          <Button variant="ghost" className={perfil?.papel === 'admin' ? '' : 'ml-auto'} disabled={rodando} onClick={rodarRotina}
            title="A rotina roda sozinha todo dia; use para disparar os alertas agora">
            <RefreshCw className={cn('h-4 w-4', rodando && 'animate-spin')} /> Rodar rotina de alertas
          </Button>
        )}
        <Button
          variant="secondary"
          className={global ? '' : 'ml-auto'}
          onClick={() =>
            baixarCsv('prazos-regulatorios.csv', [
              ['Protocolo', 'Placa', 'Associado', 'Unidade', 'Status', 'Aviso', 'Documentação completa', 'Dias', 'Limite', 'Nível'],
              ...linhas.map((p) => [
                p.numero_protocolo ?? '', p.placa ?? '', p.cliente_nome ?? '', p.regional_nome ?? 'Matriz', p.status,
                p.aviso_em, p.documentacao_completa_em ?? '', p.dias_transcorridos ?? '', p.limite_prazo ?? '',
                estiloDoNivel(p.nivel).rotulo,
              ]),
            ])
          }
        >
          <Download className="h-4 w-4" /> CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Protocolo</th>
              <th className="px-3 py-2">Associado / placa</th>
              <th className="px-3 py-2">Unidade</th>
              <th className="px-3 py-2">Aviso</th>
              <th className="px-3 py-2">Documentação</th>
              <th className="min-w-[180px] px-3 py-2">Prazo (90 dias)</th>
              <th className="px-3 py-2">Limite</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {linhas.map((p) => (
              <tr key={p.evento_id} className={cn(p.nivel === 'VENCIDO' && 'bg-rose-50/60')}>
                <td className="px-3 py-2">
                  <Link href={`/eventos/${p.evento_id}`} className="font-mono text-brand-600 hover:underline">
                    {p.numero_protocolo}
                  </Link>
                  <p className="text-[0.6875rem] text-slate-500">{p.status}</p>
                </td>
                <td className="px-3 py-2">
                  <p className="truncate text-slate-800">{p.cliente_nome}</p>
                  <p className="text-xs text-slate-500">{p.placa}</p>
                </td>
                <td className="px-3 py-2 text-slate-600">{p.regional_nome ?? 'Matriz'}</td>
                <td className="tnum px-3 py-2 text-slate-600">{formatDate(p.aviso_em)}</td>
                <td className="px-3 py-2">
                  {p.documentacao_completa_em ? (
                    <span className="text-emerald-700">Completa {formatDate(p.documentacao_completa_em)}</span>
                  ) : (
                    <span className="text-amber-700">
                      Pendente ({p.docs_pendentes}/{p.docs_obrigatorios})
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <SeloPrazo prazo={p} compacto />
                    {p.alertas_sem_ciencia > 0 && <BellRing className="h-3.5 w-3.5 text-rose-600" />}
                  </div>
                  {p.inicio_prazo && (
                    <div className="mt-1.5">
                      <BarraPrazo prazo={p} fina />
                    </div>
                  )}
                  <p className="mt-1 text-[0.6875rem] text-slate-500">{textoDoPrazo(p)}</p>
                </td>
                <td className={cn('tnum px-3 py-2', (p.nivel === 'VENCIDO' || p.nivel === 'CRITICO') && 'font-semibold text-rose-700')}>
                  {p.limite_prazo ? formatDate(p.limite_prazo) : '—'}
                </td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-400">Nenhum evento neste recorte.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[0.6875rem] text-slate-400">
        Ordem: {ORDEM_NIVEL.slice(0, 7).map((n) => estiloDoNivel(n).rotulo).join(' › ')}. Os dias são contados no dia de São
        Paulo; os alertas são gravados pela rotina diária.
      </p>
    </div>
  );
}
