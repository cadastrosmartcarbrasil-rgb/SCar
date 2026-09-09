'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Database, PlugZap, DownloadCloud, ShieldAlert, Building2, ListChecks, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useMutualCapturas, useMutualDiagnostico, useMutualPorStatus, useMutualFiliais,
  useMutualQuarentena, usePingMutual, useCapturarMutual,
} from '@/hooks/use-mutual';
import { ENTIDADES_INCREMENTAIS, ROTULO_QUARENTENA, type EntidadeMutual } from '@/lib/mutual';
import type { MutualDiagnostico, SeveridadeDiagnostico } from '@/lib/database.types';

// FASE 1 da integracao com o MUTUAL: consulta e diagnostico.
// A tela NAO decide nada — o de-para, a quarentena e a severidade vivem em
// src/lib/mutual.ts e na 0062, os dois com teste.

const ENTIDADES: { chave: EntidadeMutual; rotulo: string; nota: string }[] = [
  { chave: 'CONTRACT_OBJECT', rotulo: 'Objetos de contrato', nota: 'a espinha: veiculo + associado + valor cobrado' },
  { chave: 'REGIONAL', rotulo: 'Filiais', nota: 'de-para com as nossas unidades' },
  { chave: 'PERSON', rotulo: 'Associados', nota: 'ficha completa (sem filtro por alteracao)' },
  { chave: 'ADDRESS', rotulo: 'Enderecos', nota: 'entidade propria no Mutual' },
  { chave: 'INVOICE', rotulo: 'Faturas', nota: 'o que esta sendo cobrado hoje' },
  { chave: 'EVENT', rotulo: 'Eventos', nota: 'sem filtro por alteracao nem paginacao' },
  { chave: 'CONSULTANT', rotulo: 'Consultores', nota: 'vendedores' },
  { chave: 'VEHICLE_TYPE', rotulo: 'Tipos de veiculo', nota: 'tabela de dominio' },
  { chave: 'VEHICLE_COLOR', rotulo: 'Cores', nota: 'tabela de dominio' },
  { chave: 'VEHICLE_CATEGORY', rotulo: 'Categorias', nota: 'tabela de dominio' },
  { chave: 'VEHICLE_USE_TYPE', rotulo: 'Tipos de uso', nota: 'tabela de dominio' },
  { chave: 'EVENT_TYPE', rotulo: 'Tipos de evento', nota: 'tabela de dominio' },
];

const TOM: Record<SeveridadeDiagnostico, string> = {
  OK: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  ATENCAO: 'bg-amber-50 text-amber-700 ring-amber-200',
  CRITICO: 'bg-red-50 text-red-700 ring-red-200',
};

function Secao({ titulo, icone: Icone, children, acao }: {
  titulo: string; icone: React.ElementType; children: React.ReactNode; acao?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-superficie p-5">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
          <Icone className="h-4 w-4 text-cyan-600" aria-hidden /> {titulo}
        </h2>
        {acao}
      </header>
      {children}
    </section>
  );
}

export default function IntegracaoMutualPage() {
  const capturas = useMutualCapturas();
  const diagnostico = useMutualDiagnostico();
  const porStatus = useMutualPorStatus();
  const filiais = useMutualFiliais();
  const quarentena = useMutualQuarentena(200);
  const ping = usePingMutual();
  const capturar = useCapturarMutual();
  const [paginas, setPaginas] = useState(5);
  // De onde continuar em cada entidade. Sem isto, o botao recomeçaria sempre da
  // pagina 1 e uma base de ~13 mil objetos nunca passaria das primeiras.
  const [proximas, setProximas] = useState<Partial<Record<EntidadeMutual, number>>>({});

  async function testar() {
    const r = await ping.mutateAsync();
    if (!r.configured) { toast.error('MUTUAL_API_TOKEN nao esta configurada no servidor'); return; }
    if (r.ok) toast.success(`Conexao OK (HTTP ${r.http}) — ${r.registros} registros na amostra`);
    else toast.error(`Falhou: HTTP ${r.http ?? '-'} ${r.erro ?? ''}`);
  }

  async function puxar(entidade: EntidadeMutual) {
    const inicio = proximas[entidade] ?? 1;
    const r = await capturar.mutateAsync({ entidade, paginas, pagina_inicial: inicio });
    if (!r.configured) { toast.error('MUTUAL_API_TOKEN nao esta configurada no servidor'); return; }
    if (!r.ok) { toast.error(r.erro ?? r.error ?? 'Falha ao consultar o Mutual'); return; }

    // Guarda de onde continuar; sem `proxima_pagina`, a entidade acabou.
    setProximas((p) => {
      const novo = { ...p };
      if (r.proxima_pagina) novo[entidade] = r.proxima_pagina;
      else delete novo[entidade];
      return novo;
    });
    toast.success(
      `${r.registros} registros em ${r.paginas} pagina(s)` +
      (r.total_remoto ? ` de ${r.total_remoto} no total` : '') +
      (r.proxima_pagina ? '. Clique de novo para continuar.' : '. Acabou esta entidade.'),
    );
  }

  const grupos = (diagnostico.data ?? []).reduce<Record<string, MutualDiagnostico[]>>((acc, d) => {
    (acc[d.grupo] ??= []).push(d); return acc;
  }, {});
  const criticos = (diagnostico.data ?? []).filter((d) => d.severidade === 'CRITICO' && d.valor > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Database className="h-6 w-6 text-cyan-600" aria-hidden /> Integracao com o Mutual
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Fase 1: consulta e diagnostico dos dados antes de importar.
        </p>
      </div>

      {/* A regra desta fase, na propria tela — para ninguem achar que ja migrou. */}
      <div className="rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4 text-sm text-slate-700">
        <strong className="font-semibold text-slate-900">Nada aqui altera a operacao.</strong>{' '}
        O que e puxado fica numa area de captura propria e vira relatorio. Nenhum associado,
        veiculo, fatura ou boleto e criado — a carga de verdade e a Fase 3, e ela so comeca
        depois que estes numeros estiverem na mesa.
      </div>

      <Secao titulo="Conexao" icone={PlugZap} acao={
        <Button onClick={testar} disabled={ping.isPending} variant="secondary">
          {ping.isPending ? 'Testando...' : 'Testar conexao'}
        </Button>
      }>
        <p className="text-sm text-slate-600">
          O token vive no servidor (<code className="text-xs">MUTUAL_API_TOKEN</code>) e nunca chega
          ao navegador. Timeout costuma significar IP nao liberado; 401/403, token ou escopo.
        </p>
      </Secao>

      <Secao titulo="Puxar dados" icone={DownloadCloud} acao={
        <label className="flex items-center gap-2 text-xs text-slate-600">
          Paginas por vez
          <select
            className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
            value={paginas}
            onChange={(e) => setPaginas(Number(e.target.value))}
          >
            {[1, 5, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          {Object.keys(proximas).length > 0 && (
            <Button variant="ghost" onClick={() => setProximas({})}>Recomecar do inicio</Button>
          )}
        </label>
      }>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ENTIDADES.map((e) => {
            const cap = (capturas.data ?? []).find((c) => c.entidade === e.chave);
            return (
              <button
                key={e.chave}
                onClick={() => void puxar(e.chave)}
                disabled={capturar.isPending}
                className="rounded-xl border border-slate-200 bg-fundo p-3 text-left transition hover:border-cyan-400 disabled:opacity-60"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800">{e.rotulo}</span>
                  {ENTIDADES_INCREMENTAIS.includes(e.chave) && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1 bg-emerald-50 text-emerald-700 ring-emerald-200">
                      incremental
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{e.nota}</p>
                <p className="mt-2 text-xs tnum text-slate-600">
                  {cap ? `${cap.registros} capturados${cap.total_remoto ? ` de ${cap.total_remoto}` : ''}` : 'nada capturado ainda'}
                </p>
                {proximas[e.chave] && (
                  <p className="mt-1 text-xs font-medium text-cyan-700">
                    Ha mais — continua da pagina {proximas[e.chave]}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </Secao>

      {criticos.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-red-800">
            <ShieldAlert className="h-4 w-4" aria-hidden /> Impedimentos para a carga
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {criticos.map((c) => (
              <li key={c.indicador}>
                <strong className="tnum">{c.valor}</strong> · {c.indicador} — {c.detalhe}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Secao titulo="Diagnostico" icone={ListChecks} acao={
        <Button variant="ghost" onClick={() => void diagnostico.refetch()}>
          <RefreshCw className="h-4 w-4" aria-hidden />
        </Button>
      }>
        {diagnostico.isLoading && <p className="text-sm text-slate-500">Carregando...</p>}
        {!diagnostico.isLoading && (diagnostico.data ?? []).length === 0 && (
          <p className="text-sm text-slate-500">
            Sem dados ainda. Puxe ao menos os <strong>Objetos de contrato</strong> acima.
          </p>
        )}
        <div className="space-y-4">
          {Object.entries(grupos).map(([grupo, itens]) => (
            <div key={grupo}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{grupo}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {itens.map((d) => (
                      <tr key={d.indicador} className="border-t border-slate-100">
                        <td className="py-2 pr-3 tnum font-semibold text-slate-900">{d.valor}</td>
                        <td className="py-2 pr-3 text-slate-800">{d.indicador}</td>
                        <td className="py-2 pr-3 text-xs text-slate-500">{d.detalhe}</td>
                        <td className="py-2 text-right">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1 ${TOM[d.severidade]}`}>
                            {d.severidade}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Secao>

      {(porStatus.data ?? []).length > 0 && (
        <Secao titulo="Situacao dos contratos (de-para)" icone={ListChecks}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2">Status no Mutual</th>
                  <th className="pb-2">Vira no SCar</th>
                  <th className="pb-2 text-right">Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {(porStatus.data ?? []).map((s) => (
                  <tr key={`${s.contract_status}-${s.status_scar}`} className="border-t border-slate-100">
                    <td className="py-2 text-slate-800">{s.contract_status ?? '(sem status)'}</td>
                    <td className="py-2 text-slate-600">{s.status_scar}</td>
                    <td className="py-2 text-right tnum text-slate-900">{s.quantidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      {(filiais.data ?? []).length > 0 && (
        <Secao titulo="Filiais do Mutual" icone={Building2}>
          <p className="mb-3 text-xs text-slate-500">
            A correspondencia com as nossas unidades e <strong>manual</strong> (Fase 2): criar
            regional e criar tenant. Abaixo, so o palpite por CNPJ ou nome.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2">Filial</th><th className="pb-2">CNPJ</th>
                  <th className="pb-2 text-right">Objetos</th><th className="pb-2">Unidade no SCar</th>
                </tr>
              </thead>
              <tbody>
                {(filiais.data ?? []).map((f) => (
                  <tr key={f.id_externo} className="border-t border-slate-100">
                    <td className="py-2 text-slate-800">{f.nome ?? '(sem nome)'}</td>
                    <td className="py-2 tnum text-slate-600">{f.cnpj ?? '—'}</td>
                    <td className="py-2 text-right tnum text-slate-900">{f.objetos}</td>
                    <td className="py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1 ${f.ja_existe_id ? TOM.OK : TOM.ATENCAO}`}>
                        {f.ja_existe_id ? 'ha candidata' : 'sem correspondencia'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      {(quarentena.data ?? []).length > 0 && (
        <Secao titulo={`Quarentena (${quarentena.data?.length})`} icone={ShieldAlert}>
          <p className="mb-3 text-xs text-slate-500">
            Linhas que <strong>nao entrariam</strong> na base como estao. Corrigir no Mutual e
            puxar de novo — a captura e re-executavel.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2">Placa</th><th className="pb-2">Associado</th>
                  <th className="pb-2">CPF/CNPJ</th><th className="pb-2">Situacao</th>
                  <th className="pb-2">Motivos</th>
                </tr>
              </thead>
              <tbody>
                {(quarentena.data ?? []).map((q) => (
                  <tr key={q.id_externo} className="border-t border-slate-100">
                    <td className="py-2 tnum text-slate-800">{q.placa ?? '—'}</td>
                    <td className="py-2 text-slate-800">{q.associado ?? '—'}</td>
                    <td className="py-2 tnum text-slate-600">{q.cpf_cnpj ?? '—'}</td>
                    <td className="py-2 text-xs text-slate-500">{q.situacao ?? '—'}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {q.motivos.map((m) => (
                          <span key={m} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${TOM.CRITICO}`}>
                            {ROTULO_QUARENTENA[m as keyof typeof ROTULO_QUARENTENA] ?? m}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      )}
    </div>
  );
}
