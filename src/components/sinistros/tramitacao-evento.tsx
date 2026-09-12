'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowRightLeft, Loader2, MessageSquarePlus, Check, ExternalLink, Users, Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField, Select, Textarea } from '@/components/ui/field';
import { useUsuarios, usePerfilAtual } from '@/hooks/use-config';
import {
  useTransferirProtocolo, useProtocoloDoEvento, usePareceresProtocolo,
  useSolicitarParecer, useResponderParecer,
} from '@/hooks/use-eventos';
import { situacaoParecer, resumoPareceres, ordenarPareceres } from '@/lib/protocolos';
import { podeTratarEvento } from '@/lib/usuario';
import { PIPELINE_SINISTRO } from '@/types/domain';
import { formatDate } from '@/lib/utils';
import type { StatusEvento } from '@/lib/database.types';

/**
 * Tramitacao do evento (0059).
 *
 * O card antigo mandava como destino o operador que JA estava com o evento —
 * ou seja, nunca transferiu nada: so trocava o status e guardava um parecer
 * solto. Agora sao as duas coisas que a operacao de sinistro precisa:
 *
 *   1. PASSAR A BOLA — escolher a pessoa que fica responsavel. A transferencia
 *      cai na Central de Protocolos dela, nao so na linha do tempo do evento.
 *   2. PEDIR PARECER — o sinistro vai para o juridico, para a vistoria, para a
 *      diretoria; cada um analisa e devolve. E um pedido COM resposta, e a tela
 *      mostra quem ainda deve.
 */
export function TramitacaoEvento({
  eventoId, operadorAtualId,
}: {
  eventoId: string;
  operadorAtualId?: string | null;
}) {
  const { data: usuarios } = useUsuarios();
  const { data: perfil } = usePerfilAtual();
  const { data: atendimentoId } = useProtocoloDoEvento(eventoId);
  const { data: pareceres, isLoading: carregandoPareceres } = usePareceresProtocolo(atendimentoId ?? null);

  const transferir = useTransferirProtocolo(eventoId);
  const pedir = useSolicitarParecer();

  const [destino, setDestino] = useState('');
  const [novoStatus, setNovoStatus] = useState<StatusEvento | ''>('');
  const [parecer, setParecer] = useState('');

  const [pedindo, setPedindo] = useState(false);
  const [pergunta, setPergunta] = useState('');
  const [escolhidos, setEscolhidos] = useState<string[]>([]);

  const equipe = useMemo(
    () => (usuarios ?? []).filter((u) => u.ativo),
    [usuarios],
  );
  // Mudar o STATUS do evento e do time de sinistro (0077). Transferir e opinar
  // continuam de todo staff da unidade — juridico e vistoria opinam no sinistro
  // sem serem o time dele. Oferecer o seletor a quem o banco vai recusar seria
  // o mesmo defeito de /precificacao: a tela promete, o banco nega.
  const podeMudarStatus = podeTratarEvento(perfil?.papel);
  const lista = ordenarPareceres(pareceres ?? []);
  const resumo = resumoPareceres(lista);

  function tramitar() {
    if (!destino && !novoStatus && !parecer.trim()) {
      return toast.error('Escolha o responsavel, o novo status ou escreva o parecer');
    }
    transferir.mutate(
      { destino: destino || null, parecer: parecer || undefined, novoStatus: (novoStatus || undefined) as StatusEvento | undefined },
      {
        onSuccess: () => {
          toast.success(destino ? 'Protocolo transferido' : 'Tramitacao registrada');
          setParecer(''); setNovoStatus(''); setDestino('');
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  function solicitar() {
    if (!atendimentoId) return;
    if (!escolhidos.length) return toast.error('Escolha quem deve analisar');
    if (!pergunta.trim()) return toast.error('Escreva o que precisa ser analisado');
    pedir.mutate(
      { atendimentoId, usuarios: escolhidos, pergunta },
      {
        onSuccess: (n) => {
          toast.success(n > 0 ? `Parecer pedido a ${n} pessoa(s)` : 'Essas pessoas ja tinham pedido em aberto');
          setPergunta(''); setEscolhidos([]); setPedindo(false);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  function alternar(id: string) {
    setEscolhidos((atuais) =>
      atuais.includes(id) ? atuais.filter((x) => x !== id) : [...atuais, id]);
  }

  const responsavelAtual = equipe.find((u) => u.id === operadorAtualId);

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------- tramitar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" /> Tramitar protocolo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate-500">
            Com o protocolo{' '}
            <strong className="text-slate-700">{responsavelAtual?.nome ?? 'ninguem ainda'}</strong>.
          </p>

          <FormField label="Passar para">
            <Select value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">Manter com quem esta</option>
              {equipe.map((u) => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </Select>
          </FormField>

          {podeMudarStatus ? (
            <FormField label="Novo status">
              <Select value={novoStatus} onChange={(e) => setNovoStatus(e.target.value as StatusEvento)}>
                <option value="">Manter status atual</option>
                {PIPELINE_SINISTRO.map((c) => (
                  <option key={c.status} value={c.status}>{c.titulo}</option>
                ))}
              </Select>
            </FormField>
          ) : (
            <p className="text-xs text-slate-500">
              Mudar a fase do evento e do time de sinistro. Voce pode transferir
              o protocolo e registrar parecer.
            </p>
          )}

          <FormField label="Parecer / observacoes">
            <Textarea
              rows={4}
              value={parecer}
              onChange={(e) => setParecer(e.target.value)}
              placeholder="Descreva a analise ou o motivo da transferencia..."
            />
          </FormField>

          <Button onClick={tramitar} disabled={transferir.isPending} className="w-full justify-center">
            {transferir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
            {destino ? 'Transferir' : 'Registrar tramitacao'}
          </Button>

          {atendimentoId && (
            <Link
              href={`/protocolos?protocolo=${atendimentoId}`}
              className="flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-brand-700"
            >
              <ExternalLink className="h-3 w-3" /> Ver na Central de Protocolos
            </Link>
          )}
        </CardContent>
      </Card>

      {/* --------------------------------------------------------- pareceres */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Pareceres
            </CardTitle>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setPedindo((v) => !v)}>
              <MessageSquarePlus className="h-3.5 w-3.5" /> Pedir
            </Button>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{resumo.texto}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {pedindo && (
            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              <FormField label="O que precisa ser analisado *">
                <Textarea
                  rows={3}
                  value={pergunta}
                  onChange={(e) => setPergunta(e.target.value)}
                  placeholder="Ex.: cobre ou nao cobre pela clausula de terceiros? Justifique."
                />
              </FormField>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">Quem deve analisar</p>
                <div className="grid max-h-40 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                  {equipe.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={escolhidos.includes(u.id)}
                        onChange={() => alternar(u.id)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <span className="truncate">{u.nome}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Button onClick={solicitar} disabled={pedir.isPending} className="w-full justify-center">
                {pedir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
                Pedir parecer
              </Button>
            </div>
          )}

          {carregandoPareceres && <p className="text-sm text-slate-400">Carregando...</p>}
          {!carregandoPareceres && lista.length === 0 && !pedindo && (
            <p className="text-sm text-slate-400">
              Nenhum parecer solicitado. Use <strong>Pedir</strong> para mandar o caso a quem precisa analisar.
            </p>
          )}

          <ul className="space-y-2">
            {lista.map((p) => (
              <ItemParecer key={p.pedido_id} parecer={p} souEu={p.para_id === perfil?.id} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function ItemParecer({
  parecer, souEu,
}: {
  parecer: ReturnType<typeof ordenarPareceres>[number] & {
    pedido_id: string; pergunta: string | null; para: string | null; pedido_por: string;
    pedido_em: string; parecer: string | null; respondido_por: string | null; respondido_em: string | null;
  };
  souEu: boolean;
}) {
  const responder = useResponderParecer();
  const [texto, setTexto] = useState('');
  const sit = situacaoParecer(parecer);

  return (
    <li className={`rounded-lg border p-2.5 ${parecer.respondido ? 'border-slate-200' : 'border-amber-200 bg-amber-50/40'}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium text-slate-800">{parecer.para ?? 'Sem destinatario'}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${sit.cor}`}>{sit.rotulo}</span>
      </div>
      <p className="mt-1 text-xs text-slate-600">{parecer.pergunta}</p>
      <p className="text-[11px] text-slate-400">
        Pedido por {parecer.pedido_por} · {formatDate(parecer.pedido_em)}
      </p>

      {parecer.respondido ? (
        <div className="mt-2 rounded-lg bg-fundo p-2">
          <p className="whitespace-pre-wrap text-sm text-slate-800">{parecer.parecer}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
            <Check className="h-3 w-3" /> {parecer.respondido_por}
            {parecer.respondido_em ? ` · ${formatDate(parecer.respondido_em)}` : ''}
          </p>
        </div>
      ) : souEu ? (
        <div className="mt-2 space-y-1.5">
          <Textarea
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escreva o seu parecer..."
          />
          <Button
            className="w-full justify-center"
            disabled={responder.isPending || !texto.trim()}
            onClick={() =>
              responder.mutate(
                { pedidoId: parecer.pedido_id, mensagem: texto },
                {
                  onSuccess: () => { toast.success('Parecer registrado'); setTexto(''); },
                  onError: (e) => toast.error(e.message),
                },
              )}
          >
            {responder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Dar parecer
          </Button>
        </div>
      ) : (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
          <Clock className="h-3 w-3" /> Aguardando a analise dessa pessoa.
        </p>
      )}
    </li>
  );
}
