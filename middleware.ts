import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Middleware de autenticacao/refresh de sessao para todas as rotas de app,
// exceto assets estaticos e imagens.
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
