'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileText, Landmark, Link2, Lock, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, Input } from '@/components/ui/field';
import { BotoesHotlink } from '@/components/vendedor/shell-vendedor';
import { useAtualizarPerfilVendedor, usePerfilVendedor } from '@/hooks/use-vendedor';
import { rotuloDiaSemana } from '@/lib/vendedor';
import { formatarDocumento } from '@/lib/documento';
import { maskCelular } from '@/lib/utils';

function percent(fracao: number | null | undefined): string {
  return `${String(Number(((fracao ?? 0) * 100).toFixed(2))).replace('.', ',')}%`;
}

export default function PerfilVendedorPage() {
  const { data: p, isLoading } = usePerfilVendedor();
  const salvar = useAtualizarPerfilVendedor();
  const [form, setForm] = useState({ telefone: '', banco: '', agencia: '', conta: '', chavePix: '' });
  const [carregado, setCarregado] = useState(false);

  // So preenche uma vez: depois disso o que vale e o que o vendedor digitou.
  useEffect(() => {
    if (!p || carregado) return;
    setCarregado(true);
    setForm({
      telefone: p.telefone ?? '', banco: p.banco ?? '', agencia: p.agencia ?? '',
      conta: p.conta ?? '', chavePix: p.chave_pix ?? '',
    });
  }, [p, carregado]);

  function set(campo: string, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    salvar.mutate(form, {
      onSuccess: () => toast.success('Dados atualizados'),
      onError: (e: unknown) => toast.error((e as Error).message),
    });
  }

  if (isLoading) return <p className="text-sm text-slate-400">Carregando…</p>;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Meu perfil</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Seus dados de contato, recebimento e o seu link de vendas.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <UserRound className="h-4 w-4 text-slate-400" /> Identificacao
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-[13px] sm:grid-cols-2">
          <Campo rotulo="Nome" valor={p?.nome} />
          <Campo rotulo="Franquia" valor={p?.regional_nome} />
          <Campo rotulo="E-mail" valor={p?.email} />
          <Campo
            rotulo="CPF/CNPJ"
            valor={p?.documento
              ? formatarDocumento(p.documento, p.documento.replace(/\D/g, '').length > 11 ? 'PJ' : 'PF')
              : null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Link2 className="h-4 w-4 text-slate-400" /> Meu link de vendas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="font-mono text-[13px] text-brand-700">
            {p?.codigo ? `/v/${p.codigo}` : 'codigo ainda nao gerado'}
          </p>
          <BotoesHotlink codigo={p?.codigo ?? null} />
        </CardContent>
      </Card>

      <form onSubmit={submit}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Landmark className="h-4 w-4 text-slate-400" /> Contato e recebimento
            </CardTitle>
            <p className="text-xs text-slate-500">
              E para onde a franquia envia o repasse da sua comissao.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Telefone">
                <Input value={form.telefone} inputMode="tel"
                  onChange={(e) => set('telefone', maskCelular(e.target.value))} />
              </FormField>
              <FormField label="Chave PIX">
                <Input value={form.chavePix} onChange={(e) => set('chavePix', e.target.value)} />
              </FormField>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label="Banco">
                <Input value={form.banco} onChange={(e) => set('banco', e.target.value)} />
              </FormField>
              <FormField label="Agencia">
                <Input value={form.agencia} onChange={(e) => set('agencia', e.target.value)} />
              </FormField>
              <FormField label="Conta">
                <Input value={form.conta} onChange={(e) => set('conta', e.target.value)} />
              </FormField>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={salvar.isPending}>
                {salvar.isPending ? 'Salvando…' : 'Salvar dados'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Lock className="h-4 w-4 text-slate-400" /> Comissao e prazo
          </CardTitle>
          <p className="text-xs text-slate-500">
            Definidos pela sua franquia. Para alterar, fale com o gestor da unidade.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 text-[13px] sm:grid-cols-2">
          <Campo rotulo="Comissao de adesao" valor={percent(p?.taxa_adesao)} />
          <Campo rotulo="Comissao recorrente" valor={percent(p?.taxa_recorrente)} />
          <Campo
            rotulo="Pagamento da adesao"
            valor={p?.dia_entrada ? `toda ${rotuloDiaSemana(p.dia_entrada)}${p.entrada_herdada ? ' (padrao da franquia)' : ''}` : 'a combinar'}
          />
          <Campo
            rotulo="Pagamento da recorrencia"
            valor={p?.dia_recorrencia ? `todo dia ${p.dia_recorrencia}${p.recorrencia_herdada ? ' (padrao da franquia)' : ''}` : 'a combinar'}
          />
        </CardContent>
      </Card>

      {p?.contrato_url && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-2 text-[13px] text-slate-700">
              <FileText className="h-4 w-4 text-slate-400" />
              Contrato de parceria
            </div>
            <a
              href={p.contrato_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50"
            >
              Abrir
            </a>
          </CardContent>
        </Card>
      )}
    </div>
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
