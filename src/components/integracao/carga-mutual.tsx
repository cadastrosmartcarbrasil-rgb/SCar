'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Upload, Undo2, Car, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErroLeitura } from '@/components/integracao/erro-leitura';
import {
  useMutualTiposVeiculo, useMutualPlanos, useVincularCatalogo,
  useCargaPrevia, useCargaLinhas, useExecutarCarga, useDesfazerCarga,
} from '@/hooks/use-mutual';
import { useRegionais } from '@/hooks/use-config';
import { usePlanos, useTiposVeiculo } from '@/hooks/use-precificacao';
import {
  resumoDaCarga, recusasPorMotivo, filaAntesDoCutover, cutoverLiberado, tiposPendentes,
  planosPendentes, idsPara90Pct, amplitudeFipe,
} from '@/lib/mutual';
import type { SeveridadeDiagnostico } from '@/lib/database.types';

const TOM: Record<SeveridadeDiagnostico, string> = {
  OK: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  ATENCAO: 'bg-amber-50 text-amber-700 ring-amber-200',
  CRITICO: 'bg-red-50 text-red-700 ring-red-200',
};

/**
 * A CARGA (0084). A tela nao decide nada: as recusas, o saneamento e a
 * precedencia vivem na `mutual_carga_linhas` e em `src/lib/mutual.ts`, os dois
 * com teste. O que ela faz e tornar a decisao LEGIVEL antes de gravar —
 * previa, fila de trabalho por motivo, e so depois o botao.
 */
export function CargaMutual() {
  const regionais = useRegionais();
  const tipos = useTiposVeiculo();
  const planos = usePlanos();
  const tiposExternos = useMutualTiposVeiculo();
  const vincularTipo = useVincularCatalogo('VEHICLE_TYPE', 'tipos_veiculo');
  const vincularPlano = useVincularCatalogo('PLAN', 'planos_protecao');

  const [unidade, setUnidade] = useState<string>('');
  const [inativos, setInativos] = useState(false);

  const planosExternos = useMutualPlanos(unidade || null);
  const previa = useCargaPrevia(unidade || null, inativos);
  const linhas = useCargaLinhas(unidade || null, inativos, false, null);
  const executar = useExecutarCarga();
  const desfazer = useDesfazerCarga();

  const lista = linhas.data ?? [];
  const resumo = useMemo(() => resumoDaCarga(lista), [lista]);
  const recusas = useMemo(() => recusasPorMotivo(lista), [lista]);
  const fila = useMemo(() => filaAntesDoCutover(lista), [lista]);
  const liberado = useMemo(() => cutoverLiberado(lista), [lista]);

  const pendentes = tiposPendentes(
    (tiposExternos.data ?? []).map((t) => ({
      id_externo: t.id_externo, nome: t.nome, capturado: t.capturado,
      faturaveis: t.faturaveis, destino_id: t.destino_id,
    })),
  );

  const listaPlanos = planosExternos.data ?? [];
  const planosFalta = planosPendentes(listaPlanos);
  const idsAte90 = idsPara90Pct(listaPlanos);

  const nomeUnidade = (regionais.data ?? []).find((r) => r.id === unidade)?.nome ?? '';

  return (
    <div className="space-y-5">
      <p className="text-xs leading-relaxed text-slate-500">
        A carga e <strong>por unidade</strong> e <strong>re-executavel</strong>: rodar de novo
        atualiza pelo vinculo em vez de duplicar. Todo veiculo entra com{' '}
        <strong>cobranca externa</strong>, entao ele aparece no SAC, no portal e na 24h e{' '}
        <strong>nenhuma fatura e gerada aqui</strong> — a mensalidade continua saindo do Mutual
        ate o cutover daquela unidade.
      </p>

      {/* ------------------------------------------------ o de-para do catalogo */}
      <div className="rounded-xl border border-slate-200/80 p-4">
        <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          <Car className="h-4 w-4 text-cyan-600" aria-hidden /> Tipo de veiculo — o de-para
        </h3>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          O Mutual tem <strong>tres</strong> tipos (CARRO, MOTO, CAMINHAO) e o SCar tem{' '}
          <strong>sete</strong>: &quot;CARRO&quot; nao decide entre Passeio e Pick-up / Van, entao
          a escolha e de quem conhece a carteira — a carga nunca chuta. Sem o de-para o veiculo
          entra igual, so sem tipo, e isso <strong>nao afeta a cobranca</strong> enquanto a
          cobranca externa esta ligada.
        </p>
        {pendentes.length > 0 && (
          <p className="mb-2 text-xs text-amber-700">
            {pendentes.length} tipo(s) com carteira ainda sem de-para —{' '}
            {pendentes.reduce((s, t) => s + t.faturaveis, 0)} veiculos faturaveis.
          </p>
        )}
        <ErroLeitura q={tiposExternos} />
        <div className="space-y-2">
          {(tiposExternos.data ?? []).map((t) => (
            <div key={t.id_externo} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-[9rem] text-slate-800">
                {t.nome ?? `(id ${t.id_externo})`}
                {!t.capturado && (
                  <span className="ml-1 text-xs text-amber-700">· nao capturado</span>
                )}
              </span>
              <span className="tnum text-xs text-slate-500">
                {t.faturaveis} faturaveis · {t.veiculos} no total
              </span>
              <select
                className="rounded border border-slate-200 px-2 py-1 text-xs"
                value={t.destino_id ?? ''}
                disabled={vincularTipo.isPending}
                onChange={(e) => {
                  vincularTipo.mutate(
                    { idExterno: t.id_externo, registroId: e.target.value || null },
                    { onError: (err) => toast.error((err as Error).message) },
                  );
                }}
              >
                <option value="">— sem de-para —</option>
                {(tipos.data ?? []).map((tv) => (
                  <option key={tv.id} value={tv.id}>{tv.nome}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------ o de-para do PLANO (0085) */}
      <div className="rounded-xl border border-slate-200/80 p-4">
        <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          <ShieldCheck className="h-4 w-4 text-cyan-600" aria-hidden /> Plano / cobertura — o de-para
        </h3>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          O plano <strong>nao decide o boleto</strong>: a carga carimba o valor que o Mutual cobra
          hoje e <code className="tnum">valor_mensalidade_veiculo</code> prefere esse valor. O que
          ele decide e a <strong>cobertura que a ficha do SAC mostra</strong> — sem de-para, o
          atendente nao ve a que o associado tem direito. Por isso ele importa{' '}
          <strong>antes de outubro virar atendimento real</strong>, nao antes de carregar.
        </p>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          A mensalidade e a FIPE abaixo sao <strong>perfil, nao identificacao</strong>: foi medido
          que a FIPE varia de 6x a 14x dentro do mesmo id, logo o id e combo comercial e nao faixa
          de preco. Faixa muito larga e sinal de plano genérico.
        </p>
        <ErroLeitura q={planosExternos} />
        {!planosExternos.data && planosExternos.isLoading && (
          <p className="text-xs text-slate-500">Lendo os planos da carteira…</p>
        )}
        {listaPlanos.length === 0 && !planosExternos.isLoading && !planosExternos.isError && (
          <p className="text-xs text-slate-500">
            Nenhum <code className="tnum">plan_id</code> na carteira deste recorte.
          </p>
        )}
        {listaPlanos.length > 0 && (
          <>
            <p className="mb-2 text-xs text-slate-600">
              {listaPlanos.length} id(s) na carteira
              {unidade ? ` de ${nomeUnidade}` : ' (base inteira)'} ·{' '}
              <strong>{idsAte90} deles cobrem 90%</strong> dos veiculos faturaveis — e onde parar.
              {planosFalta.length > 0 && (
                <>
                  {' '}Faltam <strong>{planosFalta.length}</strong> com carteira
                  {' '}({planosFalta.reduce((acc, p) => acc + p.faturaveis, 0)} faturaveis).
                </>
              )}
            </p>
            {!listaPlanos.some((p) => p.capturado) && (
              <p className="mb-2 text-xs text-amber-700">
                <code className="tnum">/plan/</code> ainda nao foi capturado, entao os ids aparecem
                sem nome — e o caminho desse endpoint e um <strong>palpite</strong> (o swagger nao
                foi conferido). Puxar e um clique: um 404 ja responde. O de-para funciona do mesmo
                jeito; capturar so preenche o nome.
              </p>
            )}
            <div className="space-y-2">
              {listaPlanos.map((p) => {
                const amplitude = amplitudeFipe(p);
                return (
                  <div key={p.id_externo} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-[9rem] text-slate-800">
                      {p.nome ?? `(id ${p.id_externo})`}
                      {!p.capturado && (
                        <span className="ml-1 text-xs text-amber-700">· sem nome</span>
                      )}
                    </span>
                    <span className="tnum text-xs text-slate-500">
                      {p.faturaveis} faturaveis · {p.veiculos} no total
                      {p.cobertura_acumulada !== null && ` · acumulado ${p.cobertura_acumulada}%`}
                    </span>
                    <span className="tnum text-xs text-slate-400">
                      {p.mensalidade_mediana !== null && `mediana R$ ${p.mensalidade_mediana}`}
                      {p.tipos && ` · tipo ${p.tipos}`}
                      {amplitude !== null && amplitude >= 6 && (
                        <span className="ml-1 text-amber-700">
                          · FIPE {amplitude.toFixed(0)}x (generico)
                        </span>
                      )}
                    </span>
                    <select
                      className="rounded border border-slate-200 px-2 py-1 text-xs"
                      value={p.destino_id ?? ''}
                      disabled={vincularPlano.isPending}
                      onChange={(e) => {
                        vincularPlano.mutate(
                          { idExterno: p.id_externo, registroId: e.target.value || null },
                          { onError: (err) => toast.error((err as Error).message) },
                        );
                      }}
                    >
                      <option value="">— sem de-para —</option>
                      {(planos.data ?? []).map((pl) => (
                        <option key={pl.id} value={pl.id}>{pl.nome}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            {(planos.data ?? []).length === 0 && (
              <p className="mt-2 text-xs text-amber-700">
                Nenhum plano de protecao cadastrado aqui — cadastre em{' '}
                <strong>Configuracoes → Planos</strong> antes de escolher o destino.
              </p>
            )}
          </>
        )}
      </div>

      {/* ------------------------------------------------ a unidade e a previa */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-600">
          <span className="mb-1 block font-medium uppercase tracking-wide">Unidade a carregar</span>
          <select
            className="rounded border border-slate-200 px-2 py-1.5 text-sm"
            value={unidade}
            onChange={(e) => setUnidade(e.target.value)}
          >
            <option value="">— escolha a unidade —</option>
            {(regionais.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>{r.nome}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} />
          Incluir o acervo historico (inativos e suspensos)
        </label>
      </div>

      {!unidade && (
        <p className="text-sm text-slate-500">
          Escolha a unidade. A carga nunca roda sem ela: aqui{' '}
          <code className="tnum">regional_id</code> nulo significa <strong>matriz</strong>, nao
          &quot;todas&quot;.
        </p>
      )}

      {unidade && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Indicador rotulo="Associados" valor={resumo.associados} nota="um por pessoa" />
            <Indicador rotulo="Veiculos a criar" valor={resumo.criar} />
            <Indicador rotulo="A atualizar" valor={resumo.atualizar} nota="ja carregados antes" />
            <Indicador
              rotulo="Recusadas"
              valor={resumo.recusadas}
              nota={resumo.recusadas > 0 ? 'com motivo abaixo' : 'o lote entra inteiro'}
              alerta={resumo.recusadas > 0}
            />
          </div>

          {recusas.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
                <AlertTriangle className="h-4 w-4" aria-hidden /> A fila de trabalho
              </h3>
              <p className="mb-3 text-xs leading-relaxed text-amber-800">
                Cada motivo e uma tarefa diferente, de gente diferente. A maior primeiro resolve a
                maior parte do lote com a menor decisao — corrija no Mutual, recapture e rode de
                novo: a carga e re-executavel.
              </p>
              <ul className="space-y-1 text-sm">
                {recusas.map((r) => (
                  <li key={r.motivo} className="flex items-baseline justify-between gap-3">
                    <span className="text-slate-800">{r.motivo}</span>
                    <span className="tnum font-semibold text-slate-900">{r.quantidade}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-slate-200/80 p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              O que falta para o CUTOVER — nao para a carga
            </h3>
            <p className="mb-3 text-xs leading-relaxed text-slate-500">
              Estes veiculos <strong>entram normalmente</strong>: com a cobranca externa ligada
              nada disso e usado. Mas no dia em que a unidade passar a faturar aqui,{' '}
              <strong>mensalidade nula cai no cotador</strong> e, sem plano, isso da R$ 0,00 — o
              associado nunca receberia boleto. Por isso a fila e pre-requisito do cutover.
            </p>
            <div className="grid gap-3 sm:grid-cols-5">
              <Indicador rotulo="Sem mensalidade" valor={fila.semValor} alerta={fila.semValor > 0} />
              <Indicador rotulo="Sem dia de venc." valor={fila.semDia} alerta={fila.semDia > 0} />
              <Indicador rotulo="Sem plano" valor={fila.semPlano} alerta={fila.semPlano > 0} />
              <Indicador rotulo="Sem tipo" valor={fila.semTipo} />
              <Indicador
                rotulo="Ativacao estimada"
                valor={fila.ativacaoEstimada}
                nota="do created_at"
              />
            </div>
            <p className={`mt-3 text-xs ${liberado ? 'text-emerald-700' : 'text-amber-700'}`}>
              {liberado
                ? 'Cutover liberado: todo veiculo que entra tem valor e dia de vencimento.'
                : 'Cutover BLOQUEADO enquanto houver veiculo sem valor ou sem dia de vencimento.'}
            </p>
          </div>

          {/* a previa detalhada do banco */}
          {(previa.data ?? []).length > 0 && (
            <details className="rounded-xl border border-slate-200/80 p-4">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-600">
                Previa completa do banco ({(previa.data ?? []).length} indicadores)
              </summary>
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {(previa.data ?? []).map((d, i) => (
                    <tr key={`${d.grupo}-${d.indicador}-${i}`} className="border-t border-slate-100">
                      <td className="py-1.5 pr-2 text-xs uppercase tracking-wide text-slate-400">
                        {d.grupo}
                      </td>
                      <td className="py-1.5 pr-2 text-slate-800">{d.indicador}</td>
                      <td className="py-1.5 pr-2 text-right tnum font-semibold text-slate-900">
                        {d.valor}
                      </td>
                      <td className="py-1.5">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] ring-1 ${TOM[d.severidade]}`}>
                          {d.severidade}
                        </span>
                      </td>
                      <td className="py-1.5 pl-2 text-xs text-slate-500">{d.detalhe}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}

          {/* as linhas recusadas, uma por uma */}
          {resumo.recusadas > 0 && (
            <details className="rounded-xl border border-slate-200/80 p-4">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-600">
                As {resumo.recusadas} linhas recusadas, uma por uma
              </summary>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2">Objeto</th>
                    <th className="pb-2">Placa</th>
                    <th className="pb-2">Associado</th>
                    <th className="pb-2">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.filter((l) => l.problema).map((l) => (
                    <tr key={l.id_objeto} className="border-t border-slate-100">
                      <td className="py-1.5 tnum text-xs text-slate-500">{l.id_objeto}</td>
                      <td className="py-1.5 tnum text-slate-800">{l.placa ?? '—'}</td>
                      <td className="py-1.5 text-slate-600">{l.nome ?? '—'}</td>
                      <td className="py-1.5 text-xs text-red-700">{l.problema}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <Button
              onClick={() => {
                if (!window.confirm(
                  `Carregar ${resumo.criar} veiculo(s) novo(s) e ${resumo.associados} associado(s) `
                  + `em "${nomeUnidade}".\n\n`
                  + 'Eles entram ATIVOS e com COBRANCA EXTERNA: nenhuma fatura e gerada aqui.\n'
                  + `${resumo.recusadas} linha(s) ficam de fora, com o motivo na tela.\n\n`
                  + 'Confirmar?',
                )) return;
                executar.mutate(
                  { regionalId: unidade, incluirInativos: inativos, confirmar: true },
                  {
                    onSuccess: (r) => toast.success(r.mensagem),
                    onError: (e) => toast.error((e as Error).message),
                  },
                );
              }}
              disabled={executar.isPending || resumo.criar + resumo.atualizar === 0}
            >
              <Upload className="mr-2 h-4 w-4" aria-hidden />
              {executar.isPending ? 'Carregando...' : `Carregar ${nomeUnidade}`}
            </Button>

            <button
              type="button"
              className="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-fundo disabled:opacity-50"
              disabled={desfazer.isPending || !unidade}
              onClick={() => {
                desfazer.mutate({ regionalId: unidade, confirmar: false }, {
                  onSuccess: (r) => toast.info(
                    `${r.veiculos_removidos} veiculo(s) sairiam; ${r.preservados} ficariam `
                    + '(ja tem trabalho do SCar em cima).',
                  ),
                  onError: (e) => toast.error((e as Error).message),
                });
              }}
            >
              <Undo2 className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              Simular o desfazer
            </button>

            <button
              type="button"
              className="rounded border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
              disabled={desfazer.isPending || !unidade}
              onClick={() => {
                if (!window.confirm(
                  `DESFAZER a carga de "${nomeUnidade}".\n\n`
                  + 'Os veiculos que ja tem protocolo, evento, acionamento, rastreador, '
                  + 'vistoria ou titulo sao PRESERVADOS.\n\nConfirmar?',
                )) return;
                desfazer.mutate({ regionalId: unidade, confirmar: true }, {
                  onSuccess: (r) => toast.success(r.mensagem),
                  onError: (e) => toast.error((e as Error).message),
                });
              }}
            >
              Desfazer a carga
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Indicador({ rotulo, valor, nota, alerta }: {
  rotulo: string; valor: number; nota?: string; alerta?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3 ${alerta ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200/80'}`}>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className="tnum text-2xl font-semibold text-slate-900">{valor}</p>
      {nota && <p className="text-[11px] text-slate-500">{nota}</p>}
    </div>
  );
}
