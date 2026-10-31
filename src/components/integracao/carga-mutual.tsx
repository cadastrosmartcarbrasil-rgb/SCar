'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Upload, Undo2, Car, AlertTriangle, ShieldCheck, Bike, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErroLeitura } from '@/components/integracao/erro-leitura';
import {
  useMutualTiposVeiculo, useMutualPlanos, useMutualCategorias, useVincularCatalogo,
  useCargaPrevia, useCargaLinhas, useExecutarCarga, useDesfazerCarga,
  useClassificarPorTerceiros, useMutualVendedores, useVincularVendedores,
  useAssistenciaProfissionalMigrados, useAssistenciaProfissionalConfigs,
  useDefinirValorAssistenciaConfig, useAplicarAssistenciaProfissional,
} from '@/hooks/use-mutual';
import { MoneyInput } from '@/components/ui/field';
import { formatCurrency } from '@/lib/utils';
import { totaisApMigrados } from '@/lib/assistencia-profissional';
import { useRegionais } from '@/hooks/use-config';
import { usePlanos, useTiposVeiculo } from '@/hooks/use-precificacao';
import {
  resumoDaCarga, recusasPorMotivo, filaAntesDoCutover, cutoverLiberado, tiposPendentes,
  planosPendentes, idsPara90Pct, amplitudeFipe,
  agruparCategoriasPorTipo, categoriasSemTipo, cotaDaCategoria,
  totaisVendedores, vendedorPendente, ROTULO_MOTIVO_VENDEDOR,
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
  const vincularCategoria = useVincularCatalogo('VEHICLE_CATEGORY', 'tipos_veiculo');
  const vincularPlano = useVincularCatalogo('PLAN', 'planos_protecao');

  const [unidade, setUnidade] = useState<string>('');
  const [inativos, setInativos] = useState(false);

  const planosExternos = useMutualPlanos(unidade || null);
  const categorias = useMutualCategorias(unidade || null);
  const listaCategorias = categorias.data ?? [];
  const gruposCategoria = useMemo(
    () => agruparCategoriasPorTipo(categorias.data ?? []), [categorias.data],
  );
  const semTipo = categoriasSemTipo(listaCategorias);
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
        atualiza pelo vínculo em vez de duplicar. Todo veículo entra com{' '}
        <strong>cobrança externa</strong>, então ele aparece no SAC, no portal e na 24h e{' '}
        <strong>nenhuma fatura é gerada aqui</strong> — a mensalidade continua saindo do Mutual
        até o cutover daquela unidade.
      </p>

      {/* ------------------------------------------------ a UNIDADE vem PRIMEIRO (0094)
          Ela filtra os de-paras abaixo: sem ela as listas leem a base inteira, que e
          lenta e pode estourar o teto da tela. */}
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
          Incluir o acervo histórico (inativos e suspensos)
        </label>
      </div>


      {/* ------------------------------------------------ o de-para por CATEGORIA (0087) */}
      <div className="rounded-xl border border-slate-200/80 p-4">
        <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          <Car className="h-4 w-4 text-cyan-600" aria-hidden /> Categoria do veículo — o de-para
        </h3>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          A <strong>categoria</strong> do Mutual decide o tipo com mais precisão que o tipo
          (&quot;V6 / pickups/vans&quot; × &quot;V5 / automóvel comum&quot;). Escolher o mesmo
          tipo em várias categorias <strong>e o agrupamento</strong>, como nas equipes de vendas.
          Cada linha e o <strong>par categoria + tipo</strong>: a categoria PASSEIO do Mutual junta
          carros e motos, e as duas metades se decidem separadas. Categoria sem de-para entra pelo
          tipo (a reserva, mais abaixo); só fica sem tipo quem não tem nenhum dos dois.
        </p>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          O selo <span className="tnum">V5</span>/<span className="tnum">V6</span>… e a{' '}
          <strong>cota de participação</strong> que o nome da categoria carrega. Ele só aparece
          aqui para informar: a carga <strong>não grava a cota</strong> — e decisão a parte.
        </p>
        <ErroLeitura q={categorias} />
        {!categorias.data && categorias.isLoading && (
          <p className="text-xs text-slate-500">Lendo as categorias da carteira…</p>
        )}
        {listaCategorias.length > 0 && (
          <p className="mb-2 text-xs text-slate-600">
            {listaCategorias.length} categoria(s)
            {unidade ? ` em ${nomeUnidade}` : ' na base inteira'} ·{' '}
            {listaCategorias.filter((c) => c.destino_id).length} com de-para
            {semTipo.length > 0 && (
              <span className="text-amber-700">
                {' '}· {semTipo.length} entrariam SEM tipo
                ({semTipo.reduce((acc, c) => acc + c.faturaveis, 0)} faturáveis)
              </span>
            )}
          </p>
        )}
        <div className="space-y-3">
          {gruposCategoria.map((g) => (
            <div key={g.tipo}>
              <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-500">
                {g.tipo} <span className="tnum font-normal">· {g.faturaveis} faturáveis</span>
              </p>
              <div className="space-y-1.5">
                {g.itens.map((c) => {
                  const cota = cotaDaCategoria(c.categoria_nome);
                  return (
                    <div key={c.chave} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="min-w-[14rem] text-slate-800">
                        {c.categoria_nome ?? `(categoria ${c.categoria_id})`}
                        {cota && (
                          <span className="ml-1 rounded bg-slate-100 px-1 text-[0.6875rem] text-slate-600 tnum">
                            {cota.especial ? 'ESP ' : ''}{cota.codigo}
                          </span>
                        )}
                        {!c.capturada && (
                          <span className="ml-1 text-xs text-amber-700">· não capturada</span>
                        )}
                      </span>
                      <span className="tnum text-xs text-slate-500">
                        {c.faturaveis} faturáveis · {c.veiculos} no total
                      </span>
                      <select
                        className="rounded border border-slate-200 px-2 py-1 text-xs"
                        value={c.destino_id ?? ''}
                        disabled={vincularCategoria.isPending}
                        onChange={(e) => {
                          vincularCategoria.mutate(
                            { idExterno: c.chave, registroId: e.target.value || null },
                            { onError: (err) => toast.error((err as Error).message) },
                          );
                        }}
                      >
                        <option value="">— sem de-para —</option>
                        {(tipos.data ?? []).map((tv) => (
                          <option key={tv.id} value={tv.id}>{tv.nome}</option>
                        ))}
                      </select>
                      {!c.destino_id && (
                        <span className={`text-xs ${c.reserva_id ? 'text-slate-400' : 'text-amber-700'}`}>
                          {c.reserva_id ? `entra como ${c.reserva_nome} (pelo tipo)` : 'entra sem tipo'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------ o de-para do TIPO — a reserva */}
      <div className="rounded-xl border border-slate-200/80 p-4">
        <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          <Car className="h-4 w-4 text-cyan-600" aria-hidden /> Tipo de veículo — a reserva
        </h3>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          O Mutual tem <strong>três</strong> tipos (CARRO, MOTO, CAMINHÃO) e o SCar tem{' '}
          <strong>sete</strong>. Este de-para só vale para a categoria que ficou{' '}
          <strong>sem</strong> de-para acima — a categoria sempre vence. Sem nenhum dos dois o
          veículo entra igual, só sem tipo, e isso <strong>não afeta a cobrança</strong> enquanto a
          cobrança externa está ligada.
        </p>
        {pendentes.length > 0 && (
          <p className="mb-2 text-xs text-amber-700">
            {pendentes.length} tipo(s) com carteira ainda sem de-para —{' '}
            {pendentes.reduce((s, t) => s + t.faturaveis, 0)} veículos faturáveis.
          </p>
        )}
        <ErroLeitura q={tiposExternos} />
        <div className="space-y-2">
          {(tiposExternos.data ?? []).map((t) => (
            <div key={t.id_externo} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-[9rem] text-slate-800">
                {t.nome ?? `(id ${t.id_externo})`}
                {!t.capturado && (
                  <span className="ml-1 text-xs text-amber-700">· não capturado</span>
                )}
              </span>
              <span className="tnum text-xs text-slate-500">
                {t.faturaveis} faturáveis · {t.veiculos} no total
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
          O plano <strong>não decide o boleto</strong>: a carga carimba o valor que o Mutual cobra
          hoje e <code className="tnum">valor_mensalidade_veiculo</code> prefere esse valor. O que
          ele decide é a <strong>cobertura que a ficha do SAC mostra</strong> — sem de-para, o
          atendente não vê a que o associado tem direito. Por isso ele importa{' '}
          <strong>antes de outubro virar atendimento real</strong>, não antes de carregar.
        </p>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          A mensalidade e a FIPE abaixo são <strong>perfil, não identificação</strong>: foi medido
          que a FIPE varia de 6x a 14x dentro do mesmo id, logo o id e combo comercial e não faixa
          de preço. Faixa muito larga e sinal de plano genérico.
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
              <strong>{idsAte90} deles cobrem 90%</strong> dos veículos faturáveis — e onde parar.
              {planosFalta.length > 0 && (
                <>
                  {' '}Faltam <strong>{planosFalta.length}</strong> com carteira
                  {' '}({planosFalta.reduce((acc, p) => acc + p.faturaveis, 0)} faturáveis).
                </>
              )}
            </p>
            {!listaPlanos.some((p) => p.nome) && (
              <p className="mb-2 text-xs text-amber-700">
                Nenhum plano tem nome ainda. Puxe <strong>Planos</strong> e{' '}
                <strong>Produtos dos veículos</strong> em Puxar dados — os planos antigos só
                ganham nome pelos produtos. O de-para funciona do mesmo jeito; capturar só
                preenche o nome.
              </p>
            )}
            <div className="space-y-2">
              {listaPlanos.map((p) => {
                const amplitude = amplitudeFipe(p);
                return (
                  <div key={p.id_externo} className="flex flex-wrap items-center gap-2 text-sm">
                    {/* O usuario acha o plano no Mutual pelo NOME; o id vai so como referencia. */}
                    <span className="min-w-[9rem] text-slate-800">
                      {p.nome ?? 'Plano sem nome'}
                      <span className="tnum ml-1 text-xs text-slate-400">(id {p.id_externo})</span>
                      {!p.nome && (
                        <span className="ml-1 text-xs text-amber-700">· sem nome</span>
                      )}
                    </span>
                    <span className="tnum text-xs text-slate-500">
                      {p.faturaveis} faturáveis · {p.veiculos} no total
                      {p.cobertura_acumulada !== null && ` · acumulado ${p.cobertura_acumulada}%`}
                    </span>
                    <span className="tnum text-xs text-slate-400">
                      {p.mensalidade_mediana !== null && `mediana R$ ${p.mensalidade_mediana}`}
                      {p.tipos && ` · tipo ${p.tipos}`}
                      {p.tipos === '2' && (
                        <span className="ml-1 text-amber-700">
                          · moto: quem decide é o PRODUTO, não este plano — deixe sem de-para e
                          use o quadro das motos abaixo
                        </span>
                      )}
                      {amplitude !== null && amplitude >= 6 && (
                        <span className="ml-1 text-amber-700">
                          · FIPE {amplitude.toFixed(0)}x (genérico)
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
                Nenhum plano de proteção cadastrado aqui — cadastre em{' '}
                <strong>Configurações → Planos</strong> antes de escolher o destino.
              </p>
            )}
          </>
        )}
      </div>

      {unidade && <MotosPorProdutos unidade={unidade} nomeUnidade={nomeUnidade} />}
      {unidade && <VendedoresDosVeiculos unidade={unidade} nomeUnidade={nomeUnidade} />}
      {unidade && <AssistenciaProfissionalMigrados unidade={unidade} nomeUnidade={nomeUnidade} />}

      {!unidade && (
        <p className="text-sm text-slate-500">
          Escolha a unidade. A carga nunca roda sem ela: aqui{' '}
          <code className="tnum">regional_id</code> nulo significa <strong>matriz</strong>, não
          &quot;todas&quot;.
        </p>
      )}

      {unidade && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Indicador rotulo="Associados" valor={resumo.associados} nota="um por pessoa" />
            <Indicador rotulo="Veículos a criar" valor={resumo.criar} />
            <Indicador rotulo="A atualizar" valor={resumo.atualizar} nota="já carregados antes" />
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
                Cada motivo é uma tarefa diferente, de gente diferente. A maior primeiro resolve a
                maior parte do lote com a menor decisão — corrija no Mutual, recapture e rode de
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
              O que falta para o CUTOVER — não para a carga
            </h3>
            <p className="mb-3 text-xs leading-relaxed text-slate-500">
              Estes veículos <strong>entram normalmente</strong>: com a cobrança externa ligada
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
                rotulo="Ativação estimada"
                valor={fila.ativacaoEstimada}
                nota="do created_at"
              />
            </div>
            <p className={`mt-3 text-xs ${liberado ? 'text-emerald-700' : 'text-amber-700'}`}>
              {liberado
                ? 'Cutover liberado: todo veículo que entra tem valor e dia de vencimento.'
                : 'Cutover BLOQUEADO enquanto houver veículo sem valor ou sem dia de vencimento.'}
            </p>
          </div>

          {/* a previa detalhada do banco */}
          {(previa.data ?? []).length > 0 && (
            <details className="rounded-xl border border-slate-200/80 p-4">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-600">
                Prévia completa do banco ({(previa.data ?? []).length} indicadores)
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
                        <span className={`rounded px-1.5 py-0.5 text-[0.6875rem] ring-1 ${TOM[d.severidade]}`}>
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
                  `Carregar ${resumo.criar} veículo(s) novo(s) e ${resumo.associados} associado(s) `
                  + `em "${nomeUnidade}".\n\n`
                  + 'Eles entram ATIVOS e com COBRANÇA EXTERNA: nenhuma fatura é gerada aqui.\n'
                  + `${resumo.recusadas} linha(s) ficam de fora, com o motivo na tela.\n\n`
                  + 'Confirmar?',
                )) return;
                executar.mutate(
                  { regionalId: unidade, incluirInativos: inativos, confirmar: true },
                  {
                    onSuccess: (r) => toast.success(
                      `${r.veiculos_criados} veículo(s) criado(s), ${r.veiculos_atualizados} `
                      + `atualizado(s), ${r.clientes_criados} associado(s) novo(s). ${r.mensagem}`,
                    ),
                    // O que ja foi gravado fica (cada bloco e uma transacao); clicar de
                    // novo prepara a fila outra vez e o ja carregado vira ATUALIZAR.
                    onError: (e) => toast.error(
                      `${(e as Error).message} — os blocos anteriores ficaram gravados; `
                      + 'clicar de novo refaz a fila, e o que já entrou só e atualizado.',
                    ),
                  },
                );
              }}
              disabled={executar.isPending || resumo.criar + resumo.atualizar === 0}
            >
              <Upload className="mr-2 h-4 w-4" aria-hidden />
              {executar.progresso?.fase === 'preparando'
                ? 'Lendo o lote...'
                : executar.progresso?.fase === 'gravando'
                  ? `Gravando ${executar.progresso.feitos} de ${executar.progresso.total}...`
                  : executar.isPending ? 'Carregando...' : `Carregar ${nomeUnidade}`}
            </Button>

            <button
              type="button"
              className="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-fundo disabled:opacity-50"
              disabled={desfazer.isPending || !unidade}
              onClick={() => {
                desfazer.mutate({ regionalId: unidade, confirmar: false }, {
                  onSuccess: (r) => toast.info(
                    `${r.veiculos_removidos} veículo(s) sairiam; ${r.preservados} ficariam `
                    + '(já tem trabalho do SCar em cima).',
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
                  + 'Os veículos que já tem protocolo, evento, acionamento, rastreador, '
                  + 'vistoria ou título são PRESERVADOS.\n\nConfirmar?',
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
      <p className="text-[0.6875rem] uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className="tnum text-2xl font-semibold text-slate-900">{valor}</p>
      {nota && <p className="text-[0.6875rem] text-slate-500">{nota}</p>}
    </div>
  );
}

const ROTULO_TERCEIROS: Record<string, string> = {
  COM_TERCEIROS: 'tem proteção a terceiros no Mutual',
  SEM_TERCEIROS: 'não tem proteção a terceiros',
  JA_CERTO: 'já estão no plano certo',
  MANTIDO: 'tem outro plano escolhido aqui — não são tocados',
  SEM_DADOS: 'sem produtos capturados — puxe "Produtos dos veículos" e rode de novo',
};

/**
 * As MOTOS pelos produtos (0091/0092). No Mutual a protecao a terceiros e
 * opcional DENTRO do mesmo plano de moto, entao "Plano Moto MT" nao diz se a
 * moto e Ouro ou Essencial — quem diz e o produto contratado. Ate aqui isto so
 * rodava por SQL; o quadro simula primeiro e so grava no segundo clique.
 * Vale para veiculos JA CARREGADOS (os produtos so sao puxados para eles).
 */
function MotosPorProdutos({ unidade, nomeUnidade }: { unidade: string; nomeUnidade: string }) {
  const tipos = useTiposVeiculo();
  const planos = usePlanos();
  const classificar = useClassificarPorTerceiros();
  const listaPlanos = useMemo(() => planos.data ?? [], [planos.data]);

  const tipoMoto = (tipos.data ?? []).find((t) => /^moto/i.test(t.nome))?.id ?? '';
  const sugestao = (re: RegExp) => listaPlanos.find((p) => re.test(p.nome))?.id ?? '';

  const [tipo, setTipo] = useState('');
  const [com, setCom] = useState('');
  const [sem, setSem] = useState('');
  const [substituir, setSubstituir] = useState<string[] | null>(null);
  const [simulado, setSimulado] = useState<{ acao: string; quantidade: number }[] | null>(null);

  // Os padroes sao os da decisao do usuario (07/10/2026): com terceiros ->
  // MOTOCICLETAS - OURO, sem -> MOTOCICLETA ESSENCIAL, e quem caiu em PRATA (o
  // de-para errado de "Plano Moto MT") e reclassificado. Tudo editavel.
  const tipoEf = tipo || tipoMoto;
  const comEf = com || sugestao(/MOTOCICLETAS?\s*-\s*OURO/i);
  const semEf = sem || sugestao(/MOTOCICLETAS?\s+ESSENCIAL/i);
  const substEf = substituir ?? listaPlanos.filter((p) => /PRATA/i.test(p.nome)).map((p) => p.id);
  const pronto = Boolean(tipoEf && comEf && semEf);

  const rodar = (confirmar: boolean) => classificar.mutate(
    { regionalId: unidade, tipoVeiculoId: tipoEf, planoCom: comEf, planoSem: semEf,
      substituir: substEf, confirmar },
    {
      onSuccess: (r) => {
        setSimulado(confirmar ? null : r);
        if (confirmar) {
          const n = r.filter((x) => x.acao === 'COM_TERCEIROS' || x.acao === 'SEM_TERCEIROS')
            .reduce((acc, x) => acc + Number(x.quantidade), 0);
          toast.success(`${n} moto(s) de ${nomeUnidade} reclassificada(s). O boleto não muda.`);
        }
      },
      onError: (e) => toast.error((e as Error).message),
    },
  );

  const nomePlano = (id: string) => listaPlanos.find((p) => p.id === id)?.nome ?? '—';

  return (
    <div className="rounded-xl border border-slate-200/80 p-4">
      <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
        <Bike className="h-4 w-4 text-cyan-600" aria-hidden /> Motos — o plano pelos produtos
      </h3>
      <p className="mb-3 text-xs leading-relaxed text-slate-500">
        Nos planos de moto do Mutual (&quot;Plano Moto MT&quot;, &quot;Plano Moto SP/SP&quot;,
        &quot;Plano Moto SP/ Riberão Preto&quot;…) a <strong>proteção a terceiros é opcional
        dentro do mesmo plano</strong>: o nome do plano não diz se a moto e Ouro ou Essencial.
        Quem diz e o <strong>produto contratado</strong>. Por isso esses planos ficam{' '}
        <strong>sem de-para</strong> acima, e a classificação é feita aqui, depois de carregar a
        unidade e puxar <strong>Produtos dos veículos</strong>. O boleto não muda.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-slate-600">
          <span className="mb-1 block font-medium">Tipo de veículo</span>
          <select className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
            value={tipoEf} onChange={(e) => { setTipo(e.target.value); setSimulado(null); }}>
            <option value="">— escolha —</option>
            {(tipos.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          <span className="mb-1 block font-medium">COM terceiros vai para</span>
          <select className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
            value={comEf} onChange={(e) => { setCom(e.target.value); setSimulado(null); }}>
            <option value="">— escolha —</option>
            {listaPlanos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          <span className="mb-1 block font-medium">SEM terceiros vai para</span>
          <select className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
            value={semEf} onChange={(e) => { setSem(e.target.value); setSimulado(null); }}>
            <option value="">— escolha —</option>
            {listaPlanos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-3 text-xs text-slate-600">
        <span className="font-medium">Reclassificar também quem já está em:</span>{' '}
        <span className="text-slate-500">(quem está sem plano é sempre classificado; outro plano escolhido aqui é mantido)</span>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {listaPlanos.map((p) => (
            <label key={p.id} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={substEf.includes(p.id)}
                onChange={(e) => {
                  setSimulado(null);
                  setSubstituir(e.target.checked
                    ? [...substEf, p.id]
                    : substEf.filter((x) => x !== p.id));
                }}
              />
              {p.nome}
            </label>
          ))}
        </div>
      </div>

      {simulado && (
        <div className="mt-3 rounded-lg bg-fundo p-3 text-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Simulação em {nomeUnidade} — nada foi gravado
          </p>
          {simulado.length === 0 && (
            <p className="text-xs text-slate-500">
              Nenhuma moto carregada nesta unidade ainda. Carregue a unidade e puxe os produtos.
            </p>
          )}
          <ul className="space-y-0.5">
            {simulado.map((x) => (
              <li key={x.acao} className="flex justify-between gap-3">
                <span className="text-slate-700">
                  {ROTULO_TERCEIROS[x.acao] ?? x.acao}
                  {x.acao === 'COM_TERCEIROS' && ` → ${nomePlano(comEf)}`}
                  {x.acao === 'SEM_TERCEIROS' && ` → ${nomePlano(semEf)}`}
                </span>
                <span className="tnum font-semibold text-slate-900">{x.quantidade}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-fundo disabled:opacity-50"
          disabled={!pronto || classificar.isPending}
          onClick={() => rodar(false)}
        >
          {classificar.isPending ? 'Lendo...' : 'Simular'}
        </button>
        <Button
          disabled={!pronto || !simulado || classificar.isPending}
          onClick={() => {
            if (!window.confirm(
              `Gravar o plano das motos de "${nomeUnidade}" pelos produtos?\n\n`
              + `COM terceiros → ${nomePlano(comEf)}\nSEM terceiros → ${nomePlano(semEf)}\n\n`
              + 'O boleto não muda. Confirmar?',
            )) return;
            rodar(true);
          }}
        >
          Aplicar
        </Button>
      </div>
    </div>
  );
}

/**
 * O VENDEDOR DOS VEICULOS MIGRADOS (0095). A carga nao grava vendedor; o
 * vendedor sai do consultor do CONTRATO no Mutual, casado pelo CPF com o
 * cadastro de vendedores. O botao Carregar ja liga sozinho no fim; este quadro
 * mostra quem ficou SEM e por que, e liga de novo depois de cadastrar quem
 * faltava. Nunca troca vendedor ja gravado.
 */
function VendedoresDosVeiculos({ unidade, nomeUnidade }: { unidade: string; nomeUnidade: string }) {
  const resumo = useMutualVendedores(unidade);
  const vincular = useVincularVendedores();
  const linhas = resumo.data ?? [];
  const t = totaisVendedores(linhas);
  const pendentes = linhas.filter((l) => vendedorPendente(l.motivo));

  return (
    <div className="rounded-xl border border-slate-200/80 p-4">
      <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
        <UserCheck className="h-4 w-4 text-cyan-600" aria-hidden /> Vendedor dos veículos
      </h3>
      <p className="mb-3 text-xs leading-relaxed text-slate-500">
        O vendedor vem do <strong>consultor do contrato</strong> no Mutual, pelo CPF do cadastro de
        vendedores. Quem já tem vendedor <strong>não é trocado</strong>. Veículo vindo do Mutual{' '}
        <strong>nunca gera comissão de adesão</strong> aqui — a adesão foi paga la.
      </p>

      <ErroLeitura q={resumo} />
      {resumo.isLoading && <p className="text-xs text-slate-500">Lendo...</p>}

      {!resumo.isLoading && !resumo.isError && t.total === 0 && (
        <p className="text-xs text-slate-500">Nenhum veículo carregado nesta unidade ainda.</p>
      )}

      {t.total > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['A ligar', t.ligar],
              ['Já ligados', t.jaLigados],
              ['Outro vendedor (mantido)', t.mantidos],
              ['Sem vendedor', t.semVendedor],
            ].map(([rotulo, valor]) => (
              <div key={rotulo as string} className="rounded-lg bg-fundo p-2">
                <p className="text-[0.6875rem] text-slate-500">{rotulo}</p>
                <p className="tnum text-lg font-semibold text-slate-900">{valor}</p>
              </div>
            ))}
          </div>

          {pendentes.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold text-slate-600">
                Quem fica sem vendedor, e por que
              </p>
              <ul className="space-y-1.5">
                {pendentes.map((l) => (
                  <li key={`${l.motivo}-${l.consultor_id ?? ''}`} className="rounded-lg border border-slate-200/80 p-2 text-xs">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-slate-800">
                        {l.consultor_nome ?? '(sem consultor)'}
                        {l.consultor_documento && (
                          <span className="tnum font-normal text-slate-500"> · CPF {l.consultor_documento}</span>
                        )}
                      </span>
                      <span className="tnum font-semibold text-slate-900">{l.veiculos} veic.</span>
                    </div>
                    <p className="text-amber-700">{ROTULO_MOTIVO_VENDEDOR[l.motivo] ?? l.motivo}</p>
                    {l.placas && <p className="mt-0.5 break-words text-slate-500">{l.placas}</p>}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-500">
                Para quem não está no cadastro: cadastre o vendedor (com o CPF) em{' '}
                <strong>Configurações → Vendedores</strong>, na mesma unidade, e clique em Ligar.
              </p>
            </div>
          )}

          <div className="mt-3">
            <Button
              disabled={t.ligar === 0 || vincular.isPending}
              onClick={() => {
                if (!window.confirm(
                  `Ligar ${t.ligar} veículo(s) de "${nomeUnidade}" ao vendedor do consultor?\n\n`
                  + 'Quem já tem vendedor não é trocado. Confirmar?',
                )) return;
                vincular.mutate(
                  { regionalId: unidade, confirmar: true },
                  {
                    onSuccess: (r) => toast.success(r.mensagem),
                    onError: (e) => toast.error(e.message),
                  },
                );
              }}
            >
              {vincular.isPending ? 'Ligando...' : `Ligar ${t.ligar} ao vendedor`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 0158 — Assistencia Profissional dos migrados. O Mutual lista o produto sem
// preco: o legado ("7 ASSISTENCIA PROFISSIONAL 28MIG") traz o valor no nome;
// o novo ("Assistencia Profissional") so pela configuracao, que se informa
// aqui uma vez. O boleto NAO muda: so separa a comissao do vendedor.
// ---------------------------------------------------------------------------
function AssistenciaProfissionalMigrados({ unidade, nomeUnidade }: { unidade: string; nomeUnidade: string }) {
  const linhasQ = useAssistenciaProfissionalMigrados(unidade);
  const linhas = linhasQ.data ?? [];
  const t = totaisApMigrados(linhas);
  const configsQ = useAssistenciaProfissionalConfigs(t.semValor > 0);
  const definir = useDefinirValorAssistenciaConfig();
  const aplicar = useAplicarAssistenciaProfissional();
  const [edicao, setEdicao] = useState<Record<string, number | null>>({});
  const configsDaUnidade = new Set(linhas.filter((l) => l.situacao === 'SEM_VALOR').map((l) => l.subproduct_config_id ?? '(sem configuracao)'));
  const configs = (configsQ.data ?? []).filter((c) => configsDaUnidade.has(c.subproduct_config_id) || c.valor != null);

  return (
    <div className="rounded-xl border border-slate-200/80 p-4">
      <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
        <ShieldCheck className="h-4 w-4 text-cyan-600" aria-hidden /> Assistência Profissional dos migrados
      </h3>
      <p className="mb-3 text-xs leading-relaxed text-slate-500">
        No Mutual ela é um <strong>produto</strong> do veículo, sem preço na lista. O produto antigo traz o
        valor no nome (&quot;7 ASSISTENCIA PROFISSIONAL <strong>28</strong>MIG&quot; = R$ 28); o novo depende da
        <strong> configuração</strong> — informe o valor de cada uma abaixo (veja no Mutual quanto ela cobra).
        Gravar o valor <strong>não muda o boleto</strong>: só separa, na comissão, o que é do vendedor.
      </p>

      <ErroLeitura q={linhasQ} />
      {linhasQ.isLoading && <p className="text-xs text-slate-500">Lendo...</p>}
      {!linhasQ.isLoading && !linhasQ.isError && t.total === 0 && (
        <p className="text-xs text-slate-500">
          Nenhum veículo desta unidade tem o produto (ou os produtos dos veículos ainda não foram puxados).
        </p>
      )}

      {t.total > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['A gravar', t.aplicar],
              ['Já gravados', t.jaAplicado],
              ['Valor diferente (mantido)', t.diferente],
              ['Sem valor conhecido', t.semValor],
            ].map(([rotulo, valor]) => (
              <div key={rotulo as string} className="rounded-lg bg-fundo p-2">
                <p className="text-[0.6875rem] text-slate-500">{rotulo}</p>
                <p className="tnum text-lg font-semibold text-slate-900">{valor}</p>
              </div>
            ))}
          </div>

          {configs.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold text-slate-600">Valor por configuração do produto novo</p>
              <ErroLeitura q={configsQ} />
              <ul className="space-y-1.5">
                {configs.map((c) => {
                  const atual = c.subproduct_config_id in edicao ? edicao[c.subproduct_config_id] : c.valor;
                  const semConfig = c.subproduct_config_id === '(sem configuracao)';
                  return (
                    <li key={c.subproduct_config_id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200/80 p-2 text-xs">
                      <span className="min-w-[150px] font-medium text-slate-800">
                        Configuração {c.subproduct_config_id}
                        <span className="tnum font-normal text-slate-500"> · {c.veiculos} veíc. (base toda)</span>
                      </span>
                      {semConfig ? (
                        <span className="text-amber-700">sem configuração no Mutual — grave na ficha do veículo</span>
                      ) : (
                        <>
                          <div className="w-32">
                            <MoneyInput
                              value={atual ?? null}
                              onChange={(v) => setEdicao((p) => ({ ...p, [c.subproduct_config_id]: v }))}
                              placeholder="0,00"
                            />
                          </div>
                          <Button
                            variant="secondary"
                            disabled={definir.isPending || atual === c.valor}
                            onClick={() => definir.mutate(
                              { config: c.subproduct_config_id, valor: atual ?? null },
                              {
                                onSuccess: () => toast.success(atual == null
                                  ? 'Valor removido'
                                  : `Configuração ${c.subproduct_config_id}: ${formatCurrency(atual)}`),
                                onError: (e) => toast.error(e.message),
                              },
                            )}
                          >
                            Salvar
                          </Button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="mt-3">
            <Button
              disabled={t.aplicar === 0 || aplicar.isPending}
              onClick={() => {
                if (!window.confirm(
                  `Gravar a Assistência Profissional em ${t.aplicar} veículo(s) de "${nomeUnidade}"?\n\n`
                  + 'O boleto não muda. Valor já gravado e diferente não é trocado. Confirmar?',
                )) return;
                aplicar.mutate(
                  { regionalId: unidade },
                  {
                    onSuccess: (n) => toast.success(`${n} veículo(s) com a Assistência Profissional gravada`),
                    onError: (e) => toast.error(e.message),
                  },
                );
              }}
            >
              {aplicar.isPending ? 'Gravando...' : `Gravar em ${t.aplicar} veículo(s)`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
