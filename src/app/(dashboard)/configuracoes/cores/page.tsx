'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Palette, X, AlertTriangle, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, FormField } from '@/components/ui/field';
import {
  useCores,
  useCoresNaoReconhecidas,
  useCoresMutualNaoMapeadas,
  useSalvarCor,
  useExcluirCor,
  useSalvarApelido,
  useExcluirApelido,
} from '@/hooks/use-cores';
import { corNormalizada } from '@/lib/cores';
import type { CorListada } from '@/lib/database.types';

function mensagem(e: unknown) {
  return e instanceof Error ? e.message : 'Nao foi possivel concluir.';
}

/** Uma linha do catalogo: a cor, seus apelidos e quantos registros a usam. */
function LinhaCor({ cor }: { cor: CorListada }) {
  const [novoApelido, setNovoApelido] = useState('');
  const salvarApelido = useSalvarApelido();
  const excluirApelido = useExcluirApelido();
  const salvarCor = useSalvarCor();
  const excluirCor = useExcluirCor();

  const emUso = cor.veiculos + cor.leads;

  async function adicionar() {
    const apelido = corNormalizada(novoApelido);
    if (!apelido) return;
    try {
      await salvarApelido.mutateAsync({ cor_id: cor.id, apelido });
      setNovoApelido('');
      toast.success(`"${apelido}" passa a valer como ${cor.nome}.`);
    } catch (e) {
      toast.error(mensagem(e));
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-superficie p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden
          className="h-7 w-7 shrink-0 rounded-full border border-slate-300"
          style={{ backgroundColor: cor.hex ?? 'transparent' }}
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-800">{cor.nome}</p>
          <p className="text-xs text-slate-500 tnum">
            {emUso === 0
              ? 'nenhum registro usa'
              : `${cor.veiculos} veiculo(s) · ${cor.leads} lead(s)`}
          </p>
        </div>

        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={cor.ativo}
            onChange={async (e) => {
              try {
                await salvarCor.mutateAsync({ ...cor, ativo: e.target.checked });
              } catch (err) {
                toast.error(mensagem(err));
              }
            }}
          />
          Ativa
        </label>

        {/* Excluir so quando nada aponta para ela. A FK e `on delete set null`,
            entao apagar uma cor em uso apagaria a cor da ficha em silencio. */}
        <Button
          variant="ghost"
          disabled={emUso > 0}
          title={emUso > 0 ? 'Ha registros usando esta cor — inative em vez de excluir.' : 'Excluir'}
          onClick={async () => {
            if (!confirm(`Excluir a cor ${cor.nome}?`)) return;
            try {
              await excluirCor.mutateAsync(cor.id);
            } catch (e) {
              toast.error(mensagem(e));
            }
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-10">
        {cor.apelidos.map((a) => (
          <span
            key={a}
            className="flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600"
          >
            {a}
            <button
              type="button"
              aria-label={`Remover o apelido ${a}`}
              onClick={() => excluirApelido.mutate(a)}
              className="text-slate-400 hover:text-rose-600"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <span className="flex items-center gap-1">
          <Input
            value={novoApelido}
            onChange={(e) => setNovoApelido(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void adicionar();
              }
            }}
            placeholder="+ apelido"
            className="h-7 w-32 text-[11px]"
          />
        </span>
      </div>
    </div>
  );
}

export default function CoresPage() {
  const { data: cores, isLoading } = useCores(true);
  const { data: fila } = useCoresNaoReconhecidas();
  const { data: mutual } = useCoresMutualNaoMapeadas();
  const salvarCor = useSalvarCor();

  const [nova, setNova] = useState('');
  const [hex, setHex] = useState('#888888');

  return (
    <div className="space-y-6">
      <header>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
          <Palette className="h-5 w-5 text-cyan-600" />
          Cores do veiculo
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          O vocabulario e o do documento: o CRLV tem dezesseis cores e so essas. O que a ficha
          grava passa por aqui — &quot;prata metalico&quot;, &quot;Prata&quot; e &quot;PRATEADO&quot;
          viram <strong>PRATA</strong>. Cor que o catalogo nao reconhece{' '}
          <strong>nao e recusada</strong>: ela entra e aparece na fila abaixo.
        </p>
      </header>

      {/* ------------------------------------------------ nova cor */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-superficie p-3">
        <FormField label="Nova cor">
          <Input
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            placeholder="ex.: VERDE AGUA"
            className="w-48"
          />
        </FormField>
        <FormField label="Amostra">
          <input
            type="color"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            className="h-9 w-14 rounded border border-slate-300 bg-superficie"
          />
        </FormField>
        <Button
          onClick={async () => {
            try {
              await salvarCor.mutateAsync({ nome: nova, hex });
              setNova('');
              toast.success('Cor cadastrada.');
            } catch (e) {
              toast.error(mensagem(e));
            }
          }}
          disabled={!corNormalizada(nova)}
        >
          <Plus className="mr-1 h-4 w-4" />
          Adicionar
        </Button>
      </div>

      {/* ------------------------------------------------ catalogo */}
      {isLoading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {(cores ?? []).map((c) => (
            <LinhaCor key={c.id} cor={c} />
          ))}
        </div>
      )}

      {/* ------------------------------------------------ a fila */}
      <section>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Cores que o catalogo nao reconheceu
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Vieram da consulta por placa, de uma digitacao antiga ou da carga. Cada uma vira um
          apelido de uma cor existente ou uma cor nova — as fichas seguem valendo enquanto isso.
        </p>
        {(fila ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nada pendente: todas as cores gravadas estao no catalogo.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-superficie">
            {(fila ?? []).map((f) => (
              <li key={f.cor} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-medium text-slate-700">{f.cor}</span>
                <span className="tnum text-xs text-slate-500">
                  {f.veiculos} veiculo(s) · {f.leads} lead(s)
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------ de-para do Mutual */}
      <section>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Link2 className="h-4 w-4 text-slate-400" />
          De-para do Mutual (/vehicle/color/)
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          A cor do sistema atual que ainda nao tem par aqui. <strong>Vazio sem ter capturado
          /vehicle/color/ nao prova nada</strong> — puxe a entidade em Integracao Mutual antes de
          ler esta lista.
        </p>
        {(mutual ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nada listado.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-superficie">
            {(mutual ?? []).map((m) => (
              <li key={m.id_externo} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-medium text-slate-700">{m.descricao ?? `#${m.id_externo}`}</span>
                <span className="text-xs text-slate-500">{m.situacao}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
