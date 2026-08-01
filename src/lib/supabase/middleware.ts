// Atualiza a sessao do Supabase a cada request e aplica o guard de rotas.
// Chamado pelo middleware raiz (middleware.ts).
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/database.types';

// Rotas publicas (nao exigem sessao).
const PUBLIC_PATHS = ['/login', '/portal/login', '/auth/callback'];

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
    return NextResponse.redirect(url);
  }

  return response;
}
