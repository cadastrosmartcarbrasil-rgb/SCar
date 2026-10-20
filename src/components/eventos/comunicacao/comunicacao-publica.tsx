'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { CabecalhoMarca, RodapeMarca } from '@/components/hotlink/marca';
import {
  TEXTOS, ehTerceiro, rotuloPapel, type DadosComunicacao, type PapelComunicacao, type PoseComunicacao,
} from '@/lib/comunicacao-evento';
import { formatDate } from '@/lib/utils';
import {
  FormularioComunicacao, type AnexoComunicacao, type PrefillComunicacao,
} from './formulario-comunicacao';

/**
 * A comunicacao do evento no celular do envolvido (0129). Ordem da tela:
 * aviso de privacidade -> (associado) confirmacao de identidade -> formulario
 * em passos com rascunho automatico -> comprovante (protocolo, versao, hash).
 * Depois de enviado e so leitura; a equipe pode pedir correcao, e ai o link
 * volta a aceitar uma nova versao (a anterior fica guardada).
 */
interface Estado {
  valida: boolean;
  motivo: string | null;
  papel?: PapelComunicacao;
  status?: string;
  nome?: string | null;
  protocolo?: string | null;
  data_evento?: string | null;
  expira_em?: string | null;
  precisa_verificar?: boolean;
  bloqueado?: boolean;
  verificacao_modo?: 'DOC3_NASCIMENTO' | 'DOC6';
  correcao_comentario?: string | null;
  prefill?: PrefillComunicacao | null;
  rascunho?: DadosComunicacao | null;
  enviado_em?: string | null;
  versao?: number | null;
  hash?: string | null;
  anexos?: AnexoComunicacao[];
}

const MOTIVOS: Record<string, { titulo: string; texto: string }> = {
  LINK_INVALIDO: { titulo: 'Link não encontrado', texto: 'Confira se o endereço veio completo na mensagem. Se continuar assim, fale com a nossa central.' },
  LINK_EXPIRADO: { titulo: 'Este link expirou', texto: 'Por segurança o link vale por alguns dias. Peça um novo a nossa central — leva um minuto.' },
  LINK_REVOGADO: { titulo: 'Este link foi cancelado', texto: 'A nossa central cancelou este link. Se ainda precisa enviar informações, peça um novo.' },
};

async function chamar<T = Record<string, unknown>>(corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch('/api/v1/comunicar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? 'Não foi possível concluir agora');
  return j as T;
}

/** Junta o que o cadastro ja sabe com o que a pessoa digitou (o digitado vence). */
function comPrefill(d: DadosComunicacao, pre?: PrefillComunicacao | null): DadosComunicacao {
  if (!pre?.identificacao) return d;
  const base: Record<string, string> = {};
  for (const [k, v] of Object.entries(pre.identificacao)) if (v) base[k] = v;
  return { ...d, identificacao: { ...base, ...(d.identificacao ?? {}) } };
}

const CHAVE_LOCAL = (t: string) => `scar:comunicar:${t.slice(0, 12)}`;

export function ComunicacaoPublica({ token, logoUrl }: { token: string; logoUrl: string | null }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [aceitouAviso, setAceitouAviso] = useState(false);
  const [dados, setDados] = useState<DadosComunicacao>({});
  const [anexos, setAnexos] = useState<AnexoComunicacao[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [salvo, setSalvo] = useState<'idle' | 'salvando' | 'salvo'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ler = useCallback(async () => {
    try {
      const e = await chamar<Estado>({ acao: 'ler', token });
      setEstado(e);
      setAnexos(e.anexos ?? []);
      let base = e.rascunho ?? {};
      // Rascunho do aparelho cobre o caso de a rede cair antes do salvamento.
      try {
        const local = localStorage.getItem(CHAVE_LOCAL(token));
        if (local && (!e.rascunho || Object.keys(e.rascunho).length === 0)) base = JSON.parse(local);
      } catch { /* sem armazenamento local */ }
      setDados(comPrefill(base, e.prefill));
    } catch (err) {
      setEstado({ valida: false, motivo: 'LINK_INVALIDO' });
      toast.error((err as Error).message);
    }
  }, [token]);

  useEffect(() => { void ler(); }, [ler]);

  const editavel = estado?.valida && !estado.precisa_verificar
    && ['ABERTO', 'EM_PREENCHIMENTO', 'CORRECAO'].includes(estado.status ?? '');

  function mudar(d: DadosComunicacao) {
    setDados(d);
    try { localStorage.setItem(CHAVE_LOCAL(token), JSON.stringify(d)); } catch { /* ok */ }
    if (timer.current) clearTimeout(timer.current);
    setSalvo('salvando');
    timer.current = setTimeout(async () => {
      try { await chamar({ acao: 'rascunho', token, dados: d }); setSalvo('salvo'); }
      catch { setSalvo('idle'); }
    }, 1500);
  }

  // O formulario ja validou e reduziu a foto antes de chamar aqui.
  async function anexar(pose: PoseComunicacao, file: File) {
    const form = new FormData();
    form.append('token', token);
    form.append('pose', pose.codigo);
    form.append('file', file);
    const r = await fetch('/api/v1/comunicar/anexo', { method: 'POST', body: form });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(j.error ?? 'Não consegui enviar o arquivo'); return; }
    setAnexos((a) => [...a, { id: j.id, pose: pose.codigo, nome_original: file.name }]);
    toast.success('Arquivo recebido');
  }

  async function remover(id: string) {
    try {
      await chamar({ acao: 'remover', token, anexo_id: id });
      setAnexos((a) => a.filter((x) => x.id !== id));
    } catch (err) { toast.error((err as Error).message); }
  }

  async function enviar(declarou: boolean) {
    setEnviando(true);
    try {
      if (timer.current) clearTimeout(timer.current);
      await chamar({ acao: 'enviar', token, dados, declarou });
      try { localStorage.removeItem(CHAVE_LOCAL(token)); } catch { /* ok */ }
      toast.success('Comunicação enviada');
      await ler();
      window.scrollTo({ top: 0 });
    } catch (err) { toast.error((err as Error).message); }
    finally { setEnviando(false); }
  }

  const primeiroNome = (estado?.nome ?? '').split(' ')[0];

  return (
    <div className="flex min-h-screen flex-col bg-fundo">
      <CabecalhoMarca logoUrl={logoUrl} subtitulo="Comunicação de evento" />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {!estado && (
          <div className="flex items-center justify-center gap-2 py-20 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
          </div>
        )}

        {estado && !estado.valida && (
          <Aviso icone="alerta" titulo={MOTIVOS[estado.motivo ?? '']?.titulo ?? MOTIVOS.LINK_INVALIDO.titulo}>
            {MOTIVOS[estado.motivo ?? '']?.texto ?? MOTIVOS.LINK_INVALIDO.texto}
          </Aviso>
        )}

        {estado?.valida && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-superficie p-4">
              <p className="text-lg font-semibold text-slate-900">
                {primeiroNome ? `Olá, ${primeiroNome}!` : 'Olá!'}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Protocolo <span className="font-mono font-semibold">{estado.protocolo}</span>
                {estado.papel && !ehTerceiro(estado.papel) && estado.papel !== 'testemunha'
                  && estado.data_evento && <> · evento de {formatDate(estado.data_evento)}</>}
              </p>
              {estado.papel && <p className="mt-1 text-xs text-slate-500">Você está informando como: {rotuloPapel(estado.papel)}</p>}
              <p className="mt-2 text-sm text-slate-600">
                Comunique o quanto antes. Preencha o que souber — as informações ficam salvas enquanto você preenche.
              </p>
            </div>

            {['ENVIADO', 'CONFERIDO'].includes(estado.status ?? '') && (
              <Aviso icone="ok" titulo="Recebemos a sua comunicação">
                <p>Obrigado! A nossa equipe vai analisar e entra em contato se precisar de algo mais.</p>
                <dl className="mt-3 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                  <div><dt className="text-slate-500">Protocolo</dt><dd className="font-mono">{estado.protocolo}</dd></div>
                  <div><dt className="text-slate-500">Enviado em</dt><dd>{estado.enviado_em ? new Date(estado.enviado_em).toLocaleString('pt-BR') : '—'}</dd></div>
                  <div><dt className="text-slate-500">Versão</dt><dd>{estado.versao ?? 1}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-slate-500">Código de conferência</dt><dd className="break-all font-mono">{estado.hash}</dd></div>
                </dl>
                <p className="mt-3 text-xs text-slate-500">
                  {estado.papel && ehTerceiro(estado.papel) ? TEXTOS.naoReconheceTerceiro : TEXTOS.naoReconhece}
                </p>
              </Aviso>
            )}

            {estado.status === 'CORRECAO' && estado.correcao_comentario && (
              <Aviso icone="alerta" titulo="A nossa equipe pediu um ajuste">
                {estado.correcao_comentario}
              </Aviso>
            )}

            {editavel || estado.precisa_verificar ? (
              !aceitouAviso ? (
                <div className="rounded-2xl border border-slate-200 bg-superficie p-4">
                  <p className="flex items-center gap-2 font-semibold text-slate-900">
                    <ShieldCheck className="h-5 w-5 text-cyan-600" /> Antes de começar
                  </p>
                  <p className="mt-2 text-sm text-slate-600">{TEXTOS.privacidade}</p>
                  <button
                    onClick={() => setAceitouAviso(true)}
                    className="mt-4 w-full rounded-xl bg-acao px-4 py-3 font-semibold text-white hover:bg-acao-escura"
                  >
                    Entendi, começar
                  </button>
                </div>
              ) : estado.precisa_verificar ? (
                <Verificacao token={token} estado={estado} onOk={ler} />
              ) : (
                <>
                  <p className="text-right text-xs text-slate-500">
                    {salvo === 'salvando' ? 'Salvando...' : salvo === 'salvo' ? 'Rascunho salvo' : ''}
                  </p>
                  <FormularioComunicacao
                    papel={estado.papel!}
                    dados={dados}
                    onChange={mudar}
                    prefill={estado.prefill}
                    anexos={anexos}
                    onAnexar={anexar}
                    onRemoverAnexo={remover}
                    onEnviar={enviar}
                    enviando={enviando}
                    modo="publico"
                  />
                </>
              )
            ) : null}

            {estado.expira_em && editavel && (
              <p className="text-center text-xs text-slate-500">
                Este link vale até {new Date(estado.expira_em).toLocaleDateString('pt-BR')}.
              </p>
            )}
          </div>
        )}
      </main>
      <RodapeMarca />
    </div>
  );
}

function Verificacao({ token, estado, onOk }: { token: string; estado: Estado; onOk: () => Promise<void> }) {
  const seis = estado.verificacao_modo === 'DOC6';
  const [doc, setDoc] = useState('');
  const [nasc, setNasc] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [bloqueado, setBloqueado] = useState(Boolean(estado.bloqueado));

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const r = await chamar<{ ok: boolean; motivo?: string }>({
        acao: 'verificar', token, doc: doc.replace(/\D/g, ''), nascimento: seis ? null : nasc || null,
      });
      if (r.ok) { await onOk(); return; }
      if (r.motivo === 'BLOQUEADO') setBloqueado(true);
      else toast.error('Os dados não conferem. Confira e tente de novo.');
    } catch (err) { toast.error((err as Error).message); }
    finally { setEnviando(false); }
  }

  if (bloqueado) {
    return (
      <Aviso icone="alerta" titulo="Confirmação bloqueada">
        Foram muitas tentativas. Fale com a nossa central para receber um link novo.
      </Aviso>
    );
  }

  return (
    <form onSubmit={confirmar} className="space-y-3 rounded-2xl border border-slate-200 bg-superficie p-4">
      <p className="font-semibold text-slate-900">Confirme que é você</p>
      <p className="text-sm text-slate-600">
        {seis
          ? 'Digite os 6 primeiros números do seu CPF.'
          : 'Digite os 3 primeiros números do seu CPF e a sua data de nascimento.'}
      </p>
      <input
        inputMode="numeric" autoComplete="off" maxLength={seis ? 6 : 3} required
        value={doc} onChange={(e) => setDoc(e.target.value.replace(/\D/g, ''))}
        placeholder={seis ? '000000' : '000'}
        className="w-full rounded-xl border border-slate-300 px-3 py-3 text-lg tracking-widest"
      />
      {!seis && (
        <input
          type="date" required value={nasc} onChange={(e) => setNasc(e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-3 py-3"
        />
      )}
      <button
        disabled={enviando}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-acao px-4 py-3 font-semibold text-white hover:bg-acao-escura disabled:opacity-60"
      >
        {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar
      </button>
    </form>
  );
}

function Aviso({ icone, titulo, children }: { icone: 'ok' | 'alerta'; titulo: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border p-4 ${icone === 'ok' ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
      <p className="flex items-center gap-2 font-semibold text-slate-900">
        {icone === 'ok' ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <TriangleAlert className="h-5 w-5 text-amber-600" />}
        {titulo}
      </p>
      <div className="mt-2 text-sm text-slate-700">{children}</div>
    </div>
  );
}
