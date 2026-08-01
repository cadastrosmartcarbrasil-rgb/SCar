'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Car } from 'lucide-react';

// Login simplificado do associado (CPF/CNPJ + senha).
export default function PortalLoginPage() {
  const router = useRouter();
  const [cpf, setCpf] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/portal/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpf_cnpj: cpf, senha }),
    });
    setLoading(false);
    if (!res.ok) {
      const { error } = await res.json();
      toast.error(error ?? 'Falha no login');
      return;
    }
    router.push('/portal');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-700 px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow-lg">
        <div className="flex flex-col items-center gap-2 pb-2">
          <div className="rounded-xl bg-brand-600 p-2 text-white">
            <Car className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Portal do Associado</h1>
          <p className="text-xs text-slate-500">Acesse sua frota e boletos</p>
        </div>

        <div>
          <label className="text-sm text-slate-600">CPF / CNPJ</label>
          <input
            required
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            placeholder="Somente numeros"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm text-slate-600">Senha</label>
          <input
            type="password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {loading ? 'Entrando...' : 'Acessar'}
        </button>
      </form>
    </div>
  );
}
