'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Save, MapPin, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MoneyInput, Input } from '@/components/ui/field';
import { useAdicionaisDoTipo, useSalvarAdicionalRisco } from '@/hooks/use-adicional-risco';
import { resumoDaGrade, avisoDeReajuste, temAdicional } from '@/lib/adicional-risco';
import { formatCurrency } from '@/lib/utils';
import type { AdicionalRiscoLinha } from '@/lib/database.types';

/**
 * ADICIONAL DE RISCO POR REGIONAL — o painel vive AQUI, na aba Tabela de
 * Precos, e nao em Configuracoes -> Regionais. Dois motivos:
 *  - e a mesma natureza da REGRA DO RASTREADOR (0019), que ja mora neste
 *    painel: uma regra que sobe por cima da matriz inteira de um tipo;
 *  - quem esta decidindo o preco de Moto esta olhando a tabela de Moto. Mandar
 *    a pessoa para o cadastro de unidades e trocar de assunto no meio.
 *
 * A grade e uma linha por REGIONAL, porque o tipo ja esta escolhido na tela.
 */
function Linha({ linha, tipoVeiculoId }: { linha: AdicionalRiscoLinha; tipoVeiculoId: string }) {
  const [valor, setValor] = useState<number | null>(linha.valor);
  const [just, setJust] = useState(linha.justificativa ?? '');
  const salvar = useSalvarAdicionalRisco();

  const sujo = (valor ?? 0) !== (linha.valor ?? 0) || just !== (linha.justificativa ?? '');
  const aviso = sujo ? avisoDeReajuste(linha, valor) : null;

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="px-2 py-2">
        <span className="font-medium text-slate-700">{linha.regional_nome}</span>
        {!linha.regional_ativa && <span className="ml-1 text-xs text-slate-400">(inativa)</span>}
      </td>
      <td className="px-2 py-2">
        <MoneyInput
          value={valor}
          onChange={setValor}
          placeholder="sem adicional"
          className="w-32"
        />
      </td>
      <td className="px-2 py-2">
        <Input
          value={just}
          onChange={(e) => setJust(e.target.value)}
          placeholder="fundamento do risco"
          className="w-full min-w-[12rem]"
        />
      </td>
      <td className="tnum px-2 py-2 text-right text-xs text-slate-500">{linha.veiculos}</td>
      <td className="px-2 py-2">
        <Button
          type="button"
          variant="secondary"
          disabled={!sujo || salvar.isPending}
          onClick={() =>
            salvar.mutate(
              { regionalId: linha.regional_id, tipoVeiculoId, valor, justificativa: just },
              {
                onSuccess: () =>
                  toast.success(
                    valor && valor > 0
                      ? `${linha.regional_nome}: +${formatCurrency(valor)} por mes.`
                      : `${linha.regional_nome} voltou ao preco da matriz.`,
                  ),
                onError: (e) => toast.error(e.message),
              },
            )
          }
        >
          <Save className="h-4 w-4" />
        </Button>
      </td>
      <td className="px-2 py-2 text-xs text-amber-600">{aviso}</td>
    </tr>
  );
}

export function AdicionalRiscoRegional({ tipoVeiculoId }: { tipoVeiculoId: string }) {
  const { data, isLoading } = useAdicionaisDoTipo(tipoVeiculoId);
  const linhas = data ?? [];
  const resumo = resumoDaGrade(linhas);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <MapPin className="h-4 w-4 text-cyan-600" />
          Adicional de risco por regional
        </h4>
        {resumo.comAdicional > 0 && (
          <p className="tnum text-xs text-slate-500">
            {resumo.comAdicional} de {resumo.total} unidades cobram a mais · maior:{' '}
            {formatCurrency(resumo.maior)}
          </p>
        )}
      </div>

      <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Um valor por unidade cobre <strong>todas as faixas FIPE</strong> deste tipo, somado{' '}
          <strong>uma vez</strong> sobre a mensalidade — nao por produto. Campo vazio = preco da
          matriz. <strong>Nao altera adesao nem participacao</strong>, e veiculo que ja esta na base
          mantem o adicional da entrada.
        </span>
      </p>

      {isLoading ? (
        <p className="mt-2 text-sm text-slate-400">Carregando...</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-superficie">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="px-2 py-2">Unidade</th>
                <th className="px-2 py-2">Adicional</th>
                <th className="px-2 py-2">Justificativa</th>
                <th className="px-2 py-2 text-right">Veiculos</th>
                <th className="px-2 py-2" />
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <Linha key={l.regional_id} linha={l} tipoVeiculoId={tipoVeiculoId} />
              ))}
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-2 py-3 text-sm text-slate-400">
                    Nenhuma unidade cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {resumo.veiculosAfetados > 0 && (
        <p className="mt-2 text-xs text-slate-400">
          {resumo.veiculosAfetados} veiculo(s) ja foram precificados por uma unidade com adicional.
          Reajustar aqui vale para <strong>venda nova</strong>; quem ja esta na base mantem o valor
          da entrada.
        </p>
      )}
    </div>
  );
}
