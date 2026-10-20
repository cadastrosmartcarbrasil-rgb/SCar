'use client';

import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, CheckCircle2, ChevronLeft, ChevronRight, FileUp, Loader2, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select, Textarea } from '@/components/ui/field';
import { comprimirImagem, validarArquivo } from '@/lib/imagem';
import {
  OPCOES, POSES_POR_PAPEL, POSE_CROQUI, ROTULO_SECAO, SECOES_POR_PAPEL, TEXTOS, ehTerceiro,
  pendenciasDaComunicacao, type DadosComunicacao, type PapelComunicacao, type PoseComunicacao,
} from '@/lib/comunicacao-evento';
import { cn } from '@/lib/utils';

export interface AnexoComunicacao { id: string; pose: string | null; nome_original: string | null }

export interface PrefillComunicacao {
  identificacao?: Record<string, string | null>;
  veiculo?: Record<string, string | null>;
}

/**
 * O formulario do envolvido (0129), em etapas. O MESMO componente serve a
 * pagina publica (/comunicar/<token>, no celular de quem viveu o evento) e a
 * equipe, que preenche por quem nao consegue mexer no celular (modo "equipe":
 * a declaracao de veracidade nao e marcada por ninguem — a versao sai com a
 * origem EQUIPE).
 */
export function FormularioComunicacao({
  papel, dados, onChange, prefill, anexos, onAnexar, onRemoverAnexo, onEnviar, enviando, modo,
}: {
  papel: PapelComunicacao;
  dados: DadosComunicacao;
  onChange: (d: DadosComunicacao) => void;
  prefill?: PrefillComunicacao | null;
  anexos: AnexoComunicacao[];
  onAnexar: (pose: PoseComunicacao, file: File) => Promise<void>;
  onRemoverAnexo?: (id: string) => Promise<void>;
  onEnviar: (declarou: boolean) => Promise<void>;
  enviando: boolean;
  modo: 'publico' | 'equipe';
}) {
  const secoes = SECOES_POR_PAPEL[papel];
  const [passo, setPasso] = useState(0);
  const [declarou, setDeclarou] = useState(false);
  const atual = secoes[passo];
  const terceiro = ehTerceiro(papel);
  const pendencias = useMemo(() => pendenciasDaComunicacao(papel, dados), [papel, dados]);

  const set = <K extends keyof DadosComunicacao>(k: K, v: Partial<NonNullable<DadosComunicacao[K]>>) =>
    onChange({ ...dados, [k]: { ...(dados[k] as object | undefined), ...v } });

  const id = dados.identificacao ?? {};
  const ev = dados.evento ?? {};
  const cd = dados.condutor ?? {};
  const vt = dados.veiculo_terceiro ?? {};
  const vi = dados.vitimas ?? {};

  return (
    <div className="space-y-4">
      {/* Etapas: no celular, so os numeros; quem esta preenchendo precisa ver que esta acabando. */}
      <ol className="flex flex-wrap gap-1.5">
        {secoes.map((s, i) => (
          <li key={s}>
            <button type="button" onClick={() => setPasso(i)}
              className={cn('rounded-full px-2.5 py-1 text-xs font-medium',
                i === passo ? 'bg-acao text-white' : i < passo ? 'bg-cyan-50 text-cyan-800' : 'bg-slate-100 text-slate-500')}>
              {i + 1}<span className="hidden sm:inline"> · {ROTULO_SECAO[s]}</span>
            </button>
          </li>
        ))}
      </ol>

      <h2 className="text-base font-semibold text-slate-800">{ROTULO_SECAO[atual]}</h2>

      {atual === 'identificacao' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Nome completo" className="sm:col-span-2">
            <Input value={id.nome ?? ''} onChange={(e) => set('identificacao', { nome: e.target.value })} />
          </FormField>
          <FormField label={terceiro ? 'CPF ou CNPJ' : 'CPF ou CNPJ (opcional)'}>
            <Input inputMode="numeric" value={id.cpf ?? ''} onChange={(e) => set('identificacao', { cpf: e.target.value })} />
          </FormField>
          <FormField label="Telefone / WhatsApp com DDD">
            <Input type="tel" inputMode="tel" value={id.telefone ?? ''} onChange={(e) => set('identificacao', { telefone: e.target.value })} />
          </FormField>
          <FormField label="E-mail (opcional)">
            <Input type="email" value={id.email ?? ''} onChange={(e) => set('identificacao', { email: e.target.value })} />
          </FormField>
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <FormField label="Cidade"><Input value={id.cidade ?? ''} onChange={(e) => set('identificacao', { cidade: e.target.value })} /></FormField>
            <FormField label="UF"><Input maxLength={2} value={id.uf ?? ''} onChange={(e) => set('identificacao', { uf: e.target.value })} /></FormField>
          </div>
        </div>
      )}

      {atual === 'veiculo' && (
        <div className="space-y-3">
          {prefill?.veiculo && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-mono font-semibold tracking-wider">{prefill.veiculo.placa}</p>
              <p>{[prefill.veiculo.marca, prefill.veiculo.modelo, prefill.veiculo.ano, prefill.veiculo.cor].filter(Boolean).join(' · ')}</p>
            </div>
          )}
          <FormField label="Quilometragem aproximada (hodometro)">
            <Input inputMode="numeric" value={dados.veiculo?.km ?? ''} onChange={(e) => set('veiculo', { km: e.target.value })} />
          </FormField>
          <p className="text-xs text-slate-500">A foto do painel vai na etapa de fotos.</p>
        </div>
      )}

      {atual === 'evento' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Data"><Input type="date" value={ev.data ?? ''} onChange={(e) => set('evento', { data: e.target.value })} /></FormField>
          <FormField label="Hora aproximada"><Input type="time" value={ev.hora ?? ''} onChange={(e) => set('evento', { hora: e.target.value })} /></FormField>
          <FormField label="Endereço do local (rua, número ou km)" className="sm:col-span-2">
            <Input value={ev.endereco ?? ''} onChange={(e) => set('evento', { endereco: e.target.value })} />
          </FormField>
          <FormField label="Ponto de referência"><Input value={ev.referencia ?? ''} onChange={(e) => set('evento', { referencia: e.target.value })} /></FormField>
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <FormField label="Cidade"><Input value={ev.cidade ?? ''} onChange={(e) => set('evento', { cidade: e.target.value })} /></FormField>
            <FormField label="UF"><Input maxLength={2} value={ev.uf ?? ''} onChange={(e) => set('evento', { uf: e.target.value })} /></FormField>
          </div>
          <Opcoes label="O que aconteceu" valor={ev.natureza} opcoes={OPCOES.natureza} onChange={(v) => set('evento', { natureza: v })} />
          <Opcoes label="Com o que colidiu" valor={ev.colidiu_com} opcoes={OPCOES.colidiu_com} onChange={(v) => set('evento', { colidiu_com: v })} />
          <Opcoes label="Tipo de via" valor={ev.via} opcoes={OPCOES.via} onChange={(v) => set('evento', { via: v })} />
          <div className="grid grid-cols-2 gap-2">
            <Opcoes label="Pista" valor={ev.pista} opcoes={OPCOES.pista} onChange={(v) => set('evento', { pista: v })} />
            <Opcoes label="Luz" valor={ev.luz} opcoes={OPCOES.luz} onChange={(v) => set('evento', { luz: v })} />
          </div>
          <FormField label="Sinalização no local (semáforo, placa...)"><Input value={ev.sinalizacao ?? ''} onChange={(e) => set('evento', { sinalizacao: e.target.value })} /></FormField>
          <FormField label="Velocidade aproximada (km/h)"><Input inputMode="numeric" value={ev.velocidade ?? ''} onChange={(e) => set('evento', { velocidade: e.target.value })} /></FormField>
          <FormField label="Conte o que aconteceu" className="sm:col-span-2">
            <p className="text-xs text-slate-500">{TEXTOS.relato}</p>
            <Textarea rows={6} value={ev.relato ?? ''} onChange={(e) => set('evento', { relato: e.target.value })} />
          </FormField>
          <FormField label="Boletim de ocorrência: número (se tiver)"><Input value={ev.bo_numero ?? ''} onChange={(e) => set('evento', { bo_numero: e.target.value })} /></FormField>
          <FormField label="Órgão / UF do boletim"><Input value={ev.bo_orgao ?? ''} onChange={(e) => set('evento', { bo_orgao: e.target.value })} /></FormField>
        </div>
      )}

      {atual === 'condutor' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!terceiro && (
            <SimNao label={papel === 'associado' ? 'Era você quem dirigia?' : 'Quem dirigia era o titular do veículo?'}
              valor={cd.e_titular} onChange={(v) => set('condutor', { e_titular: v })} />
          )}
          {(terceiro || cd.e_titular === false) && (
            <>
              <FormField label="Nome de quem dirigia"><Input value={cd.nome ?? ''} onChange={(e) => set('condutor', { nome: e.target.value })} /></FormField>
              <FormField label="CPF de quem dirigia"><Input inputMode="numeric" value={cd.cpf ?? ''} onChange={(e) => set('condutor', { cpf: e.target.value })} /></FormField>
            </>
          )}
          <SimNao label="Quem dirigia era habilitado?" valor={cd.habilitado} onChange={(v) => set('condutor', { habilitado: v })} />
          <FormField label="Número da CNH"><Input inputMode="numeric" value={cd.cnh_numero ?? ''} onChange={(e) => set('condutor', { cnh_numero: e.target.value })} /></FormField>
          <FormField label="Categoria"><Input maxLength={3} value={cd.cnh_categoria ?? ''} onChange={(e) => set('condutor', { cnh_categoria: e.target.value })} /></FormField>
          <FormField label="Validade da CNH"><Input type="date" value={cd.cnh_validade ?? ''} onChange={(e) => set('condutor', { cnh_validade: e.target.value })} /></FormField>
          {!terceiro && (
            <Opcoes label="Uso do veículo no momento" valor={cd.uso} opcoes={OPCOES.uso} onChange={(v) => set('condutor', { uso: v })} />
          )}
          <p className="text-xs text-slate-500 sm:col-span-2">A foto da CNH vai na etapa de fotos.</p>
        </div>
      )}

      {atual === 'veiculo_terceiro' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Placa"><Input value={vt.placa ?? ''} onChange={(e) => set('veiculo_terceiro', { placa: e.target.value })} /></FormField>
          <FormField label="Marca / modelo"><Input value={vt.marca_modelo ?? ''} onChange={(e) => set('veiculo_terceiro', { marca_modelo: e.target.value })} /></FormField>
          <FormField label="Cor"><Input value={vt.cor ?? ''} onChange={(e) => set('veiculo_terceiro', { cor: e.target.value })} /></FormField>
          <SimNao label="Seu veículo tem seguro ou proteção veicular?" valor={vt.tem_protecao} onChange={(v) => set('veiculo_terceiro', { tem_protecao: v })} />
          {vt.tem_protecao && (
            <>
              <FormField label="Qual empresa ou associação"><Input value={vt.empresa_protecao ?? ''} onChange={(e) => set('veiculo_terceiro', { empresa_protecao: e.target.value })} /></FormField>
              <FormField label="Número do contrato (se souber)"><Input value={vt.contrato_protecao ?? ''} onChange={(e) => set('veiculo_terceiro', { contrato_protecao: e.target.value })} /></FormField>
            </>
          )}
        </div>
      )}

      {atual === 'fotos' && (
        <ListaFotos poses={POSES_POR_PAPEL[papel]} anexos={anexos} onAnexar={onAnexar} onRemover={onRemoverAnexo} />
      )}

      {atual === 'vitimas' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SimNao label="Alguém se feriu?" valor={vi.houve} onChange={(v) => set('vitimas', { houve: v })} />
          {vi.houve && papel !== 'passageiro_vitima' && (
            <>
              <FormField label="Quantas pessoas"><Input inputMode="numeric" value={vi.quantidade ?? ''} onChange={(e) => set('vitimas', { quantidade: e.target.value })} /></FormField>
              <FormField label="Socorro prestado (SAMU, bombeiros...)"><Input value={vi.socorro ?? ''} onChange={(e) => set('vitimas', { socorro: e.target.value })} /></FormField>
            </>
          )}
          <p className="text-xs text-slate-500 sm:col-span-2">Não precisa contar detalhes de saúde aqui. Se for preciso, a equipe liga para você.</p>
        </div>
      )}

      {atual === 'final' && (
        <div className="space-y-4">
          {papel !== 'testemunha' && papel !== 'passageiro_vitima' && papel !== 'terceiro_proprietario' && (
            <ListaFotos poses={[POSE_CROQUI]} anexos={anexos} onAnexar={onAnexar} onRemover={onRemoverAnexo} />
          )}
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-1" checked={dados.contato_whatsapp ?? false}
              onChange={(e) => onChange({ ...dados, contato_whatsapp: e.target.checked })} />
            Posso ser contatado(a) pelo WhatsApp
          </label>
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            {terceiro || papel === 'testemunha' || papel === 'passageiro_vitima' ? TEXTOS.naoReconheceTerceiro : TEXTOS.naoReconhece}
          </p>
          {pendencias.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Falta preencher: {pendencias.join(', ')}.
            </div>
          )}
          {modo === 'publico' ? (
            <label className="flex items-start gap-2 text-sm font-medium text-slate-800">
              <input type="checkbox" className="mt-1" checked={declarou} onChange={(e) => setDeclarou(e.target.checked)} />
              {TEXTOS.declaracao}
            </label>
          ) : (
            <p className="text-sm text-slate-600">{TEXTOS.equipe}</p>
          )}
          <Button className="w-full sm:w-auto" disabled={enviando || pendencias.length > 0 || (modo === 'publico' && !declarou)}
            onClick={() => onEnviar(modo === 'publico' ? declarou : false)}>
            {enviando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
            {modo === 'publico' ? 'Enviar comunicação' : 'Registrar comunicação'}
          </Button>
        </div>
      )}

      <div className="flex justify-between border-t border-slate-200 pt-3">
        <Button variant="secondary" disabled={passo === 0} onClick={() => setPasso((p) => p - 1)}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
        </Button>
        {passo < secoes.length - 1 && (
          <Button onClick={() => setPasso((p) => p + 1)}>Próximo <ChevronRight className="ml-1 h-4 w-4" /></Button>
        )}
      </div>
    </div>
  );
}

function Opcoes({ label, valor, opcoes, onChange }: {
  label: string; valor?: string; opcoes: readonly string[]; onChange: (v: string) => void;
}) {
  return (
    <FormField label={label}>
      <Select value={valor ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione...</option>
        {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
      </Select>
    </FormField>
  );
}

function SimNao({ label, valor, onChange }: { label: string; valor?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div>
      <p className="text-[13px] font-medium text-slate-600">{label}</p>
      <div className="mt-1 flex gap-2">
        {[true, false].map((v) => (
          <button key={String(v)} type="button" onClick={() => onChange(v)}
            className={cn('rounded-lg border px-4 py-2 text-sm', valor === v ? 'border-cyan-500 bg-cyan-50 text-cyan-800' : 'border-slate-300 text-slate-600')}>
            {v ? 'Sim' : 'Nao'}
          </button>
        ))}
      </div>
    </div>
  );
}

function ListaFotos({ poses, anexos, onAnexar, onRemover }: {
  poses: PoseComunicacao[]; anexos: AnexoComunicacao[];
  onAnexar: (pose: PoseComunicacao, file: File) => Promise<void>;
  onRemover?: (id: string) => Promise<void>;
}) {
  if (!poses.length) return <p className="text-sm text-slate-500">Não há fotos para enviar nesta etapa.</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">As fotos não são obrigatórias, mas ajudam muito a análise. Envie as que puder.</p>
      {poses.map((p) => (
        <ItemFoto key={p.codigo} pose={p} enviados={anexos.filter((a) => a.pose === p.codigo)} onAnexar={onAnexar} onRemover={onRemover} />
      ))}
    </div>
  );
}

function ItemFoto({ pose, enviados, onAnexar, onRemover }: {
  pose: PoseComunicacao; enviados: AnexoComunicacao[];
  onAnexar: (pose: PoseComunicacao, file: File) => Promise<void>;
  onRemover?: (id: string) => Promise<void>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  async function escolher(bruto: File | undefined) {
    if (!bruto) return;
    const recusa = validarArquivo(bruto, { aceitaPdf: true });
    if (recusa) { toast.error(recusa); return; }
    setEnviando(true);
    try {
      const file = await comprimirImagem(bruto);
      await onAnexar(pose, file);
      toast.success('Recebido!');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={cn('rounded-xl border p-3', enviados.length ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1 text-sm font-medium text-slate-800">
            {enviados.length > 0 && <CheckCircle2 className="h-4 w-4 text-emerald-600" />} {pose.nome}
          </p>
          <p className="text-xs text-slate-500">{pose.instrucao}</p>
        </div>
        <Button variant="secondary" disabled={enviando} onClick={() => ref.current?.click()}>
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : pose.documento ? <FileUp className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
          <span className="ml-1">{enviados.length ? 'Enviar outra' : 'Enviar'}</span>
        </Button>
      </div>
      {enviados.length > 0 && (
        <ul className="mt-2 space-y-1">
          {enviados.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-xs text-slate-600">
              <span className="truncate">{a.nome_original ?? 'arquivo'}</span>
              {onRemover && (
                <button type="button" onClick={() => onRemover(a.id)} className="text-rose-600" aria-label="Remover">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <input ref={ref} type="file" className="hidden"
        accept={pose.documento ? 'image/*,application/pdf' : 'image/*'}
        {...(pose.documento ? {} : { capture: 'environment' as const })}
        onChange={(e) => { void escolher(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}
