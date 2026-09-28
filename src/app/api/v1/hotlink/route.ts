import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Captura publica pelo hotlink (/v/<codigo>).
 *
 * Roda com a service_role porque o visitante nao tem sessao — por isso aceita
 * SO os campos do formulario. Quem decide o que fazer com a captura e o banco:
 * `registrar_captura_hotlink` aplica as regras de atribuicao (carteira,
 * duplicidade dentro da janela de protecao, reativacao e rodizio) e devolve o
 * que aconteceu. A rota nao repete regra nenhuma.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const codigo = String(body?.codigo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const nome = String(body?.nome ?? '').trim();
  const celular = String(body?.celular ?? '').trim();
  const email = String(body?.email ?? '').trim();
  const placa = String(body?.placa ?? '').trim().toUpperCase();
  const cpfCnpj = String(body?.cpf_cnpj ?? '').trim();

  if (!codigo) return NextResponse.json({ error: 'Link invalido' }, { status: 400 });
  if (nome.length < 3) return NextResponse.json({ error: 'Informe seu nome' }, { status: 400 });
  if (celular.replace(/\D/g, '').length < 10) {
    return NextResponse.json({ error: 'Informe um celular valido' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('registrar_captura_hotlink', {
    p_codigo: codigo,
    p_nome: nome,
    p_celular: celular,
    p_email: email || null,
    p_placa: placa || null,
    p_cpf_cnpj: cpfCnpj || null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const r = data?.[0];
  if (!r) return NextResponse.json({ error: 'Nao consegui registrar o contato' }, { status: 400 });

  // O visitante nao precisa saber que foi classificado como duplicado ou
  // carteira: recebe uma mensagem honesta, sem expor a regra interna.
  // `token` e a capacidade das chamadas seguintes (cotar/contratar): sem ele
  // um `lead_id` adivinhavel deixaria qualquer um pendurar proposta no
  // atendimento de outra pessoa.
  // O atendimento em que a captura caiu JA PODE TER ACEITE. Acontece na
  // recaptura (DUPLICADO, 0041/0043): a pessoa volta pelo link dentro da
  // janela de protecao e continua NO MESMO lead — que, se ja fechou, tem uma
  // proposta consentida. Deixa-la cotar de novo ali produz uma cotacao nova
  // que ninguem aceitou pendurada num aceite antigo, de outro preco.
  //
  // A consulta e pelo token que acabou de sair, entao nao expoe lead alheio.
  // Falhar aqui nao derruba a captura: o lead ja esta gravado, e o pior caso
  // e a tela seguir como antes.
  const { data: sessoes } = await admin.rpc('lead_por_token_publico', {
    p_token: r.token_publico,
  });

  return NextResponse.json({
    ok: true,
    tipo: r.tipo,
    vendedor: r.vendedor_nome,
    mensagem: r.mensagem,
    token: r.token_publico,
    ja_aceito: Boolean(sessoes?.[0]?.aceito),
  });
}
