'use client';

import { useState } from 'react';
import { Radio, Loader2, CheckCircle2, AlertTriangle, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { RECURSOS_NEWTRACKER, type CampoAmostra, type RecursoNewTracker } from '@/lib/newtracker';
import { cn } from '@/lib/utils';

// Teste da integracao com a plataforma da New Tracker (Fleet Hub 360).
// So LEITURA: mostra o que a API deles devolve, sem gravar nada. E com essa
// amostra que a sincronia do parque de rastreadores vai ser escrita.

interface Resposta {
  configured: boolean;
  ok?: boolean;
  http?: number;
  recurso?: RecursoNewTracker;
  ms?: number;
  total?: number | null;
  corpo?: unknown;
  campos?: CampoAmostra[];
  amostra?: Record<string, unknown>[];
  erro?: string;
  bruto?: unknown;
  error?: string;
}

const RECURSOS = Object.entries(RECURSOS_NEWTRACKER) as [RecursoNewTracker, string][];

export function TesteNewTracker() {
  const [carregando, setCarregando] = useState<RecursoNewTracker | null>(null);
  const [resp, setResp] = useState<Resposta | null>(null);

  async function testar(recurso: RecursoNewTracker) {
    setCarregando(recurso);
    try {
      const r = await fetch('/api/v1/newtracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recurso, limite: 5 }),
      });
      const j = (await r.json()) as Resposta;
      if (!r.ok && j.error) toast.error(j.error);
      setResp(j);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao consultar');
    } finally {
      setCarregando(null);
    }
  }

  function copiar() {
    navigator.clipboard.writeText(JSON.stringify(resp?.amostra?.length ? resp.amostra : resp?.corpo, null, 2))
      .then(() => toast.success('Amostra copiada'));
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-superficie p-4">
      <div className="flex items-center gap-2">
        <Radio className="h-4 w-4 text-cyan-600" />
        <h3 className="font-semibold text-slate-800">Plataforma da New Tracker (Fleet Hub 360)</h3>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">
        Testa a chave da New Tracker e mostra uma amostra do que a API deles devolve. Nada é gravado no SCar:
        a sincronização do parque de rastreadores será ligada depois de conferirmos os dados reais.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {RECURSOS.map(([r, rotulo]) => (
          <Button key={r} variant={r === 'status' ? 'primary' : 'secondary'} disabled={!!carregando} onClick={() => testar(r)}>
            {carregando === r && <Loader2 className="h-4 w-4 animate-spin" />}
            {r === 'status' ? 'Testar conexão' : rotulo}
          </Button>
        ))}
      </div>

      {resp && !resp.configured && !resp.error && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          A chave da New Tracker não está configurada no servidor. Coloque <code>NEWTRACKER_API_KEY=fh_live_...</code> no
          <code> .env</code> do VPS e recrie o contêiner.
        </p>
      )}

      {resp?.configured && resp.ok === false && (
        <div className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> {resp.erro}</p>
          {resp.bruto != null && (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(resp.bruto, null, 2)}</pre>
          )}
        </div>
      )}

      {resp?.configured && resp.ok && (
        <div className="mt-3 space-y-3">
          <p className="flex flex-wrap items-center gap-2 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            {RECURSOS_NEWTRACKER[resp.recurso ?? 'status']} · HTTP {resp.http} · {resp.ms} ms
            {resp.total != null && <span className="text-slate-600">· {resp.total.toLocaleString('pt-BR')} registros no total</span>}
          </p>

          {resp.recurso === 'status' && (
            <pre className="max-h-60 overflow-auto rounded-lg bg-fundo p-3 text-xs text-slate-700">{JSON.stringify(resp.corpo, null, 2)}</pre>
          )}

          {resp.recurso !== 'status' && (resp.campos?.length ?? 0) === 0 && (
            <p className="text-sm text-slate-500">Nenhum registro veio nesta consulta.</p>
          )}

          {(resp.campos?.length ?? 0) > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-superficie-alta text-left text-xs text-slate-500">
                  <tr><th className="px-2 py-1">Campo</th><th className="px-2 py-1">Preenchidos</th><th className="px-2 py-1">Exemplo</th></tr>
                </thead>
                <tbody>
                  {resp.campos!.map((c) => (
                    <tr key={c.campo} className="border-t border-slate-200">
                      <td className="px-2 py-1 font-mono text-xs text-slate-700">{c.campo}</td>
                      <td className={cn('px-2 py-1 tnum', c.preenchidos === 0 && 'text-slate-400')}>{c.preenchidos}/{c.total}</td>
                      <td className="px-2 py-1 font-mono text-xs text-slate-500 break-all">{c.exemplo ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(resp.amostra?.length || resp.recurso === 'status') && (
            <Button variant="ghost" onClick={copiar}><Copy className="h-4 w-4" /> Copiar amostra (JSON)</Button>
          )}
        </div>
      )}
    </div>
  );
}
