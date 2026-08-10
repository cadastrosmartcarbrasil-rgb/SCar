'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Calculator, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select } from '@/components/ui/field';
import { useTiposVeiculo, useProdutos, useSimularPreco, type ResultadoSimulacao } from '@/hooks/use-precificacao';
import { formatCurrency } from '@/lib/utils';

export default function PrecificacaoPage() {
  const { data: tipos } = useTiposVeiculo();
  const { data: produtos } = useProdutos();
  const simular = useSimularPreco();

  const [tipoVeiculoId, setTipoVeiculoId] = useState('');
  const [fipe, setFipe] = useState<number | ''>('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [resultado, setResultado] = useState<ResultadoSimulacao | null>(null);

  const opcionais = useMemo(() => (produtos ?? []).filter((p) => !p.obrigatorio && p.status), [produtos]);
  const obrigatorios = useMemo(() => (produtos ?? []).filter((p) => p.obrigatorio && p.status), [produtos]);

  function toggle(id: string) {
    setSelecionados((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function calcular() {
    if (!tipoVeiculoId) return toast.error('Selecione o tipo de veiculo');
    if (fipe === '' || Number(fipe) <= 0) return toast.error('Informe o valor FIPE');
    simular.mutate(
      { fipe: Number(fipe), tipoVeiculoId, produtosIds: [...selecionados] },
      {
        onSuccess: (r) => setResultado(r),
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Simulador de Precificacao</h1>
        <p className="text-sm text-slate-500">
          Calcula a mensalidade pela matriz de risco (FIPE x tipo de veiculo), conforme a tabela SmartCar.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Entrada */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-4 w-4" /> Parametros
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Tipo de veiculo">
                <Select value={tipoVeiculoId} onChange={(e) => setTipoVeiculoId(e.target.value)}>
                  <option value="">-- Selecione --</option>
                  {(tipos ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Valor FIPE (R$)">
                <Input
                  type="number"
                  step="0.01"
                  value={fipe}
                  onChange={(e) => setFipe(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Ex.: 62000"
                />
              </FormField>
            </div>

            <div>
              <p className="mb-1 text-sm font-medium text-slate-600">Itens base (obrigatorios)</p>
              <div className="flex flex-wrap gap-1.5">
                {obrigatorios.map((p) => (
                  <span key={p.id} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {p.nome}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-sm font-medium text-slate-600">Adicionais (opcionais)</p>
              <div className="space-y-1">
                {opcionais.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={selecionados.has(p.id)}
                      onChange={() => toggle(p.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    {p.nome}
                    {p.valor_fixo != null && <span className="text-xs text-slate-400">({formatCurrency(p.valor_fixo)})</span>}
                  </label>
                ))}
                {opcionais.length === 0 && <p className="text-xs text-slate-400">Nenhum adicional cadastrado.</p>}
              </div>
            </div>

            <Button onClick={calcular} disabled={simular.isPending} className="w-full">
              {simular.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
              Calcular mensalidade
            </Button>
          </CardContent>
        </Card>

        {/* Resultado */}
        <Card>
          <CardHeader>
            <CardTitle>Resultado</CardTitle>
          </CardHeader>
          <CardContent>
            {!resultado ? (
              <p className="text-sm text-slate-400">Preencha os parametros e clique em calcular.</p>
            ) : (
              <div className="space-y-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                      <th className="py-1.5">Produto</th>
                      <th className="py-1.5">Fornecedor</th>
                      <th className="py-1.5 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.calculo.detalhamento_produtos.map((i) => (
                      <tr key={i.produto_id} className="border-b border-slate-50">
                        <td className="py-1.5">
                          {i.nome}
                          {!i.obrigatorio && <span className="ml-1 text-xs text-brand-500">(add)</span>}
                        </td>
                        <td className="py-1.5 text-slate-500">{i.fornecedor}</td>
                        <td className="py-1.5 text-right font-medium">{formatCurrency(i.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
                  <Linha label="Subtotal Taxa Administrativa" valor={resultado.calculo.subtotal_taxa_admin} />
                  <Linha label="Subtotal Beneficios (parceiros)" valor={resultado.calculo.subtotal_beneficios_parceiros} />
                  <div className="my-1 border-t border-slate-200" />
                  <div className="flex items-center justify-between text-base font-semibold text-brand-700">
                    <span>Mensalidade total</span>
                    <span>{formatCurrency(resultado.calculo.valor_total_mensalidade)}</span>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Participacao (franquia) em caso de evento:{' '}
                  <strong>{formatCurrency(resultado.participacao)}</strong>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Linha({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="flex items-center justify-between text-slate-600">
      <span>{label}</span>
      <span>{formatCurrency(valor)}</span>
    </div>
  );
}
