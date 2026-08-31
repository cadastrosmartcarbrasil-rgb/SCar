'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  BadgeDollarSign, Eye, KeyRound, Link2, Loader2, Mail, Pencil, Plus, Search, Trash2, Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, PercentInput, Select, Textarea } from '@/components/ui/field';
import { useRegionais, useUsuarios } from '@/hooks/use-config';
import {
  useAcessoPortal, useEnviarBoasVindas, useExcluirVendedor, useSalvarVendedor, useSugerirCodigo,
  useVendedoresLista,
} from '@/hooks/use-vendedores';
import { validarComissaoVendedor } from '@/lib/vendas';
import { formatarTelefone } from '@/lib/documento';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { VendedorLista, VendedoresRow } from '@/lib/database.types';

const DIAS_SEMANA = [
  { valor: 1, rotulo: 'Segunda-feira' }, { valor: 2, rotulo: 'Terca-feira' },
  { valor: 3, rotulo: 'Quarta-feira' }, { valor: 4, rotulo: 'Quinta-feira' },
  { valor: 5, rotulo: 'Sexta-feira' }, { valor: 6, rotulo: 'Sabado' }, { valor: 7, rotulo: 'Domingo' },
];

const pct = (v: number | null | undefined) =>
  `${(Number(v ?? 0) * 100).toFixed(2).replace('.00', '').replace('.', ',')}%`;

function Secao({ titulo, tom = 'cinza', children }: {
  titulo: string; tom?: 'cinza' | 'ambar' | 'azul'; children: React.ReactNode;
}) {
  const cor = {
    cinza: 'border-slate-200 bg-slate-50/70',
    ambar: 'border-amber-200 bg-amber-50/60',
    azul: 'border-sky-200 bg-sky-50/60',
  }[tom];
  const titulos = { cinza: 'text-slate-600', ambar: 'text-amber-700', azul: 'text-sky-700' }[tom];
  return (
    <section className={`rounded-xl border p-3 ${cor}`}>
      <h4 className={`mb-2.5 text-[11.5px] font-bold uppercase tracking-wide ${titulos}`}>{titulo}</h4>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function VendedoresPage() {
  const [busca, setBusca] = useState('');
  const [regionalFiltro, setRegionalFiltro] = useState('');
  const { data: vendedores, isLoading } = useVendedoresLista({
    regionalId: regionalFiltro || null, busca,
  });
  const { data: regionais } = useRegionais();
  const excluir = useExcluirVendedor();

  const [editando, setEditando] = useState<Partial<VendedoresRow> | null>(null);
  const [vendo, setVendo] = useState<VendedorLista | null>(null);
  const [boasVindas, setBoasVindas] = useState<VendedorLista | null>(null);

  function copiarHotlink(v: VendedorLista) {
    const url = `${window.location.origin}/v/${v.codigo}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success(`Hotlink de ${v.nome} copiado: ${url}`),
      () => toast.error('Nao consegui copiar. O link e: ' + url),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Vendedores</h1>
          <p className="text-sm text-slate-500">
            Cadastro completo do vendedor: contato, comissao, prazo de pagamento, dados bancarios e
            acesso ao portal.
          </p>
        </div>
        <Button onClick={() => setEditando({ ativo: true, taxa_comissao_adesao: 0, taxa_comissao_recorrente: 0 })}>
          <Plus className="h-4 w-4" /> Novo Vendedor
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, codigo ou e-mail"
            className="w-72 rounded-lg border border-slate-300 py-1.5 pl-8 pr-3 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          />
        </div>
        <Select className="mt-0 w-56 py-1.5" value={regionalFiltro} onChange={(e) => setRegionalFiltro(e.target.value)}>
          <option value="">Todas as franquias</option>
          {(regionais ?? []).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
        </Select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2.5 font-semibold">Nome</th>
              <th className="px-4 py-2.5 font-semibold">Codigo</th>
              <th className="px-4 py-2.5 font-semibold">Franquia</th>
              <th className="px-4 py-2.5 text-right font-semibold">Entrada</th>
              <th className="px-4 py-2.5 text-right font-semibold">Recorrencia</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 text-right font-semibold">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Carregando...</td></tr>
            )}
            {(vendedores ?? []).map((v) => (
              <tr key={v.id} className="border-b border-slate-50 transition last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2">
                    <BadgeDollarSign className="h-4 w-4 shrink-0 text-brand-500" />
                    <span>
                      <span className="block font-semibold text-slate-800">{v.nome}</span>
                      <span className="block text-[11px] text-slate-400">
                        {v.email ?? 'sem e-mail'}
                        {v.telefone && ` · ${v.telefone}`}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{v.codigo}</td>
                <td className="px-4 py-2.5 text-slate-600">{v.regional_nome ?? 'Global'}</td>
                <td className="tnum px-4 py-2.5 text-right font-semibold text-amber-700">{pct(v.taxa_comissao_adesao)}</td>
                <td className="tnum px-4 py-2.5 text-right font-semibold text-emerald-700">{pct(v.taxa_comissao_recorrente)}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                    v.ativo ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-slate-200'
                  }`}>
                    {v.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1">
                    <Acao titulo="Ver ficha" onClick={() => setVendo(v)}><Eye className="h-3.5 w-3.5" /></Acao>
                    <Acao titulo="Editar" onClick={() => setEditando(v as unknown as VendedoresRow)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Acao>
                    <Acao titulo="Copiar hotlink de vendas" onClick={() => copiarHotlink(v)}>
                      <Link2 className="h-3.5 w-3.5" />
                    </Acao>
                    <Acao
                      titulo={v.boas_vindas_enviada_em ? `Boas-vindas enviadas em ${formatDate(v.boas_vindas_enviada_em)}` : 'Enviar boas-vindas e contrato'}
                      onClick={() => setBoasVindas(v)}
                      destaque={!v.boas_vindas_enviada_em}
                    >
                      <Mail className="h-3.5 w-3.5" />
                    </Acao>
                    <Acao
                      titulo="Remover"
                      classe="text-rose-600 hover:bg-rose-50"
                      onClick={() => {
                        if (confirm(`Remover ${v.nome}? As vendas ja feitas continuam no historico.`))
                          excluir.mutate(v.id, { onError: (e) => toast.error(e.message) });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Acao>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && (vendedores ?? []).length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                {busca ? 'Nenhum vendedor para essa busca.' : 'Nenhum vendedor cadastrado.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editando && <ModalVendedor inicial={editando} onClose={() => setEditando(null)} />}
      {vendo && <ModalFicha vendedor={vendo} onClose={() => setVendo(null)} onEditar={() => { setEditando(vendo as unknown as VendedoresRow); setVendo(null); }} />}
      {boasVindas && <ModalBoasVindas vendedor={boasVindas} onClose={() => setBoasVindas(null)} />}
    </div>
  );
}

function Acao({ titulo, onClick, children, classe, destaque }: {
  titulo: string; onClick: () => void; children: React.ReactNode; classe?: string; destaque?: boolean;
}) {
  return (
    <button
      type="button" title={titulo} aria-label={titulo} onClick={onClick}
      className={`grid h-7 w-7 place-items-center rounded-lg border transition ${
        classe ?? (destaque
          ? 'border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100'
          : 'border-slate-200 text-slate-500 hover:bg-slate-100')
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Cadastro / edicao
// ---------------------------------------------------------------------------
function ModalVendedor({ inicial, onClose }: { inicial: Partial<VendedoresRow>; onClose: () => void }) {
  const [form, setForm] = useState<Partial<VendedoresRow>>(inicial);
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');

  const { data: regionais } = useRegionais();
  const { data: usuarios } = useUsuarios();
  const salvar = useSalvarVendedor();
  const sugerir = useSugerirCodigo();
  const acesso = useAcessoPortal();

  const edicao = !!form.id;
  const set = (p: Partial<VendedoresRow>) => setForm((f) => ({ ...f, ...p }));

  const regional = useMemo(
    () => (regionais ?? []).find((r) => r.id === form.regional_id),
    [regionais, form.regional_id],
  );
  const teto = {
    adesao: Number(regional?.taxa_comissao_adesao ?? 0),
    recorrente: Number(regional?.taxa_comissao_recorrente ?? 0),
  };
  const validacao = validarComissaoVendedor(
    { adesao: Number(form.taxa_comissao_adesao ?? 0), recorrente: Number(form.taxa_comissao_recorrente ?? 0) },
    teto,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome?.trim()) return toast.error('Informe o nome do vendedor');
    if (!validacao.ok) return toast.error(validacao.erros[0]);
    if (senha && senha !== confirmar) return toast.error('As senhas nao conferem');
    if (senha && senha.length < 8) return toast.error('A senha precisa de ao menos 8 caracteres');
    if (senha && !form.email?.trim()) return toast.error('Informe o e-mail para criar o acesso ao portal');

    try {
      const id = await salvar.mutateAsync(form);
      if (senha) {
        await acesso.mutateAsync({ vendedorId: id, email: form.email!.trim(), senha });
        toast.success('Vendedor salvo e acesso ao portal configurado');
      } else {
        toast.success('Vendedor salvo');
      }
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Modal open onClose={onClose} tamanho="lg" title={edicao ? 'Editar Vendedor' : 'Novo Vendedor'} subtitulo={form.codigo ?? undefined}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Nome *">
            <Input value={form.nome ?? ''} onChange={(e) => set({ nome: e.target.value })} placeholder="Nome completo" />
          </FormField>
          <FormField label="Telefone">
            <Input value={form.telefone ?? ''} onChange={(e) => set({ telefone: formatarTelefone(e.target.value) })} inputMode="tel" />
          </FormField>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="E-mail">
            <Input type="email" value={form.email ?? ''} onChange={(e) => set({ email: e.target.value })} />
          </FormField>
          <FormField label="CPF / CNPJ">
            <Input value={form.documento ?? ''} onChange={(e) => set({ documento: e.target.value })} />
          </FormField>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Franquia (regional)">
            <Select value={form.regional_id ?? ''} onChange={(e) => set({ regional_id: e.target.value || null })}>
              <option value="">-- Selecione --</option>
              {(regionais ?? []).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </Select>
          </FormField>
          <FormField label="Codigo (hotlink)">
            <div className="flex gap-2">
              <Input
                value={form.codigo ?? ''}
                onChange={(e) => set({ codigo: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                placeholder="Gerado do nome"
                className="font-mono"
              />
              <Button
                type="button" variant="secondary"
                onClick={async () => {
                  if (!form.nome?.trim()) return toast.error('Informe o nome primeiro');
                  set({ codigo: await sugerir.mutateAsync({ nome: form.nome, ignorar: form.id }) });
                }}
              >
                <Wand2 className="h-4 w-4" />
              </Button>
            </div>
          </FormField>
        </div>

        <Secao titulo="Comissao individual" tom="ambar">
          {!form.regional_id ? (
            <p className="text-[11.5px] text-amber-800">
              Escolha a franquia: a comissao do vendedor sai do que ela recebe.
            </p>
          ) : (
            <p className="text-[11.5px] text-amber-800">
              Teto de <b>{regional?.nome}</b>: entrada ate <b className="tnum">{pct(teto.adesao)}</b>,
              recorrencia ate <b className="tnum">{pct(teto.recorrente)}</b>.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="% Entrada">
              <PercentInput
                value={form.taxa_comissao_adesao == null ? null : Number(form.taxa_comissao_adesao) * 100}
                onChange={(v) => set({ taxa_comissao_adesao: (v ?? 0) / 100 })}
              />
            </FormField>
            <FormField label="% Recorrencia">
              <PercentInput
                value={form.taxa_comissao_recorrente == null ? null : Number(form.taxa_comissao_recorrente) * 100}
                onChange={(v) => set({ taxa_comissao_recorrente: (v ?? 0) / 100 })}
              />
            </FormField>
          </div>
          {!validacao.ok && (
            <ul className="list-disc space-y-0.5 pl-4 text-[11.5px] font-medium text-rose-700">
              {validacao.erros.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">Prazo de pagamento</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Dia pagto entrada (semana)">
                <Select
                  value={form.dia_pagto_entrada ?? ''}
                  onChange={(e) => set({ dia_pagto_entrada: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">Padrao franquia</option>
                  {DIAS_SEMANA.map((d) => <option key={d.valor} value={d.valor}>{d.rotulo}</option>)}
                </Select>
                <p className="mt-1 text-[10.5px] uppercase tracking-wide text-slate-400">
                  Comissao de adesao — paga semanalmente
                </p>
              </FormField>
              <FormField label="Dia pagto recorrencia (mes)">
                <Input
                  type="number" min={1} max={31} className="tnum"
                  value={form.dia_pagto_recorrencia ?? ''}
                  onChange={(e) => set({ dia_pagto_recorrencia: e.target.value ? Number(e.target.value) : null })}
                  placeholder="Ex: 5"
                />
                <p className="mt-1 text-[10.5px] uppercase tracking-wide text-slate-400">
                  Comissao mensal — ultimo dia util do mes anterior
                </p>
              </FormField>
            </div>
          </div>
        </Secao>

        <Secao titulo="Dados bancarios">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Banco"><Input value={form.banco ?? ''} onChange={(e) => set({ banco: e.target.value })} /></FormField>
            <FormField label="Agencia"><Input value={form.agencia ?? ''} onChange={(e) => set({ agencia: e.target.value })} /></FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Conta"><Input value={form.conta ?? ''} onChange={(e) => set({ conta: e.target.value })} /></FormField>
            <FormField label="Chave PIX"><Input value={form.chave_pix ?? ''} onChange={(e) => set({ chave_pix: e.target.value })} /></FormField>
          </div>
        </Secao>

        <Secao titulo={form.usuario_id ? 'Redefinir senha do portal' : 'Criar acesso ao portal'} tom="azul">
          <p className="text-[11.5px] text-sky-800">
            {form.usuario_id
              ? 'O vendedor ja acessa o portal. Preencha para trocar a senha; deixe vazio para manter.'
              : 'Preencha para criar o login do vendedor (usa o e-mail acima). Deixe vazio para cadastrar sem acesso agora.'}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Nova senha">
              <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Deixe vazio para manter" autoComplete="new-password" />
            </FormField>
            <FormField label="Confirmar">
              <Input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} autoComplete="new-password" />
            </FormField>
          </div>
          {(usuarios ?? []).length > 0 && !form.usuario_id && (
            <FormField label="Ou vincular a um usuario ja existente">
              <Select value={form.usuario_id ?? ''} onChange={(e) => set({ usuario_id: e.target.value || null })}>
                <option value="">-- Nenhum --</option>
                {(usuarios ?? []).map((u) => <option key={u.id} value={u.id}>{u.nome} ({u.email})</option>)}
              </Select>
            </FormField>
          )}
        </Secao>

        <FormField label="Observacoes">
          <Textarea rows={2} value={form.observacoes ?? ''} onChange={(e) => set({ observacoes: e.target.value })} />
        </FormField>

        <FormField label="Status">
          <Select value={form.ativo === false ? 'false' : 'true'} onChange={(e) => set({ ativo: e.target.value === 'true' })}>
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </Select>
        </FormField>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={salvar.isPending || acesso.isPending || !validacao.ok}>
            {(salvar.isPending || acesso.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Ficha (Ver)
// ---------------------------------------------------------------------------
function ModalFicha({ vendedor, onClose, onEditar }: {
  vendedor: VendedorLista; onClose: () => void; onEditar: () => void;
}) {
  const v = vendedor;
  const dia = DIAS_SEMANA.find((d) => d.valor === v.dia_pagto_entrada)?.rotulo ?? 'nao definido';
  return (
    <Modal open onClose={onClose} tamanho="lg" title={v.nome} subtitulo={`Codigo ${v.codigo} · ${v.regional_nome ?? 'Global'}`}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Indicador rotulo="Comissao entrada" valor={pct(v.taxa_comissao_adesao)} nota={`teto ${pct(v.teto_adesao)}`} />
          <Indicador rotulo="Comissao recorrencia" valor={pct(v.taxa_comissao_recorrente)} nota={`teto ${pct(v.teto_recorrente)}`} />
          <Indicador rotulo="Comissao pendente" valor={formatCurrency(v.comissao_pendente)} nota={`${v.vendas_total} venda(s)`} />
        </div>

        <Secao titulo="Contato">
          <Linha rotulo="E-mail" valor={v.email} />
          <Linha rotulo="Telefone" valor={v.telefone} />
          <Linha rotulo="CPF/CNPJ" valor={v.documento} />
        </Secao>

        <Secao titulo="Prazo de pagamento" tom="ambar">
          <Linha rotulo="Entrada (semanal)" valor={dia} />
          <Linha rotulo="Recorrencia (mensal)" valor={v.dia_pagto_recorrencia ? `dia ${v.dia_pagto_recorrencia}` : 'nao definido'} />
        </Secao>

        <Secao titulo="Dados bancarios">
          <Linha rotulo="Banco" valor={v.banco} />
          <Linha rotulo="Agencia / Conta" valor={[v.agencia, v.conta].filter(Boolean).join(' / ') || null} />
          <Linha rotulo="Chave PIX" valor={v.chave_pix} />
        </Secao>

        <Secao titulo="Portal e onboarding" tom="azul">
          <Linha rotulo="Acesso ao portal" valor={v.tem_portal ? 'Ativo' : 'Ainda nao criado'} />
          <Linha rotulo="Boas-vindas" valor={v.boas_vindas_enviada_em ? `enviadas em ${formatDate(v.boas_vindas_enviada_em)}` : 'nao enviadas'} />
          <Linha rotulo="Contrato" valor={v.contrato_url ? 'anexado' : 'nao anexado'} />
        </Secao>

        {v.observacoes && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{v.observacoes}</p>}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
          <Button onClick={onEditar}><Pencil className="h-4 w-4" /> Editar</Button>
        </div>
      </div>
    </Modal>
  );
}

function Indicador({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 px-3 py-2">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className="tnum mt-0.5 text-lg font-bold text-slate-800">{valor}</p>
      {nota && <p className="text-[11px] text-slate-400">{nota}</p>}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-slate-500">{rotulo}</span>
      <span className={valor ? 'font-medium text-slate-800' : 'text-slate-300'}>{valor ?? '—'}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Boas-vindas + contrato
// ---------------------------------------------------------------------------
function ModalBoasVindas({ vendedor, onClose }: { vendedor: VendedorLista; onClose: () => void }) {
  const [email, setEmail] = useState(vendedor.email ?? '');
  const [contrato, setContrato] = useState<File | null>(null);
  const enviar = useEnviarBoasVindas();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return toast.error('E-mail de destino invalido');
    enviar.mutate(
      { vendedorId: vendedor.id, email, contrato },
      {
        onSuccess: () => { toast.success('Boas-vindas enviadas'); onClose(); },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <Modal open onClose={onClose} title="Boas-vindas — vendedor">
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs">
          <Linha rotulo="Para" valor={vendedor.nome} />
          <Linha rotulo="Unidade" valor={vendedor.regional_nome} />
          <Linha rotulo="Codigo" valor={vendedor.codigo} />
        </div>

        <FormField label="E-mail de destino *">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>

        <FormField label="Anexar contrato (PDF)">
          <input
            type="file" accept="application/pdf"
            onChange={(e) => setContrato(e.target.files?.[0] ?? null)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Recomendado: o contrato para assinatura digital. Max. ~5 MB. Opcional — da para enviar sem anexo.
          </p>
        </FormField>

        <p className="rounded-lg bg-cyan-50 px-3 py-2 text-[11.5px] leading-relaxed text-cyan-900">
          <KeyRound className="mr-1 inline h-3.5 w-3.5" />
          O e-mail leva o codigo do vendedor e o <b>hotlink de vendas</b>: toda cotacao aberta por
          esse link ja entra vinculada a ele.
        </p>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={enviar.isPending}>
            {enviar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Enviar boas-vindas
          </Button>
        </div>
      </form>
    </Modal>
  );
}
