import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  ENV_SICREDI,
  SicrediGateway,
  configSicrediDoAmbiente,
  contratoWebhookExistente,
  webhookEhNosso,
  mascararSegredo,
  variaveisSicrediFaltando,
} from '@/lib/pagamentos/sicredi';

// /api/v1/sicredi — bancada de teste da API Cobranca do Sicredi.
// So admin/financeiro. As credenciais vem das SICREDI_* do servidor e NUNCA
// voltam na resposta (o GET diz so QUAIS faltam e o ambiente).
//
//   GET                                  -> situacao da configuracao
//   POST { action: 'autenticar' }        -> testa o token
//   POST { action: 'boleto_teste' }      -> registra um boleto FICTICIO (so sandbox)
//   POST { action: 'consultar', nosso_numero }
//   POST { action: 'liquidados', dia: 'YYYY-MM-DD' }
//   POST { action: 'pdf', linha_digitavel } -> application/pdf
//   POST { action: 'webhook_consultar' }  -> contrato de webhook no Sicredi
//   POST { action: 'webhook_registrar', responsavel, email, telefone, substituir? }
//        -> cria (ou altera, se ja existe) o contrato apontando para
//           <este site>/api/v1/sicredi/webhook/<SICREDI_WEBHOOK_SECRET>.
//           O segredo nunca volta na resposta (sai mascarado).
//           O contrato e UM por beneficiario: se o existente aponta para
//           OUTRO sistema (o Mutual, ate o corte de dezembro), recusa com 409
//           — trocar o destino derruba a baixa dele. So com substituir: true.
//           Consulta que falha tambem recusa: criar no escuro pode duplicar.
//
// O boleto de teste NAO e gravado em titulos_financeiros: e so para ver o
// formato real da resposta do banco antes de ligar a remessa.
export const dynamic = 'force-dynamic';

async function autorizado() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  const { data: perfil } = await supabase.from('usuarios').select('papel, ativo').eq('id', user.id).maybeSingle();
  if (!perfil?.ativo || !['admin', 'financeiro'].includes(perfil.papel)) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const negado = await autorizado();
  if (negado) return negado;
  const cfg = configSicrediDoAmbiente(process.env);
  return NextResponse.json({
    configurado: !!cfg,
    ambiente: cfg?.ambiente ?? null,
    faltando: variaveisSicrediFaltando(process.env),
    webhook_segredo: segredoWebhookOk(),
  });
}

function segredoWebhookOk() {
  return (process.env[ENV_SICREDI.webhookSecret] ?? '').length >= 32;
}

/** Origem publica deste site (atras do Caddy vem nos x-forwarded-*). */
function origemPublica(request: Request): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}` : new URL(request.url).origin;
}

interface Body {
  action?: 'autenticar' | 'boleto_teste' | 'consultar' | 'liquidados' | 'pdf' | 'webhook_consultar' | 'webhook_registrar';
  responsavel?: string;
  email?: string;
  telefone?: string;
  nosso_numero?: string;
  linha_digitavel?: string;
  dia?: string;
  valor?: number;
  substituir?: boolean;
}

export async function POST(request: Request) {
  const negado = await autorizado();
  if (negado) return negado;

  const cfg = configSicrediDoAmbiente(process.env);
  if (!cfg) {
    return NextResponse.json(
      { error: `Sicredi nao configurado. Faltam: ${variaveisSicrediFaltando(process.env).join(', ')}` },
      { status: 400 },
    );
  }
  const gw = new SicrediGateway(cfg);
  const body = (await request.json().catch(() => ({}))) as Body;

  try {
    switch (body.action) {
      case 'autenticar': {
        await gw.token();
        return NextResponse.json({ ok: true, ambiente: cfg.ambiente, mensagem: 'Autenticacao aceita pelo Sicredi' });
      }
      case 'boleto_teste': {
        if (cfg.ambiente !== 'sandbox') {
          return NextResponse.json({ error: 'Boleto de teste so no sandbox' }, { status: 400 });
        }
        const venc = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
        // Pagador ficticio da propria colecao do Sicredi (sandbox).
        const r = await gw.emitir({
          titulo_id: crypto.randomUUID(),
          valor: body.valor && body.valor > 0 ? body.valor : 10.01,
          vencimento: venc,
          descricao: 'Teste de integracao SCar',
          pagador: {
            nome: 'TESTE FAKE',
            cpf_cnpj: '35169335695',
            endereco: { logradouro: 'RUA DOUTOR VARGAS NETO 180', cidade: 'PORTO ALEGRE', uf: 'RS', cep: '91250000' },
          },
        });
        if (r.erro) return NextResponse.json({ error: r.erro }, { status: 400 });
        return NextResponse.json({ ok: true, emitido: r });
      }
      case 'consultar': {
        if (!body.nosso_numero) return NextResponse.json({ error: 'Informe nosso_numero' }, { status: 400 });
        return NextResponse.json({ ok: true, boleto: await gw.consultar(body.nosso_numero) });
      }
      case 'liquidados': {
        const dia = body.dia ?? new Date().toISOString().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return NextResponse.json({ error: 'dia invalido' }, { status: 400 });
        return NextResponse.json({ ok: true, dia, liquidados: await gw.liquidadosDoDia(dia) });
      }
      case 'pdf': {
        if (!body.linha_digitavel) return NextResponse.json({ error: 'Informe linha_digitavel' }, { status: 400 });
        const bytes = await gw.pdf(body.linha_digitavel);
        return new NextResponse(bytes, {
          headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="boleto.pdf"' },
        });
      }
      case 'webhook_consultar': {
        const segredo = process.env[ENV_SICREDI.webhookSecret];
        const contrato = await gw.consultarContratosWebhook();
        return NextResponse.json({
          ok: true,
          ambiente: cfg.ambiente,
          contrato: JSON.parse(mascararSegredo(JSON.stringify(contrato ?? null), segredo)),
        });
      }
      case 'webhook_registrar': {
        const segredo = process.env[ENV_SICREDI.webhookSecret];
        if (!segredoWebhookOk()) {
          return NextResponse.json(
            { error: 'Falta SICREDI_WEBHOOK_SECRET no servidor (minimo 32 caracteres)' },
            { status: 400 },
          );
        }
        const url = `${origemPublica(request)}/api/v1/sicredi/webhook/${segredo}`;
        // Ja existe contrato? altera (PUT); senao cria. Consulta que falha
        // RECUSA: sem saber o que existe, criar pode duplicar ou atropelar.
        let existente: { id: string; url: string | null } | null;
        try {
          existente = contratoWebhookExistente(await gw.consultarContratosWebhook());
        } catch (e) {
          return NextResponse.json(
            { error: `Nao foi possivel consultar o contrato atual no Sicredi (${(e as Error).message}). Nada foi alterado.` },
            { status: 502 },
          );
        }
        if (existente && !webhookEhNosso(existente.url, origemPublica(request)) && body.substituir !== true) {
          let destino = 'outro sistema';
          try { destino = existente.url ? new URL(existente.url).host : destino; } catch { /* url estranha */ }
          return NextResponse.json(
            {
              error:
                `O beneficiario ja tem webhook apontando para ${destino}. Registrar aqui SUBSTITUI esse destino ` +
                'e o outro sistema deixa de receber os avisos de pagamento. Nada foi alterado.',
              contrato_de_terceiro: true,
              destino,
            },
            { status: 409 },
          );
        }
        const id = existente?.id ?? null;
        const resp = await gw.salvarContratoWebhook(
          { url, nomeResponsavel: body.responsavel ?? '', email: body.email ?? '', telefone: body.telefone },
          id,
        );
        return NextResponse.json({
          ok: true,
          ambiente: cfg.ambiente,
          acao: id ? 'alterado' : 'criado',
          url: mascararSegredo(url, segredo),
          contrato: JSON.parse(mascararSegredo(JSON.stringify(resp ?? null), segredo)),
        });
      }
      default:
        return NextResponse.json({ error: 'action invalida' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
