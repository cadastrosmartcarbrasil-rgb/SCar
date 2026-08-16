#!/usr/bin/env bash
# Build de VALIDACAO (npm run validate / CI). O next build renderiza paginas que
# criam o client do Supabase, entao sem env ele quebra no prerender. Aqui as
# variaveis publicas caem num valor dummy quando nao existem — o build de
# producao (Docker/VPS) continua usando o `next build` puro com as reais.
set -euo pipefail
cd "$(dirname "$0")/.."

export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-https://dummy.supabase.co}"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-dummy}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-dummy}"

exec npx next build
