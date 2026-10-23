-- Teste da 0143. O resultado da leitura com a cor e provado pela suite 0142
-- (que roda com a versao desta migration); aqui fica a guarda do desempenho:
-- sem `materialized` o planejador recalcula o cor_map a cada objeto.
\set ON_ERROR_STOP on
do $$
begin
  assert (select count(*) from pg_proc where proname = 'mutual_carga_linhas') = 1,
    'uma versao so de mutual_carga_linhas';
  assert (select prosrc ilike '%cor_map as materialized%' from pg_proc
           where proname = 'mutual_carga_linhas'),
    'o cor_map tem de ser MATERIALIZED (senao vira nested loop por linha)';
  assert (select prosrc not ilike '%mutual_cor_do_externo(o.payload%' from pg_proc
           where proname = 'mutual_carga_linhas'),
    'a cor nao volta a ser resolvida por linha';

  raise notice '=== 0143 carga cor materializada: TODOS OS TESTES PASSARAM ===';
end $$;
