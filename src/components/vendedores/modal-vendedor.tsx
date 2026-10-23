'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, PercentInput, Select, Textarea } from '@/components/ui/field';
import { useRegionais, useUsuarios } from '@/hooks/use-config';
import { vinculoDeOutraPessoa } from '@/lib/acesso';
import { opcoesParaEscolher } from '@/lib/regional';
import { useAcessoPortal, useSalvarVendedor, useSugerirCodigo } from '@/hooks/use-vendedores';
import { validarComissaoVendedor } from '@/lib/vendas';
import { formatarTelefone } from '@/lib/documento';
import type { VendedoresRow } from '@/lib/database.types';

const DIAS_SEMANA = [
  { valor: 1, rotulo: 'Segunda-feira' }, { valor: 2, rotulo: 'Terca-feira' },
  { valor: 3, rotulo: 'Quarta-feira' }, { valor: 4, rotulo: 'Quinta-feira' },
  { valor: 5, rotulo: 'Sexta-feira' }, { valor: 6, rotulo: 'Sábado' }, { valor: 7, rotulo: 'Domingo' },
];

const pct = (v: number | null | undefined) =>
  `${(Number(v ?? 0) * 100).toFixed(2).replace('.00', '').replace('.', ',')}%`;

// ---------------------------------------------------------------------------
// Cadastro do vendedor. E o MESMO formulario na matriz (Configuracoes ->
// Vendedores) e no portal da franquia (/regional/equipe) — com `regionalFixa`
// o gestor cadastra a propria equipe sem sair do portal e sem poder escolher
// outra unidade. A RLS de `vendedores` ja garante isso no banco.
// ---------------------------------------------------------------------------
export function Secao({ titulo, tom = 'cinza', children }: {
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

export function ModalVendedor({ inicial, onClose, regionalFixa }: {
  inicial: Partial<VendedoresRow>;
  onClose: () => void;
  /** Portal da franquia: a unidade ja vem definida e o campo fica travado. */
  regionalFixa?: string | null;
}) {
  const [form, setForm] = useState<Partial<VendedoresRow>>(
    regionalFixa ? { ...inicial, regional_id: inicial.regional_id ?? regionalFixa } : inicial,
  );
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');

  const { data: regionais } = useRegionais();
  const { data: usuarios } = useUsuarios();
  const salvar = useSalvarVendedor();
  const sugerir = useSugerirCodigo();
  const acesso = useAcessoPortal();

  const edicao = !!form.id;
  const loginLigado = (usuarios ?? []).find((u) => u.id === form.usuario_id) ?? null;
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
    if (senha && senha !== confirmar) return toast.error('As senhas não conferem');
    if (senha && senha.length < 8) return toast.error('A senha precisa de ao menos 8 caracteres');
    if (senha && !form.email?.trim()) return toast.error('Informe o e-mail para criar o acesso ao portal');

    // 20/10/2026: o vendedor BIANCA2 foi ligado ao login da MARIA CAROLINE e ela
    // passou a entrar como Bianca. Login de outra pessoa pede confirmacao.
    if (form.usuario_id && loginLigado && vinculoDeOutraPessoa(form.nome, loginLigado.nome)
        && (form.usuario_id !== inicial.usuario_id || senha)) {
      const ok = window.confirm(
        `O login escolhido é de ${loginLigado.nome} (${loginLigado.email}), e o vendedor é ${form.nome}.\n\n`
        + `${senha ? 'A nova senha vai valer para o login dessa pessoa. ' : 'Essa pessoa vai entrar no portal como este vendedor. '}`
        + 'Confirma?');
      if (!ok) return;
    }

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
            <Select
              value={form.regional_id ?? ''}
              disabled={!!regionalFixa}
              onChange={(e) => set({ regional_id: e.target.value || null })}
            >
              <option value="">-- Selecione --</option>
              {opcoesParaEscolher(regionais, form.regional_id).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </Select>
          </FormField>
          <FormField label="Código (hotlink)">
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

        <Secao titulo="Comissão individual" tom="ambar">
          {!form.regional_id ? (
            <p className="text-[11.5px] text-amber-800">
              Escolha a franquia: a comissão do vendedor sai do que ela recebe.
            </p>
          ) : (
            <p className="text-[11.5px] text-amber-800">
              Teto de <b>{regional?.nome}</b>: entrada até <b className="tnum">{pct(teto.adesao)}</b>,
              recorrência até <b className="tnum">{pct(teto.recorrente)}</b>.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="% Entrada">
              <PercentInput
                value={form.taxa_comissao_adesao == null ? null : Number(form.taxa_comissao_adesao) * 100}
                onChange={(v) => set({ taxa_comissao_adesao: (v ?? 0) / 100 })}
              />
            </FormField>
            <FormField label="% Recorrência">
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
                  <option value="">Padrão franquia</option>
                  {DIAS_SEMANA.map((d) => <option key={d.valor} value={d.valor}>{d.rotulo}</option>)}
                </Select>
                <p className="mt-1 text-[10.5px] uppercase tracking-wide text-slate-400">
                  Comissão de adesão — paga semanalmente
                </p>
              </FormField>
              <FormField label="Dia pagto recorrência (mês)">
                <Input
                  type="number" min={1} max={31} className="tnum"
                  value={form.dia_pagto_recorrencia ?? ''}
                  onChange={(e) => set({ dia_pagto_recorrencia: e.target.value ? Number(e.target.value) : null })}
                  placeholder="Ex: 5"
                />
                <p className="mt-1 text-[10.5px] uppercase tracking-wide text-slate-400">
                  Comissão mensal — último dia útil do mês anterior
                </p>
              </FormField>
            </div>
          </div>
        </Secao>

        <Secao titulo="Dados bancários">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Banco"><Input value={form.banco ?? ''} onChange={(e) => set({ banco: e.target.value })} /></FormField>
            <FormField label="Agência"><Input value={form.agencia ?? ''} onChange={(e) => set({ agencia: e.target.value })} /></FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Conta"><Input value={form.conta ?? ''} onChange={(e) => set({ conta: e.target.value })} /></FormField>
            <FormField label="Chave PIX"><Input value={form.chave_pix ?? ''} onChange={(e) => set({ chave_pix: e.target.value })} /></FormField>
          </div>
        </Secao>

        <Secao titulo={form.usuario_id ? 'Redefinir senha do portal' : 'Criar acesso ao portal'} tom="azul">
          <p className="text-[11.5px] text-sky-800">
            {form.usuario_id
              ? 'O vendedor já acessa o portal. Preencha para trocar a senha; deixe vazio para manter.'
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
          {form.usuario_id && (
            <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs ${
              loginLigado && vinculoDeOutraPessoa(form.nome, loginLigado.nome) ? 'bg-rose-50 text-rose-800' : 'bg-white/60 text-slate-600'}`}>
              <span>
                Login ligado: <b>{loginLigado ? `${loginLigado.nome} (${loginLigado.email})` : 'usuário fora da sua lista'}</b>
                {loginLigado && vinculoDeOutraPessoa(form.nome, loginLigado.nome) && ' — é OUTRA pessoa: ela entra no portal como este vendedor.'}
              </span>
              <Button type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={() => set({ usuario_id: null })}>
                Desvincular login
              </Button>
            </div>
          )}
          {!regionalFixa && (usuarios ?? []).length > 0 && !form.usuario_id && (
            <FormField label="Ou vincular a um usuário já existente">
              <Select value={form.usuario_id ?? ''} onChange={(e) => set({ usuario_id: e.target.value || null })}>
                <option value="">-- Nenhum --</option>
                {(usuarios ?? []).map((u) => <option key={u.id} value={u.id}>{u.nome} ({u.email})</option>)}
              </Select>
            </FormField>
          )}
        </Secao>

        <FormField label="Observações">
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
