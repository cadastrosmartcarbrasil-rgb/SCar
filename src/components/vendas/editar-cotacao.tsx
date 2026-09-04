'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Lock, Percent, ShieldCheck, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select, MoneyInput } from '@/components/ui/field';
import { usePlanos, useProdutos } from '@/hooks/use-precificacao';
import {
  useAtualizarCotacao, useProdutosObrigatorios, useSimularDesconto, useAprovarDesconto,
} from '@/hooks/use-vendas';
import { calcularDesconto, podeEditarCotacao, selecaoValida } from '@/lib/crm';
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
  const atualizar = useAtualizarCotacao();
  const aprovar = useAprovarDesconto();

  const [fipe, setFipe] = useState<number | null>(Number(cotacao.fipe));
  const [planoId, setPlanoId] = useState(cotacao.plano_id ?? '');
  const [opcionais, setOpcionais] = useState<string[]>(cotacao.opcionais_ids ?? []);
  const [desconto, setDesconto] = useState(Number(cotacao.desconto_percentual ?? 0));
  const [alcada, setAlcada] = useState<{ email: string; senha: string; justificativa: string } | null>(null);

  const { data: obrigatorios } = useProdutosObrigatorios(cotacao.tipo_veiculo_id, planoId || null, fipe ?? 0);
  const { data: simulacao } = useSimularDesconto(cotacao.id, desconto);

  const idsObrigatorios = useMemo(
    () => (obrigatorios ?? []).map((o) => o.produto_id),
    [obrigatorios],
  );

  // Opcionais disponiveis = produtos ativos que NAO sao obrigatorios do pacote.
  const disponiveis = useMemo(
    () => (produtos ?? []).filter((p) => p.status && !idsObrigatorios.includes(p.id)),
    [produtos, idsObrigatorios],
  );

  const limite = Number(simulacao?.limite_regional ?? 0);
  const previa = calcularDesconto(
    Number(cotacao.total_mensalidade),
    Number(cotacao.taxa_adesao ?? 0),
    desconto,
    limite,
  );

  if (!podeEditarCotacao(lead.status)) {
    return (
      <Modal open onClose={onClose} title="Cotacao bloqueada">
        <p className="text-sm text-slate-600">
          O lead ja foi enviado para a auditoria ({lead.status}); a cotacao ficou congelada como
          documento da venda.
        </p>
        <div className="mt-3 flex justify-end"><Button onClick={onClose}>Entendi</Button></div>
      </Modal>
    );
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
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
        // os obrigatorios voltam sempre para a selecao (trava do plano)
        opcionaisIds: selecaoValida(opcionais, []),
        descontoPercentual: desconto,
      },
      {
        onSuccess: (c) => {
          toast.success(`Cotacao atualizada — ${formatCurrency(Number(c.total_com_desconto ?? c.total_mensalidade))}/mes`);
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
        opcionaisIds: selecaoValida(opcionais, []),
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
    <Modal open onClose={onClose} title="Editar cotacao" tamanho="lg">
      <form onSubmit={salvar} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Valor FIPE">
            <MoneyInput value={fipe} onChange={setFipe} />
          </FormField>
          <FormField label="Plano / combo">
            <Select value={planoId} onChange={(e) => setPlanoId(e.target.value)}>
              <option value="">Somente cobertura base</option>
              {(planos ?? []).filter((p) => p.ativo).map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </Select>
          </FormField>
        </div>

        {/* Itens obrigatorios: travados */}
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <Lock className="h-3.5 w-3.5" /> Itens do plano (nao removiveis)
          </p>
          <ul className="space-y-1 text-sm">
            {(obrigatorios ?? []).map((o) => (
              <li key={o.produto_id} className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked disabled />
                  {o.nome}
                </span>
                <span className="tnum text-slate-500">{formatCurrency(Number(o.valor))}</span>
              </li>
            ))}
            {(obrigatorios ?? []).length === 0 && (
              <li className="text-slate-400">Selecione o tipo de veiculo/plano para ver os itens.</li>
            )}
          </ul>
        </div>

        {/* Opcionais: livres */}
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Opcionais</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {disponiveis.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={opcionais.includes(p.id)}
                  onChange={(e) =>
                    setOpcionais((ids) => (e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id)))
                  }
                />
                {p.nome}
              </label>
            ))}
            {disponiveis.length === 0 && <p className="text-sm text-slate-400">Nenhum opcional disponivel.</p>}
          </div>
        </div>

        {/* Desconto com trava por regional */}
        <div className={`rounded-lg border p-3 ${previa.exigeAprovacao ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
          <div className="flex flex-wrap items-end gap-3">
            <FormField label="Desconto (%)">
              <Input
                type="number" min={0} max={100} step="0.5"
                value={desconto}
                onChange={(e) => setDesconto(Number(e.target.value))}
                className="w-28"
              />
            </FormField>
            <p className="text-xs text-slate-500">
              Limite da franquia: <strong>{limite.toFixed(2).replace('.', ',')}%</strong>
            </p>
          </div>

          <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            <p className="text-slate-600">
              Mensalidade: <span className="tnum font-medium">{formatCurrency(previa.mensalidadeFinal)}</span>
              {previa.descontoMensalidade > 0 && (
                <span className="ml-1 text-xs text-slate-400 line-through">
                  {formatCurrency(Number(cotacao.total_mensalidade))}
                </span>
              )}
            </p>
            <p className="text-slate-600">
              Adesao: <span className="tnum font-medium">{formatCurrency(previa.adesaoFinal)}</span>
              {previa.descontoAdesao > 0 && (
                <span className="ml-1 text-xs text-slate-400 line-through">
                  {formatCurrency(Number(cotacao.taxa_adesao ?? 0))}
                </span>
              )}
            </p>
          </div>

          {previa.exigeAprovacao && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-800">
              <Percent className="h-3.5 w-3.5" />
              Acima do limite da franquia — ao salvar, sera pedida a aprovacao de um Gestor/Diretor.
            </p>
          )}
          {cotacao.desconto_aprovado_por && (
            <p className="mt-1 text-xs text-violet-700">
              Desconto atual liberado por excecao{cotacao.desconto_justificativa ? `: ${cotacao.desconto_justificativa}` : ''}.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={atualizar.isPending}>
            {atualizar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {previa.exigeAprovacao ? 'Salvar e pedir aprovacao' : 'Salvar cotacao'}
          </Button>
        </div>
      </form>

      {/* Alcada de excecao */}
      {alcada && (
        <Modal open onClose={() => setAlcada(null)} title="Aprovacao de desconto">
          <form onSubmit={confirmarAlcada} className="space-y-3">
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              O desconto de <strong>{desconto}%</strong> passa do limite de {limite}% da franquia.
              Um Gestor/Diretor precisa autorizar com as proprias credenciais.
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
                  placeholder="Ex.: cliente com 3 veiculos, proposta da concorrencia" />
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
