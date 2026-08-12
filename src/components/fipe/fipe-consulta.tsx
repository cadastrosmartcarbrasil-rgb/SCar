'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Select } from '@/components/ui/field';
import { useFipeMarcas, useFipeModelos, useFipeAnos, useFipeValor } from '@/hooks/use-fipe';
import { FIPE_TIPOS, type FipeTipo, type FipeValor } from '@/lib/fipe';
import { formatCurrency } from '@/lib/utils';

export interface FipeSelecao {
  tipo: FipeTipo;
  marcaNome: string;
  modeloNome: string;
  valor: FipeValor;
}

// Consulta em cascata da Tabela FIPE. Ao escolher o ano, dispara onSelecionar
// com o valor e os nomes resolvidos (para preencher o formulario do veiculo).
export function FipeConsulta({
  tipoInicial = 'carros',
  onSelecionar,
}: {
  tipoInicial?: FipeTipo;
  onSelecionar?: (sel: FipeSelecao) => void;
}) {
  const [tipo, setTipo] = useState<FipeTipo>(tipoInicial);
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [ano, setAno] = useState('');

  const marcas = useFipeMarcas(tipo);
  const modelos = useFipeModelos(tipo, marca || undefined);
  const anos = useFipeAnos(tipo, marca || undefined, modelo || undefined);
  const valor = useFipeValor(tipo, marca || undefined, modelo || undefined, ano || undefined);

  const naoConfigurado = marcas.data && marcas.data.configured === false;

  const marcaNome = useMemo(() => marcas.data?.itens.find((i) => i.cod === marca)?.nome ?? '', [marcas.data, marca]);
  const modeloNome = useMemo(() => modelos.data?.itens.find((i) => i.cod === modelo)?.nome ?? '', [modelos.data, modelo]);

  // Reset em cascata quando um nivel acima muda.
  useEffect(() => { setMarca(''); setModelo(''); setAno(''); }, [tipo]);
  useEffect(() => { setModelo(''); setAno(''); }, [marca]);
  useEffect(() => { setAno(''); }, [modelo]);

  // Emite a selecao quando o valor chega.
  useEffect(() => {
    if (ano && valor.data?.valor && onSelecionar) {
      onSelecionar({ tipo, marcaNome, modeloNome, valor: valor.data.valor });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor.data, ano]);

  if (naoConfigurado) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        Consulta FIPE nao configurada. Defina <code>FIPE_API_TOKEN</code> no servidor para habilitar
        o preenchimento automatico. Por enquanto, informe os dados manualmente.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
        <Search className="h-4 w-4" /> Consulta Tabela FIPE
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div>
          <label className="text-xs text-slate-500">Tipo</label>
          <Select value={tipo} onChange={(e) => setTipo(e.target.value as FipeTipo)} className="mt-0.5">
            {FIPE_TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </div>

        <div>
          <label className="text-xs text-slate-500">Marca {marcas.isFetching && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}</label>
          <Select value={marca} onChange={(e) => setMarca(e.target.value)} className="mt-0.5" disabled={!marcas.data?.itens.length}>
            <option value="">-- Marca --</option>
            {(marcas.data?.itens ?? []).map((i) => <option key={i.cod} value={i.cod}>{i.nome}</option>)}
          </Select>
        </div>

        <div>
          <label className="text-xs text-slate-500">Modelo {modelos.isFetching && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}</label>
          <Select value={modelo} onChange={(e) => setModelo(e.target.value)} className="mt-0.5" disabled={!marca || !modelos.data?.itens.length}>
            <option value="">-- Modelo --</option>
            {(modelos.data?.itens ?? []).map((i) => <option key={i.cod} value={i.cod}>{i.nome}</option>)}
          </Select>
        </div>

        <div>
          <label className="text-xs text-slate-500">Ano {anos.isFetching && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}</label>
          <Select value={ano} onChange={(e) => setAno(e.target.value)} className="mt-0.5" disabled={!modelo || !anos.data?.itens.length}>
            <option value="">-- Ano --</option>
            {(anos.data?.itens ?? []).map((i) => <option key={i.cod} value={i.cod}>{i.nome}</option>)}
          </Select>
        </div>
      </div>

      {ano && (
        <div className="text-sm">
          {valor.isFetching ? (
            <span className="text-slate-400"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Consultando valor...</span>
          ) : valor.data?.valor?.valor != null ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
              <span className="text-base font-semibold">{formatCurrency(valor.data.valor.valor)}</span>
              {valor.data.valor.codigoFipe && <span className="text-xs">Cod. FIPE: {valor.data.valor.codigoFipe}</span>}
              {valor.data.valor.referencia && <span className="text-xs">Ref.: {valor.data.valor.referencia}</span>}
            </div>
          ) : valor.isError ? (
            <span className="text-rose-500">Nao foi possivel obter o valor.</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
