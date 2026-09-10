'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Database, PlugZap, DownloadCloud, ShieldAlert, Building2, ListChecks, RefreshCw,
  Search, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useMutualCapturas, useMutualDiagnostico, useMutualPorStatus, useMutualFiliais,
  useMutualQuarentena, useMutualStatusNaoMapeados, useMutualPeriodicidade,
  useMutualStatusCruzado,
  useMutualCampos, usePingMutual, useCapturaMutual,
  useMutualCoberturaConsultor, useMutualConsultoresPendentes,
} from '@/hooks/use-mutual';
import {
  ENTIDADES_INCREMENTAIS, ROTULO_QUARENTENA, ROTULO_PERIODO_MUTUAL, type EntidadeMutual,
  gargaloDoFunil, coberturaDoFunil, teseDoConsultorSeSustenta,
} from '@/lib/mutual';
import type { MutualDiagnostico, SeveridadeDiagnostico } from '@/lib/database.types';

// FASE 1 da integracao com o MUTUAL: consulta e diagnostico.
// A tela NAO decide nada — o de-para, a quarentena e a severidade vivem em
// src/lib/mutual.ts e na 0062, os dois com teste.

const ENTIDADES: { chave: EntidadeMutual; rotulo: string; nota: string }[] = [
  { chave: 'CONTRACT_OBJECT', rotulo: 'Objetos de contrato', nota: 'a espinha: veiculo + associado + valor cobrado' },
  { chave: 'CONTRACT', rotulo: 'Contratos', nota: 'e AQUI que moram o dia de vencimento e a unidade' },
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

// A ordem em que a gestao le: quanto tem -> o que trava a carteira viva ->
// cadastro -> unicidade -> estrutura -> e, por ultimo, o acervo encerrado, que
// e informativo. Sem isto os grupos sairiam em ordem alfabetica e "ACERVO
// INATIVO" abriria o relatorio, que e o oposto da prioridade.
const ORDEM_GRUPOS = ['VOLUME', 'BLOQUEIO', 'CADASTRO', 'UNICIDADE', 'ESTRUTURA', 'ACERVO INATIVO'];

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
  const funil = useMutualCoberturaConsultor(true);
  const pendentes = useMutualConsultoresPendentes(true, 50);
  const diagnostico = useMutualDiagnostico();
  const porStatus = useMutualPorStatus();
  const filiais = useMutualFiliais();
  const [inspecionar, setInspecionar] = useState<EntidadeMutual>('CONTRACT');
  const [caminho, setCaminho] = useState('');
  const campos = useMutualCampos(inspecionar, caminho || undefined);
  const [soFaturaveis, setSoFaturaveis] = useState(true);
  // 0071: o 0 km (sem placa, com chassi) nao e dado sujo — e fila operacional.
  // Fica fora da quarentena por padrao; este botao mostra.
  const [verPlacaPendente, setVerPlacaPendente] = useState(false);
  const quarentena = useMutualQuarentena(200, soFaturaveis, verPlacaPendente);
  const cruzado = useMutualStatusCruzado();
  const naoMapeados = useMutualStatusNaoMapeados();
  const periodicidade = useMutualPeriodicidade();
  const ping = usePingMutual();
  const { puxarTudo, parar, progresso, rodando } = useCapturaMutual();
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
    const r = await puxarTudo(entidade, {
      paginasPorVez: paginas,
      inicio: proximas[entidade] ?? 1,
    });

    // Onde retomar. Sem `proximaPagina`, a entidade acabou.
    setProximas((p) => {
      const novo = { ...p };
      if (r.proximaPagina) novo[entidade] = r.proximaPagina;
      else delete novo[entidade];
      return novo;
    });

    if (!r.configured) { toast.error('MUTUAL_API_TOKEN nao esta configurada no servidor'); return; }
    if (!r.ok) {
      // O que ja veio esta gravado: o erro diz de onde retomar, nao manda recomecar.
      toast.error(
        `${r.erro} — ${r.registros} registros gravados antes de parar` +
        (r.proximaPagina ? `. Clique de novo para retomar da pagina ${r.proximaPagina}.` : '.'),
      );
      return;
    }
    if (r.parado) {
      toast.message(
        `Parado a seu pedido: ${r.registros} registros em ${r.paginas} pagina(s). ` +
        `Clique de novo para retomar da pagina ${r.proximaPagina}.`,
      );
      return;
    }
    toast.success(
      `Concluido: ${r.registros} registros em ${r.paginas} pagina(s)` +
      (r.total ? ` de ${r.total} no total` : '') + '.',
    );
  }

  const porGrupo = (diagnostico.data ?? []).reduce<Record<string, MutualDiagnostico[]>>((acc, d) => {
    (acc[d.grupo] ??= []).push(d); return acc;
  }, {});
  const grupos = Object.entries(porGrupo).sort(
    ([a], [b]) => (ORDEM_GRUPOS.indexOf(a) + 1 || 99) - (ORDEM_GRUPOS.indexOf(b) + 1 || 99),
  );
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
        rodando ? (
          <Button variant="secondary" onClick={parar}>Parar</Button>
        ) : (
          <label className="flex items-center gap-2 text-xs text-slate-600">
            Paginas por bloco
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
        )
      }>
        <p className="mb-3 text-xs text-slate-500">
          O clique puxa a entidade <strong>ate o fim</strong>, em blocos — nao e preciso ficar
          clicando. Cada bloco ja grava o que trouxe e a captura e re-executavel, entao parar no
          meio (ou um erro de rede) nunca perde o que ja veio: o proximo clique retoma de onde
          parou.
        </p>

        {progresso && (
          <div className="mb-3 rounded-xl border border-cyan-200 bg-cyan-50/60 p-3">
            <p className="text-sm font-medium text-slate-800">
              Puxando {ENTIDADES.find((x) => x.chave === progresso.entidade)?.rotulo ?? progresso.entidade}...
            </p>
            <p className="mt-0.5 text-xs tnum text-slate-600">
              {progresso.registros} registros · {progresso.paginas} pagina(s)
              {progresso.total ? ` de ${progresso.total} no total` : ''} · proxima pagina{' '}
              {progresso.proxima}
            </p>
            {progresso.total ? (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-cyan-500 transition-all"
                  style={{ width: `${Math.min(100, Math.round((progresso.registros / progresso.total) * 100))}%` }}
                />
              </div>
            ) : null}
            <p className="mt-1.5 text-[11px] text-slate-500">
              O botao <strong>Parar</strong> encerra no fim do bloco atual — nao no meio de uma
              gravacao.
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ENTIDADES.map((e) => {
            const cap = (capturas.data ?? []).find((c) => c.entidade === e.chave);
            return (
              <button
                key={e.chave}
                onClick={() => void puxar(e.chave)}
                disabled={rodando}
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
          {grupos.map(([grupo, itens]) => (
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

      <Secao titulo="O que existe no payload" icone={Search} acao={
        <div className="flex items-center gap-2">
          <select
            className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
            value={inspecionar}
            onChange={(e) => { setInspecionar(e.target.value as EntidadeMutual); setCaminho(''); }}
          >
            {ENTIDADES.map((e) => <option key={e.chave} value={e.chave}>{e.rotulo}</option>)}
          </select>
          <input
            className="w-40 rounded-lg border border-slate-200 px-2 py-1 text-sm"
            placeholder="objeto aninhado"
            value={caminho}
            onChange={(e) => setCaminho(e.target.value)}
          />
        </div>
      }>
        <p className="mb-3 text-xs text-slate-500">
          As chaves que <strong>realmente vem</strong> no que foi capturado, com quantas chegam
          preenchidas e um exemplo. Serve para achar um campo <strong>sem supor onde ele mora</strong> —
          supor ja custou duas rodadas aqui (o dia de vencimento estava no contrato, e a unidade nao
          esta em <code className="text-[11px]">regional</code> em lugar nenhum). Para olhar dentro
          de um objeto, escreva o nome dele no campo ao lado (ex.:{' '}
          <code className="text-[11px]">vehicle_data</code>,{' '}
          <code className="text-[11px]">person_data</code>).
        </p>
        {campos.isLoading && <p className="text-sm text-slate-500">Carregando...</p>}
        {!campos.isLoading && (campos.data ?? []).length === 0 && (
          <p className="text-sm text-slate-500">
            Nada capturado nesta entidade ainda — ou o objeto aninhado nao existe.
          </p>
        )}
        {(campos.data ?? []).length > 0 && (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-superficie">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2">Campo</th>
                  <th className="pb-2 text-right">Preenchidos</th>
                  <th className="pb-2 text-right">Vazios</th>
                  <th className="pb-2">Exemplo</th>
                </tr>
              </thead>
              <tbody>
                {(campos.data ?? []).map((c) => (
                  <tr key={c.campo} className="border-t border-slate-100">
                    <td className="py-1.5 font-medium text-slate-800">{c.campo}</td>
                    <td className={`py-1.5 text-right tnum ${c.preenchidos > 0 ? 'font-semibold text-slate-900' : 'text-slate-400'}`}>
                      {c.preenchidos}
                    </td>
                    <td className="py-1.5 text-right tnum text-slate-500">{c.vazios}</td>
                    <td className="py-1.5 truncate text-xs text-slate-600">{c.exemplo ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      {(periodicidade.data ?? []).length > 0 && (
        <Secao titulo="Periodicidade da cobranca" icone={ListChecks}>
          <p className="mb-3 text-xs text-slate-500">
            No SCar, <code className="text-[11px]">valor_mensalidade</code> e{' '}
            <strong>mensal</strong>. No Mutual o contrato tem periodo (a tela mostra
            &quot;Semestral · 6 parcelas · parcela R$ 120,00 · total R$ 720,00&quot;), entao e
            preciso saber se o <code className="text-[11px]">final_total_value</code> do objeto e a{' '}
            <strong>parcela</strong> ou o <strong>total</strong>. <strong>Compare as linhas:</strong>{' '}
            se o valor mediano do semestral for parecido com o do mensal, e parcela; se for umas 6
            vezes maior, e o total — e a carga precisa dividir, senao o associado recebe boleto de
            6x o que paga hoje.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2">Periodo</th>
                  <th className="pb-2 text-right">Contratos</th>
                  <th className="pb-2 text-right">Faturaveis</th>
                  <th className="pb-2 text-right">Parcelas (media)</th>
                  <th className="pb-2 text-right">Valor mediano</th>
                  <th className="pb-2 text-right">Faixa</th>
                </tr>
              </thead>
              <tbody>
                {(periodicidade.data ?? []).map((p) => (
                  <tr key={p.periodo} className="border-t border-slate-100">
                    <td className="py-2 text-slate-800">
                      {p.meses ? ROTULO_PERIODO_MUTUAL[p.meses] ?? p.periodo : p.periodo}
                      {p.meses && p.meses > 1 && (
                        <span className="ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1 bg-amber-50 text-amber-700 ring-amber-200">
                          nao mensal
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right tnum text-slate-900">{p.contratos}</td>
                    <td className="py-2 text-right tnum text-slate-600">{p.objetos}</td>
                    <td className="py-2 text-right tnum text-slate-600">{p.parcelas_media ?? '—'}</td>
                    <td className="py-2 text-right tnum font-semibold text-slate-900">
                      {p.valor_mediano != null ? `R$ ${p.valor_mediano}` : '—'}
                    </td>
                    <td className="py-2 text-right tnum text-xs text-slate-500">
                      {p.valor_minimo != null ? `${p.valor_minimo} a ${p.valor_maximo}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      {(naoMapeados.data ?? []).length > 0 && (
        <Secao titulo="Status que o de-para NAO reconhece" icone={ShieldAlert}>
          <p className="mb-3 text-xs text-slate-500">
            O enum do swagger deles <strong>nao e exaustivo</strong>. Estes status vieram da base
            real e hoje <strong>nao entram</strong> — cada um precisa de uma decisao antes da carga,
            senao vira veiculo faltando na importacao sem ninguem perceber. Desde a 0071 o status
            do <strong>veiculo</strong> tambem decide a carga, entao palavra nova ali classifica o
            carro errado.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2">Onde</th>
                  <th className="pb-2">Status no Mutual</th>
                  <th className="pb-2 text-right">Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {(naoMapeados.data ?? []).map((s) => (
                  <tr key={`${s.origem}-${s.status ?? '-'}`} className="border-t border-slate-100">
                    <td className="py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        s.origem === 'OBJETO'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {s.origem === 'OBJETO' ? 'veiculo' : 'associado'}
                      </span>
                    </td>
                    <td className="py-2 text-slate-800">{s.status ?? '(sem status)'}</td>
                    <td className="py-2 text-right tnum text-slate-900">{s.quantidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

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

      {(cruzado.data ?? []).some((c) => c.mudou) && (
        <Secao titulo="Status do ASSOCIADO x status do VEICULO" icone={ListChecks}>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            O contrato do Mutual guarda <strong>varios veiculos</strong>, entao o status dele fala
            do <strong>associado</strong>: ele fica ATIVO porque tem OUTRO carro, enquanto AQUELE
            veiculo esta encerrado. Ate a 0071 lia-se so o contrato, e o carro morto entrava como
            faturavel. Agora vence o <strong>menos vivo dos dois</strong> — o veiculo so consegue
            puxar para baixo, nunca ressuscitar um contrato cancelado.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2">Associado (contrato)</th>
                  <th className="pb-2">Veiculo (objeto)</th>
                  <th className="pb-2">Antes</th>
                  <th className="pb-2">Agora</th>
                  <th className="pb-2 text-right">Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {(cruzado.data ?? []).filter((c) => c.mudou).map((c) => (
                  <tr key={`${c.contract_status}-${c.object_status}`} className="border-t border-slate-100">
                    <td className="py-2 text-slate-600">{c.contract_status ?? '—'}</td>
                    <td className="py-2 font-medium text-slate-800">{c.object_status}</td>
                    <td className="py-2 text-slate-400 line-through">{c.status_pelo_contrato}</td>
                    <td className="py-2 font-semibold text-slate-900">{c.status_scar}</td>
                    <td className="py-2 text-right tnum text-slate-900">{c.quantidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      {(quarentena.data ?? []).length > 0 && (
        <Secao
          titulo={`Quarentena (${quarentena.data?.length})`}
          icone={ShieldAlert}
          acao={
            <div className="flex items-center gap-1">
              <Button variant="ghost" onClick={() => setVerPlacaPendente((v) => !v)}>
                {verPlacaPendente ? 'Esconder 0 km' : 'Ver os 0 km'}
              </Button>
              <Button variant="ghost" onClick={() => setSoFaturaveis((v) => !v)}>
                {soFaturaveis ? 'Ver o acervo inteiro' : 'So a carteira viva'}
              </Button>
            </div>
          }
        >
          <p className="mb-3 text-xs text-slate-500">
            Linhas que <strong>nao entrariam</strong> na base como estao. Corrigir no Mutual e
            puxar de novo — a captura e re-executavel.{' '}
            {soFaturaveis
              ? 'Mostrando so a carteira que vai FATURAR: num contrato encerrado, valor e dia de vencimento em branco sao o esperado, nao um problema.'
              : 'Mostrando o acervo inteiro. No contrato encerrado, valor e vencimento nao contam como motivo — so identidade, CPF e nome.'}
          </p>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            <strong>Veiculo 0 km fica de fora desta lista.</strong> Ele nao tem placa porque ainda
            nao foi emplacado — corrigir no Mutual nao resolve. Quem resolve e a operacao: o SAC
            exige a placa no atendimento, ou um aviso a cobra depois da adesao. Ele e identificado
            pelo <strong>chassi</strong> enquanto isso.
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
      {/* A UNIDADE PELO CONSULTOR (0073) — a corrente e onde ela quebra */}
      <Secao titulo="A unidade pelo consultor" icone={Users}>
        <p className="mb-4 text-xs text-slate-500">
          A unidade nao esta em <code className="tnum">regional</code> em lugar nenhum. A corrente que
          sobrou e <strong>objeto.consultant (codigo) → consultor → vendedor importado → unidade</strong>.
          Sao <strong>quatro saltos</strong>: o que decide nao e o total, e <em>onde</em> ela quebra.
          Puxe <strong>Consultores</strong> antes de ler.
        </p>
        {funil.isLoading && <p className="text-sm text-slate-500">Carregando...</p>}
        {!funil.isLoading && (funil.data ?? []).length > 0 && (() => {
          const passos = funil.data ?? [];
          const base = passos[0]?.objetos ?? 0;
          const gargalo = gargaloDoFunil(passos);
          const cobertura = coberturaDoFunil(passos);
          const passa = teseDoConsultorSeSustenta(passos);
          return (
            <>
              <div className={`mb-4 rounded-lg px-3 py-2 text-sm ring-1 ${passa ? TOM.OK : TOM.CRITICO}`}>
                <strong className="tnum">{(cobertura * 100).toFixed(1)}%</strong> dos veiculos chegam
                a uma unidade.{' '}
                {passa
                  ? 'A tese se sustenta — a carga pode resolver a unidade pelo consultor.'
                  : 'A tese NAO se sustenta sozinha: o resto viraria trabalho manual por associado.'}
                {gargalo && (
                  <> O gargalo esta em <strong>{gargalo.etapa}</strong>, que perde{' '}
                    <strong className="tnum">{gargalo.perdidos}</strong>.</>
                )}
              </div>
              <ol className="space-y-1">
                {passos.map((p) => (
                  <li key={p.passo} className="flex flex-wrap items-baseline gap-x-3 border-b border-slate-100 py-2 last:border-0">
                    <span className="w-5 text-xs text-slate-400 tnum">{p.passo}</span>
                    <span className="flex-1 text-sm text-slate-800">{p.etapa}</span>
                    <span className="tnum text-sm font-semibold text-slate-800">{p.objetos}</span>
                    <span className="w-28 text-right tnum text-xs text-rose-600">
                      {p.perdidos > 0 ? `− ${p.perdidos}` : ''}
                    </span>
                    <span className="w-14 text-right tnum text-xs text-slate-500">
                      {base > 0 ? `${((p.objetos / base) * 100).toFixed(0)}%` : ''}
                    </span>
                    {p.detalhe && <span className="w-full pl-8 text-xs text-slate-500">{p.detalhe}</span>}
                  </li>
                ))}
              </ol>
            </>
          );
        })()}

        {(pendentes.data ?? []).length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Quem a corrente perde — por volume de veiculos
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="pb-2">Consultor</th><th className="pb-2">Nome</th>
                    <th className="pb-2">CPF</th><th className="pb-2 text-right">Veiculos</th>
                    <th className="pb-2">Falta</th>
                  </tr>
                </thead>
                <tbody>
                  {(pendentes.data ?? []).map((c) => (
                    <tr key={c.consultor_id} className="border-t border-slate-100">
                      <td className="py-2 tnum text-slate-600">{c.consultor_id}</td>
                      <td className="py-2 text-slate-800">{c.nome ?? '—'}</td>
                      <td className="py-2 tnum text-slate-600">{c.documento ?? '—'}</td>
                      <td className="py-2 text-right tnum font-semibold text-slate-800">{c.veiculos}</td>
                      <td className="py-2 text-xs text-slate-500">{c.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Secao>
    </div>
  );
}
