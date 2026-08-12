'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Car, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select } from '@/components/ui/field';
import { useAssociados } from '@/hooks/use-associados';
import { useRegionais, useVendedores, useUsuarios, useMarcas, useModelos } from '@/hooks/use-config';
import { useTiposVeiculo } from '@/hooks/use-precificacao';
import { useVeiculos, useSaveVeiculo, useExcluirVeiculo } from '@/hooks/use-veiculos';
import { consultarPlaca, normalizarPlaca, placaValida } from '@/lib/placa';
import { formatCurrency } from '@/lib/utils';
import type {
  VeiculosRow,
  StatusVeiculo,
  TipoNegociacao,
  TipoCambio,
  Combustivel,
} from '@/lib/database.types';

const NEGOCIACOES: { v: TipoNegociacao; l: string }[] = [
  { v: 'venda', l: 'Venda' },
  { v: 'substituicao', l: 'Substituicao' },
  { v: 'reativacao', l: 'Reativacao' },
  { v: 'troca_titularidade', l: 'Troca de Titularidade' },
  { v: 'renovacao', l: 'Renovacao' },
];
const CAMBIOS: { v: TipoCambio; l: string }[] = [
  { v: 'manual', l: 'Manual' },
  { v: 'automatico', l: 'Automatico' },
  { v: 'automatizado', l: 'Automatizado' },
];
const COMBUSTIVEIS: { v: Combustivel; l: string }[] = [
  { v: 'gasolina', l: 'Gasolina' },
  { v: 'flex', l: 'Flex' },
  { v: 'diesel', l: 'Diesel' },
  { v: 'alcool', l: 'Alcool' },
  { v: 'eletrico', l: 'Eletrico (Bateria)' },
];
const STATUS: { v: StatusVeiculo; l: string; cor: string }[] = [
  { v: 'ativo', l: 'Ativo', cor: 'bg-emerald-50 text-emerald-700' },
  { v: 'inativo', l: 'Inativo', cor: 'bg-slate-100 text-slate-600' },
  { v: 'suspenso', l: 'Suspenso', cor: 'bg-amber-50 text-amber-700' },
  { v: 'excluido', l: 'Excluido', cor: 'bg-rose-50 text-rose-700' },
  { v: 'baixado', l: 'Baixado', cor: 'bg-slate-100 text-slate-500' },
];
const statusMeta = (s: StatusVeiculo) => STATUS.find((x) => x.v === s) ?? STATUS[0];

const anoAtual = 2026;

export default function VeiculosPage() {
  const { data: veiculos, isLoading } = useVeiculos();
  const { data: associados } = useAssociados();
  const { data: regionais } = useRegionais();
  const { data: vendedores } = useVendedores();
  const { data: usuarios } = useUsuarios();
  const { data: marcas } = useMarcas();
  const { data: tiposVeiculo } = useTiposVeiculo();
  const salvar = useSaveVeiculo();
  const excluir = useExcluirVeiculo();

  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState<Partial<VeiculosRow>>({});
  const [consultando, setConsultando] = useState(false);

  const nomeUsuario = useMemo(() => new Map((usuarios ?? []).map((u) => [u.id, u.nome])), [usuarios]);
  const nomeAssociado = useMemo(
    () => new Map((associados ?? []).map((a) => [a.id, a.nome_razao_social])),
    [associados],
  );

  // modelos sugeridos para a marca digitada (busca sob demanda pela marca)
  const marcaSelecionada = useMemo(
    () => (marcas ?? []).find((m) => m.nome.toLowerCase() === (form.marca ?? '').toLowerCase()),
    [marcas, form.marca],
  );
  const { data: modelosDaMarca = [] } = useModelos(marcaSelecionada?.id);

  const filtrados = useMemo(() => {
    const t = busca.toLowerCase();
    return (veiculos ?? []).filter(
      (v) =>
        (v.placa ?? '').toLowerCase().includes(t) ||
        (v.marca ?? '').toLowerCase().includes(t) ||
        (v.modelo ?? '').toLowerCase().includes(t) ||
        (v.clientes?.nome_razao_social ?? '').toLowerCase().includes(t),
    );
  }, [veiculos, busca]);

  function novo() {
    setForm({ status: 'ativo', uso: 'passeio', data_contrato: undefined });
    setAberto(true);
  }

  async function consultar() {
    const p = normalizarPlaca(form.placa ?? '');
    if (!placaValida(p)) return toast.error('Placa invalida');
    setConsultando(true);
    const r = await consultarPlaca(p);
    setConsultando(false);
    if (!r.found) {
      toast.message('Consulta indisponivel - preencha os dados manualmente.');
      return;
    }
    setForm((f) => ({
      ...f,
      marca: r.marca ?? f.marca,
      modelo: r.modelo ?? f.modelo,
      ano_fabricacao: r.ano_fabricacao ?? f.ano_fabricacao,
      ano_modelo: r.ano_modelo ?? f.ano_modelo,
      cor: r.cor ?? f.cor,
      chassi: r.chassi ?? f.chassi,
    }));
    toast.success('Dados da placa preenchidos');
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.cliente_id) return toast.error('Selecione o associado');
    if (!placaValida(form.placa ?? '')) return toast.error('Placa invalida');
    salvar.mutate(form, {
      onSuccess: () => {
        toast.success('Veiculo salvo');
        setAberto(false);
      },
      onError: (err) => {
        const m = (err as Error).message;
        toast.error(m.includes('placa') ? 'Placa ja cadastrada' : m);
      },
    });
  }

  const setF = (patch: Partial<VeiculosRow>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Veiculos / Contratos</h1>
          <p className="text-sm text-slate-500">Frota protegida, vinculada aos associados.</p>
        </div>
        <Button onClick={novo}>
          <Plus className="h-4 w-4" /> Novo Veiculo
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por placa, marca, modelo ou associado"
          className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Placa</th>
              <th className="px-4 py-2">Veiculo</th>
              <th className="px-4 py-2">Associado</th>
              <th className="px-4 py-2">FIPE</th>
              <th className="px-4 py-2">Situacao</th>
              <th className="px-4 py-2 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Carregando...
                </td>
              </tr>
            )}
            {filtrados.map((v) => {
              const meta = statusMeta(v.status);
              return (
                <tr key={v.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2 font-mono font-medium text-slate-800">{v.placa}</td>
                  <td className="px-4 py-2 text-slate-600">
                    <span className="inline-flex items-center gap-2">
                      <Car className="h-4 w-4 text-brand-500" />
                      {[v.marca, v.modelo].filter(Boolean).join(' ') || '-'}
                      {v.ano_modelo ? ` ${v.ano_fabricacao ?? ''}/${v.ano_modelo}` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {v.clientes?.nome_razao_social ?? nomeAssociado.get(v.cliente_id) ?? '-'}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{v.valor_fipe ? formatCurrency(v.valor_fipe) : '-'}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${meta.cor}`}>{meta.l}</span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => {
                          setForm(v);
                          setAberto(true);
                        }}
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Excluir o veiculo ${v.placa}?`))
                            excluir.mutate(v.id, { onError: (e) => toast.error((e as Error).message) });
                        }}
                        className="rounded p-1.5 text-rose-500 hover:bg-rose-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!isLoading && filtrados.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Nenhum veiculo cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={aberto} onClose={() => setAberto(false)} title={form.id ? `Editar ${form.placa}` : 'Novo Veiculo (Contrato)'}>
        <datalist id="dl-marcas">
          {(marcas ?? []).map((m) => (
            <option key={m.id} value={m.nome} />
          ))}
        </datalist>
        <datalist id="dl-modelos">
          {modelosDaMarca.map((mo) => (
            <option key={mo.id} value={mo.nome} />
          ))}
        </datalist>

        <form onSubmit={submit} className="space-y-4">
          <FormField label="Associado *">
            <Select value={form.cliente_id ?? ''} onChange={(e) => setF({ cliente_id: e.target.value })}>
              <option value="">-- Selecione o associado --</option>
              {(associados ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.matricula ? `${a.matricula} - ` : ''}
                  {a.nome_razao_social}
                </option>
              ))}
            </Select>
          </FormField>

          {/* Placa + consulta */}
          <FormField label="Placa *">
            <div className="flex gap-2">
              <Input
                value={form.placa ?? ''}
                onChange={(e) => setF({ placa: normalizarPlaca(e.target.value) })}
                placeholder="ABC1D23"
                className="mt-0 font-mono uppercase"
              />
              <Button type="button" variant="secondary" onClick={consultar} disabled={consultando} className="shrink-0">
                {consultando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Consultar
              </Button>
            </div>
          </FormField>

          {/* Marca / Modelo */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Marca">
              <Input list="dl-marcas" value={form.marca ?? ''} onChange={(e) => setF({ marca: e.target.value })} />
            </FormField>
            <FormField label="Modelo">
              <Input list="dl-modelos" value={form.modelo ?? ''} onChange={(e) => setF({ modelo: e.target.value })} />
            </FormField>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <FormField label="Renavam">
              <Input value={form.renavam ?? ''} onChange={(e) => setF({ renavam: e.target.value })} />
            </FormField>
            <FormField label="Chassi" className="col-span-2">
              <Input value={form.chassi ?? ''} onChange={(e) => setF({ chassi: e.target.value })} />
            </FormField>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <FormField label="Cor">
              <Input value={form.cor ?? ''} onChange={(e) => setF({ cor: e.target.value })} />
            </FormField>
            <FormField label="Ano fab.">
              <Input
                type="number"
                min={1950}
                max={anoAtual + 1}
                value={form.ano_fabricacao ?? ''}
                onChange={(e) => setF({ ano_fabricacao: Number(e.target.value) || null })}
              />
            </FormField>
            <FormField label="Ano modelo">
              <Input
                type="number"
                min={1950}
                max={anoAtual + 1}
                value={form.ano_modelo ?? ''}
                onChange={(e) => setF({ ano_modelo: Number(e.target.value) || null })}
              />
            </FormField>
            <FormField label="KM">
              <Input
                type="number"
                min={0}
                value={form.quilometragem ?? ''}
                onChange={(e) => setF({ quilometragem: Number(e.target.value) || null })}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <FormField label="Combustivel">
              <Select value={form.combustivel ?? ''} onChange={(e) => setF({ combustivel: (e.target.value || null) as Combustivel })}>
                <option value="">--</option>
                {COMBUSTIVEIS.map((c) => (
                  <option key={c.v} value={c.v}>
                    {c.l}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Cambio">
              <Select value={form.tipo_cambio ?? ''} onChange={(e) => setF({ tipo_cambio: (e.target.value || null) as TipoCambio })}>
                <option value="">--</option>
                {CAMBIOS.map((c) => (
                  <option key={c.v} value={c.v}>
                    {c.l}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Uso">
              <Select value={form.uso ?? 'passeio'} onChange={(e) => setF({ uso: e.target.value as VeiculosRow['uso'] })}>
                <option value="passeio">Passeio</option>
                <option value="app">Aplicativo</option>
                <option value="comercial">Comercial</option>
              </Select>
            </FormField>
          </div>

          <FormField label="Categoria de risco (tipo de veiculo p/ precificacao)">
            <Select value={form.tipo_veiculo_id ?? ''} onChange={(e) => setF({ tipo_veiculo_id: e.target.value || null })}>
              <option value="">-- Selecione --</option>
              {(tiposVeiculo ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </Select>
          </FormField>

          {/* FIPE */}
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-3">
            <FormField label="Codigo FIPE">
              <Input value={form.codigo_fipe ?? ''} onChange={(e) => setF({ codigo_fipe: e.target.value })} placeholder="002001-5" />
            </FormField>
            <FormField label="Valor FIPE (R$)">
              <Input
                type="number"
                step="0.01"
                min={0}
                value={form.valor_fipe ?? ''}
                onChange={(e) => setF({ valor_fipe: Number(e.target.value) || null })}
              />
            </FormField>
            <p className="col-span-2 text-xs text-slate-400">
              O valor FIPE sera a base do calculo das mensalidades (a ser configurado depois).
            </p>
          </div>

          {/* Dados do contrato */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Regional">
              <Select value={form.regional_id ?? ''} onChange={(e) => setF({ regional_id: e.target.value || null })}>
                <option value="">-- Selecione --</option>
                {(regionais ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Consultor (Vendedor)">
              <Select value={form.vendedor_id ?? ''} onChange={(e) => setF({ vendedor_id: e.target.value || null })}>
                <option value="">-- Selecione --</option>
                {(vendedores ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {nomeUsuario.get(v.usuario_id) ?? '(vendedor)'}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <FormField label="Data do contrato">
              <Input type="date" value={form.data_contrato ?? ''} onChange={(e) => setF({ data_contrato: e.target.value })} />
            </FormField>
            <FormField label="Tipo de negociacao">
              <Select value={form.tipo_negociacao ?? ''} onChange={(e) => setF({ tipo_negociacao: (e.target.value || null) as TipoNegociacao })}>
                <option value="">--</option>
                {NEGOCIACOES.map((n) => (
                  <option key={n.v} value={n.v}>
                    {n.l}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Situacao do contrato">
              <Select value={form.status ?? 'ativo'} onChange={(e) => setF({ status: e.target.value as StatusVeiculo })}>
                {STATUS.filter((s) => s.v !== 'baixado').map((s) => (
                  <option key={s.v} value={s.v}>
                    {s.l}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="secondary" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending ? 'Salvando...' : 'Salvar veiculo'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
