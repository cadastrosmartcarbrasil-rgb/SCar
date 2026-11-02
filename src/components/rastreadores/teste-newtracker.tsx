'use client';

import { useState } from 'react';
import { Radio, Loader2, CheckCircle2, AlertTriangle, Copy, Download, Eye } from 'lucide-react';
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
  conta?: string;
  contas?: string[];
}

const RECURSOS = Object.entries(RECURSOS_NEWTRACKER) as [RecursoNewTracker, string][];

type Situacao = 'INSTALAR' | 'SEM_POSICAO' | 'VEICULO_SEM_CADASTRO' | 'FORA_DA_BASE';

interface LinhaResumo {
  imei: string; modelo: string | null; situacao: Situacao;
  placa_nt: string | null; chassi_nt: string | null; veiculo_nt: string | null;
  placa: string | null; chassi: string | null; casou_por: 'CHASSI' | 'PLACA' | null;
  comunicado_em: string | null; online: boolean | null;
}

interface RespostaImportacao {
  configured: boolean; ok: boolean; acao?: 'previa' | 'importar'; erro?: string; error?: string;
  integracao?: string;
  lidos?: { equipamentos: number; chips: number; veiculos: number; posicoes: number };
  por_conta?: { conta: string; equipamentos: number; chips: number; veiculos: number; posicoes: number }[];
  contagem?: Record<Situacao, number>;
  rotulos?: Record<Situacao, string>;
  a_instalar?: number; ja_instalados?: number; outra_plataforma?: number; com_posicao?: number;
  exemplos?: Record<Situacao, LinhaResumo[]>;
  resultado?: {
    cadastro: Record<string, number>; comunicacao: Record<string, number>;
    problemas: { imei: string; resultado: string; motivo: string | null }[];
  };
}

const ROTULO_RESULTADO: Record<string, string> = {
  CRIADO_INSTALADO: 'Cadastrados e instalados',
  INSTALADO: 'Instalados (já existiam no parque)',
  JA_INSTALADO: 'Já estavam instalados',
  CRIADO: 'Cadastrados em estoque',
  ATUALIZADO: 'Atualizados',
  VEICULO_NAO_ENCONTRADO: 'Veículo não encontrado',
  OUTRA_PLATAFORMA: 'IMEI de outra rastreadora',
  RECUSADO: 'Recusados',
  INVALIDO: 'Inválidos',
  ERRO: 'Erro',
  IGNORADO_ANTIGO: 'Posição mais antiga que a gravada',
  NAO_ENCONTRADO: 'Equipamento não encontrado',
};

const fmt = (n: number | undefined) => (n ?? 0).toLocaleString('pt-BR');

function quando(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function ImportarEquipamentos() {
  const [rodando, setRodando] = useState<'previa' | 'importar' | null>(null);
  const [resp, setResp] = useState<RespostaImportacao | null>(null);
  const [aba, setAba] = useState<Situacao>('INSTALAR');

  async function chamar(acao: 'previa' | 'importar') {
    if (acao === 'importar' && !window.confirm(
      `Importar ${fmt(resp?.a_instalar)} equipamento(s) para o parque, instalados nos veículos da Smart Car, e gravar a última posição de cada um?\n\nEquipamentos de veículos que não são da Smart Car ficam de fora.`,
    )) return;
    setRodando(acao);
    try {
      const r = await fetch('/api/v1/newtracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao }),
      });
      const j = (await r.json()) as RespostaImportacao;
      if (j.error) toast.error(j.error);
      else if (j.ok === false) toast.error(j.erro ?? 'Falha');
      else if (acao === 'importar') toast.success('Importação concluída');
      setResp(j);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao consultar');
    } finally {
      setRodando(null);
    }
  }

  const c = resp?.contagem;
  const linhas = resp?.exemplos?.[aba] ?? [];

  return (
    <div className="mt-5 border-t border-slate-200 pt-4">
      <h4 className="font-semibold text-slate-800">Importar equipamentos para o parque</h4>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">
        Lê todos os equipamentos, chips, veículos e posições da New Tracker e casa cada veículo com a nossa base
        (pelo chassi e, na falta, pela placa). Entram só os equipamentos instalados em veículos da Smart Car.
        Pode rodar de novo quando quiser: nada é duplicado.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!!rodando} onClick={() => chamar('previa')}>
          {rodando === 'previa' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          Ver prévia
        </Button>
        {resp?.ok && resp.acao === 'previa' && (resp.a_instalar ?? 0) > 0 && (
          <Button disabled={!!rodando} onClick={() => chamar('importar')}>
            {rodando === 'importar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Importar {fmt(resp.a_instalar)} equipamento(s)
          </Button>
        )}
      </div>
      {rodando && <p className="mt-2 text-sm text-slate-500">Lendo a plataforma da New Tracker… pode levar até alguns minutos.</p>}

      {resp && resp.ok === false && !rodando && (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4" /> {resp.erro ?? resp.error}
        </p>
      )}

      {resp?.ok && c && !rodando && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-slate-600">
            Lidos na New Tracker: {fmt(resp.lidos?.equipamentos)} equipamentos · {fmt(resp.lidos?.chips)} chips ·{' '}
            {fmt(resp.lidos?.veiculos)} veículos · {fmt(resp.lidos?.posicoes)} posições. Gravação em nome da chave
            “{resp.integracao}”.
          </p>
          {(resp.por_conta?.length ?? 0) > 1 && (
            <ul className="text-xs text-slate-500">
              {resp.por_conta!.map((c) => (
                <li key={c.conta}>
                  Conta {c.conta}: {fmt(c.equipamentos)} equipamentos · {fmt(c.chips)} chips · {fmt(c.veiculos)} veículos ·{' '}
                  {fmt(c.posicoes)} posições
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(c) as Situacao[]).map((s) => (
              <button
                key={s}
                onClick={() => setAba(s)}
                className={cn('rounded-lg border p-3 text-left', aba === s ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200')}
              >
                <div className="text-xl font-semibold tnum text-slate-800">{fmt(c[s])}</div>
                <div className="text-xs text-slate-500">{resp.rotulos?.[s] ?? s}</div>
              </button>
            ))}
          </div>
          <p className="text-sm text-slate-600">
            Dos instalados em veículos da Smart Car: <b>{fmt(resp.a_instalar)}</b> a importar ·{' '}
            {fmt(resp.ja_instalados)} já estão no parque · {fmt(resp.outra_plataforma)} com IMEI de outra rastreadora ·{' '}
            {fmt(resp.com_posicao)} com posição.
          </p>

          {resp.resultado && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              <p className="font-medium">Resultado da importação</p>
              <ul className="mt-1 list-disc pl-5">
                {Object.entries(resp.resultado.cadastro).map(([k, n]) => (
                  <li key={k}>{ROTULO_RESULTADO[k] ?? k}: {fmt(n)}</li>
                ))}
                {Object.entries(resp.resultado.comunicacao).map(([k, n]) => (
                  <li key={'c' + k}>Posição — {ROTULO_RESULTADO[k] ?? k}: {fmt(n)}</li>
                ))}
              </ul>
              {resp.resultado.problemas.length > 0 && (
                <div className="mt-2 text-rose-700">
                  <p className="font-medium">Não entraram ({resp.resultado.problemas.length}):</p>
                  <ul className="mt-1 max-h-40 list-disc overflow-auto pl-5 text-xs">
                    {resp.resultado.problemas.slice(0, 100).map((p) => (
                      <li key={p.imei + p.resultado}>IMEI {p.imei}: {p.motivo ?? ROTULO_RESULTADO[p.resultado] ?? p.resultado}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {resp.exemplos && (
            <div className="overflow-x-auto">
              <p className="mb-1 text-xs text-slate-500">
                {resp.rotulos?.[aba]} — mostrando até 50
              </p>
              {linhas.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-superficie-alta text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-2 py-1">IMEI</th><th className="px-2 py-1">Modelo</th>
                      <th className="px-2 py-1">Veículo na New Tracker</th><th className="px-2 py-1">Veículo no SCar</th>
                      <th className="px-2 py-1">Última comunicação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <tr key={l.imei} className="border-t border-slate-200">
                        <td className="px-2 py-1 font-mono text-xs">{l.imei}</td>
                        <td className="px-2 py-1 text-xs">{l.modelo ?? '—'}</td>
                        <td className="px-2 py-1 text-xs">
                          {[l.placa_nt, l.chassi_nt].filter(Boolean).join(' · ') || '—'}
                          {l.veiculo_nt && <div className="text-slate-400">{l.veiculo_nt}</div>}
                        </td>
                        <td className="px-2 py-1 text-xs">
                          {l.placa || l.chassi ? (
                            <>
                              {l.placa ?? `0 KM · ${l.chassi}`}
                              {l.casou_por && <span className="ml-1 text-slate-400">(pelo {l.casou_por === 'CHASSI' ? 'chassi' : 'placa'})</span>}
                            </>
                          ) : '—'}
                        </td>
                        <td className="px-2 py-1 text-xs">
                          {quando(l.comunicado_em)}
                          {l.online != null && <span className={cn('ml-1', l.online ? 'text-emerald-700' : 'text-slate-400')}>{l.online ? 'online' : 'offline'}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TesteNewTracker() {
  const [carregando, setCarregando] = useState<RecursoNewTracker | null>(null);
  const [resp, setResp] = useState<Resposta | null>(null);
  const [conta, setConta] = useState<string | null>(null);
  const contas = resp?.contas ?? [];

  async function testar(recurso: RecursoNewTracker) {
    setCarregando(recurso);
    try {
      const r = await fetch('/api/v1/newtracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recurso, limite: 5, conta }),
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

      {contas.length > 1 && (
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
          Conta da New Tracker:
          <select
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
            value={conta ?? resp?.conta ?? contas[0]}
            onChange={(e) => setConta(e.target.value)}
          >
            {contas.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      )}

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
            {RECURSOS_NEWTRACKER[resp.recurso ?? 'status']}{contas.length > 1 && resp.conta ? ` · conta ${resp.conta}` : ''} · HTTP {resp.http} · {resp.ms} ms
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

      <ImportarEquipamentos />
    </div>
  );
}
