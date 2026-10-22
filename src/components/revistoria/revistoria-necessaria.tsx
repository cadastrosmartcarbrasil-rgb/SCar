'use client';

// O painel dentro da 2a via/negociacao (0137): boleto vencido ha mais de N dias
// so sai com a revistoria do veiculo aprovada — ou liberada com justificativa.
// O banco recusa de qualquer jeito (trigger); aqui a tela diz POR QUE e da o
// caminho: gerar o link, mandar no WhatsApp, acompanhar, liberar.
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CheckCircle2, Copy, ExternalLink, Loader2, MessageCircle, ShieldAlert, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  linkDaRevistoria, useDispensarRevistoria, useRevistoriaExigida, useSolicitarRevistoria,
} from '@/hooks/use-revistoria';
import { usePode } from '@/hooks/use-permissoes';
import { mensagemRevistoria, resumoExigencia, ROTULO_SITUACAO_REVISTORIA } from '@/lib/revistoria';
import { linkWhatsAppAssociado } from '@/lib/protocolos';
import { identificacaoVeiculo } from '@/lib/placa';
import { formatDate } from '@/lib/utils';
import type { RevistoriaExigida } from '@/lib/database.types';

/** Devolve o estado para o modal decidir se libera o botao de emitir. */
export function useBloqueioRevistoria(clienteId: string, origens: { origem: string; id: string }[]) {
  const q = useRevistoriaExigida(clienteId, origens);
  const r = resumoExigencia(q.data ?? []);
  return { q, ...r, carregando: q.isLoading };
}

export function RevistoriaNecessaria({
  linhas, nome, celular, titulo, acaoLiberada,
}: {
  linhas: RevistoriaExigida[];
  nome: string | null | undefined;
  celular: string | null | undefined;
  /** Substitui a frase do topo (o SAC fala com o atendente, nao com quem emite). */
  titulo?: ReactNode;
  /** O que oferecer no veiculo ja liberado (no SAC: "Gerar a 2a via agora"). */
  acaoLiberada?: (l: RevistoriaExigida) => ReactNode;
}) {
  if (linhas.length === 0) return null;
  const r = resumoExigencia(linhas);
  return (
    <div className={`rounded-lg border p-3 ${r.bloqueia ? 'border-amber-300 bg-amber-50/60' : 'border-emerald-200 bg-emerald-50/60'}`}>
      <p className="flex items-start gap-2 text-sm font-semibold text-slate-800">
        {r.bloqueia
          ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
        {titulo ?? (r.bloqueia
          ? 'Revistoria necessária: há boleto vencido acima do limite'
          : 'Revistoria em ordem: a 2ª via pode sair')}
      </p>
      <ul className="mt-2 space-y-2">
        {linhas.map((l) => (
          <LinhaVeiculo key={l.veiculo_id} l={l} nome={nome} celular={celular} acaoLiberada={acaoLiberada} />
        ))}
      </ul>
    </div>
  );
}

function LinhaVeiculo({ l, nome, celular, acaoLiberada }: {
  l: RevistoriaExigida; nome?: string | null; celular?: string | null;
  acaoLiberada?: (l: RevistoriaExigida) => ReactNode;
}) {
  const solicitar = useSolicitarRevistoria();
  const dispensar = useDispensarRevistoria();
  const podePedir = usePode('revistoria.criar');
  const podeLiberar = usePode('revistoria.cancelar');
  const [liberando, setLiberando] = useState(false);
  const [just, setJust] = useState('');
  const veiculo = identificacaoVeiculo(l.placa, l.chassi);
  const rot = l.situacao ? ROTULO_SITUACAO_REVISTORIA[l.situacao] : null;

  const link = l.token ? linkDaRevistoria(l.token) : null;
  const texto = link ? mensagemRevistoria({
    nome, placa: veiculo, link, expiraEm: l.token_expira_em, motivo: l.motivo_reprovacao,
  }) : '';
  const whats = link ? linkWhatsAppAssociado(celular, texto) : null;

  return (
    <li className="rounded-md bg-superficie p-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-mono font-semibold">{veiculo}</span>
          {l.modelo && <span className="text-slate-500"> · {l.modelo}</span>}
          <span className="ml-2 text-xs text-rose-700">{l.dias_atraso}d de atraso (desde {formatDate(l.vencimento)})</span>
        </span>
        {l.liberada
          ? <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">{rot?.rotulo ?? 'Liberada'}</span>
          : rot && <span className={`rounded px-2 py-0.5 text-xs font-medium ${rot.tom}`}>{rot.rotulo}</span>}
      </div>

      {l.liberada && acaoLiberada && <div className="mt-2">{acaoLiberada(l)}</div>}
      {!l.liberada && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {!l.situacao && podePedir && (
            <Button className="px-2.5 py-1.5 text-xs" onClick={() => solicitar.mutate(l.veiculo_id, {
              onSuccess: () => toast.success('Link da revistoria gerado. Envie ao associado.'),
              onError: (e) => toast.error(e.message),
            })} disabled={solicitar.isPending}>
              {solicitar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Sim, gerar o link da revistoria
            </Button>
          )}
          {l.situacao === 'AGUARDANDO' && link && (
            <>
              {whats && (
                <a href={whats} target="_blank" rel="noreferrer"
                   className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                  <MessageCircle className="h-3.5 w-3.5" /> Enviar no WhatsApp
                </a>
              )}
              <Button className="px-2.5 py-1.5 text-xs" variant="secondary" onClick={() => { navigator.clipboard?.writeText(texto); toast.success('Mensagem copiada'); }}>
                <Copy className="h-3.5 w-3.5" /> Copiar mensagem
              </Button>
              <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-cyan-700 hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> abrir link
              </a>
              {l.token_expira_em && new Date(l.token_expira_em) <= new Date() && podePedir && (
                <Button className="px-2.5 py-1.5 text-xs" variant="secondary" onClick={() => solicitar.mutate(l.veiculo_id, {
                  onSuccess: () => toast.success('Link renovado por 7 dias.'), onError: (e) => toast.error(e.message),
                })}>Renovar link (vencido)</Button>
              )}
            </>
          )}
          {l.situacao === 'EM_ANALISE' && l.revistoria_id && (
            <Link href={`/cobrancas/revistorias?id=${l.revistoria_id}`} className="text-xs font-medium text-cyan-700 hover:underline">
              O associado já enviou — analisar agora
            </Link>
          )}
          {podeLiberar && !liberando && (
            <button type="button" onClick={() => setLiberando(true)} className="inline-flex items-center gap-1 text-xs text-violet-700 hover:underline">
              <Unlock className="h-3.5 w-3.5" /> Liberar sem revistoria
            </button>
          )}
        </div>
      )}
      {l.motivo_reprovacao && l.situacao === 'AGUARDANDO' && (
        <p className="mt-1 text-xs text-amber-800">Reprovada: {l.motivo_reprovacao}</p>
      )}

      {liberando && (
        <div className="mt-2 space-y-2 rounded-md border border-violet-200 bg-violet-50/50 p-2">
          <textarea
            className="w-full rounded-md border border-slate-300 p-2 text-sm" rows={2}
            placeholder="Justificativa (fica na trilha): ex.: veículo na oficina credenciada desde 10/10"
            value={just} onChange={(e) => setJust(e.target.value)}
          />
          <div className="flex gap-2">
            <Button className="px-2.5 py-1.5 text-xs" disabled={dispensar.isPending || just.trim().length < 10}
              onClick={() => dispensar.mutate({ veiculoId: l.veiculo_id, justificativa: just }, {
                onSuccess: () => { toast.success('Liberado sem revistoria.'); setLiberando(false); },
                onError: (e) => toast.error(e.message),
              })}>
              Confirmar liberação
            </Button>
            <Button className="px-2.5 py-1.5 text-xs" variant="secondary" onClick={() => setLiberando(false)}>Voltar</Button>
          </div>
        </div>
      )}
    </li>
  );
}
