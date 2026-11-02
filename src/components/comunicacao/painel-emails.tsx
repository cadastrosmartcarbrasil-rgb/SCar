'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Mail, PauseCircle, PlayCircle, RefreshCw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea, FormField } from '@/components/ui/field';
import {
  useCancelarEmail, useEmailConfig, useEmailFila, useEmailRegua, useEmailResumo, useEmailSupressoes,
  useEnviarTesteEmail, useLiberarSupressao, useReenviarEmail, useRodarRotinaEmail, useSalvarEmailConfig,
  useSalvarRegua, useSuprimirEmail, type FiltroFila,
} from '@/hooks/use-email-cobranca';
import {
  RAZAO_SOCIAL_PADRAO, ROTULO_SITUACAO_EMAIL, exemploAviso, renderizarAviso, taxasDoPainel,
  type SituacaoEmail, type TemplateEmail,
} from '@/lib/comunicacao/cobranca';
import { formatDate } from '@/lib/utils';
import type { EmailStatus } from '@/lib/database.types';

const COR_SITUACAO: Partial<Record<SituacaoEmail, string>> = {
  entregue: 'bg-emerald-100 text-emerald-800',
  enviado: 'bg-cyan-100 text-cyan-800',
  pendente: 'bg-slate-100 text-slate-700',
  enviando: 'bg-slate-100 text-slate-700',
  falhou: 'bg-rose-100 text-rose-800',
  bounce: 'bg-rose-100 text-rose-800',
  reclamado: 'bg-rose-100 text-rose-800',
  suprimido: 'bg-amber-100 text-amber-800',
};

function Selo({ s }: { s: SituacaoEmail }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${COR_SITUACAO[s] ?? 'bg-slate-100 text-slate-600'}`}>{ROTULO_SITUACAO_EMAIL[s] ?? s}</span>;
}

function Bloco({ titulo, children, acao }: { titulo: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-superficie p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-slate-900">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

function pct(v: number) {
  return `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

export function PainelEmails() {
  const cfg = useEmailConfig();
  if (cfg.isLoading) return <p className="text-sm text-slate-500">Carregando…</p>;
  if (cfg.error) return <p className="text-sm text-rose-700">Erro ao ler: {(cfg.error as Error).message}</p>;
  if (!cfg.data) {
    return <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
      Só a matriz (administrador e financeiro) acessa os e-mails de cobrança.
    </p>;
  }
  return (
    <div className="space-y-5">
      <Configuracao />
      <Indicadores />
      <Regua />
      <Fila />
      <Supressoes />
      <Previa />
    </div>
  );
}

function Configuracao() {
  const { data: cfg } = useEmailConfig();
  const salvar = useSalvarEmailConfig();
  const rodar = useRodarRotinaEmail();
  const [form, setForm] = useState({ allowlist: '', reply_to: '', limite: '2', inicio: '08:00', fim: '20:00', domingo: false });

  useEffect(() => {
    if (!cfg) return;
    setForm({
      allowlist: (cfg.allowlist ?? []).join(', '),
      reply_to: cfg.reply_to ?? '',
      limite: String(cfg.limite_por_segundo),
      inicio: cfg.janela_inicio.slice(0, 5),
      fim: cfg.janela_fim.slice(0, 5),
      domingo: cfg.permite_domingo,
    });
  }, [cfg]);

  if (!cfg) return null;
  const live = cfg.modo === 'live';

  const gravar = (v: Parameters<typeof salvar.mutate>[0], ok: string) =>
    salvar.mutate(v, { onSuccess: () => toast.success(ok), onError: (e) => toast.error(e.message) });

  return (
    <Bloco
      titulo="Situação dos envios"
      acao={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={rodar.isPending}
            onClick={() => rodar.mutate(false, {
              onSuccess: (r) => {
                const s = r.resumo ?? {};
                toast.success(`Rotina: ${r.fila?.criados ?? 0} na fila hoje · ${s.enviados ?? 0} enviados · ${s.cancelados ?? 0} cancelados${r.aviso ? ` — ${r.aviso}` : ''}`);
              },
              onError: (e) => toast.error(e.message),
            })}>
            <RefreshCw className="h-4 w-4" /> Rodar agora
          </Button>
          <Button variant={cfg.pausado ? 'primary' : 'danger'}
            onClick={() => gravar({ pausado: !cfg.pausado }, cfg.pausado ? 'Envios retomados' : 'Envios pausados')}>
            {cfg.pausado ? <><PlayCircle className="h-4 w-4" /> Retomar envios</> : <><PauseCircle className="h-4 w-4" /> Pausar envios</>}
          </Button>
        </div>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className={`rounded-xl border p-3 ${cfg.pausado ? 'border-rose-300 bg-rose-50' : 'border-emerald-300 bg-emerald-50'}`}>
          <p className="text-xs text-slate-600">Envio</p>
          <p className="font-semibold text-slate-900">{cfg.pausado ? 'PAUSADO' : 'Ligado'}</p>
        </div>
        <div className={`rounded-xl border p-3 ${live ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
          <p className="text-xs text-slate-600">Modo</p>
          <p className="font-semibold text-slate-900">{live ? 'Produção — envia aos associados' : 'Teste — só para a lista abaixo'}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-600">Janela (horário de Brasília)</p>
          <p className="font-semibold text-slate-900">{cfg.janela_inicio.slice(0, 5)}–{cfg.janela_fim.slice(0, 5)}{cfg.permite_domingo ? ' · inclui domingo' : ' · sem domingo'}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Lista de teste (modo teste envia SÓ para estes e-mails, separados por vírgula)" className="sm:col-span-2">
          <Textarea rows={2} value={form.allowlist} onChange={(e) => setForm({ ...form, allowlist: e.target.value })} />
        </FormField>
        <FormField label="Responder para (vazio = e-mail financeiro da Empresa)">
          <Input type="email" value={form.reply_to} onChange={(e) => setForm({ ...form, reply_to: e.target.value })} />
        </FormField>
        <FormField label="E-mails por segundo">
          <Input type="number" min={0.1} max={50} step={0.1} value={form.limite} onChange={(e) => setForm({ ...form, limite: e.target.value })} />
        </FormField>
        <FormField label="Janela: início">
          <Input type="time" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} />
        </FormField>
        <FormField label="Janela: fim">
          <Input type="time" value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} />
        </FormField>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.domingo} onChange={(e) => setForm({ ...form, domingo: e.target.checked })} />
          Enviar também aos domingos
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button disabled={salvar.isPending} onClick={() => gravar({
          allowlist: form.allowlist.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean),
          reply_to: form.reply_to.trim() || null,
          limite_por_segundo: Number(form.limite) || 2,
          janela_inicio: form.inicio,
          janela_fim: form.fim,
          permite_domingo: form.domingo,
        }, 'Configuração salva')}>Salvar</Button>
        <Button variant={live ? 'secondary' : 'accent'} onClick={() => {
          const msg = live
            ? 'Voltar ao MODO TESTE? Os avisos passam a sair só para a lista de teste.'
            : 'Ligar o MODO PRODUÇÃO? Os avisos passam a sair para TODOS os associados com boleto do SCar. Confirme antes que o domínio está verificado no Resend e que os textos foram aprovados.';
          if (confirm(msg)) gravar({ modo: live ? 'sandbox' : 'live' }, live ? 'Modo teste' : 'Modo produção ligado');
        }}>
          {live ? 'Voltar ao modo teste' : 'Ligar modo produção'}
        </Button>
      </div>
    </Bloco>
  );
}

function Indicadores() {
  const [dias, setDias] = useState(7);
  const { data } = useEmailResumo(dias);
  const r = data ?? {};
  const taxas = taxasDoPainel({ enviados: r.enviados ?? 0, bounces: r.bounces ?? 0, reclamacoes: r.reclamacoes ?? 0 });
  const cartoes: [string, number | undefined][] = [
    ['Enviados', r.enviados], ['Entregues', r.entregues], ['Devolvidos (bounce)', r.bounces], ['Marcados como spam', r.reclamacoes],
    ['Falhas', r.falhas], ['Na fila', r.pendentes], ['Bloqueados por supressão', r.suprimidos], ['Supressões ativas', r.supressoes_ativas],
  ];
  return (
    <Bloco titulo="Indicadores" acao={
      <Select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="w-36">
        <option value={7}>Últimos 7 dias</option>
        <option value={30}>Últimos 30 dias</option>
      </Select>
    }>
      {(taxas.alertaBounce || taxas.alertaReclamacao) && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {taxas.alertaBounce && <>Devoluções em {pct(taxas.bounce)} (limite 2%). </>}
            {taxas.alertaReclamacao && <>Marcações de spam em {pct(taxas.reclamacao)} (limite 0,05%). </>}
            Considere pausar os envios e revisar os e-mails da base antes que o provedor restrinja a conta.
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cartoes.map(([t, v]) => (
          <div key={t} className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-500">{t}</p>
            <p className="tnum text-xl font-semibold text-slate-900">{(v ?? 0).toLocaleString('pt-BR')}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">Taxa de devolução {pct(taxas.bounce)} · taxa de spam {pct(taxas.reclamacao)}, sobre os enviados no período.</p>
    </Bloco>
  );
}

function Regua() {
  const { data } = useEmailRegua();
  const salvar = useSalvarRegua();
  return (
    <Bloco titulo="Régua de avisos">
      <p className="mb-3 text-sm text-slate-600">
        Só boletos emitidos pelo SCar e registrados no banco. Atraso conta do vencimento em dia útil.
        Boleto pago ou cancelado derruba os avisos que ainda não saíram.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-superficie-alta text-left text-xs text-slate-500">
            <tr><th className="p-2">Aviso</th><th className="p-2">Quando</th><th className="p-2">Ativo</th></tr>
          </thead>
          <tbody>
            {(data ?? []).map((r) => (
              <tr key={r.codigo} className="border-t border-slate-200">
                <td className="p-2 text-slate-800">{r.nome}</td>
                <td className="p-2 text-slate-700">
                  {r.offset_dias === 0 ? 'No vencimento' : r.offset_dias < 0 ? `${-r.offset_dias} dia(s) antes` : `${r.offset_dias} dia(s) depois`}
                </td>
                <td className="p-2">
                  <input type="checkbox" checked={r.ativo}
                    onChange={(e) => salvar.mutate({ codigo: r.codigo, ativo: e.target.checked }, { onError: (er) => toast.error(er.message) })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Bloco>
  );
}

function Fila() {
  const [f, setF] = useState<FiltroFila>({ status: '', regua: '', busca: '', de: '', ate: '' });
  const { data, isLoading } = useEmailFila(f);
  const { data: regua } = useEmailRegua();
  const reenviar = useReenviarEmail();
  const cancelar = useCancelarEmail();
  const nomes = useMemo(() => new Map((regua ?? []).map((r) => [r.codigo, r.nome])), [regua]);
  return (
    <Bloco titulo="Fila e histórico">
      <div className="mb-3 grid gap-2 sm:grid-cols-5">
        <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as EmailStatus | '' })}>
          <option value="">Todas as situações</option>
          {Object.entries(ROTULO_SITUACAO_EMAIL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select value={f.regua} onChange={(e) => setF({ ...f, regua: e.target.value })}>
          <option value="">Todos os avisos</option>
          {(regua ?? []).map((r) => <option key={r.codigo} value={r.codigo}>{r.nome}</option>)}
        </Select>
        <Input caixa="original" placeholder="Buscar e-mail" value={f.busca} onChange={(e) => setF({ ...f, busca: e.target.value })} />
        <Input type="date" value={f.de} onChange={(e) => setF({ ...f, de: e.target.value })} title="Data do aviso: de" />
        <Input type="date" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} title="Data do aviso: até" />
      </div>
      {isLoading ? <p className="text-sm text-slate-500">Carregando…</p> : (data ?? []).length === 0 ? (
        <p className="text-sm text-slate-500">Nada na fila com estes filtros.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-superficie-alta text-left text-xs text-slate-500">
              <tr><th className="p-2">Dia</th><th className="p-2">Associado / e-mail</th><th className="p-2">Aviso</th><th className="p-2">Situação</th><th className="p-2">Detalhe</th><th className="p-2"></th></tr>
            </thead>
            <tbody>
              {(data ?? []).map((i) => (
                <tr key={i.id} className="border-t border-slate-200 align-top">
                  <td className="p-2 whitespace-nowrap text-slate-700">{formatDate(i.data_alvo)}</td>
                  <td className="p-2"><div className="text-slate-800">{i.clientes?.nome_razao_social ?? '—'}</div><div className="text-xs text-slate-500">{i.destinatario}</div></td>
                  <td className="p-2 text-slate-700">{nomes.get(i.regua_codigo) ?? i.regua_codigo}</td>
                  <td className="p-2"><Selo s={i.status as SituacaoEmail} />{i.tentativas > 1 && <span className="ml-1 text-xs text-slate-500">{i.tentativas} tentativas</span>}</td>
                  <td className="p-2 text-xs text-slate-600">{i.erro ?? i.motivo ?? ''}</td>
                  <td className="p-2 whitespace-nowrap text-right">
                    {['falhou', 'expirado', 'cancelado'].includes(i.status) && (
                      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => reenviar.mutate({ p_id: i.id }, {
                        onSuccess: () => toast.success('Voltou para a fila de hoje'), onError: (e) => toast.error(e.message),
                      })}>Reenviar</Button>
                    )}
                    {i.status === 'pendente' && (
                      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => cancelar.mutate({ p_id: i.id }, {
                        onSuccess: () => toast.success('Cancelado'), onError: (e) => toast.error(e.message),
                      })}>Cancelar</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">Mostrando até 200, do mais recente.</p>
        </div>
      )}
    </Bloco>
  );
}

function Supressoes() {
  const [busca, setBusca] = useState('');
  const { data } = useEmailSupressoes(busca);
  const liberar = useLiberarSupressao();
  const suprimir = useSuprimirEmail();
  const [novo, setNovo] = useState('');
  const MOTIVO: Record<string, string> = { bounce_permanente: 'Devolvido (endereço inexistente)', reclamacao: 'Marcou como spam', manual: 'Manual' };
  return (
    <Bloco titulo="Lista de supressão (nunca recebem)">
      <p className="mb-3 text-sm text-slate-600">Endereço devolvido em definitivo ou que marcou como spam entra aqui sozinho e não recebe mais nenhum aviso.</p>
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <Input caixa="original" placeholder="Buscar e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Input caixa="original" type="email" placeholder="Bloquear um e-mail" value={novo} onChange={(e) => setNovo(e.target.value)} />
        <Button variant="secondary" disabled={!novo.trim()} onClick={() => {
          const motivo = prompt('Motivo do bloqueio (mínimo 5 caracteres):');
          if (!motivo) return;
          suprimir.mutate({ p_email: novo, p_motivo: motivo }, {
            onSuccess: () => { toast.success('Bloqueado'); setNovo(''); }, onError: (e) => toast.error(e.message),
          });
        }}>Bloquear</Button>
      </div>
      {(data ?? []).length === 0 ? <p className="text-sm text-slate-500">Nenhum e-mail bloqueado.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-superficie-alta text-left text-xs text-slate-500">
              <tr><th className="p-2">E-mail</th><th className="p-2">Motivo</th><th className="p-2">Desde</th><th className="p-2"></th></tr>
            </thead>
            <tbody>
              {(data ?? []).map((s) => (
                <tr key={s.id} className="border-t border-slate-200">
                  <td className="p-2 text-slate-800">{s.email}</td>
                  <td className="p-2 text-slate-700">{MOTIVO[s.motivo] ?? s.motivo}{s.detalhe ? <span className="block text-xs text-slate-500">{s.detalhe}</span> : null}</td>
                  <td className="p-2 text-slate-700">{formatDate(s.criado_em)}</td>
                  <td className="p-2 text-right">
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => {
                      const motivo = prompt('Por que liberar este e-mail? (mínimo 5 caracteres)');
                      if (!motivo) return;
                      liberar.mutate({ p_id: s.id, p_motivo: motivo }, { onSuccess: () => toast.success('Liberado'), onError: (e) => toast.error(e.message) });
                    }}>Liberar</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Bloco>
  );
}

const MODELOS: { valor: string; rotulo: string; template: TemplateEmail; offset: number }[] = [
  { valor: 'd-5', rotulo: '5 dias antes', template: 'aviso_vencimento', offset: -5 },
  { valor: 'd-1', rotulo: '1 dia antes', template: 'aviso_vencimento', offset: -1 },
  { valor: 'd0', rotulo: 'No vencimento', template: 'vence_hoje', offset: 0 },
  { valor: 'd+2', rotulo: '2 dias depois', template: 'atraso', offset: 2 },
  { valor: 'd+7', rotulo: '7 dias depois', template: 'atraso', offset: 7 },
];

function Previa() {
  const [modelo, setModelo] = useState('d-5');
  const [email, setEmail] = useState('');
  const teste = useEnviarTesteEmail();
  const m = MODELOS.find((x) => x.valor === modelo) ?? MODELOS[0];
  const r = renderizarAviso(m.template, exemploAviso(m.template, m.offset, '#'), {
    razaoSocial: RAZAO_SOCIAL_PADRAO, cnpj: null, whatsapp: '(00) 00000-0000', email: 'financeiro@exemplo.com.br', site: null,
  });
  return (
    <Bloco titulo="Pré-visualização e envio de teste">
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <Select value={modelo} onChange={(e) => setModelo(e.target.value)}>
          {MODELOS.map((x) => <option key={x.valor} value={x.valor}>{x.rotulo}</option>)}
        </Select>
        <Input caixa="original" type="email" placeholder="Enviar teste para…" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button variant="secondary" disabled={!email.trim() || teste.isPending} onClick={() => teste.mutate(
          { email, template: m.template, offset_dias: m.offset },
          { onSuccess: () => toast.success('Teste enviado'), onError: (e) => toast.error(e.message) },
        )}><Send className="h-4 w-4" /> Enviar teste</Button>
      </div>
      <p className="mb-2 flex items-center gap-1.5 text-sm text-slate-700"><Mail className="h-4 w-4" /> <strong>Assunto:</strong> {r.assunto}</p>
      <iframe title="Pré-visualização do e-mail" srcDoc={r.html} className="h-[640px] w-full rounded-xl border border-slate-200 bg-white" sandbox="" />
      <p className="mt-2 text-xs text-slate-500">Dados de exemplo. No envio real, o rodapé usa a razão social, o CNPJ e os contatos de Configurações → Empresa.</p>
    </Bloco>
  );
}
