'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Lock, Percent, ShieldCheck, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select, MoneyInput, PercentInput } from '@/components/ui/field';
import {
  usePlanos, useProdutos, useProdutosPorPlano, useTiposPorProduto, useTiposVeiculo, useTiposPorPlano, useSugestoesPorPlano,
} from '@/hooks/use-precificacao';
import { alternarOpcional, planosDoTipo, sugestoesDoPlano } from '@/lib/planos-oferta';
import { produtosParaTipo, regraRastreadorCobra, semRastreadorDaRegra } from '@/lib/produtos';
import {
  useAtualizarCotacao, useProdutosObrigatorios, useSimularDesconto, useAprovarDesconto,
  useRegrasAssistenciaProfissional, useCotacaoAoVivo,
} from '@/hooks/use-vendas';
import { calcularDesconto, percentualParaValorFinal, podeEditarCotacao } from '@/lib/crm';
import { validarAssistenciaProfissional } from '@/lib/assistencia-profissional';
import { CampoAssistenciaProfissional } from '@/components/vendas/campo-assistencia-profissional';
import { avulsosDoVeiculo } from '@/lib/planos';
import { separarOpcionais } from '@/lib/vistoria';
import { formatCurrency } from '@/lib/utils';
import type { CotacoesRow, LeadsRow } from '@/lib/database.types';

// Edicao da cotacao durante a negociacao: troca de plano, opcionais, FIPE e
// desconto. Itens OBRIGATORIOS do plano aparecem travados (nao podem sair).
export function EditarCotacao({
  lead, cotacao, onClose,
}: {
  lead: LeadsRow;
  cotacao: CotacoesRow;
  onClose: () => void;
}) {
  const { data: planos } = usePlanos();
  const { data: produtos } = useProdutos();
  const { data: produtosPorPlano } = useProdutosPorPlano();
  const { data: tiposPorProduto } = useTiposPorProduto();
  const { data: tiposVeiculo } = useTiposVeiculo();
  const { data: tiposPorPlano } = useTiposPorPlano();
  const { data: sugestoesPorPlano } = useSugestoesPorPlano();
  const atualizar = useAtualizarCotacao();
  const aprovar = useAprovarDesconto();

  const [fipe, setFipe] = useState<number | null>(Number(cotacao.fipe));
  const [planoId, setPlanoId] = useState(cotacao.plano_id ?? '');
  const [opcionais, setOpcionais] = useState<string[]>(cotacao.opcionais_ids ?? []);
  const [desconto, setDesconto] = useState(Number(cotacao.desconto_percentual ?? 0));
  // 0158 — Assistencia Profissional: interna e fora do desconto
  const { data: regrasAp } = useRegrasAssistenciaProfissional(lead.id);
  const [assistencia, setAssistencia] = useState<number | null>(Number(cotacao.valor_assistencia_profissional ?? 0) || null);
  const erroAp = validarAssistenciaProfissional(assistencia, regrasAp);
  const [alcada, setAlcada] = useState<{ email: string; senha: string; justificativa: string } | null>(null);

  const { data: obrigatorios } = useProdutosObrigatorios(cotacao.tipo_veiculo_id, planoId || null, fipe ?? 0);
  const { data: simulacao } = useSimularDesconto(cotacao.id, desconto);

  const idsObrigatorios = useMemo(
    () => (obrigatorios ?? []).map((o) => o.produto_id),
    [obrigatorios],
  );

  // Opcionais disponiveis = produtos ativos que NAO sao obrigatorios do pacote.
  // So o que atende o tipo do veiculo (0089). O que ja esta na cotacao e nao
  // atende fica na lista, marcado, para nao sumir calado.
  const disponiveis = useMemo(
    () => semRastreadorDaRegra(
      produtosParaTipo(
        (produtos ?? []).filter((p) => p.status && !idsObrigatorios.includes(p.id)),
        cotacao.tipo_veiculo_id, tiposPorProduto, opcionais,
      ),
      // O rastreador opcional so abaixo do minimo do tipo (0090).
      regraRastreadorCobra((tiposVeiculo ?? []).find((t) => t.id === cotacao.tipo_veiculo_id), fipe),
      opcionais,
    ),
    [produtos, idsObrigatorios, cotacao.tipo_veiculo_id, tiposPorProduto, opcionais, tiposVeiculo, fipe],
  );

  // O combo tambem carrega OPCIONAIS (plano_produtos). Eles nao sao
  // "obrigatorios do produto", entao escapavam da lista travada acima e eram
  // oferecidos de novo como avulso — o cliente pagaria a parte por algo que ja
  // esta levando. Aqui eles aparecem marcados, travados e com o selo do plano.
  const idsDoPlano = useMemo(
    () => (planoId ? produtosPorPlano?.[planoId] ?? [] : []),
    [produtosPorPlano, planoId],
  );
  const { inclusos: noPlano, avulsos: livres } = useMemo(
    () => separarOpcionais(disponiveis, idsDoPlano),
    [disponiveis, idsDoPlano],
  );

  // O preco de AGORA (o mesmo motor que grava), item a item — antes a tela so
  // mostrava o valor dos obrigatorios e o total da cotacao ja salva, entao o
  // consultor trocava plano/opcional sem saber quanto ficava.
  const avulsosCobrados = useMemo(() => avulsosDoVeiculo(opcionais, idsDoPlano), [opcionais, idsDoPlano]);
  const aoVivo = useCotacaoAoVivo({
    fipe, tipoVeiculoId: cotacao.tipo_veiculo_id, planoId: planoId || null,
    avulsos: avulsosCobrados, oferecidos: livres.filter((p) => !p.foraDoTipo).map((p) => p.id),
    regionalId: cotacao.regional_id ?? null,
  });
  const atual = aoVivo.data?.atual ?? null;
  const precoOpcional = aoVivo.data?.precoOpcional ?? {};
  const itens = atual?.detalhamento_produtos ?? [];
  const totalTabela = atual ? Number(atual.valor_total_mensalidade) : Number(cotacao.total_mensalidade);
  const adesaoTabela = atual ? Number(atual.taxa_adesao ?? 0) : Number(cotacao.taxa_adesao ?? 0);
  const mudouTabela = Math.abs(totalTabela - Number(cotacao.total_mensalidade)) > 0.004;

  const limite = Number(simulacao?.limite_regional ?? 0);
  const previa = calcularDesconto(totalTabela, adesaoTabela, desconto, limite);

  // 0162 — trocar de plano = comecar dos pre-marcados do plano novo (removiveis).
  function trocarPlano(novo: string) {
    setPlanoId(novo);
    const incluidos = novo ? produtosPorPlano?.[novo] ?? [] : [];
    const sug = sugestoesDoPlano(novo || null, sugestoesPorPlano, disponiveis.map((d) => d.id), incluidos);
    setOpcionais(sug);
  }

  if (!podeEditarCotacao(lead.status)) {
    return (
      <Modal open onClose={onClose} title="Cotação bloqueada">
        <p className="text-sm text-slate-600">
          O lead já foi enviado para a auditoria ({lead.status}); a cotação ficou congelada como
          documento da venda.
        </p>
        <div className="mt-3 flex justify-end"><Button onClick={onClose}>Entendi</Button></div>
      </Modal>
    );
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (erroAp) return toast.error(`Assistência Profissional: ${erroAp}`);
    if (previa.exigeAprovacao) {
      // Desconto acima do limite da franquia: pede a alcada do gestor.
      setAlcada({ email: '', senha: '', justificativa: '' });
      return;
    }
    atualizar.mutate(
      {
        cotacaoId: cotacao.id,
        fipe,
        planoId: planoId || null,
        limparPlano: !planoId,
        // so o que e vendido A PARTE: o combo entra pelo proprio plano
        opcionaisIds: avulsosDoVeiculo(opcionais, idsDoPlano),
        descontoPercentual: desconto,
        assistenciaProfissional: assistencia ?? 0,
      },
      {
        onSuccess: (c) => {
          toast.success(`Cotação atualizada — ${formatCurrency(Number(c.total_com_desconto ?? c.total_mensalidade))}/mes`);
          onClose();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  function confirmarAlcada(e: React.FormEvent) {
    e.preventDefault();
    if (!alcada?.email || !alcada.senha || !alcada.justificativa.trim()) {
      return toast.error('Preencha as credenciais do gestor e a justificativa');
    }
    // 1) salva os itens/valores dentro do limite atual (sem desconto)
    atualizar.mutate(
      {
        cotacaoId: cotacao.id,
        fipe,
        planoId: planoId || null,
        limparPlano: !planoId,
        opcionaisIds: avulsosDoVeiculo(opcionais, idsDoPlano),
        assistenciaProfissional: assistencia ?? 0,
      },
      {
        onSuccess: () => {
          // 2) o gestor aplica o desconto de excecao com as proprias credenciais
          aprovar.mutate(
            {
              cotacao_id: cotacao.id,
              percentual: desconto,
              justificativa: alcada.justificativa,
              email: alcada.email,
              senha: alcada.senha,
            },
            {
              onSuccess: (r) => {
                toast.success(`Desconto de ${desconto}% liberado por ${r.aprovado_por}`);
                setAlcada(null);
                onClose();
              },
              onError: (err) => toast.error(err.message),
            },
          );
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <Modal open onClose={onClose} title="Editar cotação" tamanho="lg">
      <form onSubmit={salvar} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Valor FIPE">
            <MoneyInput value={fipe} onChange={setFipe} />
          </FormField>
          <FormField label="Plano / combo">
            <Select value={planoId} onChange={(e) => trocarPlano(e.target.value)}>
              <option value="">Somente cobertura base</option>
              {planosDoTipo((planos ?? []).filter((p) => p.ativo || p.id === planoId), cotacao.tipo_veiculo_id, tiposPorPlano)
                .concat((planos ?? []).filter((p) => p.id === planoId && !planosDoTipo([p], cotacao.tipo_veiculo_id, tiposPorPlano).length))
                .map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </Select>
          </FormField>
        </div>

        {/* A composicao de AGORA, item a item, com o valor de cada um */}
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Composição da mensalidade</span>
            {aoVivo.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          </p>
          <ul className={`space-y-1 text-sm transition ${aoVivo.isFetching ? 'opacity-60' : ''}`}>
            {itens.map((i, idx) => {
              const doPlano = !!i.produto_id && idsDoPlano.includes(i.produto_id);
              const avulso = !!i.produto_id && avulsosCobrados.includes(i.produto_id);
              return (
                <li key={`${i.produto_id ?? i.nome}-${idx}`} className="flex items-center justify-between gap-2 text-slate-600">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{i.nome}</span>
                    {i.obrigatorio && <span className="rounded bg-slate-100 px-1.5 py-px text-[10px] uppercase text-slate-500">base</span>}
                    {doPlano && <span className="rounded-full bg-cyan-50 px-1.5 py-px text-[10px] font-bold uppercase text-cyan-700 ring-1 ring-inset ring-cyan-200">no plano</span>}
                    {avulso && <span className="rounded bg-amber-50 px-1.5 py-px text-[10px] uppercase text-amber-700">opcional</span>}
                  </span>
                  <span className="tnum shrink-0 text-right text-slate-700">
                    {i.valor_tabela != null && Number(i.valor_tabela) > Number(i.valor) && (
                      <span className="mr-1 text-xs text-slate-400 line-through">{formatCurrency(Number(i.valor_tabela))}</span>
                    )}
                    {formatCurrency(Number(i.valor))}
                  </span>
                </li>
              );
            })}
            {itens.length === 0 && (
              <li className="text-slate-400">{aoVivo.isLoading ? 'Calculando...' : 'Informe o valor FIPE para ver os itens.'}</li>
            )}
          </ul>
          {itens.length > 0 && (
            <p className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-sm font-semibold text-slate-700">
              <span>Total de tabela</span>
              <span className="tnum">
                {mudouTabela && (
                  <span className="mr-1 text-xs font-normal text-slate-400 line-through">{formatCurrency(Number(cotacao.total_mensalidade))}</span>
                )}
                {formatCurrency(totalTabela)}
              </span>
            </p>
          )}
        </div>

        {/* Opcionais a parte, com o preco de cada um antes de marcar */}
        <div className="rounded-lg border border-slate-200 p-3">
          {noPlano.length > 0 && (
            <p className="mb-2 text-xs text-slate-500">
              Já incluídos em {planos?.find((p) => p.id === planoId)?.nome ?? 'este plano'}: {noPlano.map((p) => p.nome).join(', ')}.
            </p>
          )}
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Opcionais a parte
          </p>
          <div className="grid gap-1 sm:grid-cols-2">
            {livres.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={opcionais.includes(p.id)}
                  onChange={() => setOpcionais((ids) => [...alternarOpcional(ids, p.id, disponiveis)])}
                />
                <span className="min-w-0 flex-1">{p.nome}</span>
                {p.foraDoTipo ? (
                  <span className="rounded bg-amber-100 px-1.5 py-px text-[10px] uppercase text-amber-800">
                    não atende este tipo — não é cobrado
                  </span>
                ) : precoOpcional[p.id] != null && (
                  <span className="tnum shrink-0 text-xs text-slate-500">+ {formatCurrency(precoOpcional[p.id])}</span>
                )}
              </label>
            ))}
            {livres.length === 0 && <p className="text-sm text-slate-400">Nenhum opcional disponível.</p>}
          </div>
        </div>

        {/* Desconto com trava por regional */}
        <div className={`rounded-lg border p-3 ${previa.exigeAprovacao ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
          <div className="flex flex-wrap items-end gap-3">
            <FormField label="Desconto (%)">
              <div className="w-28">
                <PercentInput value={desconto || null} onChange={(v) => setDesconto(v ?? 0)} max={100} />
              </div>
            </FormField>
            <FormField label="ou o valor final (R$/mês)">
              <div className="w-40">
                <MoneyInput
                  value={desconto > 0 ? previa.mensalidadeFinal : null}
                  onChange={(v) => setDesconto(v == null ? 0 : percentualParaValorFinal(totalTabela, v))}
                />
              </div>
            </FormField>
            <p className="text-xs text-slate-500">
              Limite da franquia: <strong>{limite.toFixed(2).replace('.', ',')}%</strong>
            </p>
          </div>

          <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            <p className="text-slate-600">
              Mensalidade: <span className="tnum font-medium">{formatCurrency(previa.mensalidadeFinal + (assistencia ?? 0))}</span>
              {previa.descontoMensalidade > 0 && (
                <span className="ml-1 text-xs text-slate-400 line-through">
                  {formatCurrency(totalTabela)}
                </span>
              )}
            </p>
            <p className="text-slate-600">
              Adesao: <span className="tnum font-medium">{formatCurrency(previa.adesaoFinal)}</span>
              {previa.descontoAdesao > 0 && (
                <span className="ml-1 text-xs text-slate-400 line-through">
                  {formatCurrency(adesaoTabela)}
                </span>
              )}
            </p>
          </div>

          {previa.exigeAprovacao && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-800">
              <Percent className="h-3.5 w-3.5" />
              Acima do limite da franquia — ao salvar, será pedida a aprovação de um Gestor/Diretor.
            </p>
          )}
          {cotacao.desconto_aprovado_por && (
            <p className="mt-1 text-xs text-violet-700">
              Desconto atual liberado por exceção{cotacao.desconto_justificativa ? `: ${cotacao.desconto_justificativa}` : ''}.
            </p>
          )}
        </div>

        <CampoAssistenciaProfissional regras={regrasAp} valor={assistencia} onChange={setAssistencia} />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={atualizar.isPending}>
            {atualizar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {previa.exigeAprovacao ? 'Salvar e pedir aprovação' : 'Salvar cotação'}
          </Button>
        </div>
      </form>

      {/* Alcada de excecao */}
      {alcada && (
        <Modal open onClose={() => setAlcada(null)} title="Aprovação de desconto">
          <form onSubmit={confirmarAlcada} className="space-y-3">
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              O desconto de <strong>{desconto}%</strong> passa do limite de {limite}% da franquia.
              Um Gestor/Diretor precisa autorizar com as próprias credenciais.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="E-mail do gestor">
                <Input type="email" autoComplete="off" value={alcada.email}
                  onChange={(e) => setAlcada({ ...alcada, email: e.target.value })} />
              </FormField>
              <FormField label="Senha do gestor">
                <Input type="password" autoComplete="new-password" value={alcada.senha}
                  onChange={(e) => setAlcada({ ...alcada, senha: e.target.value })} />
              </FormField>
              <FormField label="Justificativa" className="sm:col-span-2">
                <Input value={alcada.justificativa}
                  onChange={(e) => setAlcada({ ...alcada, justificativa: e.target.value })}
                  placeholder="Ex.: cliente com 3 veículos, proposta da concorrência" />
              </FormField>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setAlcada(null)}>Voltar</Button>
              <Button type="submit" disabled={aprovar.isPending || atualizar.isPending}>
                <ShieldCheck className="h-4 w-4" /> Aprovar desconto
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Modal>
  );
}
