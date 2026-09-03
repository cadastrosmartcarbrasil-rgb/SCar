'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CreditCard, Loader2, Lock, ShieldCheck, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { usePortalCartoes, useRemoverCartao } from '@/hooks/use-portal';
import {
  bandeiraDoNumero, formatarNumero, formatarValidade, validarCartao,
} from '@/lib/cartao';
import { formatDate } from '@/lib/utils';

/**
 * Cartao para debito automatico da mensalidade.
 *
 * O numero digitado aqui vai para o nosso servidor e de la direto para o
 * gateway, que devolve um token. **Nada do cartao fica no nosso banco** — nem
 * o numero, nem o codigo de seguranca. O texto na tela diz isso ao associado,
 * porque ele tem o direito de saber onde o cartao dele para.
 */
export default function PortalPagamentoPage() {
  const { data: cartoes, isLoading, refetch } = usePortalCartoes();
  const remover = useRemoverCartao();
  const [form, setForm] = useState({ numero: '', nome: '', validade: '', cvv: '' });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  const bandeira = bandeiraDoNumero(form.numero);
  const problema = validarCartao(form);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (problema) return setErro(problema);
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch('/api/portal/cartao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? 'Nao consegui cadastrar o cartao');
      // Some com os dados da memoria da tela assim que o token volta.
      setForm({ numero: '', nome: '', validade: '', cvv: '' });
      setMostrarForm(false);
      toast.success('Cartao cadastrado. As proximas mensalidades serao debitadas nele.');
      refetch();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[22px] font-bold tracking-tight text-brand-800">Pagamento</h1>
        <p className="mt-0.5 text-[13px] text-slate-500">
          Cadastre um cartao e a mensalidade e debitada automaticamente — sem boleto para lembrar.
        </p>
      </header>

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-2xl bg-superficie" />
      ) : (cartoes ?? []).length > 0 ? (
        <ul className="space-y-2">
          {(cartoes ?? []).map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-superficie p-4">
              <span className="grid h-11 w-14 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-acao to-faixa text-[10px] font-bold uppercase tracking-wide text-white">
                {c.bandeira ?? 'cartao'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="tnum text-[15px] font-bold text-brand-800">
                  •••• •••• •••• {c.ultimos_digitos ?? '????'}
                </p>
                <p className="text-[11.5px] text-slate-500">
                  {c.nome_portador}
                  {c.validade_mes && c.validade_ano
                    ? ` · vence ${String(c.validade_mes).padStart(2, '0')}/${String(c.validade_ano).slice(-2)}`
                    : ''}
                </p>
                {c.principal && (
                  <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold uppercase text-emerald-700 ring-1 ring-inset ring-emerald-200">
                    cobranca automatica
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  if (!confirm('Remover este cartao? As proximas mensalidades voltam a ser por boleto.')) return;
                  remover.mutate(c.id, {
                    onSuccess: () => toast.success('Cartao removido'),
                    onError: (e) => toast.error(e.message),
                  });
                }}
                aria-label="Remover cartao"
                className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <CardContent className="p-6 text-center">
            <CreditCard className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-[13px] text-slate-500">
              Voce ainda nao tem cartao cadastrado. Suas mensalidades vem por boleto.
            </p>
          </CardContent>
        </Card>
      )}

      {!mostrarForm ? (
        <button
          onClick={() => setMostrarForm(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-acao px-4 py-3 text-[14px] font-semibold text-white transition hover:bg-acao-escura"
        >
          <CreditCard className="h-4 w-4" />
          {(cartoes ?? []).length > 0 ? 'Trocar o cartao' : 'Cadastrar cartao'}
        </button>
      ) : (
        <Card>
          <CardContent className="p-5">
            <form onSubmit={salvar} className="space-y-3">
              <p className="flex items-start gap-1.5 rounded-xl bg-slate-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-slate-600">
                <Lock className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" />
                O numero do seu cartao vai direto para a operadora e <b>nao fica guardado
                conosco</b>. Aqui ficam apenas a bandeira e os 4 ultimos digitos, para voce
                reconhecer o cartao nesta tela.
              </p>

              <Campo rotulo="Numero do cartao" valor={formatarNumero(form.numero)} mono
                inputMode="numeric" autoFocus
                onChange={(v) => setForm({ ...form, numero: v })}
                sufixo={bandeira !== 'DESCONHECIDA' ? bandeira : undefined} />

              <Campo rotulo="Nome como esta no cartao" valor={form.nome}
                onChange={(v) => setForm({ ...form, nome: v.toUpperCase() })} />

              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Validade (MM/AA)" valor={formatarValidade(form.validade)} mono
                  inputMode="numeric"
                  onChange={(v) => setForm({ ...form, validade: v })} />
                <Campo rotulo="Cod. seguranca" valor={form.cvv} mono inputMode="numeric"
                  onChange={(v) => setForm({ ...form, cvv: v.replace(/\D/g, '').slice(0, 4) })} />
              </div>

              {(erro || (problema && form.numero.length > 6)) && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
                  {erro ?? problema}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button" onClick={() => { setMostrarForm(false); setErro(null); }}
                  className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={!!problema || enviando}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-acao px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-acao-escura disabled:opacity-50"
                >
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Salvar cartao
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <p className="px-1 text-[11.5px] leading-relaxed text-slate-400">
        A cobranca no cartao acontece no vencimento de cada mensalidade. Boletos ja emitidos
        continuam validos e podem ser pagos normalmente em <b>Financeiro</b>.
      </p>
    </div>
  );
}

function Campo({ rotulo, valor, onChange, mono, inputMode, autoFocus, sufixo }: {
  rotulo: string; valor: string; onChange: (v: string) => void;
  mono?: boolean; inputMode?: 'numeric'; autoFocus?: boolean; sufixo?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{rotulo}</span>
      <div className="relative mt-1">
        <input
          value={valor} inputMode={inputMode} autoFocus={autoFocus} autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-xl border border-slate-300 px-3 py-2.5 text-[14px] outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 ${
            mono ? 'font-mono tracking-wide' : ''} ${sufixo ? 'pr-24' : ''}`}
        />
        {sufixo && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10.5px] font-bold uppercase tracking-wide text-cyan-600">
            {sufixo}
          </span>
        )}
      </div>
    </label>
  );
}
