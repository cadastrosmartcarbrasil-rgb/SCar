'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, Loader2, MapPin, UserRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAtualizarPerfilPortal, usePortalPerfil } from '@/hooks/use-portal';
import { buscarCep } from '@/lib/cep';
import { formatarDocumento } from '@/lib/documento';
import { formatDate, maskCelular } from '@/lib/utils';

export default function PortalPerfilPage() {
  const { data: p, isLoading } = usePortalPerfil();
  const salvar = useAtualizarPerfilPortal();
  const [form, setForm] = useState({ email: '', telefone: '' });
  const [endereco, setEndereco] = useState<Record<string, string>>({});
  const [carregado, setCarregado] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);

  // Preenche uma vez; depois vale o que o associado digitou.
  useEffect(() => {
    if (!p || carregado) return;
    setCarregado(true);
    setForm({ email: p.email ?? '', telefone: p.telefone ?? '' });
    setEndereco((p.endereco ?? {}) as Record<string, string>);
  }, [p, carregado]);

  async function preencherPorCep(cep: string) {
    const limpo = cep.replace(/\D/g, '');
    if (limpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await buscarCep(limpo);
      if (r) {
        setEndereco((e) => ({
          ...e, cep: limpo, logradouro: r.logradouro ?? e.logradouro,
          bairro: r.bairro ?? e.bairro, cidade: r.cidade ?? e.cidade, uf: r.estado ?? e.uf,
        }));
      }
    } finally {
      setBuscandoCep(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    salvar.mutate(
      { email: form.email, telefone: form.telefone, endereco },
      {
        onSuccess: () => toast.success('Dados atualizados'),
        onError: (err) => toast.error(err.message),
      },
    );
  }

  if (isLoading) return <p className="text-[13px] text-slate-400">Carregando…</p>;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[22px] font-bold tracking-tight text-brand-800">Meu perfil</h1>
        <p className="mt-0.5 text-[13px] text-slate-500">
          Mantenha seu contato atualizado — e por ele que falamos com voce.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <UserRound className="h-4 w-4 text-slate-400" /> Identificacao
          </CardTitle>
          <p className="text-xs text-slate-500">
            Nome e documento sao do seu cadastro na associacao. Para corrigir, fale com o atendimento.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 text-[13px] sm:grid-cols-2">
          <Campo rotulo="Nome" valor={p?.nome} />
          <Campo
            rotulo="CPF / CNPJ"
            valor={p?.cpf_cnpj ? formatarDocumento(p.cpf_cnpj, p.tipo_pessoa === 'PJ' ? 'PJ' : 'PF') : null}
          />
          <Campo rotulo="Associado desde"
            valor={p?.associado_desde ? formatDate(p.associado_desde) : '—'} />
          <Campo rotulo="Veiculos ativos" valor={String(p?.veiculos_ativos ?? 0)} />
        </CardContent>
      </Card>

      <form onSubmit={submit}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-slate-400" /> Contato e endereco
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Entrada rotulo="E-mail" valor={form.email} type="email"
                onChange={(v) => setForm({ ...form, email: v })} />
              <Entrada rotulo="Celular" valor={form.telefone} inputMode="tel"
                onChange={(v) => setForm({ ...form, telefone: maskCelular(v) })} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Entrada rotulo="CEP" valor={endereco.cep ?? ''} inputMode="numeric"
                sufixo={buscandoCep ? '…' : undefined}
                onChange={(v) => {
                  setEndereco((e) => ({ ...e, cep: v }));
                  preencherPorCep(v);
                }} />
              <Entrada rotulo="Cidade" valor={endereco.cidade ?? ''}
                onChange={(v) => setEndereco((e) => ({ ...e, cidade: v }))} className="sm:col-span-2" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Entrada rotulo="Logradouro" valor={endereco.logradouro ?? ''} className="sm:col-span-2"
                onChange={(v) => setEndereco((e) => ({ ...e, logradouro: v }))} />
              <Entrada rotulo="Numero" valor={endereco.numero ?? ''}
                onChange={(v) => setEndereco((e) => ({ ...e, numero: v }))} />
            </div>

            <div className="flex justify-end">
              <button
                type="submit" disabled={salvar.isPending}
                className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
              >
                {salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </button>
            </div>
          </CardContent>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <KeyRound className="h-4 w-4 text-slate-400" /> Senha
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TrocarSenha />
        </CardContent>
      </Card>
    </div>
  );
}

function TrocarSenha() {
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const res = await fetch('/api/portal/senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha, confirmacao }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? 'Nao consegui trocar a senha');
      setSenha('');
      setConfirmacao('');
      toast.success('Senha alterada');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Entrada rotulo="Nova senha" valor={senha} type="password" onChange={setSenha} />
        <Entrada rotulo="Repita a senha" valor={confirmacao} type="password" onChange={setConfirmacao} />
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={enviando || senha.length < 8 || senha !== confirmacao}
          className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2.5 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
          Trocar senha
        </button>
      </div>
    </form>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className="mt-0.5 text-slate-800">{valor || '—'}</p>
    </div>
  );
}

function Entrada({ rotulo, valor, onChange, type = 'text', inputMode, className, sufixo }: {
  rotulo: string; valor: string; onChange: (v: string) => void;
  type?: string; inputMode?: 'tel' | 'numeric'; className?: string; sufixo?: string;
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{rotulo}</span>
      <div className="relative mt-1">
        <input
          type={type} value={valor} inputMode={inputMode}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-[14px] outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
        />
        {sufixo && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-slate-400">{sufixo}</span>
        )}
      </div>
    </label>
  );
}
