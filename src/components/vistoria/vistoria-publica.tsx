'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Camera, CheckCircle2, Clock, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { CabecalhoMarca, RodapeMarca } from '@/components/hotlink/marca';
import { comprimirImagem, validarArquivo } from '@/lib/imagem';
import { progressoVistoria, proximaPose } from '@/lib/vistoria';
import { formatDate } from '@/lib/utils';
import type { FotoVistoriaModelo } from '@/lib/database.types';

/**
 * A vistoria feita pelo CLIENTE, no celular dele, sem login.
 *
 * A tela e a MESMA ideia do `<FotosVistoria>` do vendedor — as poses vem do
 * catalogo (`vistoria_fotos_modelo`), cada uma com a instrucao de
 * enquadramento — mas escrita para quem nunca viu o sistema: uma pose por vez,
 * sem jargao, sem menu, e o botao abre a camera traseira direto.
 *
 * O que ela NAO faz, de proposito: apagar foto. O cliente que errou manda de
 * novo — `fotos_vistoria_lead` fica com a mais recente de cada pose. Dar botao
 * de excluir a quem nao vai auditar so cria o caso de a vistoria voltar a
 * zero na vespera da entrada na base.
 */
const MOTIVOS: Record<string, { titulo: string; texto: string }> = {
  LINK_INVALIDO: {
    titulo: 'Link nao encontrado',
    texto: 'Confira se o endereco veio completo na mensagem. Se continuar assim, fale com o seu consultor.',
  },
  LINK_EXPIRADO: {
    titulo: 'Este link expirou',
    texto: 'Por seguranca o link vale por alguns dias. Peca um novo ao seu consultor — leva um minuto.',
  },
  ATENDIMENTO_ENCERRADO: {
    titulo: 'Vistoria ja concluida',
    texto: 'Este atendimento foi finalizado. Se precisar enviar fotos novas, fale com o seu consultor.',
  },
};

export function VistoriaPublica({
  token, valida, motivo, nome, veiculo, expiraEm, posesIniciais,
}: {
  token: string;
  valida: boolean;
  motivo: string;
  nome: string | null;
  veiculo: { placa: string | null; marca: string | null; modelo: string | null };
  expiraEm: string | null;
  posesIniciais: FotoVistoriaModelo[];
}) {
  const [poses, setPoses] = useState<FotoVistoriaModelo[]>(posesIniciais);
  const [enviando, setEnviando] = useState<string | null>(null);

  const progresso = progressoVistoria(poses);
  const proxima = proximaPose(poses);
  const completa = progresso.completa;

  async function enviar(codigo: string, bruto: File | null) {
    if (!bruto) return;
    const recusa = validarArquivo(bruto);
    if (recusa) return toast.error(recusa);

    setEnviando(codigo);
    try {
      // Reduz no navegador ANTES de subir: no 4G da rua, foto de 8 MB e a
      // diferenca entre enviar e desistir. Mesma regra do resto do sistema.
      const file = await comprimirImagem(bruto);
      const form = new FormData();
      form.append('token', token);
      form.append('tipo', codigo);
      form.append('file', file);

      const res = await fetch('/api/v1/vistoria/foto', { method: 'POST', body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Nao consegui enviar a foto');

      setPoses(body.poses ?? []);
      toast.success('Foto recebida!');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(null);
    }
  }

  if (!valida) {
    const m = MOTIVOS[motivo] ?? MOTIVOS.LINK_INVALIDO;
    return (
      <Pagina>
        <div className="rounded-2xl bg-superficie p-6 text-center shadow-sm">
          <TriangleAlert className="mx-auto h-12 w-12 text-amber-500" />
          <h2 className="mt-3 text-lg font-semibold text-slate-800">{m.titulo}</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{m.texto}</p>
        </div>
      </Pagina>
    );
  }

  return (
    <Pagina>
      <div className="rounded-2xl bg-superficie p-5 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-800">
          {nome ? `${nome.split(' ')[0]}, ` : ''}vamos fotografar o seu carro
        </h1>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          Sao {progresso.obrigatorias} fotos obrigatorias. Siga a dica de cada uma — leva uns 3 minutos, e e o
          ultimo passo para a sua protecao comecar.
        </p>

        {(veiculo.placa || veiculo.modelo) && (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600">
            <span className="font-mono font-semibold tracking-wider">{veiculo.placa}</span>
            {veiculo.modelo && <> · {veiculo.marca} {veiculo.modelo}</>}
          </p>
        )}

        {/* Progresso: o cliente precisa ver que esta acabando. */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-[12px] font-medium">
            <span className={completa ? 'text-emerald-600' : 'text-slate-600'}>
              {completa ? 'Tudo pronto!' : `${progresso.obrigatoriasFeitas} de ${progresso.obrigatorias}`}
            </span>
            {expiraEm && !completa && (
              <span className="flex items-center gap-1 text-[11.5px] text-slate-400">
                <Clock className="h-3 w-3" /> ate {formatDate(expiraEm)}
              </span>
            )}
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${completa ? 'bg-emerald-500' : 'bg-cyan-500'}`}
              style={{ width: `${progresso.percentual}%` }}
            />
          </div>
        </div>

        {completa && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-emerald-800">
            <CheckCircle2 className="mt-px h-4 w-4 shrink-0" />
            <span>
              Recebemos todas as fotos. Nossa equipe vai conferir e o seu consultor entra em
              contato. <b>Nao precisa fazer mais nada.</b>
            </span>
          </p>
        )}
        {!completa && proxima && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-cyan-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-cyan-900">
            <Camera className="mt-px h-4 w-4 shrink-0" />
            <span>Agora a foto <b>{proxima.nome.toLowerCase()}</b>.</span>
          </p>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {poses.map((p) => (
          <label
            key={p.codigo}
            className={`flex items-center gap-3 rounded-2xl border p-3.5 transition ${
              p.enviada
                ? 'border-emerald-200 bg-emerald-50/60'
                : 'border-slate-200 bg-superficie active:bg-slate-50'
            }`}
          >
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                p.enviada ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {enviando === p.codigo
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : p.enviada ? <CheckCircle2 className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-slate-800">
                {p.nome}
                {!p.obrigatorio && <span className="ml-1 text-[11px] font-normal text-slate-400">(opcional)</span>}
              </span>
              {p.instrucao && (
                <span className="mt-0.5 block text-[12px] leading-snug text-slate-500">{p.instrucao}</span>
              )}
              {p.enviada && (
                <span className="mt-0.5 block text-[11.5px] font-medium text-emerald-700">
                  Recebida · toque para trocar
                </span>
              )}
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={enviando !== null}
              onChange={(e) => {
                enviar(p.codigo, e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
          </label>
        ))}
      </div>

      <p className="mt-4 flex items-start gap-1.5 px-1 text-[11.5px] leading-relaxed text-slate-400">
        <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
        As fotos vao direto para a sua proposta e sao usadas so na analise do seu veiculo.
      </p>
    </Pagina>
  );
}

function Pagina({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-fundo">
      <CabecalhoMarca subtitulo="Vistoria do veiculo" />
      <main className="mx-auto w-full max-w-lg px-4 pb-10">{children}</main>
      <RodapeMarca />
    </div>
  );
}
