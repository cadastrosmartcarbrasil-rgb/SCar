'use client';

import { useEffect, useState } from 'react';
import { BellRing, CheckCircle2, FileText, KeyRound, Landmark, Receipt, Search, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';

interface Situacao {
  configurado: boolean;
  ambiente: 'sandbox' | 'producao' | null;
  faltando: string[];
  webhook_segredo?: boolean;
}

/**
 * Bancada do Sicredi: confere se as SICREDI_* chegaram no contêiner e exercita
 * a API (token, boleto de teste no sandbox, consulta, liquidados, PDF). Nada
 * aqui grava em titulos_financeiros.
 */
export function BancadaSicredi() {
  const [sit, setSit] = useState<Situacao | null>(null);
  const [erroSit, setErroSit] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [saida, setSaida] = useState<{ ok: boolean; texto: string } | null>(null);
  const [nossoNumero, setNossoNumero] = useState('');
  const [linha, setLinha] = useState('');
  const [dia, setDia] = useState(new Date().toISOString().slice(0, 10));
  const [tituloId, setTituloId] = useState('');
  const [diaBaixa, setDiaBaixa] = useState('');
  const [whResp, setWhResp] = useState('');
  const [whEmail, setWhEmail] = useState('');
  const [whTel, setWhTel] = useState('');

  // Baixa dos pagos (0105): sem dia = ontem e hoje, como o agendador faz.
  async function darBaixa() {
    setOcupado('baixa');
    setSaida(null);
    try {
      const r = await fetch('/api/v1/cobrancas/baixa-banco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(diaBaixa ? { dia: diaBaixa } : {}),
      });
      const j = await r.json();
      if (!r.ok && !j.resumo) throw new Error(j.error ?? `HTTP ${r.status}`);
      setSaida({ ok: !!j.ok, texto: JSON.stringify(j, null, 2) });
    } catch (e) {
      setSaida({ ok: false, texto: (e as Error).message });
    } finally {
      setOcupado(null);
    }
  }

  // Emite UM titulo pelo caminho real (a remessa), sem levar a fila inteira:
  // com `titulo_ids` a rota nao consulta `titulos_para_remessa`.
  async function emitirTitulo() {
    setOcupado('remessa');
    setSaida(null);
    try {
      const r = await fetch('/api/v1/cobrancas/remessa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo_ids: [tituloId.trim()] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setSaida({ ok: true, texto: JSON.stringify(j, null, 2) });
    } catch (e) {
      setSaida({ ok: false, texto: (e as Error).message });
    } finally {
      setOcupado(null);
    }
  }

  useEffect(() => {
    fetch('/api/v1/sicredi')
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setSit(j);
      })
      .catch((e) => setErroSit((e as Error).message));
  }, []);

  async function chamar(action: string, extra: Record<string, unknown> = {}) {
    setOcupado(action);
    setSaida(null);
    try {
      const r = await fetch('/api/v1/sicredi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      if (action === 'pdf' && r.ok) {
        window.open(URL.createObjectURL(await r.blob()), '_blank');
        setSaida({ ok: true, texto: 'PDF aberto em outra aba.' });
        return;
      }
      const j = await r.json();
      if (r.status === 409 && j.contrato_de_terceiro && !extra.substituir) {
        const ok = window.confirm(
          `${j.error}\n\nSo confirme no dia do corte, quando o boleto deixar de sair por ${j.destino}. ` +
            'Substituir agora mesmo assim?',
        );
        if (ok) {
          setOcupado(null);
          return chamar(action, { ...extra, substituir: true });
        }
      }
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      const emitido = j.emitido as { nosso_numero?: string; linha_digitavel?: string } | undefined;
      if (emitido?.nosso_numero) setNossoNumero(emitido.nosso_numero);
      if (emitido?.linha_digitavel) setLinha(emitido.linha_digitavel);
      setSaida({ ok: true, texto: JSON.stringify(j, null, 2) });
    } catch (e) {
      setSaida({ ok: false, texto: (e as Error).message });
    } finally {
      setOcupado(null);
    }
  }

  const pronto = !!sit?.configurado;

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-superficie p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-slate-800">
          <Landmark className="h-4 w-4 text-brand-500" /> Sicredi — API Cobranca
        </h3>
        {sit && (
          <span
            className={`rounded px-2 py-0.5 text-xs ${
              !pronto
                ? 'bg-amber-50 text-amber-700'
                : sit.ambiente === 'producao'
                  ? 'bg-rose-50 text-rose-700'
                  : 'bg-sky-50 text-sky-700'
            }`}
          >
            {!pronto ? 'nao configurado' : sit.ambiente === 'producao' ? 'PRODUCAO' : 'sandbox'}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500">
        As credenciais ficam nas variaveis SICREDI_* do servidor (.env do VPS + docker-compose), nunca nesta tela.
        Os testes abaixo nao geram titulo no sistema.
      </p>

      {erroSit && <p className="text-sm text-rose-600">{erroSit}</p>}
      {sit && !pronto && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Faltam no servidor: <span className="font-mono">{sit.faltando.join(', ')}</span>
        </div>
      )}

      {pronto && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => chamar('autenticar')} disabled={!!ocupado}>
              <KeyRound className="h-4 w-4" /> {ocupado === 'autenticar' ? 'Testando...' : 'Testar autenticacao'}
            </Button>
            {sit.ambiente === 'sandbox' && (
              <Button type="button" variant="secondary" onClick={() => chamar('boleto_teste')} disabled={!!ocupado}>
                <Receipt className="h-4 w-4" /> {ocupado === 'boleto_teste' ? 'Registrando...' : 'Registrar boleto de teste'}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex gap-2">
              <Input placeholder="Nosso numero" value={nossoNumero} onChange={(e) => setNossoNumero(e.target.value)} />
              <Button type="button" variant="secondary" disabled={!nossoNumero || !!ocupado} onClick={() => chamar('consultar', { nosso_numero: nossoNumero })} title="Consultar">
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Input placeholder="Linha digitavel" value={linha} onChange={(e) => setLinha(e.target.value)} />
              <Button type="button" variant="secondary" disabled={!linha || !!ocupado} onClick={() => chamar('pdf', { linha_digitavel: linha })} title="PDF">
                <FileText className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Input type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
              <Button type="button" variant="secondary" disabled={!!ocupado} onClick={() => chamar('liquidados', { dia })}>
                Pagos no dia
              </Button>
            </div>
          </div>
          <div className="space-y-1 border-t border-slate-200 pt-3">
            <p className="text-xs text-slate-500">
              Baixa dos pagos: le os boletos pagos no Sicredi e da baixa nos titulos do SCar (o agendador do servidor
              faz o mesmo sozinho). Sem data: ontem e hoje. Pagamento que nao casa com titulo fica registrado como
              &quot;nao encontrado&quot;.
            </p>
            <div className="flex gap-2">
              <Input type="date" value={diaBaixa} onChange={(e) => setDiaBaixa(e.target.value)} />
              <Button type="button" variant="secondary" disabled={!!ocupado} onClick={darBaixa}>
                <CheckCircle2 className="h-4 w-4" /> {ocupado === 'baixa' ? 'Dando baixa...' : 'Dar baixa agora'}
              </Button>
            </div>
          </div>
          <div className="space-y-2 border-t border-slate-200 pt-3">
            <p className="flex items-center gap-1 text-xs font-semibold text-slate-700">
              <BellRing className="h-3.5 w-3.5" /> Webhook de liquidacao
            </p>
            <p className="text-xs text-slate-500">
              Cadastra no Sicredi o aviso de pagamento: a cada boleto pago o banco chama este sistema, que confere o
              pagamento e da a baixa na hora. O agendador continua rodando como rede de seguranca. O endereco usa o
              segredo SICREDI_WEBHOOK_SECRET do servidor (aparece mascarado).
            </p>
            {sit.webhook_segredo === false && (
              <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                Falta SICREDI_WEBHOOK_SECRET no servidor — sem ela nao da para registrar o webhook.
              </p>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Input placeholder="Responsavel" value={whResp} onChange={(e) => setWhResp(e.target.value)} />
              <Input type="email" placeholder="E-mail do responsavel" value={whEmail} onChange={(e) => setWhEmail(e.target.value)} />
              <Input placeholder="Telefone (opcional)" value={whTel} onChange={(e) => setWhTel(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" disabled={!!ocupado} onClick={() => chamar('webhook_consultar')}>
                <Search className="h-4 w-4" /> {ocupado === 'webhook_consultar' ? 'Consultando...' : 'Consultar contrato'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!!ocupado || !whResp.trim() || !whEmail.trim() || sit.webhook_segredo === false}
                onClick={() => chamar('webhook_registrar', { responsavel: whResp, email: whEmail, telefone: whTel })}
              >
                <BellRing className="h-4 w-4" /> {ocupado === 'webhook_registrar' ? 'Registrando...' : 'Registrar webhook'}
              </Button>
            </div>
          </div>
          <div className="space-y-1 border-t border-slate-200 pt-3">
            <p className="text-xs text-slate-500">
              Emitir UM titulo pela remessa (o caminho real: cria a remessa, chama o Sicredi e grava linha
              digitavel/PIX no titulo). So este titulo vai; a fila do mes nao e tocada.
            </p>
            <div className="flex gap-2">
              <Input placeholder="ID do titulo (uuid)" value={tituloId} onChange={(e) => setTituloId(e.target.value)} caixa="original" />
              <Button type="button" variant="secondary" disabled={!/^[0-9a-f-]{36}$/i.test(tituloId.trim()) || !!ocupado} onClick={emitirTitulo}>
                <Receipt className="h-4 w-4" /> {ocupado === 'remessa' ? 'Emitindo...' : 'Emitir titulo'}
              </Button>
            </div>
          </div>
        </>
      )}

      {saida && (
        <div className={`rounded border p-3 text-xs ${saida.ok ? 'border-emerald-200' : 'border-rose-200'}`}>
          <p className={`mb-1 flex items-center gap-1 font-semibold ${saida.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
            {saida.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            {saida.ok ? 'Resposta' : 'Erro'}
          </p>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-slate-600">{saida.texto}</pre>
        </div>
      )}
    </div>
  );
}
