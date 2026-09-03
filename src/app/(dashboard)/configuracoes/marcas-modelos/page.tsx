'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Car, Search, Pencil, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import {
  useMarcas,
  useModelos,
  useSaveMarca,
  useDeleteMarca,
  useSaveModelo,
  useDeleteModelo,
} from '@/hooks/use-config';
import { useCotasParticipacao } from '@/hooks/use-precificacao';
import { parseCategoriaSGA } from '@/lib/participacao';
import type { StatusCadastro, ModelosRow, MarcasRow } from '@/lib/database.types';

const STATUS: { value: StatusCadastro; label: string }[] = [
  { value: 'ATIVO', label: 'Ativo' },
  { value: 'INATIVO', label: 'Inativo (nao aceito)' },
  { value: 'SUSPENSO', label: 'Suspenso' },
];

function StatusBadge({ status }: { status: StatusCadastro }) {
  const cls =
    status === 'ATIVO'
      ? 'bg-emerald-50 text-emerald-700'
      : status === 'SUSPENSO'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-rose-50 text-rose-700';
  const label = STATUS.find((s) => s.value === status)?.label ?? status;
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>;
}

export default function MarcasModelosPage() {
  const { data: marcas, isLoading } = useMarcas();
  const [marcaSel, setMarcaSel] = useState<string | null>(null);
  const [buscaMarca, setBuscaMarca] = useState('');
  const { data: modelos } = useModelos(marcaSel ?? undefined);

  const { data: cotas } = useCotasParticipacao();
  const salvarMarca = useSaveMarca();
  const excluirMarca = useDeleteMarca();
  const salvarModelo = useSaveModelo();
  const excluirModelo = useDeleteModelo();

  // Mapa codigo->id e id->codigo das cotas, + derivacao a partir do texto do tipo.
  const cotaIdPorCodigo = useMemo(
    () => new Map((cotas ?? []).map((c) => [c.codigo, c.id])),
    [cotas],
  );
  const cotaCodigoPorId = useMemo(
    () => new Map((cotas ?? []).map((c) => [c.id, c])),
    [cotas],
  );
  function derivarCota(tipo: string | null | undefined) {
    const p = parseCategoriaSGA(tipo);
    return {
      cota_participacao_id: p.codigoCota ? cotaIdPorCodigo.get(p.codigoCota) ?? null : null,
      grupo_veiculo: p.grupo || null,
      especial: p.especial,
    };
  }

  // Nova marca
  const [novaMarca, setNovaMarca] = useState('');
  const [novaMarcaStatus, setNovaMarcaStatus] = useState<StatusCadastro>('ATIVO');

  // Novo modelo
  const [novoModelo, setNovoModelo] = useState('');
  const [novoTipo, setNovoTipo] = useState('');
  const [novaIdade, setNovaIdade] = useState<number | ''>('');
  const [novoStatus, setNovoStatus] = useState<StatusCadastro>('ATIVO');

  const [editModelo, setEditModelo] = useState<string | null>(null);

  const marcasFiltradas = useMemo(() => {
    const t = buscaMarca.trim().toLowerCase();
    const lista = marcas ?? [];
    if (!t) return lista;
    return lista.filter((m) => m.nome.toLowerCase().includes(t));
  }, [marcas, buscaMarca]);

  const marcaAtual = (marcas ?? []).find((m) => m.id === marcaSel);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Catalogo de marcas e modelos (padrao SGA). Cada modelo tem tipo do veiculo, idade maxima
        aceita e status de aceitacao (Ativo, Inativo = nao aceito, Suspenso). Alimenta o cadastro
        de veiculos e a precificacao.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Marcas */}
        <div className="rounded-lg border border-slate-200 bg-superficie">
          <div className="border-b border-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
            Marcas <span className="text-slate-400">({(marcas ?? []).length})</span>
          </div>

          <div className="space-y-2 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={buscaMarca}
                onChange={(e) => setBuscaMarca(e.target.value)}
                placeholder="Buscar marca..."
                className="mt-0 pl-8"
              />
            </div>
            <div className="flex gap-2">
              <Input
                value={novaMarca}
                onChange={(e) => setNovaMarca(e.target.value)}
                placeholder="Nova marca (ex.: Toyota)"
                className="mt-0"
              />
              <Select
                value={novaMarcaStatus}
                onChange={(e) => setNovaMarcaStatus(e.target.value as StatusCadastro)}
                className="mt-0 w-40"
              >
                {STATUS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
              <Button
                onClick={() => {
                  if (!novaMarca.trim()) return;
                  salvarMarca.mutate(
                    { nome: novaMarca.trim(), status: novaMarcaStatus },
                    {
                      onSuccess: () => {
                        setNovaMarca('');
                        setNovaMarcaStatus('ATIVO');
                        toast.success('Marca adicionada');
                      },
                      onError: (e) => toast.error((e as Error).message),
                    },
                  );
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <ul className="max-h-96 overflow-y-auto">
            {isLoading && <li className="px-4 py-3 text-sm text-slate-400">Carregando...</li>}
            {marcasFiltradas.map((m) => (
              <MarcaItem
                key={m.id}
                marca={m}
                selecionada={marcaSel === m.id}
                onSelecionar={() => {
                  setMarcaSel(m.id);
                  setEditModelo(null);
                }}
                onSalvar={(status) =>
                  salvarMarca.mutate(
                    { id: m.id, nome: m.nome, status },
                    {
                      onSuccess: () => toast.success('Marca atualizada'),
                      onError: (e) => toast.error((e as Error).message),
                    },
                  )
                }
                onExcluir={() => {
                  if (confirm(`Excluir a marca "${m.nome}" e seus modelos?`))
                    excluirMarca.mutate(m.id, {
                      onSuccess: () => marcaSel === m.id && setMarcaSel(null),
                      onError: (er) => toast.error((er as Error).message),
                    });
                }}
              />
            ))}
            {!isLoading && marcasFiltradas.length === 0 && (
              <li className="px-4 py-3 text-sm text-slate-400">Nenhuma marca.</li>
            )}
          </ul>
        </div>

        {/* Modelos */}
        <div className="rounded-lg border border-slate-200 bg-superficie">
          <div className="border-b border-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
            Modelos {marcaAtual && <span className="text-brand-600">de {marcaAtual.nome}</span>}
          </div>
          {!marcaSel ? (
            <p className="p-4 text-sm text-slate-400">Selecione uma marca a esquerda.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 p-3">
                <Input
                  value={novoModelo}
                  onChange={(e) => setNovoModelo(e.target.value)}
                  placeholder="Modelo (ex.: Corolla 2.0)"
                  className="col-span-2 mt-0"
                />
                <Input
                  value={novoTipo}
                  onChange={(e) => setNovoTipo(e.target.value)}
                  placeholder="Tipo do veiculo"
                  className="mt-0"
                />
                <Input
                  type="number"
                  min={0}
                  value={novaIdade}
                  onChange={(e) => setNovaIdade(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Idade max. (0 = s/ limite)"
                  className="mt-0"
                />
                <Select
                  value={novoStatus}
                  onChange={(e) => setNovoStatus(e.target.value as StatusCadastro)}
                  className="mt-0"
                >
                  {STATUS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
                <Button
                  className="w-full"
                  onClick={() => {
                    if (!novoModelo.trim()) return;
                    salvarModelo.mutate(
                      {
                        marca_id: marcaSel,
                        nome: novoModelo.trim(),
                        tipo_veiculo: novoTipo.trim() || null,
                        idade_maxima: novaIdade === '' ? 0 : Number(novaIdade),
                        status: novoStatus,
                        ...derivarCota(novoTipo),
                      },
                      {
                        onSuccess: () => {
                          setNovoModelo('');
                          setNovoTipo('');
                          setNovaIdade('');
                          setNovoStatus('ATIVO');
                          toast.success('Modelo adicionado');
                        },
                        onError: (e) => toast.error((e as Error).message),
                      },
                    );
                  }}
                >
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              </div>

              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-slate-100 text-left text-[11px] uppercase text-slate-400">
                      <th className="px-3 py-1.5">Modelo</th>
                      <th className="px-2 py-1.5">Tipo</th>
                      <th className="px-2 py-1.5">Cota</th>
                      <th className="px-2 py-1.5">Idade</th>
                      <th className="px-2 py-1.5">Status</th>
                      <th className="px-2 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(modelos ?? []).map((mo) => (
                      <ModeloRow
                        key={mo.id}
                        modelo={mo}
                        cotaLabel={
                          mo.cota_participacao_id
                            ? (() => {
                                const c = cotaCodigoPorId.get(mo.cota_participacao_id);
                                return c ? `${c.codigo} · ${(c.percentual * 100).toFixed(0)}%` : null;
                              })()
                            : null
                        }
                        emEdicao={editModelo === mo.id}
                        onEditar={() => setEditModelo(mo.id)}
                        onCancelar={() => setEditModelo(null)}
                        onSalvar={(patch) =>
                          salvarModelo.mutate(
                            {
                              id: mo.id,
                              marca_id: mo.marca_id,
                              nome: mo.nome,
                              ...patch,
                              ...derivarCota(patch.tipo_veiculo),
                            },
                            {
                              onSuccess: () => {
                                setEditModelo(null);
                                toast.success('Modelo atualizado');
                              },
                              onError: (e) => toast.error((e as Error).message),
                            },
                          )
                        }
                        onExcluir={() =>
                          excluirModelo.mutate(mo.id, {
                            onError: (er) => toast.error((er as Error).message),
                          })
                        }
                      />
                    ))}
                    {(modelos ?? []).length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-4 text-sm text-slate-400">
                          Nenhum modelo nesta marca.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MarcaItem({
  marca,
  selecionada,
  onSelecionar,
  onSalvar,
  onExcluir,
}: {
  marca: MarcasRow;
  selecionada: boolean;
  onSelecionar: () => void;
  onSalvar: (status: StatusCadastro) => void;
  onExcluir: () => void;
}) {
  return (
    <li
      onClick={onSelecionar}
      className={`flex cursor-pointer items-center justify-between gap-2 border-t border-slate-50 px-4 py-2 text-sm ${
        selecionada ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-50'
      }`}
    >
      <span className="inline-flex items-center gap-2 truncate">
        <Car className="h-4 w-4 shrink-0 text-slate-400" /> <span className="truncate">{marca.nome}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <select
          value={marca.status}
          onChange={(e) => onSalvar(e.target.value as StatusCadastro)}
          className="rounded border border-slate-200 bg-superficie px-1 py-0.5 text-[11px]"
        >
          {STATUS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button onClick={onExcluir}>
          <Trash2 className="h-3.5 w-3.5 text-rose-400 hover:text-rose-600" />
        </button>
      </span>
    </li>
  );
}

function ModeloRow({
  modelo,
  cotaLabel,
  emEdicao,
  onEditar,
  onCancelar,
  onSalvar,
  onExcluir,
}: {
  modelo: ModelosRow;
  cotaLabel: string | null;
  emEdicao: boolean;
  onEditar: () => void;
  onCancelar: () => void;
  onSalvar: (patch: { tipo_veiculo: string | null; idade_maxima: number; status: StatusCadastro }) => void;
  onExcluir: () => void;
}) {
  const [tipo, setTipo] = useState(modelo.tipo_veiculo ?? '');
  const [idade, setIdade] = useState<number | ''>(modelo.idade_maxima ?? 0);
  const [status, setStatus] = useState<StatusCadastro>(modelo.status);

  if (!emEdicao) {
    return (
      <tr className="border-b border-slate-50">
        <td className="px-3 py-1.5">{modelo.nome}</td>
        <td className="px-2 py-1.5 text-slate-500">{modelo.tipo_veiculo ?? '-'}</td>
        <td className="px-2 py-1.5">
          {cotaLabel ? (
            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700">
              {cotaLabel}
            </span>
          ) : (
            <span className="text-slate-300">-</span>
          )}
        </td>
        <td className="px-2 py-1.5 text-slate-500">{modelo.idade_maxima || '-'}</td>
        <td className="px-2 py-1.5">
          <StatusBadge status={modelo.status} />
        </td>
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-2">
            <button onClick={onEditar} title="Editar">
              <Pencil className="h-3.5 w-3.5 text-slate-400 hover:text-brand-600" />
            </button>
            <button onClick={onExcluir} title="Excluir">
              <Trash2 className="h-3.5 w-3.5 text-rose-400 hover:text-rose-600" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-slate-50 bg-brand-50/40">
      <td className="px-3 py-1.5 font-medium text-slate-700">{modelo.nome}</td>
      <td className="px-2 py-1.5">
        <input
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="w-28 rounded border border-slate-300 px-1.5 py-1 text-xs"
        />
      </td>
      <td className="px-2 py-1.5 text-[11px] text-slate-400">
        {cotaLabel ?? 'auto'}
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          min={0}
          value={idade}
          onChange={(e) => setIdade(e.target.value === '' ? '' : Number(e.target.value))}
          className="w-16 rounded border border-slate-300 px-1.5 py-1 text-xs"
        />
      </td>
      <td className="px-2 py-1.5">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusCadastro)}
          className="rounded border border-slate-300 px-1 py-1 text-xs"
        >
          {STATUS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-2">
          <button
            title="Salvar"
            onClick={() =>
              onSalvar({
                tipo_veiculo: tipo.trim() || null,
                idade_maxima: idade === '' ? 0 : Number(idade),
                status,
              })
            }
          >
            <Check className="h-4 w-4 text-emerald-500 hover:text-emerald-700" />
          </button>
          <button title="Cancelar" onClick={onCancelar}>
            <X className="h-4 w-4 text-slate-400 hover:text-slate-600" />
          </button>
        </div>
      </td>
    </tr>
  );
}
