import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPaymentGateway } from '@/lib/pagamentos';
import { numeroValido, ultimosDigitos, validarCartao } from '@/lib/cartao';

/**
 * Cadastro do cartao para debito da mensalidade.
 *
 * O CAMINHO DO NUMERO DO CARTAO, explicito:
 *   navegador -> esta rota (memoria) -> gateway -> token
 * Ele NAO e gravado, NAO e logado e NAO volta na resposta. O que persiste e o
 * token, a bandeira e os 4 ultimos digitos, gravados por
 * `portal_registrar_cartao` — funcao que nem sequer tem parametro para o numero.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessao expirada.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const numero = String(body?.numero ?? '').replace(/\D/g, '');
  const nome = String(body?.nome ?? '').trim();
  const validade = String(body?.validade ?? '');
  const cvv = String(body?.cvv ?? '').replace(/\D/g, '');

  const erro = validarCartao({ numero, nome, validade, cvv });
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  if (!numeroValido(numero)) {
    return NextResponse.json({ error: 'Confira o numero do cartao' }, { status: 400 });
  }

  const [mes, ano] = validade.replace(/\D/g, '').match(/.{1,2}/g) ?? [];
  const admin = createAdminClient();

  // Titular: o gateway exige os dados para analise antifraude.
  const { data: cliente } = await admin
    .from('clientes')
    .select('id, nome_razao_social, cpf_cnpj, email, telefone, endereco')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!cliente) return NextResponse.json({ error: 'Cadastro nao encontrado.' }, { status: 404 });

  const endereco = (cliente.endereco ?? {}) as Record<string, string>;

  try {
    const { data: integracao } = await admin
      .from('integracoes_bancarias').select('*').eq('ativo', true).limit(1).maybeSingle();

    const gateway = getPaymentGateway(integracao ?? undefined);
    const token = await gateway.tokenizarCartao({
      numero,
      nome,
      validade_mes: Number(mes),
      validade_ano: Number(`20${ano}`.slice(-4)),
      cvv,
      titular: {
        nome: cliente.nome_razao_social,
        cpf_cnpj: cliente.cpf_cnpj,
        email: cliente.email,
        telefone: cliente.telefone,
        cep: endereco.cep ?? null,
        numero_endereco: endereco.numero ?? null,
      },
    });

    // Grava com a SESSAO do associado: a RLS confere que o cartao e dele.
    const { error: erroGravar } = await supabase.rpc('portal_registrar_cartao', {
      p_token: token.token,
      p_bandeira: token.bandeira ?? null,
      p_ultimos_digitos: token.ultimos_digitos ?? ultimosDigitos(numero),
      p_nome_portador: nome,
      p_validade_mes: Number(mes),
      p_validade_ano: Number(`20${ano}`.slice(-4)),
      p_gateway: gateway.provedor,
    });
    if (erroGravar) return NextResponse.json({ error: erroGravar.message }, { status: 400 });

    return NextResponse.json({
      ok: true,
      bandeira: token.bandeira,
      ultimos_digitos: token.ultimos_digitos ?? ultimosDigitos(numero),
    });
  } catch (e) {
    // A mensagem do gateway pode conter detalhe tecnico: nao vai crua ao cliente.
    console.error('[portal/cartao] falha ao tokenizar', (e as Error).name);
    return NextResponse.json(
      { error: 'Nao consegui validar o cartao agora. Confira os dados ou tente mais tarde.' },
      { status: 400 },
    );
  }
}
