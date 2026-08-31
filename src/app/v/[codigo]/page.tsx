'use client';

import { use, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { maskCelular } from '@/lib/utils';

/**
 * Hotlink de vendas: pagina publica do vendedor.
 * Quem preenche aqui vira um lead JA vinculado a ele — e como a comissao da
 * indicacao fica rastreada.
 */
export default function HotlinkPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = use(params);
  const [vendedor, setVendedor] = useState<string | null>(null);
  const [invalido, setInvalido] = useState(false);
  const [form, setForm] = useState({ nome: '', celular: '', email: '', placa: '' });
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc('resolver_hotlink', { p_codigo: codigo }).then(({ data }) => {
      const d = data?.[0];
      if (d) setVendedor(d.nome);
      else setInvalido(true);
    });
  }, [codigo]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch('/api/v1/hotlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, codigo }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Nao consegui enviar');
      setPronto(true);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#eef2f8] px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="cockpit mb-4 rounded-2xl px-5 py-6 text-center">
          <p className="text-lg font-bold tracking-tight text-white">
            SMART<span className="text-cyan-400">CAR</span>BRASIL
          </p>
          <p className="mt-1 text-xs text-white/70">Protecao veicular</p>
        </div>

        {invalido ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
            <p className="text-sm font-semibold text-slate-800">Link indisponivel</p>
            <p className="mt-1 text-xs text-slate-500">
              Este link de vendas nao esta ativo. Fale com o seu consultor.
            </p>
          </div>
        ) : pronto ? (
          <div className="rounded-2xl border border-emerald-200 bg-white p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="mt-2 text-sm font-semibold text-slate-800">Recebemos seus dados!</p>
            <p className="mt-1 text-xs text-slate-500">
              {vendedor ?? 'Seu consultor'} vai entrar em contato com a sua cotacao.
            </p>
          </div>
        ) : (
          <form onSubmit={enviar} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
            <div>
              <h1 className="text-base font-semibold text-slate-900">Faca sua cotacao</h1>
              <p className="mt-0.5 text-xs text-slate-500">
                {vendedor ? <>Atendimento com <b>{vendedor}</b>.</> : 'Preencha e entramos em contato.'}
              </p>
            </div>

            <Campo rotulo="Nome completo *" valor={form.nome} onChange={(v) => setForm({ ...form, nome: v })} />
            <Campo rotulo="Celular / WhatsApp *" valor={form.celular} onChange={(v) => setForm({ ...form, celular: maskCelular(v) })} inputMode="tel" />
            <Campo rotulo="E-mail" valor={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
            <Campo rotulo="Placa do veiculo" valor={form.placa} onChange={(v) => setForm({ ...form, placa: v.toUpperCase() })} />

            {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{erro}</p>}

            <button
              type="submit"
              disabled={enviando}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
              Quero minha cotacao
            </button>

            <p className="flex items-center justify-center gap-1 text-[11px] text-slate-400">
              <ShieldCheck className="h-3 w-3" /> Seus dados sao usados apenas para esta cotacao.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

function Campo({ rotulo, valor, onChange, type = 'text', inputMode }: {
  rotulo: string; valor: string; onChange: (v: string) => void;
  type?: string; inputMode?: 'tel' | 'text';
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{rotulo}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
      />
    </label>
  );
}
