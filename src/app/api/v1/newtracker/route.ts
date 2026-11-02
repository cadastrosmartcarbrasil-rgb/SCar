import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  RECURSOS_NEWTRACKER, cabecalhoNewTracker, camposDaAmostra, ehRecursoNewTracker,
  lerPaginaNewTracker, mensagemErroNewTracker, urlNewTracker, type RecursoNewTracker,
  ROTULO_SITUACAO_IMPORTACAO, contarSituacoes, type LinhaPrevia,
} from '@/lib/newtracker';
import { baseNewTracker, contasConfiguradas, importarNewTracker, integracaoNewTracker, montarPreviaNewTracker } from '@/lib/newtracker-server';

// POST /api/v1/newtracker
// Proxy server-side da API da plataforma da NEW TRACKER (Fleet Hub 360), no molde
// do /api/v1/mutual: a CHAVE fh_live_ nunca vai ao navegador.
//
// FASE 1: SO LEITURA E NADA E GRAVADO. Serve para testar a chave e ver uma
// amostra real de cada recurso antes de escrever a sincronia do parque.
//
// Ambiente do VPS (.env + docker-compose.yml):
//   NEWTRACKER_API_KEY  -> chave fh_live_... (obrigatoria)
//   NEWTRACKER_API_BASE -> opcional, padrao https://bgixdmhmaheznzqjljhk.supabase.co/functions/v1
export const dynamic = 'force-dynamic';

const LIMITE_AMOSTRA = 20;

interface Body {
  acao?: 'amostra' | 'previa' | 'importar';
  conta?: string;
  recurso?: string;
  limite?: number;
}

export const maxDuration = 300;

function resumoLinha(l: LinhaPrevia) {
  return {
    imei: l.item.imei,
    modelo: l.item.modelo,
    situacao: l.situacao,
    placa_nt: l.item.veiculo_nt?.placa ?? null,
    chassi_nt: l.item.veiculo_nt?.chassi ?? null,
    veiculo_nt: l.item.veiculo_nt?.descricao ?? null,
    placa: l.veiculo?.placa ?? null,
    chassi: l.veiculo?.chassi ?? null,
    casou_por: l.casou_por,
    comunicado_em: l.item.posicao?.comunicado_em ?? null,
    online: l.item.posicao?.online ?? null,
  };
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { data: perfil } = await supabase
    .from('usuarios').select('papel, ativo').eq('id', user.id).maybeSingle();
  if (!perfil?.ativo || perfil.papel !== 'admin') {
    return NextResponse.json({ error: 'Somente o administrador pode testar a integração da New Tracker' }, { status: 403 });
  }

  const contas = contasConfiguradas();
  const base = baseNewTracker();
  if (contas.length === 0) return NextResponse.json({ configured: false });
  const nomesContas = contas.map((c) => c.nome);

  const body = (await request.json().catch(() => ({}))) as Body;
  const conta = contas.find((c) => c.nome === body.conta) ?? contas[0];
  const chave = conta.chave;

  // --- previa / importar: le TUDO da New Tracker e casa com a nossa frota ---
  if (body.acao === 'previa' || body.acao === 'importar') {
    try {
      const integ = await integracaoNewTracker();
      const previa = await montarPreviaNewTracker();
      const contagem = contarSituacoes(previa.linhas);
      const instalar = previa.linhas.filter((l) => l.situacao === 'INSTALAR');
      let ja_instalados = 0, outra_plataforma = 0;
      for (const l of instalar) {
        const p = previa.no_parque.get(l.item.imei);
        if (!p) continue;
        if (p.fornecedor_id && p.fornecedor_id !== integ.fornecedor_id) outra_plataforma++;
        else if (p.status === 'ATIVO' && p.veiculo_id === l.veiculo?.id) ja_instalados++;
      }
      const base = {
        configured: true, ok: true, acao: body.acao, integracao: integ.nome,
        contas: nomesContas, lidos: previa.lidos, por_conta: previa.por_conta, contagem,
        rotulos: ROTULO_SITUACAO_IMPORTACAO,
        a_instalar: instalar.length - ja_instalados - outra_plataforma,
        ja_instalados, outra_plataforma,
        com_posicao: instalar.filter((l) => l.item.posicao).length,
      };
      if (body.acao === 'previa') {
        return NextResponse.json({
          ...base,
          exemplos: {
            INSTALAR: instalar.slice(0, 50).map(resumoLinha),
            FORA_DA_BASE: previa.linhas.filter((l) => l.situacao === 'FORA_DA_BASE').slice(0, 50).map(resumoLinha),
            SEM_POSICAO: previa.linhas.filter((l) => l.situacao === 'SEM_POSICAO').slice(0, 50).map(resumoLinha),
            VEICULO_SEM_CADASTRO: previa.linhas.filter((l) => l.situacao === 'VEICULO_SEM_CADASTRO').slice(0, 50).map(resumoLinha),
          },
        });
      }
      const resultado = await importarNewTracker(previa.linhas);
      console.log(`[newtracker] importacao por ${user.id}: ${JSON.stringify(resultado.cadastro)} / ${JSON.stringify(resultado.comunicacao)}`);
      return NextResponse.json({ ...base, resultado });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[newtracker]', msg);
      return NextResponse.json({ configured: true, ok: false, acao: body.acao, erro: msg });
    }
  }

  const recurso: RecursoNewTracker = ehRecursoNewTracker(body.recurso) ? body.recurso : 'status';
  const limite = Math.min(LIMITE_AMOSTRA, Math.max(1, Math.floor(body.limite ?? 5)));
  const alvo = urlNewTracker(base, recurso, { limite });

  const inicio = Date.now();
  try {
    const res = await fetch(alvo, {
      headers: cabecalhoNewTracker(chave),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    const texto = await res.text();
    let corpo: unknown = null;
    try { corpo = JSON.parse(texto); } catch { /* HTML ou texto: mostra o comeco */ }
    const ms = Date.now() - inicio;
    console.log(`[newtracker] ${recurso} HTTP ${res.status} ${ms}ms`);

    if (!res.ok) {
      return NextResponse.json({
        configured: true, ok: false, http: res.status, recurso, ms, conta: conta.nome, contas: nomesContas,
        erro: mensagemErroNewTracker(res.status, corpo),
        bruto: corpo ?? texto.slice(0, 300),
      });
    }

    const pagina = lerPaginaNewTracker(corpo);
    return NextResponse.json({
      configured: true,
      ok: true,
      http: res.status,
      recurso,
      conta: conta.nome,
      contas: nomesContas,
      rotulo: RECURSOS_NEWTRACKER[recurso],
      ms,
      total: pagina.total,
      // status: o corpo inteiro (empresa e permissoes da chave)
      corpo: recurso === 'status' ? (pagina.corpo ?? corpo ?? texto.slice(0, 300)) : null,
      campos: camposDaAmostra(pagina.dados),
      amostra: pagina.dados,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({
      configured: true, ok: false, http: 0, recurso, ms: Date.now() - inicio,
      erro: `Não foi possível falar com a New Tracker (${msg}).`,
    });
  }
}
