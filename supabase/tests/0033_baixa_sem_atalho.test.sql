-- Teste funcional: o atalho de quitacao nao existe mais (0033)
\set ON_ERROR_STOP on
do $$
declare
  n int;
begin
  -- A funcao tem de estar fora do banco: toda baixa passa pelo registro
  -- completo, com a conta que pagou/recebeu.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'quitar_lancamento';
  assert n = 0, 'quitar_lancamento ainda existe no banco';

  -- O caminho oficial (inserir a baixa) continua de pe e ainda recalcula
  -- status e saldo pelos triggers do 0012 e do 0032.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname in ('fn_recalcular_lancamento', 'fn_lanc_calcular_saldo');
  assert n = 2, 'os triggers de saldo/status precisam continuar existindo, achei ' || n;

  raise notice '=== TESTES 0033 (baixa sem atalho) PASSARAM ===';
end $$;
