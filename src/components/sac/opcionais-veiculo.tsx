'use client';

// Alterar os OPCIONAIS contratados a parte, direto do SAC: contratar mais ou
// retirar. So aparece o que atende o TIPO do veiculo (moto nao tem parabrisa)
// e o que o plano ja carrega nao e oferecido de novo — regra unica em
// `opcionaisOferecidos` (src/lib/produtos.ts).
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useProdutos, useProdutosPorPlano, useTiposPorProduto, useTiposVeiculo } from '@/hooks/use-precificacao';
import { useMensalidadeCalculada, useSalvarOpcionaisVeiculo, useVeiculoProdutos } from '@/hooks/use-veiculo-ficha';
import { opcionaisOferecidos, regraRastreadorCobra } from '@/lib/produtos';
import { podeSincronizarMensalidade } from '@/lib/planos';
import { formatCurrency } from '@/lib/utils';
import type { VeiculosRow } from '@/lib/database.types';

export function ModalOpcionaisVeiculo({ veiculo, planoNome, onClose }: {
  veiculo: VeiculosRow;
  planoNome: string | null;
  onClose: () => void;
}) {
  const { data: produtos } = useProdutos();
  const { data: tiposPorProduto } = useTiposPorProduto();
  const { data: porPlano } = useProdutosPorPlano();
  const { data: tipos } = useTiposVeiculo();
  const { data: atuais, isLoading } = useVeiculoProdutos(veiculo.id);
  const salvar = useSalvarOpcionaisVeiculo();

  const [marcados, setMarcados] = useState<Set<string> | null>(null);
  useEffect(() => { if (atuais && !marcados) setMarcados(new Set(atuais)); }, [atuais, marcados]);

  const idsDoPlano = useMemo(
    () => (veiculo.plano_protecao_id ? porPlano?.[veiculo.plano_protecao_id] ?? [] : []),
    [porPlano, veiculo.plano_protecao_id],
  );
  const tipo = (tipos ?? []).find((t) => t.id === veiculo.tipo_veiculo_id);
  const oferecidos = useMemo(
    () => opcionaisOferecidos({
      produtos: produtos ?? [],
      tipoVeiculoId: veiculo.tipo_veiculo_id,
      tiposPorProduto,
      idsDoPlano,
      contratados: atuais ?? [],
      regraRastreadorCobra: regraRastreadorCobra(tipo, veiculo.valor_fipe),
    }),
    [produtos, veiculo.tipo_veiculo_id, tiposPorProduto, idsDoPlano, atuais, tipo, veiculo.valor_fipe],
  );

  const novos = useMemo(() => [...(marcados ?? [])], [marcados]);
  const antes = useMensalidadeCalculada({
    fipe: veiculo.valor_fipe, tipoVeiculoId: veiculo.tipo_veiculo_id,
    planoId: veiculo.plano_protecao_id, avulsos: atuais ?? [], ativo: !!atuais,
  });
  const depois = useMensalidadeCalculada({
    fipe: veiculo.valor_fipe, tipoVeiculoId: veiculo.tipo_veiculo_id,
    planoId: veiculo.plano_protecao_id, avulsos: novos, ativo: !!marcados,
  });

  const gravado = veiculo.valor_mensalidade != null ? Number(veiculo.valor_mensalidade) : null;
  // Atualiza o valor gravado por padrao so quando ele estava em dia com o motor
  // (ou vazio). Valor negociado ou cobrado no sistema anterior nao muda calado.
  const sugereAtualizar = !veiculo.cobranca_externa && podeSincronizarMensalidade(gravado, antes.data ?? null);
  const [atualizarValor, setAtualizarValor] = useState<boolean | null>(null);
  // Sem valor gravado o boleto ja usa o calculado: nao se cria override aqui.
  const atualizar = gravado != null && !veiculo.cobranca_externa && (atualizarValor ?? sugereAtualizar);
  const mudou = !!marcados && !!atuais &&
    (novos.length !== atuais.length || novos.some((id) => !atuais.includes(id)));

  function alternar(id: string) {
    setMarcados((s) => {
      const n = new Set(s ?? []);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function confirmar() {
    if (!marcados || !atuais) return;
    salvar.mutate(
      {
        veiculoId: veiculo.id, atuais, novos,
        valorMensalidade: atualizar && depois.data != null ? depois.data : undefined,
      },
      {
        onSuccess: () => {
          toast.success(atualizar && depois.data != null
            ? `Opcionais atualizados — mensalidade ${formatCurrency(depois.data)}`
            : 'Opcionais atualizados');
          onClose();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  const nomeTipo = tipo?.nome ?? 'sem tipo definido';

  return (
    <Modal open onClose={onClose} title={`Opcionais — ${veiculo.placa}`} tamanho="lg">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Plano: <b>{planoNome ?? 'Sem plano'}</b> · Tipo: <b>{nomeTipo}</b>. Aparecem só os opcionais que atendem
          este tipo de veículo e que o plano ainda não inclui.
        </p>
        {!veiculo.tipo_veiculo_id && (
          <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
            O veículo está sem tipo: defina o tipo no cadastro para os opcionais serem filtrados e calculados.
          </p>
        )}

        {isLoading || !marcados ? (
          <p className="text-sm text-slate-400">Carregando...</p>
        ) : oferecidos.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum opcional disponível para este tipo de veículo.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {oferecidos.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-slate-700">
                    <input
                      type="checkbox" className="h-4 w-4 rounded border-slate-300"
                      checked={marcados.has(p.id)} onChange={() => alternar(p.id)}
                    />
                    {p.nome}
                    {p.foraDoTipo && (
                      <span className="rounded bg-amber-100 px-1.5 py-px text-[10px] uppercase text-amber-800">
                        não atende este tipo — não é cobrado
                      </span>
                    )}
                    {!p.status && (
                      <span className="rounded bg-slate-100 px-1.5 py-px text-[10px] uppercase text-slate-500">fora de venda</span>
                    )}
                  </span>
                  <span className="tnum text-xs text-slate-500">
                    {p.metodo_preco === 'FIXO' && p.valor_fixo != null ? formatCurrency(Number(p.valor_fixo)) : 'por faixa'}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="text-slate-600">
            Mensalidade calculada:{' '}
            <b className="tnum">{depois.isFetching ? '...' : depois.data != null ? formatCurrency(depois.data) : '—'}</b>
            {antes.data != null && depois.data != null && antes.data !== depois.data && (
              <span className="text-xs text-slate-500"> (era {formatCurrency(antes.data)})</span>
            )}
          </p>
          <p className="text-xs text-slate-500">
            Valor gravado no cadastro: {gravado != null ? formatCurrency(gravado) : 'nenhum (cobra o calculado)'}
          </p>
          {veiculo.cobranca_externa ? (
            <p className="mt-1 text-xs text-amber-800">
              A mensalidade deste veículo é cobrada no sistema anterior (Mutual): ajuste o valor la também.
            </p>
          ) : gravado != null && (
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={atualizar} onChange={(e) => setAtualizarValor(e.target.checked)} />
              Atualizar o valor gravado para o calculado
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
          <Button onClick={confirmar} disabled={!mudou || salvar.isPending}>
            {salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar opcionais
          </Button>
        </div>
      </div>
    </Modal>
  );
}
