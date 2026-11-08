'use client';

// TIRAR UM VEICULO DE UM BOLETO (0193) — em Boletos e 2a via. O boleto que
// cobra varios veiculos (o agrupado do Mutual, pelo contrato, ou o agrupado do
// SCar, pelos itens da fatura) vira um boleto NOVO sem o veiculo escolhido; so
// depois de o banco aceitar o novo o antigo recebe baixa (mesma maquina da 2a
// via, 0121). A conta mostrada e a do banco (`veiculos_do_boleto`).
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, MinusCircle, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input, MoneyInput } from '@/components/ui/field';
import { useTirarVeiculoDoBoleto, useVeiculosDoBoleto } from '@/hooks/use-renegociacao';
import { contaTirarVeiculo, MOTIVO_CANCELAMENTO_MINIMO } from '@/lib/renegociacao';
import { identificacaoVeiculo } from '@/lib/placa';
import { hojeSaoPaulo } from '@/lib/permissoes';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { TituloCliente } from '@/lib/database.types';

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function ModalTirarVeiculo({ boleto, onClose }: { boleto: TituloCliente; onClose: () => void }) {
  const origem = boleto.origem === 'MUTUAL' ? 'MUTUAL' : 'SCAR';
  const veiculos = useVeiculosDoBoleto(origem, boleto.id);
  const tirar = useTirarVeiculoDoBoleto();
  const hoje = hojeSaoPaulo();
  const [veiculoId, setVeiculoId] = useState<string | null>(null);
  const [parte, setParte] = useState<number | null>(null);
  const [vencimento, setVencimento] = useState(
    boleto.data_vencimento > somarDias(hoje, 2) ? boleto.data_vencimento : somarDias(hoje, 2),
  );
  const [motivo, setMotivo] = useState('');

  const lista = veiculos.data ?? [];
  const escolhido = lista.find((v) => v.veiculo_id === veiculoId);
  // ao escolher o veiculo, a parte sugerida pelo banco entra no campo (editavel)
  useEffect(() => { setParte(escolhido ? Number(escolhido.valor_veiculo) : null); }, [veiculoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const conta = contaTirarVeiculo(
    lista.map((v) => ({ ...v, mensalidade: Number(v.mensalidade), valor_veiculo: Number(v.valor_veiculo),
      valor_boleto: Number(v.valor_boleto), soma_pesos: Number(v.soma_pesos) })),
    veiculoId, parte,
  );
  const motivoCurto = motivo.trim().length < MOTIVO_CANCELAMENTO_MINIMO;
  const doContrato = lista[0]?.fonte === 'CONTRATO';
  const doAssociado = lista[0]?.fonte === 'ASSOCIADO';

  function confirmar() {
    if (!veiculoId) return;
    tirar.mutate({
      origem, id: boleto.id, veiculo_id: veiculoId,
      valor_veiculo: parte, vencimento, motivo: motivo.trim(),
    }, {
      onSuccess: (r) => {
        if (r.erros_baixa > 0) {
          toast.warning('Boleto novo emitido. O antigo ainda não recebeu baixa no banco — use "Tentar a baixa de novo" no cartão da negociação.');
        } else {
          toast.success(`Boleto novo de ${formatCurrency(conta.novo)} emitido; o antigo recebeu baixa.`);
        }
        onClose();
      },
    });
  }

  return (
    <Modal open onClose={onClose} title="Tirar um veículo deste boleto" tamanho="lg">
      <div className="space-y-3 text-sm text-slate-600">
        <p>
          Boleto de <b className="tnum">{formatCurrency(Number(boleto.valor))}</b>, vence {formatDate(boleto.data_vencimento)}
          {boleto.origem === 'MUTUAL' && <span className="ml-1 rounded bg-brand-50 px-1.5 text-[0.6875rem] text-brand-600">Mutual</span>}.
          Escolha o veículo que sai: sai um <b>boleto novo sem ele</b> e o antigo recebe baixa no banco.
        </p>

        {veiculos.isLoading && <p className="text-xs text-slate-400">Carregando os veículos do boleto...</p>}
        {veiculos.error && <p className="text-xs text-rose-600">{(veiculos.error as Error).message}</p>}
        {!veiculos.isLoading && lista.length > 0 && (
          <div className="rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-superficie-alta text-left text-slate-500">
                <tr>
                  <th className="px-3 py-1.5" />
                  <th className="px-3 py-1.5">Veículo</th>
                  <th className="px-3 py-1.5 text-right">Mensalidade</th>
                  <th className="px-3 py-1.5 text-right">Parte no boleto</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((v) => (
                  <tr key={v.veiculo_id} className="cursor-pointer border-t border-slate-100" onClick={() => setVeiculoId(v.veiculo_id)}>
                    <td className="px-3 py-1.5">
                      <input type="radio" name="veiculo-sai" checked={veiculoId === v.veiculo_id}
                        onChange={() => setVeiculoId(v.veiculo_id)} aria-label="Veículo que sai" />
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="placa font-medium text-slate-800">{identificacaoVeiculo(v.placa, v.chassi)}</span>
                      {v.modelo ? ` · ${v.modelo}` : ''}
                      {!v.na_base && <span className="ml-1 rounded bg-slate-100 px-1.5 text-[0.6875rem] text-slate-500">{v.status}</span>}
                    </td>
                    <td className="tnum px-3 py-1.5 text-right">{formatCurrency(Number(v.mensalidade))}</td>
                    <td className="tnum px-3 py-1.5 text-right">{formatCurrency(Number(v.valor_veiculo))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {lista.length > 0 && !conta.bate && (
          <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            A soma das mensalidades ({formatCurrency(Number(lista[0].soma_pesos))}) não bate com o valor do boleto
            ({formatCurrency(Number(lista[0].valor_boleto))}). A parte de cada veículo foi calculada na proporção —
            confira no {boleto.origem === 'MUTUAL' ? 'Mutual' : 'cadastro'} e corrija o valor abaixo se precisar.
          </p>
        )}
        {doAssociado && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Não foi possível ler o contrato do Mutual: a lista mostra os veículos do associado na base. Confira quais estão neste boleto.
          </p>
        )}
        {doContrato && (
          <p className="text-xs text-slate-500">Os veículos vieram do contrato do Mutual deste boleto.</p>
        )}

        {veiculoId && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Valor que sai do boleto</span>
              <MoneyInput value={parte} onChange={setParte} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Vencimento do boleto novo</span>
              <Input type="date" min={hoje} value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </label>
          </div>
        )}
        {veiculoId && !conta.erro && (
          <p className="rounded-lg bg-cyan-50 px-3 py-2 text-xs text-cyan-800">
            <span className="tnum line-through">{formatCurrency(Number(boleto.valor))}</span>{' → '}
            boleto novo de <b className="tnum">{formatCurrency(conta.novo)}</b>, vencendo {formatDate(vencimento)}.
          </p>
        )}

        <label className="block">
          <span className="text-xs font-medium text-slate-600">Motivo *</span>
          <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: vendeu a moto; veículo cancelado em 05/11"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>

        {boleto.origem === 'MUTUAL' && (
          <p className="text-xs text-slate-500">
            Lembre de cancelar o veículo também no Mutual, senão ele volta a ser cobrado no próximo boleto de lá.
          </p>
        )}
        {veiculoId && conta.erro && <p className="text-xs text-rose-600">{conta.erro}</p>}
        {lista.length > 0 && lista.length < 2 && !veiculoId && <p className="text-xs text-rose-600">{conta.erro}</p>}
        {tirar.error && <p className="text-xs text-rose-600">{tirar.error.message}</p>}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
          <Button type="button" disabled={!veiculoId || !!conta.erro || motivoCurto || !vencimento || vencimento < hoje || tirar.isPending}
            onClick={confirmar}>
            {tirar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MinusCircle className="h-4 w-4" />}
            Emitir boleto sem este veículo
          </Button>
        </div>
      </div>
    </Modal>
  );
}
