#!/usr/bin/env bash
# Testes do supabase-sql-guard.sh. Rodar: npm run test:hooks
# Cada caso: decisao esperada (allow|ask) + SQL. Falha = exit 1.
set -u
dir="$(cd "$(dirname "$0")" && pwd)"
hook="$dir/supabase-sql-guard.sh"
falhas=0; total=0

caso() {
  local esperado="$1" sql="$2" obtido
  total=$((total + 1))
  obtido="$(printf '%s' "$sql" | jq -Rs '{tool_input:{query:.}}' | "$hook" \
    | jq -r '.hookSpecificOutput.permissionDecision // "nada"')"
  if [ "$obtido" != "$esperado" ]; then
    falhas=$((falhas + 1))
    printf 'FALHOU: esperado %s, veio %s -> %s\n' "$esperado" "$obtido" "$sql"
  fi
}

# --- Leitura: tem de passar sem perguntar ---
caso allow "select status, count(*) from veiculos group by 1 order by 1"
caso allow 'select count(*) as "dia do vencimento" from veiculos'
caso allow 'select placa as "Placa do Veículo", cor as "cor do carro" from veiculos limit 5'
caso allow "explain analyze select * from veiculos where placa = 'ABC1D23'"
caso allow "explain (analyze, buffers) select 1"
caso allow "with x as (select 1 as a) select * from x"
caso allow "select * from mutual_carga_previa('00000000-0000-0000-0000-000000000000'::uuid)"
caso allow "select regexp_replace(placa, '[^A-Z0-9]', '', 'g') from veiculos"
caso allow "select pg_get_functiondef('mutual_executar_carga'::regproc)"
caso allow "select * from veiculos where obs like '%delete%' -- insert aqui e comentario"
caso allow "/* drop table x */ select 1"
caso allow "select * from gerar_dre('2026-01-01','2026-01-31', null)"
caso allow "select * from resolver_hotlink('AMANDA')"
caso allow "select current_setting('statement_timeout')"
caso allow "select count(*) filter (where prosecdef and proconfig is null) from pg_proc"
caso allow "  (select 1) union all (select 2)"
caso allow "select 'it''s' as texto"
caso allow "select E'a\\'b' as texto"
caso allow "table veiculos"

# --- Escrita/DDL: tem de perguntar ---
caso ask "update veiculos set cor = 'PRATA'"
caso ask "insert into cores(nome) values ('X')"
caso ask "delete from veiculos"
caso ask "drop table x"
caso ask "alter role authenticated set statement_timeout = '8s'"
caso ask "create index i on veiculos(placa)"
caso ask "grant select on veiculos to anon"
caso ask "do \$\$ begin perform 1; end \$\$"
caso ask "create function f() returns int language sql as \$f\$ select 1 \$f\$"
caso ask "set role postgres"
caso ask "select 1; set session authorization postgres"
caso ask "select vincular_externo('MUTUAL','SALE_TEAM','1','regionais',null)"
caso ask "select * from mutual_executar_carga(null, false, true)"
caso ask "select set_config('scar.importacao','true',false)"
caso ask "select nextval('matricula_seq')"
caso ask 'select "mutual_executar_carga"(null, false, true)'
caso ask "notify pgrst, 'reload config'"
caso ask "explain analyze delete from veiculos"
caso ask "with d as (delete from veiculos returning *) select * from d"
caso ask "select pg_terminate_backend(123)"
caso ask "select pode_liberar_assistencia(); select abrir_acionamento(null)"
# literal/comentario nao podem esconder escrita
caso ask "select '--'; delete from veiculos"
caso ask "select 'a\\'; delete from veiculos; select '1'"
caso ask "select \$\$x\$\$"
caso ask "truncate veiculos"
caso ask "vacuum veiculos"
caso ask "copy veiculos to stdout"
caso ask "lock table veiculos"
caso ask "comment on table veiculos is 'x'"

echo "supabase-sql-guard: $((total - falhas))/$total casos passaram"
[ "$falhas" -eq 0 ]
