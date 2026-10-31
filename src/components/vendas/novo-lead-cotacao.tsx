'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowLeft, Check, ExternalLink, Loader2, MonitorPlay, Pencil, Plus,
} from 'lucide-react';
import { Input, Select, MoneyInput } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { CartaoDoPlano } from '@/components/vendas/cartao-plano';
import { FipeConsulta } from '@/components/fipe/fipe-consulta';
import { useFipePorPlaca } from '@/hooks/use-fipe';
import type { RegistroPlaca } from '@/lib/fipe';
import {
  useTiposVeiculo, useProdutos, useCotasParticipacao, useTiposPorProduto, useTiposPorPlano, useSugestoesPorPlano,
  useModeloDoCatalogo,
} from '@/hooks/use-precificacao';
import { alternarOpcional, planoInicial, sugestoesDoPlano, valorVisivel } from '@/lib/planos-oferta';
import { produtosParaTipo, regraRastreadorCobra, semRastreadorDaRegra } from '@/lib/produtos';
import {
  useAvisoDeCaptura, useCotacaoComparativa, useProdutosDoPlano, useRegrasAssistenciaProfissional,
  useSalvarCotacao, useSaveLead, type PlanoComparado,
} from '@/hooks/use-vendas';
import { CampoAssistenciaProfissional } from '@/components/vendas/campo-assistencia-profissional';
import { validarAssistenciaProfissional } from '@/lib/assistencia-profissional';
import { avisoDeCaptura } from '@/lib/atribuicao';
import { formatarDocumento, validarDocumento } from '@/lib/documento';
import { avulsosParaCotacao, separarOpcionais } from '@/lib/vistoria';
import { placaCompleta, tipoVeiculoSugerido } from '@/lib/venda-publica';
import { normalizarPlaca } from '@/lib/placa';
import { cn, maskCelular, formatCurrency } from '@/lib/utils';
import type { Combustivel, LeadsRow, OrigemFipe } from '@/lib/database.types';

/** O que a tela precisa gravar para criar o lead. */
export type NovoLead = Partial<LeadsRow> & { nome: string; celular: string };

/** Identifica a opcao escolhida no comparativo ('BASE' = so a cobertura base). */
const chaveDoPlano = (p: PlanoComparado) => p.plano_id ?? 'BASE';

// ---------------------------------------------------------------------------
// Novo lead + cotacao. Uma tela so, usada pelo CRM (/vendas/novo) e pelo
// portal do vendedor (/vendedor/leads/novo) — o que muda entre os dois e
// COMO o lead nasce e para onde a tela volta.
//
// A ordem segue a conversa real: a pessoa manda a PLACA e quer saber o preco.
// Por isso a tela comeca no veiculo, cota TODOS os planos de uma vez (como a
// pagina publica ja fazia) e so pede nome e telefone depois que o numero
// agradou. Nao existe mais botao "calcular": trocar um opcional recotiza.
// ---------------------------------------------------------------------------
export function NovoLeadCotacao({ criarLead, aoConcluir, voltarPara }: {
  /**
   * Como o lead nasce. No CRM e um insert direto; no portal do vendedor passa
   * por `vendedor_criar_lead`, que o amarra a quem cadastrou. A tela e a mesma.
   */
  criarLead?: (dados: NovoLead) => Promise<{ id: string }>;
  aoConcluir: (leadId: string) => void;
  voltarPara: { href: string; rotulo: string };
}) {
  const { data: tipos } = useTiposVeiculo();
  const { data: produtos } = useProdutos();
  const { data: tiposPorProduto } = useTiposPorProduto();
  const { data: cotas } = useCotasParticipacao();
  const { data: tiposPorPlano } = useTiposPorPlano();
  const { data: sugestoesPorPlano } = useSugestoesPorPlano();
  const fipePorPlaca = useFipePorPlaca();
  const salvarLead = useSaveLead();
  const salvarCotacao = useSalvarCotacao();
  const criar = criarLead ?? ((d: NovoLead) => salvarLead.mutateAsync(d));

  // Veiculo
  const [placa, setPlaca] = useState('');
  // O REGISTRO do documento (chassi, motor, cor, ano de fabricacao) vem junto
  // da consulta da placa. Nao tem campo nesta tela de proposito — a captura e
  // curta, na ordem da conversa — mas e gravado no lead, e o fechamento da
  // venda ja abre com ele preenchido. Sem isto o vendedor digitaria o chassi a
  // mao no fim, com o dado na nossa mao desde o comeco.
  const [registro, setRegistro] = useState<RegistroPlaca | null>(null);
  const [tipoVeiculoId, setTipoVeiculoId] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [anoModelo, setAnoModelo] = useState<number | ''>('');
  const [combustivel, setCombustivel] = useState<Combustivel | ''>('');
  const [valorFipe, setValorFipe] = useState<number | null>(null);
  const [codigoFipe, setCodigoFipe] = useState('');
  const [cotaId, setCotaId] = useState('');
  // 0162 — a cota vem do modelo do catalogo; escolher na mao desliga o automatico.
  const [cotaManual, setCotaManual] = useState(false);
  const [modeloId, setModeloId] = useState<string | null>(null);
  const [origemFipe, setOrigemFipe] = useState<OrigemFipe>('MANUAL');
  const [mostrarCascata, setMostrarCascata] = useState(false);
  // Cotacao
  const [escolha, setEscolha] = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modoEnvio, setModoEnvio] = useState<'DETALHADA' | 'CONSOLIDADA'>('DETALHADA');
  // 0158 — Assistencia Profissional (interna; a unidade de quem cota decide)
  const { data: regrasAp } = useRegrasAssistenciaProfissional(null);
  const [assistencia, setAssistencia] = useState<number | null>(null);
  // Lead
  const [nome, setNome] = useState('');
  const [celular, setCelular] = useState('');
  const [email, setEmail] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');

  // Esta pessoa ja e conhecida da casa? A checagem roda com o que ja foi
  // digitado (placa, depois celular/CPF) e NAO trava nada: quem esta com o
  // cliente na linha continua cotando — mesma escolha do 0043.
  const { data: classificacao } = useAvisoDeCaptura({ celular, cpfCnpj, placa });
  const aviso = avisoDeCaptura(classificacao);

  const catalogo = useModeloDoCatalogo(marca, modelo);
  useEffect(() => {
    if (catalogo.isFetching) return;
    const r = catalogo.data;
    setModeloId(r?.modelo_id ?? null);
    if (!cotaManual) setCotaId(r?.cota_id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogo.data, catalogo.isFetching]);
  // So o que atende o tipo do veiculo (0089): sem parabrisa para moto. O motor
  // ignora o resto de qualquer jeito; aqui e para a tela nao oferecer.
  const opcionais = useMemo(
    // ...e o rastreador opcional so abaixo do minimo do tipo (0090).
    () => semRastreadorDaRegra(
      produtosParaTipo((produtos ?? []).filter((p) => !p.obrigatorio && p.status), tipoVeiculoId, tiposPorProduto),
      regraRastreadorCobra((tipos ?? []).find((t) => t.id === tipoVeiculoId), valorFipe),
    ),
    [produtos, tipoVeiculoId, tiposPorProduto, tipos, valorFipe],
  );

  // 0162 — os pre-marcados de cada plano, so do que esta sendo oferecido aqui.
  const oferecidosIds = useMemo(() => opcionais.map((p) => p.id), [opcionais]);
  const sugestoes = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const id of Object.keys(sugestoesPorPlano ?? {})) {
      m[id] = sugestoesDoPlano(id, sugestoesPorPlano, oferecidosIds);
    }
    return m;
  }, [sugestoesPorPlano, oferecidosIds]);

  // Um preco por plano, recalculado sozinho a cada mudanca de veiculo/opcional.
  const comparativo = useCotacaoComparativa({
    fipe: valorFipe, tipoVeiculoId, cotaId: cotaId || null, avulsos: [...selecionados],
    escolha, sugestoes, tiposPorPlano,
  });
  const planos = useMemo(() => comparativo.data ?? [], [comparativo.data]);
  const escolhido = planos.find((p) => chaveDoPlano(p) === escolha) ?? null;
  // 0163 — o PREFERENCIAL (marcado em Configuracoes -> Planos) vem escolhido;
  // sem ele, o do meio, onde a maioria fecha. O vendedor decide.
  const inicial = planos.length > 1 ? planoInicial(planos, planos[Math.min(2, planos.length - 1)]) : null;
  const sugerido = inicial ? chaveDoPlano(inicial) : null;
  // Os demais so mostram o valor depois do clique.
  const [revelados, setRevelados] = useState<Set<string>>(new Set());

  const { data: doPlano } = useProdutosDoPlano(escolhido?.plano_id ?? null);
  const idsDoPlano = useMemo(() => (doPlano ?? []).map((p) => p.produto_id), [doPlano]);
  const { inclusos, avulsos } = useMemo(
    () => separarOpcionais(opcionais, idsDoPlano),
    [opcionais, idsDoPlano],
  );
  const preMarcados = useMemo(
    () => new Set(escolha && escolha !== 'BASE' ? sugestoes[escolha] ?? [] : []),
    [escolha, sugestoes],
  );

  // Trocar de plano = comecar dos pre-marcados dele (o consultor tira/troca depois).
  useEffect(() => {
    setSelecionados(new Set(escolha && escolha !== 'BASE' ? sugestoes[escolha] ?? [] : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escolha]);

  // Enquanto a lista nao chega, nada esta escolhido; quando chega, cai no sugerido.
  useEffect(() => {
    if (planos.length === 0) return;
    setEscolha((atual) => (planos.some((p) => chaveDoPlano(p) === atual) ? atual : (sugerido ?? '')));
  }, [planos, sugerido]);

  // ------------------------------------------------------------------ placa
  // Placa completa = consulta na hora. Quem digita a placa quer o preco, nao
  // um botao a mais.
  const ultimaBuscada = useRef('');
  useEffect(() => {
    const p = normalizarPlaca(placa);
    if (!placaCompleta(p) || ultimaBuscada.current === p) return;
    ultimaBuscada.current = p;
    void consultarPlacaFipe(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placa]);

  async function consultarPlacaFipe(p: string) {
    const r = await fipePorPlaca.mutateAsync(p).catch(() => null);
    const v = r?.valor ?? null;
    // O registro vale mesmo quando a avaliacao nao vem (placa fora da FIPE):
    // chassi e motor nao dependem do preco.
    if (r?.registro) setRegistro(r.registro);
    if (!v) {
      setMostrarCascata(true);
      toast.message('Placa não encontrada na FIPE — busque pelo modelo abaixo.');
      return;
    }
    if (v.marca) setMarca(v.marca);
    if (v.modelo) setModelo(v.modelo);
    if (v.anoModelo) setAnoModelo(v.anoModelo);
    if (v.combustivel) setCombustivel(v.combustivel as Combustivel);
    if (v.valor != null) setValorFipe(v.valor);
    if (v.codigoFipe) setCodigoFipe(v.codigoFipe);
    setOrigemFipe('API');
    // O tipo sai do registro da FIPE, como na pagina publica: o vendedor
    // confirma ou corrige, mas nao precisa adivinhar.
    const sugestao = tipoVeiculoSugerido(v.bruto, (tipos ?? []).map((t) => ({ id: t.id, nome: t.nome })));
    if (sugestao) setTipoVeiculoId((atual) => atual || sugestao);
    toast.success(`FIPE: ${formatCurrency(v.valor ?? 0)}`);
  }

  function toggle(id: string) {
    // Marcar um vidro/terceiros/carro reserva troca o outro do mesmo grupo.
    setSelecionados((s) => alternarOpcional(s, id, opcionais));
  }

  async function gerar() {
    if (!valorFipe) return toast.error('Informe o valor FIPE do veículo');
    if (!tipoVeiculoId) return toast.error('Selecione o tipo de veículo');
    if (!escolhido) return toast.error('Escolha o plano da proposta');
    if (!nome.trim()) return toast.error('Informe o nome do lead');
    if (celular.replace(/\D/g, '').length < 10) return toast.error('Informe um celular válido');
    // CPF e opcional na captura; digitado errado, nao.
    if (docPreenchido && !docValido) return toast.error('CPF/CNPJ invalido');
    const erroAp = validarAssistenciaProfissional(assistencia, regrasAp);
    if (erroAp) return toast.error(`Assistência Profissional: ${erroAp}`);
    try {
      const lead = await criar({
        nome: nome.trim(),
        celular: celular.replace(/\D/g, ''),
        email: email.trim() || null,
        cpf_cnpj: cpfCnpj.replace(/\D/g, '') || null,
        placa: placa ? normalizarPlaca(placa) : null,
        tipo_veiculo_id: tipoVeiculoId,
        marca: marca || null,
        modelo: modelo || null,
        ano_modelo: anoModelo === '' ? null : Number(anoModelo),
        combustivel: (combustivel || null) as Combustivel | null,
        valor_fipe: valorFipe,
        codigo_fipe: codigoFipe || null,
        cota_participacao_id: cotaId || null,
        modelo_id: modeloId,
        origem_fipe: origemFipe,
        // Registro do documento, quando a placa trouxe
        chassi: registro?.chassi ?? null,
        numero_motor: registro?.numeroMotor ?? null,
        cor: registro?.cor ?? null,
        ano_fabricacao: registro?.anoFabricacao ?? null,
      });
      await salvarCotacao.mutateAsync({
        leadId: lead.id,
        fipe: valorFipe,
        tipoVeiculoId,
        cotaId: cotaId || null,
        planoId: escolhido.plano_id,
        produtosIds: avulsosParaCotacao(selecionados, idsDoPlano),
        modoEnvio,
        assistenciaProfissional: assistencia ?? 0,
      });
      toast.success('Cotação gerada');
      aoConcluir(lead.id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const docPreenchido = cpfCnpj.length >= 11;
  const docValido = docPreenchido && validarDocumento(cpfCnpj, cpfCnpj.length > 11 ? 'PJ' : 'PF');
  const salvando = salvarLead.isPending || salvarCotacao.isPending;

  // Apresentar ao cliente: some o formulario e a tela mostra so o que ele precisa
  // ver (e nada interno, como a Assistencia Profissional).
  const [apresentando, setApresentando] = useState(false);
  const podeApresentar = planos.length > 0 && !!escolhido;
  useEffect(() => {
    if (!podeApresentar) setApresentando(false);
  }, [podeApresentar]);
  const resumoDoVeiculo = [marca, modelo, anoModelo].filter(Boolean).join(' ');

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-24 lg:pb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href={voltarPara.href} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-4 w-4" /> {voltarPara.rotulo}
          </Link>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900">Nova cotação</h1>
          {!apresentando && (
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Digite a placa: marca, modelo e valor FIPE vêm sozinhos e os planos aparecem em seguida.
            </p>
          )}
        </div>
        {podeApresentar && (
          <Button
            type="button"
            variant={apresentando ? 'secondary' : 'accent'}
            onClick={() => setApresentando((v) => !v)}
            className={apresentando ? 'px-5 py-3 text-base' : 'px-5 py-3 text-base font-bold text-faixa'}
          >
            {apresentando
              ? <><Pencil className="h-4 w-4" /> Voltar a editar</>
              : <><MonitorPlay className="h-5 w-5" /> Apresentar ao cliente</>}
          </Button>
        )}
      </div>

      {/* Aviso de duplicidade — informa, nunca bloqueia */}
      {aviso && !apresentando && (
        <div className={`flex items-start gap-2 rounded-2xl px-4 py-3 text-sm ring-1 ring-inset ${aviso.classe}`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{aviso.titulo}</p>
            <p className="mt-0.5 leading-snug opacity-90">{aviso.texto}</p>
            {aviso.linkDoLead && (
              <Link
                href={aviso.linkDoLead}
                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold underline"
              >
                Abrir o atendimento que já existe <ExternalLink className="h-3 w-3" />
              </Link>
            )}
            <p className="mt-1 text-xs opacity-70">
              Isto é um aviso: você pode seguir com a cotação normalmente.
            </p>
          </div>
        </div>
      )}

      {/* No computador: dados do lado esquerdo, planos do lado direito. No celular: 1, 2, 3 em fila. */}
      <div className={cn('grid gap-6 lg:items-start', apresentando ? 'lg:grid-cols-1' : 'lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]')}>
        {/* 1. Veiculo — a conversa comeca na placa */}
        <Secao passo={1} titulo="Veículo" className={cn('lg:col-start-1 lg:row-start-1', apresentando && 'hidden')}>
          <Campo label="Placa">
            <div className="relative">
              <Input
                value={placa}
                onChange={(e) => setPlaca(normalizarPlaca(e.target.value))}
                placeholder="ABC1D23"
                className="py-3 font-mono text-2xl uppercase tracking-[0.25em]"
                maxLength={7}
                autoFocus
              />
              {fipePorPlaca.isPending && (
                <Loader2 className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-slate-400" />
              )}
            </div>
          </Campo>

          {!mostrarCascata && (
            <button type="button" onClick={() => setMostrarCascata(true)} className="text-sm font-semibold text-brand-600 hover:underline">
              Não tem a placa? Buscar por Tipo &gt; Marca &gt; Modelo &gt; Ano
            </button>
          )}
          {mostrarCascata && (
            <FipeConsulta
              onSelecionar={(sel) => {
                if (sel.marcaNome) setMarca(sel.marcaNome);
                if (sel.modeloNome) setModelo(sel.modeloNome);
                if (sel.valor.anoModelo) setAnoModelo(sel.valor.anoModelo);
                if (sel.valor.combustivel) setCombustivel(sel.valor.combustivel as Combustivel);
                if (sel.valor.valor != null) setValorFipe(sel.valor.valor);
                if (sel.valor.codigoFipe) setCodigoFipe(sel.valor.codigoFipe);
                setOrigemFipe('API');
              }}
            />
          )}

          {(registro?.chassi || registro?.numeroMotor) && (
            <p className="text-xs text-slate-500">
              Do documento:{' '}
              {registro.chassi && <span className="font-mono">chassi {registro.chassi}</span>}
              {registro.chassi && registro.numeroMotor && ' · '}
              {registro.numeroMotor && <span className="font-mono">motor {registro.numeroMotor}</span>}
              {' '}— vai junto para a ficha da venda.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Marca"><Input value={marca} onChange={(e) => setMarca(e.target.value)} /></Campo>
            <Campo label="Modelo"><Input value={modelo} onChange={(e) => setModelo(e.target.value)} /></Campo>
            <Campo label="Ano modelo">
              <Input type="number" className="tnum" value={anoModelo}
                onChange={(e) => setAnoModelo(e.target.value === '' ? '' : Number(e.target.value))} />
            </Campo>
            <Campo label="Valor FIPE (R$) *">
              <MoneyInput value={valorFipe} placeholder="0,00"
                onChange={(v) => { setValorFipe(v); if (origemFipe === 'API') setOrigemFipe('MANUAL'); }} />
            </Campo>
            <Campo label="Tipo de veículo *">
              <Select value={tipoVeiculoId} onChange={(e) => setTipoVeiculoId(e.target.value)}>
                <option value="">-- Selecione --</option>
                {(tipos ?? []).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </Select>
            </Campo>
            <Campo label="Cota de participação">
              <Select value={cotaId} onChange={(e) => { setCotaId(e.target.value); setCotaManual(true); }}>
                <option value="">Padrão da faixa</option>
                {(cotas ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.codigo} — {(c.percentual * 100).toLocaleString('pt-BR')}%</option>
                ))}
              </Select>
            </Campo>
          </div>
          <p className="text-xs leading-snug text-slate-500">
            {catalogo.isFetching ? 'Procurando o modelo no catálogo...'
              : catalogo.data
                ? catalogo.data.cota_codigo
                  ? <>Cota do catálogo: <b>{catalogo.data.modelo}</b> ({catalogo.data.cota_codigo} — {(Number(catalogo.data.cota_percentual) * 100).toLocaleString('pt-BR')}%){cotaManual && ' · alterada à mão'}</>
                  : <>Modelo <b>{catalogo.data.modelo}</b> sem cota no catálogo: vale a faixa.</>
                : marca && modelo ? 'Modelo não achado no catálogo de Marcas/Modelos: vale a faixa.' : null}
          </p>
        </Secao>

        {/* 2. Planos — painel escuro, feito para virar a tela para o cliente */}
        <section
          className={cn(
            'relative overflow-hidden rounded-3xl bg-faixa text-white shadow-xl ring-1 ring-white/10',
            'lg:col-start-2 lg:row-span-2 lg:row-start-1',
            apresentando && 'mx-auto w-full max-w-5xl lg:col-start-1 lg:row-span-1',
          )}
        >
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl" />
          <div className="relative space-y-6 p-5 sm:p-8">
            <header className="flex items-start gap-3">
              <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-400 text-sm font-bold text-faixa">2</span>
              <div className="min-w-0">
                <h2 className="font-display text-2xl font-bold leading-tight sm:text-3xl">Escolha a proteção do seu veículo</h2>
                {(placa || resumoDoVeiculo || valorFipe) && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-white/75">
                    {placa && <span className="placa rounded-md bg-white px-2.5 py-1 text-sm font-bold tracking-widest text-faixa">{placa}</span>}
                    {resumoDoVeiculo && <span className="min-w-0">{resumoDoVeiculo}</span>}
                    {valorFipe != null && valorFipe > 0 && <span>FIPE <b className="tnum text-white">{formatCurrency(valorFipe)}</b></span>}
                  </div>
                )}
              </div>
            </header>

            {!valorFipe || !tipoVeiculoId ? (
              <p className="rounded-2xl border border-dashed border-white/25 px-4 py-12 text-center text-base text-white/70">
                Informe o valor FIPE e o tipo do veículo para ver os planos.
              </p>
            ) : comparativo.isLoading ? (
              <p className="flex items-center justify-center gap-2 py-12 text-base text-white/70">
                <Loader2 className="h-5 w-5 animate-spin" /> Cotando os planos...
              </p>
            ) : planos.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-rose-300/50 px-4 py-12 text-center text-base text-rose-200">
                Nenhum plano disponível para este veículo.
              </p>
            ) : (
              <div className={cn('space-y-4 transition', comparativo.isFetching && 'opacity-60')}>
                {planos.map((p) => {
                  const chave = chaveDoPlano(p);
                  const ativo = chave === escolha;
                  return (
                    <CartaoDoPlano
                      key={chave}
                      plano={p}
                      ativo={ativo}
                      mostraValor={ativo || valorVisivel(p, planos, revelados, chave)}
                      selo={chave === sugerido ? (p.preferencial ? 'preferencial' : 'sugerido') : null}
                      onEscolher={() => { setEscolha(chave); setRevelados((r) => new Set(r).add(chave)); }}
                    />
                  );
                })}
              </div>
            )}

            {/* Adicionais: marcar/desmarcar recotiza todos os planos */}
            {planos.length > 0 && (
              <div className="space-y-3 border-t border-white/15 pt-6">
                <div>
                  <h3 className="font-display text-lg font-bold">Personalize com adicionais</h3>
                  {escolhido && (
                    <p className="mt-0.5 text-sm text-white/60">
                      Valem para o plano {escolhido.nome}. Ao marcar, o valor dos planos se atualiza.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {inclusos.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white/75 ring-1 ring-white/15">
                      <Check className="h-4 w-4 text-cyan-300" /> {p.nome}
                      <span className="text-xs font-bold text-cyan-200">no plano</span>
                    </span>
                  ))}
                  {avulsos.map((p) => {
                    const marcado = selecionados.has(p.id);
                    return (
                      <button
                        key={p.id} type="button" aria-pressed={marcado} onClick={() => toggle(p.id)}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ring-1 transition',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300',
                          marcado ? 'bg-cyan-400 text-faixa ring-cyan-300' : 'bg-white/5 text-white ring-white/25 hover:bg-white/10',
                        )}
                      >
                        {marcado ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        {p.nome}
                        {p.valor_fixo != null && <span className="tnum font-normal opacity-80">{formatCurrency(p.valor_fixo)}</span>}
                        {preMarcados.has(p.id) && marcado && <span className="text-xs font-bold opacity-80">sugerido</span>}
                      </button>
                    );
                  })}
                  {avulsos.length === 0 && inclusos.length === 0 && (
                    <span className="text-sm text-white/60">Nenhum adicional cadastrado.</span>
                  )}
                </div>
                {preMarcados.size > 0 && !apresentando && (
                  <p className="text-xs text-white/50">
                    Os sugeridos já vêm marcados no preço. Desmarque ou troque (ex.: marcar o parabrisa troca o vidros completo) para chegar ao valor.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* 3. Contato — depois que o numero agradou */}
        <Secao passo={3} titulo="Dados do lead" className={cn('lg:col-start-1 lg:row-start-2', apresentando && 'hidden')}>
          <Campo label="Nome *">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do cliente" />
          </Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Celular / WhatsApp *">
              <Input value={celular} onChange={(e) => setCelular(maskCelular(e.target.value))}
                inputMode="tel" placeholder="(11) 91234-5678" />
            </Campo>
            <Campo label="CPF / CNPJ">
              <Input
                value={formatarDocumento(cpfCnpj, cpfCnpj.length > 11 ? 'PJ' : 'PF')}
                onChange={(e) => setCpfCnpj(e.target.value.replace(/\D/g, '').slice(0, 14))}
                inputMode="numeric" placeholder="Ajuda a achar duplicidade"
              />
              {docPreenchido && !docValido && (
                <p className="mt-0.5 text-xs text-rose-500">CPF/CNPJ invalido</p>
              )}
            </Campo>
          </div>
          <Campo label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="opcional" />
          </Campo>
          <CampoAssistenciaProfissional regras={regrasAp} valor={assistencia} onChange={setAssistencia} />
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-600">Envio ao cliente</p>
            <div className="flex gap-2">
              {(['DETALHADA', 'CONSOLIDADA'] as const).map((m) => (
                <button key={m} type="button" onClick={() => setModoEnvio(m)}
                  className={cn(
                    'flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition',
                    modoEnvio === m ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50',
                  )}>
                  {m === 'DETALHADA' ? 'Detalhada (item a item)' : 'Consolidada (só o total)'}
                </button>
              ))}
            </div>
          </div>
        </Secao>
      </div>

      {/* Barra de acao: no celular fica presa embaixo; no computador acompanha a rolagem */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-superficie p-3',
          'md:static md:border-0 md:bg-transparent md:p-0',
          'lg:sticky lg:bottom-4 lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-superficie lg:p-4 lg:shadow-lg',
          apresentando && 'hidden',
        )}
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-2 lg:max-w-none lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          {escolhido ? (
            <p className="text-center text-sm text-slate-500 lg:text-left">
              {escolhido.nome} · <b className="tnum text-base text-brand-700">{formatCurrency(escolhido.mensalidade + (assistencia ?? 0))}/mês</b>
              {(assistencia ?? 0) > 0 && <> (inclui {formatCurrency(assistencia ?? 0)} de Assistência Profissional)</>}
              {escolhido.adesao > 0 && <> · adesão {formatCurrency(escolhido.adesao)}</>}
            </p>
          ) : <span />}
          <Button onClick={gerar} disabled={salvando || !escolhido} className="w-full lg:w-auto lg:min-w-[20rem] lg:py-3 lg:text-base">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Gerar cotação e link
          </Button>
        </div>
      </div>
    </div>
  );
}

function Secao({ passo, titulo, children, className }: { passo: number; titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-4 rounded-2xl border border-slate-200 bg-superficie p-5 shadow-sm sm:p-6', className)}>
      <h2 className="flex items-center gap-3 font-display text-xl font-bold text-slate-800">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-acao text-sm font-bold text-white">{passo}</span>
        {titulo}
      </h2>
      {children}
    </section>
  );
}
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-sm font-medium text-slate-600">{label}</label>{children}</div>;
}
