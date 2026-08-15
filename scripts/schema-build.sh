#!/usr/bin/env bash
# ============================================================================
# SCar :: regenera supabase/schema.sql (consolidado de TODAS as migrations).
# Rode sempre que criar/editar uma migration — o schema.sql e o arquivo que se
# cola no SQL Editor do Supabase quando se monta um ambiente do zero.
# ============================================================================
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESTINO="$RAIZ/supabase/schema.sql"

{
  echo '-- SCar :: schema.sql (consolidado) - cole no Supabase SQL Editor.'
  for f in "$RAIZ"/supabase/migrations/*.sql; do
    echo
    echo "-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/$(basename "$f") >>>>>>>>>>>>>>>>>>>>>>>>"
    echo
    cat "$f"
  done
} > "$DESTINO"

echo "schema.sql regenerado: $(grep -c '' "$DESTINO") linhas, $(ls "$RAIZ"/supabase/migrations/*.sql | wc -l) migrations"
