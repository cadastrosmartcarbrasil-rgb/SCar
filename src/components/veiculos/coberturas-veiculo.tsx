'use client';

import { CheckCircle2, CircleSlash, Info, ShieldCheck, XCircle } from 'lucide-react';
import { useCoberturasVeiculo, type VeiculoParaCobertura } from '@/hooks/use-coberturas';
import {
  agruparCoberturas, gruposNaoIncluidos, ROTULO_GRUPO, textoDoLimite, type ItemCobertura,
} from '@/lib/coberturas';
import { formatCurrency, formatDate } from '@/lib/utils';

// O pacote do veiculo ABERTO na ficha (SAC e /veiculos/[id]), sem clique para
// expandir: o atendente le de uma vez o que o associado tem, o limite de cada
// uso, a participacao e o que o plano NAO inclui (0120). O texto de cada
// cobertura vem de Configuracoes -> Produtos (campo "O que cobre").
export function CoberturasDetalhadas({
  veiculo, acaoOpcionais,
}: {
  veiculo: VeiculoParaCobertura;
  /** Botao opcional ao lado do titulo (o SAC poe "Alterar opcionais"). */
  acaoOpcionais?: React.ReactNode;
}) {
  const { data, isLoading, error } = useCoberturasVeiculo(veiculo);

  if (isLoading) return <p className="text-sm text-slate-400">Carregando coberturas...</p>;
  if (error || !data) {
    return (
      <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
        Não foi possível ler as coberturas deste veículo. Recarregue a tela antes de informar o associado.
      </p>
    );
  }

  const secoes = agruparCoberturas(data.itens);
  const faltam = gruposNaoIncluidos({
    itens: data.itens, disponiveis: data.disponiveis, semCasco: data.plano?.sem_casco,
  });
  const avulsos = data.itens.filter((i) => i.origem === 'AVULSO').length;
  const semTexto = data.itens.some((i) => !i.descricao?.trim() && i.categoria !== 'ADMIN');

  return (
    <section className="space-y-3 rounded-xl border border-cyan-200 bg-cyan-50/40 p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-cyan-700">
            <ShieldCheck className="h-4 w-4" /> O que este veículo tem
          </p>
          <p className="mt-0.5 text-base font-semibold text-slate-900">
            {data.plano?.nome ?? (veiculo.plano_protecao_id ? 'Plano' : 'Sem plano definido')}
            {avulsos > 0 && <span className="ml-1 text-sm font-normal text-slate-500">+ {avulsos} opcional(is)</span>}
          </p>
          {data.plano?.descricao_comercial && (
            <p className="mt-1 max-w-3xl text-sm text-slate-600">{data.plano.descricao_comercial}</p>
          )}
        </div>
        {acaoOpcionais}
      </header>

      {data.participacao != null && (
        <p className="rounded-md bg-superficie px-3 py-2 text-sm text-slate-700">
          <span className="font-medium">Participação em evento:</span>{' '}
          <span className="tnum font-semibold">{formatCurrency(data.participacao)}</span>
          <span className="text-slate-500"> (valor que o associado paga no reparo do próprio veículo)</span>
        </p>
      )}

      {secoes.length === 0 ? (
        <p className="text-sm text-slate-500">
          {veiculo.plano_protecao_id
            ? 'Nenhuma cobertura calculada para este plano.'
            : 'Veículo sem plano: ajuste no cadastro do veículo antes de informar coberturas.'}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {secoes.map((s) => (
            <div key={s.grupo} className="rounded-lg border border-slate-200 bg-superficie p-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{s.rotulo}</p>
              <ul className="space-y-2">
                {s.itens.map((i) => <ItemDaCobertura key={i.produto_id} i={i} />)}
              </ul>
            </div>
          ))}
        </div>
      )}

      {faltam.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
            <CircleSlash className="h-3.5 w-3.5" /> Não inclui
          </p>
          <p className="mt-0.5 text-sm text-amber-900">{faltam.map((g) => ROTULO_GRUPO[g]).join(' · ')}</p>
        </div>
      )}

      {semTexto && (
        <p className="flex items-start gap-1.5 text-xs text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Cobertura sem descrição mostra só o nome. O texto se cadastra em Configurações → Produtos, campo &ldquo;O que cobre&rdquo;.
        </p>
      )}
    </section>
  );
}

function ItemDaCobertura({ i }: { i: ItemCobertura }) {
  const limite = textoDoLimite(i);
  return (
    <li className="text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-medium text-slate-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          {i.nome}
          {i.origem === 'AVULSO' && (
            <span className="rounded bg-cyan-100 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase text-cyan-800">opcional</span>
          )}
        </span>
        {i.origem === 'AVULSO' && <span className="tnum text-xs text-slate-500">+ {formatCurrency(Number(i.valor))}/mes</span>}
      </div>
      {i.descricao?.trim() && <p className="ml-5 mt-0.5 whitespace-pre-line text-slate-600">{i.descricao}</p>}
      {limite && (
        <p className="ml-5 mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="tnum">{limite}</span>
          {i.elegivel ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> DISPONÍVEL
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-rose-700">
              <XCircle className="h-3 w-3" /> LIMITE ATINGIDO{i.ultimo_uso ? ` · último uso ${formatDate(i.ultimo_uso)}` : ''}
            </span>
          )}
        </p>
      )}
    </li>
  );
}
