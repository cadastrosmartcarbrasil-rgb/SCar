'use client';

import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErroLeitura } from '@/components/integracao/erro-leitura';
import { useEventosHistoricoResumo, useImportarEventosHistorico } from '@/hooks/use-eventos-historico';
import { formatDate, formatDateTime } from '@/lib/utils';

const inteiro = new Intl.NumberFormat('pt-BR');

/**
 * HISTORICO DE EVENTOS (0101). Os eventos/eventos do Mutual dos associados
 * ja carregados entram em `eventos_historico` — tabela propria, NAO
 * `eventos_sinistro`: la cada um viraria evento EM ABERTO no Kanban e no
 * painel, porque o Mutual manda "ANDAMENTO" em todos. Aqui e so historia:
 * aparece no SAC, em /eventos (aba Historico) e na Visao Geral.
 *
 * Ordem certa: puxar "Eventos (EVENT)" em "Puxar dados" -> importar aqui.
 * Re-executavel: so regrava o evento que mudou.
 */
export function HistoricoEventos() {
  const q = useEventosHistoricoResumo();
  const importar = useImportarEventosHistorico();
  const r = q.data;
  const ultimo = importar.data;

  const rodar = (confirmar: boolean) => {
    importar.mutate(confirmar, {
      onSuccess: (t) => {
        if (!t) return;
        toast.success(confirmar
          ? `Historico atualizado: ${inteiro.format(t.gravados)} eventos novos ou alterados.`
          : `Simulacao: ${inteiro.format(t.importaveis)} de ${inteiro.format(t.lidos)} eventos entram.`);
      },
      onError: (e) => toast.error((e as Error).message ?? 'Falha ao importar.'),
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-slate-500">
        Traz os eventos/eventos do Mutual dos associados <strong>ja carregados</strong> para o historico do SCar —
        aparecem na aba <strong>Eventos</strong> do SAC, em{' '}
        <Link href="/eventos?aba=historico" className="font-medium text-cyan-700 underline">Eventos → Historico</Link>{' '}
        e na Visao Geral. Eles <strong>nao viram evento em aberto</strong>: o Mutual manda o status &quot;ANDAMENTO&quot; em
        todos, entao so a data de conclusao conta como encerramento. Evento de associado ainda nao carregado fica de fora.
      </p>
      <ErroLeitura q={q} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Numero rotulo="Eventos no historico" valor={inteiro.format(r?.eventos ?? 0)}
          detalhe={`${inteiro.format(r?.associados ?? 0)} associados · ${inteiro.format(r?.veiculos ?? 0)} veiculos`} />
        <Numero rotulo="De veiculo fora da base" valor={inteiro.format(r?.sem_veiculo ?? 0)}
          detalhe="carro antigo do associado — fica com a placa" />
        <Numero rotulo="Periodo" valor={r?.primeiro_evento ? `${formatDate(r.primeiro_evento)} a ${formatDate(r.ultimo_evento)}` : '—'} />
        <Numero rotulo="Eventos capturados (EVENT)" valor={inteiro.format(r?.capturados ?? 0)}
          detalhe={r?.ultima_captura ? `captura de ${formatDateTime(r.ultima_captura)}` : 'nunca puxados'} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => rodar(true)} disabled={importar.isPending || !r?.capturados}>
          {importar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
          {importar.isPending ? 'Importando…' : 'Importar / atualizar historico'}
        </Button>
        <Button variant="secondary" onClick={() => rodar(false)} disabled={importar.isPending || !r?.capturados}>
          Simular
        </Button>
        {r?.ultima_importacao && (
          <span className="text-xs text-slate-500">Ultima atualizacao: {formatDateTime(r.ultima_importacao)}</span>
        )}
      </div>

      {ultimo && (
        <p className="tnum text-xs text-slate-600">
          {inteiro.format(ultimo.lidos)} eventos lidos · <b>{inteiro.format(ultimo.importaveis)} de associados na base</b>
          {importar.variables && <> · <b>{inteiro.format(ultimo.gravados)} gravados</b></>}
          {' '}· {inteiro.format(ultimo.sem_associado)} de associado ainda nao carregado (ficam de fora)
          · {inteiro.format(ultimo.sem_veiculo_na_base)} de veiculo fora da base
          {ultimo.data_invalida > 0 && <> · {inteiro.format(ultimo.data_invalida)} com data invalida (entram sem data)</>}
        </p>
      )}
    </div>
  );
}

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className="tnum mt-1 text-sm font-semibold text-slate-900">{valor}</p>
      {detalhe && <p className="mt-0.5 text-[11px] text-slate-500">{detalhe}</p>}
    </div>
  );
}
