'use client';

/**
 * DESCONTO NA MENSALIDADE DO VEICULO DA BASE (0179). O desconto fica no
 * cadastro do veiculo e vale para os PROXIMOS boletos (e para as faturas ainda
 * sem boleto). Pedido de quem atende, aprovado pela diretoria; quem tem a
 * alcada "Desconto" grava direto. Retirar nao precisa de aprovacao.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { BadgePercent, History, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField, Input, MoneyInput, PercentInput } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { usePode } from '@/hooks/use-permissoes';
import {
  useDescontoVeiculo, useRemoverDescontoVeiculo, useSolicitarDescontoVeiculo, type PedidoDescontoVeiculo,
} from '@/hooks/use-descontos';
import { calcularDescontoMensalidade, textoValidade, type TipoDesconto } from '@/lib/desconto-mensalidade';
import { formatCurrency, formatDate } from '@/lib/utils';

const ROTULO_PEDIDO: Record<PedidoDescontoVeiculo['situacao'], string> = {
  PENDENTE: 'Aguardando a diretoria',
  APROVADO: 'Aprovado',
  RECUSADO: 'Recusado',
  CANCELADO: 'Substituído',
  REMOVIDO: 'Desconto retirado',
};

const pct = (v: number) => `${Number(v).toFixed(2).replace('.', ',')}%`;

export function DescontoVeiculo({ veiculoId }: { veiculoId: string }) {
  const { data, isLoading, error } = useDescontoVeiculo(veiculoId);
  const aprova = usePode('desconto');
  const [pedindo, setPedindo] = useState(false);
  const [retirando, setRetirando] = useState(false);
  const [historico, setHistorico] = useState(false);

  if (isLoading) return <p className="text-sm text-slate-500">Carregando desconto...</p>;
  if (error) return <p className="text-sm text-rose-600">Desconto: {(error as Error).message}</p>;
  if (!data) return null;
  const { atual, pedidos } = data;
  const pendente = pedidos.find((p) => p.situacao === 'PENDENTE');
  const ultimoRecusado = pedidos[0]?.situacao === 'RECUSADO' ? pedidos[0] : null;
  const hoje = new Date().toISOString().slice(0, 10);
  const vencido = atual.desconto > 0 && atual.validoAte != null && atual.validoAte < hoje;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <BadgePercent className="h-4 w-4 text-cyan-600" /> Desconto na mensalidade
        </p>
        <div className="flex flex-wrap gap-1.5">
          {pedidos.length > 0 && (
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setHistorico((h) => !h)}>
              <History className="h-3.5 w-3.5" /> Histórico
            </Button>
          )}
          {atual.desconto > 0 && (
            <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => setRetirando(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Retirar
            </Button>
          )}
          <Button className="px-2.5 py-1 text-xs" onClick={() => setPedindo(true)}>
            {atual.desconto > 0 || pendente ? 'Alterar desconto' : aprova ? 'Dar desconto' : 'Pedir desconto'}
          </Button>
        </div>
      </div>

      {atual.desconto > 0 ? (
        <p className="text-sm text-slate-600">
          <b className="tnum">− {formatCurrency(atual.desconto)}/mês</b>
          {atual.mensalidade > 0 && <> · {pct((atual.desconto * 100) / atual.mensalidade)}</>}
          {' '}· {textoValidade(atual.validoAte)}
          {vencido && <span className="ml-1 font-medium text-amber-700">(prazo encerrado — os próximos boletos saem cheios)</span>}
          {atual.mensalidade > 0 && (
            <span className="block text-xs text-slate-500">
              Mensalidade {formatCurrency(atual.mensalidade)} → boleto de {formatCurrency(Math.max(0, atual.mensalidade - atual.desconto))}
            </span>
          )}
        </p>
      ) : (
        <p className="text-sm text-slate-500">Sem desconto. Os boletos saem pelo valor da mensalidade.</p>
      )}

      {pendente && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Pedido de <b>{formatCurrency(pendente.desconto)}/mês</b> ({pct(pendente.percentual)}, {textoValidade(pendente.valido_ate)})
          aguardando a diretoria — feito por {pendente.solicitado_por ?? '—'} em {formatDate(pendente.solicitado_em)}.
          Até a aprovação os boletos seguem como estão.
        </p>
      )}
      {!pendente && ultimoRecusado && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          Último pedido recusado pela diretoria{ultimoRecusado.decisao_motivo ? `: ${ultimoRecusado.decisao_motivo}` : ''}.
        </p>
      )}
      {atual.cobrancaExterna && (
        <p className="text-xs text-slate-500">
          Este veículo ainda é cobrado pelo sistema anterior: o desconto vale para os boletos emitidos pelo SCar
          (depois da virada da cobrança da unidade). Até lá, conceda também no sistema anterior.
        </p>
      )}

      {historico && (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 text-xs">
          {pedidos.map((p) => (
            <li key={p.id} className="px-3 py-2 text-slate-600">
              <span className="font-medium text-slate-800">{ROTULO_PEDIDO[p.situacao]}</span>
              {p.tipo !== 'REMOCAO' && <> · {formatCurrency(p.desconto)}/mês ({pct(p.percentual)}) · {textoValidade(p.valido_ate)}</>}
              <span className="block text-slate-500">
                {p.solicitado_por ?? '—'} em {formatDate(p.solicitado_em)}
                {p.justificativa ? ` — ${p.justificativa}` : ''}
                {p.decidido_por && p.situacao !== 'REMOVIDO' ? ` · decidido por ${p.decidido_por}` : ''}
                {p.decisao_motivo ? ` (${p.decisao_motivo})` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      {pedindo && (
        <ModalPedirDesconto veiculoId={veiculoId} mensalidade={atual.mensalidade} limite={atual.limite}
          aprova={aprova} onClose={() => setPedindo(false)} />
      )}
      {retirando && <ModalRetirarDesconto veiculoId={veiculoId} onClose={() => setRetirando(false)} />}
    </div>
  );
}

function ModalPedirDesconto({ veiculoId, mensalidade, limite, aprova, onClose }: {
  veiculoId: string; mensalidade: number; limite: number; aprova: boolean; onClose: () => void;
}) {
  const solicitar = useSolicitarDescontoVeiculo();
  const [tipo, setTipo] = useState<TipoDesconto>('PERCENTUAL');
  const [valor, setValor] = useState<number | null>(null);
  const [validoAte, setValidoAte] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const previa = calcularDescontoMensalidade(mensalidade, tipo, valor, limite);
  const podeSalvar = previa.desconto > 0 && !previa.acimaDoLimite && justificativa.trim().length >= 3 && mensalidade > 0;

  async function salvar() {
    try {
      const p = await solicitar.mutateAsync({
        veiculoId, tipo, valor: Number(valor), validoAte: validoAte || null, justificativa: justificativa.trim(),
      });
      toast.success(p.situacao === 'APROVADO'
        ? 'Desconto aplicado: vale para os próximos boletos'
        : 'Pedido enviado para a aprovação da diretoria');
      onClose();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <Modal open onClose={onClose} title={aprova ? 'Desconto na mensalidade' : 'Pedir desconto na mensalidade'}
      subtitulo="Fica no cadastro do veículo e vale para os próximos boletos">
      <div className="space-y-3">
        {mensalidade <= 0 && (
          <p className="text-sm text-rose-600">O veículo não tem mensalidade definida — ajuste o cadastro antes.</p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <FormField label="Tipo">
            <div className="flex gap-1">
              {(['PERCENTUAL', 'VALOR'] as const).map((t) => (
                <button key={t} type="button" onClick={() => { setTipo(t); setValor(null); }}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${tipo === t
                    ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                  {t === 'PERCENTUAL' ? '%' : 'R$ por mês'}
                </button>
              ))}
            </div>
          </FormField>
          <FormField label={tipo === 'PERCENTUAL' ? 'Desconto (%)' : 'Desconto (R$/mês)'}>
            <div className="w-36">
              {tipo === 'PERCENTUAL'
                ? <PercentInput value={valor} onChange={setValor} max={100} />
                : <MoneyInput value={valor} onChange={setValor} />}
            </div>
          </FormField>
          <FormField label="Válido até (vencimento)">
            <Input type="date" value={validoAte} onChange={(e) => setValidoAte(e.target.value)} className="w-44" />
          </FormField>
        </div>
        <p className="text-xs text-slate-500">
          Limite da unidade: <b>{pct(limite)}</b>. Sem data, o desconto vale até ser retirado.
        </p>
        <FormField label={aprova ? 'Justificativa' : 'Justificativa (vai para a diretoria)'}>
          <Input value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
            placeholder="Ex.: retenção, associado com 3 veículos" />
        </FormField>
        <p className="text-sm text-slate-600">
          Mensalidade <span className="tnum">{formatCurrency(mensalidade)}</span> → boleto de{' '}
          <b className="tnum">{formatCurrency(previa.mensalidadeFinal)}</b>
          {previa.desconto > 0 && <span className="text-xs text-slate-500"> (− {formatCurrency(previa.desconto)} · {pct(previa.percentual)})</span>}
        </p>
        {previa.acimaDoLimite && previa.desconto > 0 && (
          <p className="text-xs font-medium text-rose-700">Acima do limite da unidade — reduza o desconto.</p>
        )}
        {!aprova && (
          <p className="text-xs text-slate-500">
            O desconto só entra nos boletos depois de aprovado pela diretoria (menu “Descontos para aprovar”).
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Voltar</Button>
          <Button disabled={!podeSalvar || solicitar.isPending} onClick={salvar}>
            {solicitar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {aprova ? 'Aplicar desconto' : 'Enviar para aprovação'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ModalRetirarDesconto({ veiculoId, onClose }: { veiculoId: string; onClose: () => void }) {
  const remover = useRemoverDescontoVeiculo();
  const [motivo, setMotivo] = useState('');
  async function salvar() {
    try {
      await remover.mutateAsync({ veiculoId, motivo: motivo.trim() });
      toast.success('Desconto retirado: os próximos boletos saem pelo valor cheio');
      onClose();
    } catch (e) { toast.error((e as Error).message); }
  }
  return (
    <Modal open onClose={onClose} title="Retirar o desconto">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Os próximos boletos (e as faturas ainda sem boleto) saem pelo valor cheio. Boleto já emitido não muda.
        </p>
        <FormField label="Motivo">
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: fim da campanha" />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Voltar</Button>
          <Button variant="danger" disabled={motivo.trim().length < 3 || remover.isPending} onClick={salvar}>
            Retirar desconto
          </Button>
        </div>
      </div>
    </Modal>
  );
}
