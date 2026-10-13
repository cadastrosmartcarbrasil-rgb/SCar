import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  SicrediGateway,
  configSicrediDoAmbiente,
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
  });
}

interface Body {
  action?: 'autenticar' | 'boleto_teste' | 'consultar' | 'liquidados' | 'pdf';
  nosso_numero?: string;
  linha_digitavel?: string;
  dia?: string;
  valor?: number;
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
      default:
        return NextResponse.json({ error: 'action invalida' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
