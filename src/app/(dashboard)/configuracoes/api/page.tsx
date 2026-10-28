'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, KeyRound, Plus, Pencil, RefreshCw, Ban, History, FileJson, AlertTriangle, BookOpen, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Textarea } from '@/components/ui/field';
import { SeletorFornecedor } from '@/components/fornecedores/seletor-fornecedor';
import { useRegionais } from '@/hooks/use-config';
import {
  useApiIntegracoes, useApiRequisicoes, useAtualizarApiIntegracao, useCriarApiIntegracao,
  useGirarChaveApi, useRevogarApiIntegracao, type DadosIntegracao,
} from '@/hooks/use-api-integracoes';
import {
  ESCOPOS_API, ESCOPOS_RASTREADORA, SITUACOES_RASTREAMENTO, chaveMascarada, lerListaIps,
  rotuloEscopo, situacaoChave,
} from '@/lib/api-externa';
import { cn, formatDateTime } from '@/lib/utils';
import type { ApiIntegracaoLista } from '@/lib/database.types';

// Configuracoes -> API e Integracoes (0151). So o admin (a aba nao entra na
// grade de permissoes). Cada sistema externo ganha a sua chave, com escopos,
// unidades, IPs e validade; a chave aparece UMA vez.

type Form = {
  id?: string;
  nome: string;
  descricao: string;
  fornecedor_id: string | null;
  escopos: string[];
  todasUnidades: boolean;
  regional_ids: string[];
  ips: string;
  expira_em: string;
  ativo: boolean;
};

const VAZIO: Form = {
  nome: '', descricao: '', fornecedor_id: null, escopos: [...ESCOPOS_RASTREADORA],
  todasUnidades: true, regional_ids: [], ips: '', expira_em: '', ativo: true,
};

const COR_SITUACAO: Record<string, string> = {
  ATIVA: 'bg-emerald-100 text-emerald-800',
  PAUSADA: 'bg-amber-100 text-amber-800',
  VENCIDA: 'bg-rose-100 text-rose-800',
  REVOGADA: 'bg-slate-200 text-slate-600',
};

export default function ApiIntegracoesPage() {
  const { data: lista, isLoading, error } = useApiIntegracoes();
  const { data: regionais } = useRegionais();
  const criar = useCriarApiIntegracao();
  const atualizar = useAtualizarApiIntegracao();
  const girar = useGirarChaveApi();
  const revogar = useRevogarApiIntegracao();

  const [form, setForm] = useState<Form | null>(null);
  const [chaveNova, setChaveNova] = useState<{ nome: string; chave: string } | null>(null);
  const [revogando, setRevogando] = useState<ApiIntegracaoLista | null>(null);
  const [motivo, setMotivo] = useState('');
  const [trilha, setTrilha] = useState<ApiIntegracaoLista | null>(null);
  const [origem, setOrigem] = useState('');
  useEffect(() => { setOrigem(window.location.origin); }, []);

  const nomeUnidade = (id: string) => regionais?.find((r) => r.id === id)?.nome ?? id.slice(0, 8);

  function editar(i: ApiIntegracaoLista) {
    setForm({
      id: i.id, nome: i.nome, descricao: i.descricao ?? '', fornecedor_id: i.fornecedor_id,
      escopos: i.escopos, todasUnidades: !i.regional_ids?.length, regional_ids: i.regional_ids ?? [],
      ips: (i.ips_permitidos ?? []).join('\n'), expira_em: i.expira_em ? i.expira_em.slice(0, 10) : '',
      ativo: i.ativo,
    });
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (form.nome.trim().length < 2) return toast.error('Informe o nome da integração');
    if (form.escopos.length === 0) return toast.error('Escolha ao menos um escopo');
    if (!form.todasUnidades && form.regional_ids.length === 0) return toast.error('Escolha as unidades (ou marque todas)');
    const { ips, invalidos } = lerListaIps(form.ips);
    if (invalidos.length) return toast.error(`Não é IP: ${invalidos.join(', ')}`);
    const dados: DadosIntegracao = {
      nome: form.nome, descricao: form.descricao || null, fornecedor_id: form.fornecedor_id,
      escopos: form.escopos, regional_ids: form.todasUnidades ? null : form.regional_ids,
      ips: ips.length ? ips : null,
      expira_em: form.expira_em ? new Date(`${form.expira_em}T23:59:59-03:00`).toISOString() : null,
    };
    if (form.id) {
      atualizar.mutate({ ...dados, id: form.id, ativo: form.ativo }, {
        onSuccess: () => { toast.success('Integração salva'); setForm(null); },
        onError: (err) => toast.error((err as Error).message),
      });
    } else {
      criar.mutate(dados, {
        onSuccess: (r) => { setForm(null); setChaveNova({ nome: form.nome.toUpperCase(), chave: r.chave }); },
        onError: (err) => toast.error((err as Error).message),
      });
    }
  }

  function gerarNova(i: ApiIntegracaoLista) {
    if (!confirm(`Gerar chave nova para ${i.nome}? A chave atual para de funcionar NA HORA — o sistema dela precisa receber a nova.`)) return;
    girar.mutate(i.id, {
      onSuccess: (r) => setChaveNova({ nome: i.nome, chave: r.chave }),
      onError: (err) => toast.error((err as Error).message),
    });
  }

  function confirmarRevogacao() {
    if (!revogando) return;
    revogar.mutate({ id: revogando.id, motivo }, {
      onSuccess: () => { toast.success('Chave revogada'); setRevogando(null); setMotivo(''); },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  function copiar(texto: string) {
    navigator.clipboard.writeText(texto).then(() => toast.success('Copiado'));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-slate-500">
          Chaves para outros sistemas consultarem o SCar — a primeira é a da plataforma de rastreamento, que cruza
          os veículos (placa, chassi, situação, associado) e devolve a última comunicação de cada equipamento.
          Cada sistema tem a sua chave: revogar uma não afeta as outras.
        </p>
        <div className="flex gap-2">
          <a href="/api/externa/v1/docs" target="_blank" rel="noreferrer">
            <Button variant="secondary"><BookOpen className="h-4 w-4" /> Documentação da API</Button>
          </a>
          <Button variant="secondary" onClick={() => copiar(`${origem}/api/externa/v1/docs`)}>
            <Link2 className="h-4 w-4" /> Copiar link para o parceiro
          </Button>
          <a href="/api/externa/v1/openapi.json" target="_blank" rel="noreferrer" title="Especificação OpenAPI 3 (para Swagger)">
            <Button variant="secondary"><FileJson className="h-4 w-4" /> OpenAPI</Button>
          </a>
          <Button onClick={() => setForm({ ...VAZIO })}><Plus className="h-4 w-4" /> Nova integração</Button>
        </div>
      </div>

      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">Não foi possível ler as integrações: {(error as Error).message}</p>}
      {isLoading && <p className="text-sm text-slate-500">Carregando…</p>}
      {!isLoading && !error && (lista ?? []).length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          Nenhuma integração ainda. Crie a da rastreadora em <b>Nova integração</b> e envie a chave e o link da
          documentação ao fornecedor.
        </div>
      )}

      <div className="space-y-3">
        {(lista ?? []).map((i) => {
          const sit = situacaoChave(i);
          return (
            <div key={i.id} className="rounded-2xl border border-slate-200 bg-superficie p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <KeyRound className="h-4 w-4 text-cyan-600" />
                    <span className="font-semibold text-slate-800">{i.nome}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', COR_SITUACAO[sit])}>{sit}</span>
                    {i.fornecedor_nome && <span className="text-xs text-slate-500">· {i.fornecedor_nome}</span>}
                  </div>
                  {i.descricao && <p className="mt-1 text-sm text-slate-500">{i.descricao}</p>}
                  <p className="mt-1 font-mono text-xs text-slate-500">{chaveMascarada(i.chave_prefixo)}</p>
                </div>
                {sit !== 'REVOGADA' && (
                  <div className="flex flex-wrap gap-1">
                    <Button variant="ghost" onClick={() => setTrilha(i)} title="Requisições"><History className="h-4 w-4" /></Button>
                    <Button variant="ghost" onClick={() => editar(i)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" onClick={() => gerarNova(i)} title="Gerar chave nova"><RefreshCw className="h-4 w-4" /></Button>
                    <Button variant="ghost" onClick={() => setRevogando(i)} title="Revogar"><Ban className="h-4 w-4 text-rose-600" /></Button>
                  </div>
                )}
                {sit === 'REVOGADA' && (
                  <Button variant="ghost" onClick={() => setTrilha(i)} title="Requisições"><History className="h-4 w-4" /></Button>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {i.escopos.map((e) => (
                  <span key={e} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{rotuloEscopo(e)}</span>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-1 text-xs text-slate-500 sm:grid-cols-2 lg:grid-cols-4">
                <span>Unidades: {i.regional_ids?.length ? i.regional_ids.map(nomeUnidade).join(', ') : 'todas'}</span>
                <span>IPs: {i.ips_permitidos?.length ? i.ips_permitidos.join(', ') : 'qualquer'}</span>
                <span>Último uso: {i.ultimo_uso_em ? `${formatDateTime(i.ultimo_uso_em)} (${i.ultimo_ip ?? '?'})` : 'nunca'}</span>
                <span>
                  24 h: {i.requisicoes_24h} requisição(ões)
                  {i.erros_24h > 0 && <b className="text-rose-600"> · {i.erros_24h} com erro</b>}
                </span>
                {i.expira_em && <span>Vale até {formatDateTime(i.expira_em)}</span>}
                {i.revogada_em && <span>Revogada em {formatDateTime(i.revogada_em)}: {i.revogacao_motivo}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <details className="rounded-2xl border border-slate-200 bg-superficie p-4 text-sm">
        <summary className="cursor-pointer font-medium text-slate-700">Como o sistema parceiro usa a API</summary>
        <div className="mt-3 space-y-3 text-slate-600">
          <p>Endereço base: <code className="codigo">{origem}/api/externa/v1</code> — envie também o link da documentação completa: <code className="codigo">{origem}/api/externa/v1/docs</code> (endpoints, exemplos, erros, coleção Postman).</p>
          <pre className="overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs">{`# conferir a chave
curl -H "Authorization: Bearer <chave>" ${origem}/api/externa/v1/status

# todos os veículos (páginas de até 500; repita com ?cursor=<proximo_cursor>)
curl -H "Authorization: Bearer <chave>" "${origem}/api/externa/v1/veiculos?limite=500"

# só o que mudou desde a última sincronia
curl -H "Authorization: Bearer <chave>" "${origem}/api/externa/v1/veiculos?atualizados_desde=2026-10-25T00:00:00Z"

# um veículo por placa ou chassi
curl -H "Authorization: Bearer <chave>" ${origem}/api/externa/v1/veiculos/ABC1D23

# a plataforma devolve a última comunicação (até 500 por chamada)
curl -X POST -H "Authorization: Bearer <chave>" -H "Content-Type: application/json" \\
  -d '{"comunicacoes":[{"imei":"860000000000001","comunicado_em":"2026-10-25T10:00:00-03:00","latitude":-15.6,"longitude":-56.1}]}' \\
  ${origem}/api/externa/v1/rastreadores/comunicacao`}</pre>
          <ul className="space-y-1">
            {Object.entries(SITUACOES_RASTREAMENTO).map(([k, v]) => (
              <li key={k}><b>{k}</b> — {v}</li>
            ))}
          </ul>
        </div>
      </details>

      {/* ------------------------------------------------ cadastro/edicao */}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Editar integração' : 'Nova integração'} tamanho="lg">
        {form && (
          <form onSubmit={salvar} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Nome do sistema *">
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="EX.: PLATAFORMA DE RASTREAMENTO" />
              </FormField>
              <FormField label="Rastreadora (fornecedor), se for o caso">
                <SeletorFornecedor
                  value={form.fornecedor_id}
                  onChange={(id) => setForm({ ...form, fornecedor_id: id || null })}
                  permiteCadastrar={false}
                />
              </FormField>
            </div>
            <p className="-mt-2 text-xs text-slate-500">
              Ligada a uma rastreadora, a chave só vê e só atualiza os equipamentos DELA no parque.
            </p>
            <FormField label="Descrição">
              <Textarea rows={2} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </FormField>

            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">O que a chave pode fazer *</p>
              <div className="space-y-2">
                {ESCOPOS_API.map((e) => (
                  <label key={e.chave} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={form.escopos.includes(e.chave)}
                      onChange={(ev) => setForm({
                        ...form,
                        escopos: ev.target.checked ? [...form.escopos, e.chave] : form.escopos.filter((x) => x !== e.chave),
                      })}
                    />
                    <span><b className="text-slate-700">{e.rotulo}</b> <span className="text-slate-500">— {e.detalhe}</span></span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={form.todasUnidades} onChange={(e) => setForm({ ...form, todasUnidades: e.target.checked })} />
                Todas as unidades
              </label>
              {!form.todasUnidades && (
                <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {(regionais ?? []).map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.regional_ids.includes(r.id)}
                        onChange={(e) => setForm({
                          ...form,
                          regional_ids: e.target.checked ? [...form.regional_ids, r.id] : form.regional_ids.filter((x) => x !== r.id),
                        })}
                      />
                      {r.nome}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="IPs permitidos (um por linha; vazio = qualquer)">
                <Textarea rows={3} value={form.ips} onChange={(e) => setForm({ ...form, ips: e.target.value })} placeholder="200.150.10.20" />
              </FormField>
              <FormField label="Vale até (vazio = sem prazo)">
                <Input type="date" value={form.expira_em} onChange={(e) => setForm({ ...form, expira_em: e.target.value })} />
              </FormField>
            </div>

            {form.id && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
                Chave ativa (desmarcar pausa o acesso sem revogar)
              </label>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
              <Button type="submit" disabled={criar.isPending || atualizar.isPending}>
                {form.id ? 'Salvar' : 'Criar e gerar a chave'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ------------------------------------------------ chave em claro (uma vez) */}
      <Modal open={!!chaveNova} onClose={() => setChaveNova(null)} title={`Chave de ${chaveNova?.nome ?? ''}`} tamanho="lg">
        {chaveNova && (
          <div className="space-y-4">
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Copie agora e envie ao sistema por canal seguro. O SCar guarda só uma impressão da chave: ela
              não aparece de novo. Perdeu? Gere uma nova.
            </div>
            <div className="flex items-center gap-2">
              <code className="codigo flex-1 break-all rounded-lg bg-slate-100 p-3 text-sm">{chaveNova.chave}</code>
              <Button variant="secondary" onClick={() => copiar(chaveNova.chave)}><Copy className="h-4 w-4" /> Copiar</Button>
            </div>
            <p className="text-sm text-slate-500">
              Endereço: <code className="codigo">{origem}/api/externa/v1</code> · Documentação:{' '}
              <code className="codigo">{origem}/api/externa/v1/docs</code>
              {' '}(coleção Postman em <code className="codigo">/api/externa/v1/postman.json</code>)
            </p>
            <div className="flex justify-end"><Button onClick={() => setChaveNova(null)}>Já copiei</Button></div>
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------ revogar */}
      <Modal open={!!revogando} onClose={() => setRevogando(null)} title={`Revogar ${revogando?.nome ?? ''}`}>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            A chave para de funcionar na hora e não volta. Para só pausar, use Editar → desmarcar “Chave ativa”.
          </p>
          <FormField label="Motivo *">
            <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRevogando(null)}>Cancelar</Button>
            <Button variant="danger" disabled={motivo.trim().length < 3 || revogar.isPending} onClick={confirmarRevogacao}>Revogar</Button>
          </div>
        </div>
      </Modal>

      <TrilhaModal integracao={trilha} onClose={() => setTrilha(null)} />
    </div>
  );
}

function TrilhaModal({ integracao, onClose }: { integracao: ApiIntegracaoLista | null; onClose: () => void }) {
  const { data, isLoading } = useApiRequisicoes(integracao?.id ?? null);
  return (
    <Modal open={!!integracao} onClose={onClose} title={`Requisições — ${integracao?.nome ?? ''}`} subtitulo="As 100 mais recentes" tamanho="xl">
      {isLoading && <p className="text-sm text-slate-500">Carregando…</p>}
      {!isLoading && (data ?? []).length === 0 && <p className="text-sm text-slate-500">Nenhuma requisição ainda.</p>}
      {(data ?? []).length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-superficie-alta text-left text-xs text-slate-500">
              <tr>
                <th className="px-2 py-1.5">Quando</th><th className="px-2 py-1.5">Rota</th><th className="px-2 py-1.5">Situação</th>
                <th className="px-2 py-1.5 text-right">Registros</th><th className="px-2 py-1.5 text-right">ms</th><th className="px-2 py-1.5">IP</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((r) => (
                <tr key={r.id} className="border-t border-slate-200">
                  <td className="whitespace-nowrap px-2 py-1.5">{formatDateTime(r.created_at)}</td>
                  <td className="px-2 py-1.5 font-mono text-xs">{r.metodo} {r.rota.replace('/api/externa/v1', '')}</td>
                  <td className={cn('px-2 py-1.5', r.status >= 400 ? 'text-rose-600' : 'text-emerald-700')}>
                    {r.status}{r.erro ? ` · ${r.erro}` : ''}
                  </td>
                  <td className="px-2 py-1.5 text-right tnum">{r.registros ?? '—'}</td>
                  <td className="px-2 py-1.5 text-right tnum">{r.duracao_ms ?? '—'}</td>
                  <td className="px-2 py-1.5 text-xs">{r.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
