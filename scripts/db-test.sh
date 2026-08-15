#!/usr/bin/env bash
# ============================================================================
# SCar :: harness de teste do banco
#
# Sobe um PostgreSQL 16 local, aplica TODAS as migrations em ordem e roda cada
# arquivo de supabase/tests/*.test.sql num banco isolado (clone por template),
# para que um teste nao interfira no outro.
#
#   ./scripts/db-test.sh                 # tudo
#   ./scripts/db-test.sh 0028            # so os testes que casam com "0028"
#   ./scripts/db-test.sh --schema        # valida tambem o schema.sql consolidado
#
# Requisitos: postgresql-16 instalado (binarios em /usr/lib/postgresql/16/bin).
# O cluster fica em $PGTEST_HOME (padrao /home/pgtest) e roda na porta 5433.
# ============================================================================
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGTEST_HOME="${PGTEST_HOME:-/home/pgtest}"
PGPORT_TESTE="${PGPORT_TESTE:-5433}"
PGUSER_TESTE="${PGUSER_TESTE:-pgtest}"

export PGHOST=127.0.0.1
export PGPORT="$PGPORT_TESTE"
export PGUSER="$PGUSER_TESTE"

FILTRO=""
VALIDAR_SCHEMA=0
for arg in "$@"; do
  case "$arg" in
    --schema) VALIDAR_SCHEMA=1 ;;
    *) FILTRO="$arg" ;;
  esac
done

vermelho() { printf '\033[31m%s\033[0m\n' "$1"; }
verde()    { printf '\033[32m%s\033[0m\n' "$1"; }
cinza()    { printf '\033[90m%s\033[0m\n' "$1"; }

# ---------------------------------------------------------------- cluster local
# PGTEST_EXTERNO=1 (ou um servidor ja no ar) = usa o Postgres existente, sem
# provisionar cluster. E o caso do CI, que sobe o postgres como service.
if [ "${PGTEST_EXTERNO:-0}" = "1" ] || pg_isready -q 2>/dev/null; then
  cinza "==> usando o postgres ja disponivel em $PGHOST:$PGPORT"
elif [ ! -d "$PGTEST_HOME/pgdata" ]; then
  cinza "==> criando cluster de teste em $PGTEST_HOME"
  id "$PGUSER_TESTE" >/dev/null 2>&1 || useradd -m "$PGUSER_TESTE"
  mkdir -p "$PGTEST_HOME/sock"
  chown -R "$PGUSER_TESTE:$PGUSER_TESTE" "$PGTEST_HOME"
  su "$PGUSER_TESTE" -c "$PGBIN/initdb -D $PGTEST_HOME/pgdata -U $PGUSER_TESTE --auth=trust" >/dev/null
fi

if [ "${PGTEST_EXTERNO:-0}" != "1" ] && ! pg_isready -q 2>/dev/null; then
  cinza "==> subindo postgres na porta $PGPORT_TESTE"
  mkdir -p "$PGTEST_HOME/sock"; chown -R "$PGUSER_TESTE:$PGUSER_TESTE" "$PGTEST_HOME/sock"
  su "$PGUSER_TESTE" -c \
    "$PGBIN/pg_ctl -D $PGTEST_HOME/pgdata -o '-p $PGPORT_TESTE -k $PGTEST_HOME/sock' -l $PGTEST_HOME/pg.log start" >/dev/null
  sleep 2
fi

# ------------------------------------------------------- banco base (migrations)
cinza "==> aplicando migrations em scar_base"
psql -d postgres -q -c "drop database if exists scar_base" -c "create database scar_base"
PGDATABASE=scar_base psql -q -v ON_ERROR_STOP=1 -f "$RAIZ/supabase/tests/bootstrap.sql" >/dev/null

for f in "$RAIZ"/supabase/migrations/*.sql; do
  if ! saida=$(PGDATABASE=scar_base psql -q -v ON_ERROR_STOP=1 -f "$f" 2>&1); then
    vermelho "MIGRATION FALHOU: $(basename "$f")"
    echo "$saida" | tail -20
    exit 1
  fi
done
verde "migrations 0001..$(ls "$RAIZ"/supabase/migrations | tail -1 | cut -c1-4) aplicadas"

# ------------------------------------------------- schema.sql consolidado (opcional)
if [ "$VALIDAR_SCHEMA" = "1" ]; then
  cinza "==> validando supabase/schema.sql (consolidado)"
  psql -d postgres -q -c "drop database if exists scar_schema" -c "create database scar_schema"
  PGDATABASE=scar_schema psql -q -v ON_ERROR_STOP=1 -f "$RAIZ/supabase/tests/bootstrap.sql" >/dev/null
  if saida=$(PGDATABASE=scar_schema psql -q -v ON_ERROR_STOP=1 -f "$RAIZ/supabase/schema.sql" 2>&1); then
    verde "schema.sql consolidado OK"
  else
    vermelho "schema.sql FALHOU (regenere com ./scripts/schema-build.sh)"
    echo "$saida" | tail -20
    exit 1
  fi
fi

# --------------------------------------------------------------- testes isolados
falhas=0
total=0
for t in "$RAIZ"/supabase/tests/*.test.sql; do
  nome="$(basename "$t" .test.sql)"
  [ -n "$FILTRO" ] && [[ "$nome" != *"$FILTRO"* ]] && continue
  total=$((total + 1))

  psql -d postgres -q -c "drop database if exists scar_t" -c "create database scar_t template scar_base"
  if saida=$(PGDATABASE=scar_t psql -q -v ON_ERROR_STOP=1 -f "$t" 2>&1) && echo "$saida" | grep -q "PASSARAM"; then
    verde "OK      $nome"
  else
    vermelho "FALHOU  $nome"
    echo "$saida" | grep -E "ERROR|CONTEXT" | head -6
    falhas=$((falhas + 1))
  fi
done

echo
if [ "$falhas" -eq 0 ]; then
  verde "$total/$total suites de banco passaram"
else
  vermelho "$falhas de $total suites falharam"
  exit 1
fi
