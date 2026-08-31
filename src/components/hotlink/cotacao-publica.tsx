'use client';

import { useState } from 'react';
import {
  BadgeCheck, Car, CheckCircle2, ChevronRight, Loader2, Lock, ShieldCheck, User,
} from 'lucide-react';
import { maskCelular } from '@/lib/utils';
import { formatarMoedaBR } from '@/lib/money';
import { formatarDocumento } from '@/lib/documento';
import { normalizarPlaca } from '@/lib/placa';
import type { PlanoCotado, TipoVeiculoPublico } from '@/lib/venda-publica';
import { ORDEM_ETAPAS, mensagemDeErro, podeAvancar } from '@/lib/venda-publica';

const dinheiro = (v: number) => `R$ ${formatarMoedaBR(v)}`;

/**
 * Cotacao publica do hotlink, em tres passos: contato -> planos -> aceite.
 *
 * O contato e gravado no PRIMEIRO passo (nao se perde o lead se a pessoa
 * desistir depois), e o aceite do ultimo passo e o que empurra a venda para a
 * esteira de aprovacao. Quem aceita pode ser o proprio cliente, no celular
 * dele, ou o vendedor, presencialmente — as duas formas ficam registradas.
 */
export function CotacaoPublica({ codigo, vendedor, tipos }: {
  codigo: string;
  vendedor: string | null;
  tipos: TipoVeiculoPublico[];
}) {
  const [etapa, setEtapa] = useState<(typeof ORDEM_ETAPAS)[number]>('contato');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [contato, setContato] = useState({ nome: '', celular: '', email: '', placa: '' });
  const [token, setToken] = useState<string | null>(null);
  const [avisoCaptura, setAvisoCaptura] = useState<string | null>(null);

  const [tipoVeiculoId, setTipoVeiculoId] = useState(tipos[0]?.id ?? '');
  const [valorInformado, setValorInformado] = useState('');
  const [veiculo, setVeiculo] = useState<{ marca: string | null; modelo: string | null; ano: number | null; valor_fipe: number; origem: string } | null>(null);
  const [planos, setPlanos] = useState<PlanoCotado[]>([]);
  const [planoId, setPlanoId] = useState('');

  const [aceite, setAceite] = useState({ nome: '', documento: '', por: 'CLIENTE', marcado: false });
  const [contratado, setContratado] = useState<{ mensalidade: number; adesao: number } | null>(null);

  const planoEscolhido = planos.find((p) => p.plano_id === planoId) ?? null;

  async function chamar<T>(url: string, corpo: unknown): Promise<T> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(mensagemDeErro(json?.error));
    return json as T;
  }

  async function enviarContato(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await chamar<{ token: string; tipo: string; mensagem: string; vendedor: string | null }>(
        '/api/v1/hotlink', { ...contato, codigo },
      );
      setToken(r.token);
      // Quem ja e associado (ou ja esta em atendimento) recebe o retorno certo
      // em vez de uma promessa de cotacao nova.
      if (r.tipo === 'CARTEIRA' || r.tipo === 'DUPLICADO') {
        setAvisoCaptura(r.mensagem);
        setEtapa('fim');
        return;
      }
      setAceite((a) => ({ ...a, nome: contato.nome }));
      setEtapa('veiculo');
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  async function cotar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await chamar<{ veiculo: typeof veiculo; planos: PlanoCotado[] }>(
        '/api/v1/hotlink/cotar',
        {
          token, tipo_veiculo_id: tipoVeiculoId, placa: contato.placa,
          valor_fipe: Number(valorInformado.replace(/\./g, '').replace(',', '.')) || 0,
        },
      );
      setVeiculo(r.veiculo);
      setPlanos(r.planos);
      setPlanoId(r.planos[Math.min(1, r.planos.length - 1)]?.plano_id ?? '');
      setEtapa('planos');
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  async function contratar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await chamar<{ mensalidade: number; adesao: number }>(
        '/api/v1/hotlink/contratar',
        {
          token, plano_id: planoId, nome: aceite.nome,
          documento: aceite.documento, por: aceite.por,
        },
      );
      setContratado({ mensalidade: Number(r.mensalidade), adesao: Number(r.adesao) });
      setEtapa('fim');
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  // ------------------------------------------------------------------ fim
  if (etapa === 'fim') {
    return (
      <Cartao>
        <div className="px-6 py-10 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          {contratado ? (
            <>
              <h2 className="mt-3 text-xl font-semibold text-brand-800">Proposta aceita!</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
                Sua adesao entrou na nossa fila de aprovacao. O proximo passo e a
                <b> vistoria do veiculo</b> — {vendedor ?? 'seu consultor'} vai combinar com voce.
              </p>
              <div className="mx-auto mt-5 max-w-xs rounded-xl bg-brand-50 px-4 py-3 text-left">
                <Linha rotulo="Mensalidade" valor={dinheiro(contratado.mensalidade)} destaque />
                {contratado.adesao > 0 && (
                  <Linha rotulo="Adesao (unica)" valor={dinheiro(contratado.adesao)} />
                )}
              </div>
            </>
          ) : (
            <>
              <h2 className="mt-3 text-xl font-semibold text-brand-800">Recebemos seus dados</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{avisoCaptura}</p>
            </>
          )}
        </div>
      </Cartao>
    );
  }

  return (
    <Cartao>
      <Passos atual={etapa} />

      {erro && (
        <p className="mx-6 mt-4 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{erro}</p>
      )}

      {/* -------------------------------------------------------- contato */}
      {etapa === 'contato' && (
        <form onSubmit={enviarContato} className="space-y-3 px-6 py-6">
          <Titulo icone={User} texto="Seus dados" ajuda="Leva menos de um minuto." />
          <Campo rotulo="Nome completo" valor={contato.nome}
            onChange={(v) => setContato({ ...contato, nome: v })} autoFocus />
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Celular / WhatsApp" valor={contato.celular} inputMode="tel"
              onChange={(v) => setContato({ ...contato, celular: maskCelular(v) })} />
            <Campo rotulo="Placa do veiculo" valor={contato.placa} mono
              onChange={(v) => setContato({ ...contato, placa: normalizarPlaca(v) })} />
          </div>
          <Campo rotulo="E-mail (opcional)" valor={contato.email} type="email"
            onChange={(v) => setContato({ ...contato, email: v })} />
          <Botao carregando={enviando} disabled={!podeAvancar.contato(contato)}>
            Continuar
          </Botao>
        </form>
      )}

      {/* -------------------------------------------------------- veiculo */}
      {etapa === 'veiculo' && (
        <form onSubmit={cotar} className="space-y-3 px-6 py-6">
          <Titulo icone={Car} texto="Seu veiculo" ajuda="Buscamos o valor na tabela FIPE pela placa." />
          <div>
            <Rotulo>Tipo do veiculo</Rotulo>
            <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {tipos.map((t) => (
                <button
                  key={t.id} type="button" onClick={() => setTipoVeiculoId(t.id)}
                  className={`rounded-xl border px-3 py-2.5 text-[12.5px] font-semibold transition ${
                    tipoVeiculoId === t.id
                      ? 'border-cyan-500 bg-cyan-50 text-brand-800 ring-1 ring-cyan-400'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                >
                  {t.nome}
                </button>
              ))}
            </div>
          </div>
          <Campo rotulo="Placa" valor={contato.placa} mono
            onChange={(v) => setContato({ ...contato, placa: normalizarPlaca(v) })} />
          <Campo
            rotulo="Valor de mercado (se nao acharmos pela placa)"
            valor={valorInformado} inputMode="decimal" prefixo="R$"
            onChange={setValorInformado}
          />
          <Botao carregando={enviando} disabled={!tipoVeiculoId}>Ver meus planos</Botao>
        </form>
      )}

      {/* -------------------------------------------------------- planos */}
      {etapa === 'planos' && (
        <div className="px-6 py-6">
          <Titulo icone={ShieldCheck} texto="Escolha sua protecao"
            ajuda={veiculo ? `${[veiculo.marca, veiculo.modelo].filter(Boolean).join(' ') || 'Seu veiculo'} · valor de referencia ${dinheiro(veiculo.valor_fipe)}` : undefined} />

          <div className="mt-4 space-y-3">
            {planos.map((p) => {
              const ativo = p.plano_id === planoId;
              return (
                <button
                  key={p.plano_id} type="button" onClick={() => setPlanoId(p.plano_id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    ativo
                      ? 'border-cyan-500 bg-cyan-50/50 ring-1 ring-cyan-400'
                      : 'border-slate-200 bg-white hover:border-slate-300'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold text-brand-800">{p.nome}</p>
                      {p.descricao && (
                        <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-500">{p.descricao}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">por mes</p>
                      <p className="tnum text-[20px] font-bold leading-tight text-brand-700">
                        {dinheiro(p.mensalidade)}
                      </p>
                    </div>
                  </div>
                  {ativo && p.itens.length > 0 && (
                    <ul className="mt-3 grid gap-1 border-t border-cyan-200/70 pt-3 sm:grid-cols-2">
                      {p.itens.map((i) => (
                        <li key={i.nome} className="flex items-center gap-1.5 text-[11.5px] text-slate-600">
                          <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-cyan-600" />
                          {i.nome}
                        </li>
                      ))}
                    </ul>
                  )}
                  {ativo && (p.adesao > 0 || p.participacao > 0) && (
                    <p className="mt-2 text-[11px] text-slate-500">
                      {p.adesao > 0 && <>Adesao unica de <b>{dinheiro(p.adesao)}</b>. </>}
                      {p.participacao > 0 && <>Participacao no evento: <b>{dinheiro(p.participacao)}</b>.</>}
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button" onClick={() => setEtapa('aceite')} disabled={!planoId}
            className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-3 text-[14px] font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            Contratar {planoEscolhido?.nome} <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* -------------------------------------------------------- aceite */}
      {etapa === 'aceite' && planoEscolhido && (
        <form onSubmit={contratar} className="space-y-3 px-6 py-6">
          <Titulo icone={Lock} texto="Confirmacao"
            ajuda="Seus dados sao usados apenas para a analise da adesao." />

          <div className="rounded-xl bg-brand-50 px-4 py-3">
            <Linha rotulo={planoEscolhido.nome} valor={`${dinheiro(planoEscolhido.mensalidade)} /mes`} destaque />
            {planoEscolhido.adesao > 0 && (
              <Linha rotulo="Adesao (unica)" valor={dinheiro(planoEscolhido.adesao)} />
            )}
            {veiculo && (
              <Linha rotulo="Veiculo" valor={[veiculo.marca, veiculo.modelo].filter(Boolean).join(' ') || (contato.placa || '—')} />
            )}
          </div>

          <Campo rotulo="Nome completo de quem contrata" valor={aceite.nome}
            onChange={(v) => setAceite({ ...aceite, nome: v })} />
          <Campo rotulo="CPF ou CNPJ" valor={aceite.documento} inputMode="numeric"
            onChange={(v) => setAceite({ ...aceite, documento: formatarDocumento(v.replace(/\D/g, ''), v.replace(/\D/g, '').length > 11 ? 'PJ' : 'PF') })} />

          <div>
            <Rotulo>Quem esta confirmando</Rotulo>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {[
                { v: 'CLIENTE', r: 'Eu mesmo' },
                { v: 'VENDEDOR', r: `Meu consultor${vendedor ? ` (${vendedor.split(' ')[0]})` : ''}` },
              ].map((o) => (
                <button
                  key={o.v} type="button" onClick={() => setAceite({ ...aceite, por: o.v })}
                  className={`rounded-xl border px-3 py-2.5 text-[12.5px] font-semibold transition ${
                    aceite.por === o.v
                      ? 'border-cyan-500 bg-cyan-50 text-brand-800 ring-1 ring-cyan-400'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                >
                  {o.r}
                </button>
              ))}
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3">
            <input
              type="checkbox" checked={aceite.marcado}
              onChange={(e) => setAceite({ ...aceite, marcado: e.target.checked })}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
            />
            <span className="text-[11.5px] leading-relaxed text-slate-600">
              Declaro que as informacoes acima sao verdadeiras e aceito contratar o
              <b> {planoEscolhido.nome}</b> nas condicoes apresentadas. Entendo que a adesao passa por
              <b> analise e vistoria do veiculo</b>, e que as mensalidades comecam apos a aprovacao.
            </span>
          </label>

          <Botao carregando={enviando} disabled={!podeAvancar.aceite(aceite)}>
            Aceitar e contratar
          </Botao>
          <button
            type="button" onClick={() => setEtapa('planos')}
            className="w-full py-1 text-[12px] font-medium text-slate-500 hover:text-slate-700"
          >
            Voltar aos planos
          </button>
        </form>
      )}
    </Cartao>
  );
}

// ---------------------------------------------------------------------------
// Pecas visuais
// ---------------------------------------------------------------------------
function Cartao({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_10px_40px_-12px_rgba(20,33,61,0.25)] ring-1 ring-slate-200/70">
      {children}
    </div>
  );
}

function Passos({ atual }: { atual: string }) {
  const nomes: Record<string, string> = {
    contato: 'Contato', veiculo: 'Veiculo', planos: 'Planos', aceite: 'Confirmacao',
  };
  const i = ORDEM_ETAPAS.indexOf(atual as (typeof ORDEM_ETAPAS)[number]);
  return (
    <div className="flex border-b border-slate-100 bg-slate-50/60">
      {ORDEM_ETAPAS.filter((e) => e !== 'fim').map((e, idx) => (
        <div
          key={e}
          className={`flex-1 border-b-2 px-2 py-2.5 text-center text-[10.5px] font-bold uppercase tracking-wide transition ${
            idx === i ? 'border-cyan-500 text-brand-700'
            : idx < i ? 'border-cyan-200 text-slate-400'
            : 'border-transparent text-slate-300'}`}
        >
          {nomes[e]}
        </div>
      ))}
    </div>
  );
}

function Titulo({ icone: Icone, texto, ajuda }: {
  icone: React.ElementType; texto: string; ajuda?: string;
}) {
  return (
    <div className="pb-1">
      <h2 className="flex items-center gap-2 text-[17px] font-bold text-brand-800">
        <Icone className="h-5 w-5 text-cyan-600" /> {texto}
      </h2>
      {ajuda && <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">{ajuda}</p>}
    </div>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{children}</span>
  );
}

function Campo({ rotulo, valor, onChange, type = 'text', inputMode, mono, autoFocus, prefixo }: {
  rotulo: string; valor: string; onChange: (v: string) => void;
  type?: string; inputMode?: 'tel' | 'numeric' | 'decimal';
  mono?: boolean; autoFocus?: boolean; prefixo?: string;
}) {
  return (
    <label className="block">
      <Rotulo>{rotulo}</Rotulo>
      <div className="relative mt-1">
        {prefixo && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-slate-400">
            {prefixo}
          </span>
        )}
        <input
          type={type} value={valor} inputMode={inputMode} autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-xl border border-slate-300 px-3 py-2.5 text-[14px] text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 ${
            mono ? 'font-mono uppercase tracking-wide' : ''} ${prefixo ? 'pl-10' : ''}`}
        />
      </div>
    </label>
  );
}

function Botao({ children, carregando, disabled }: {
  children: React.ReactNode; carregando?: boolean; disabled?: boolean;
}) {
  return (
    <button
      type="submit" disabled={carregando || disabled}
      className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-[14px] font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
    >
      {carregando && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[12px] text-slate-500">{rotulo}</span>
      <span className={`tnum font-semibold ${destaque ? 'text-[15px] text-brand-700' : 'text-[13px] text-slate-700'}`}>
        {valor}
      </span>
    </div>
  );
}
