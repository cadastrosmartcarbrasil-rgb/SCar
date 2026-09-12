// Atualiza a sessao do Supabase a cada request e aplica o guard de rotas.
// Chamado pelo middleware raiz (middleware.ts).
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/database.types';

// Rotas publicas (nao exigem sessao).
// /cotacao/<token> e a cotacao publica compartilhavel (link enviado ao cliente).
// /v/<codigo> e o hotlink de vendas do vendedor (link publico compartilhavel).
// /vistoria/<token> e a vistoria no celular do cliente (0076) — o link tem
// prazo proprio e e a unica capacidade de quem nao tem login.
const PUBLIC_PATHS = ['/login', '/portal/login', '/auth/callback', '/cotacao', '/v', '/vistoria'];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANTE: nao insira logica entre createServerClient e getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));

  // Sem sessao em rota protegida -> redireciona ao login apropriado.
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = path.startsWith('/portal') ? '/portal/login' : '/login';
    url.searchParams.set('redirect', path);
    const redirecionamento = NextResponse.redirect(url);
    // ATENCAO: o `getUser()` acima pode ter escrito cookies em `response` —
    // quando o refresh token expira ou e recusado, o Supabase manda APAGAR os
    // cookies da sessao morta. Devolver um `NextResponse.redirect` novo joga
    // essa limpeza fora, e o navegador fica com um cookie de sessao invalido
    // que NUNCA e removido: toda rota protegida bate no login e o proprio
    // login parte de uma sessao corrompida. Era o "deslogou e nao loga mais",
    // que so saia limpando os cookies do site na mao. Aqui a limpeza viaja
    // junto com o redirecionamento.
    response.cookies.getAll().forEach((c) => redirecionamento.cookies.set(c));
    return redirecionamento;
  }

  return response;
}
