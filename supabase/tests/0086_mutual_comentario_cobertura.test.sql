-- Suite da 0086: o banco parou de afirmar o numero errado.
--
-- Guarda de REGRESSAO, nao de cosmetica: a conclusao do de-para do plano ("18
-- decisoes cobrem 90%") e lida do comentario pela proxima sessao, e foi um
-- numero meu errado que a 0085 gravou. Se alguem recriar a funcao copiando o
-- texto da 0085, este teste falha.
do $$
declare
  v_com text;
begin
  select obj_description(p.oid, 'pg_proc') into v_com
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'mutual_planos_externos'
     and pg_get_function_identity_arguments(p.oid) = 'p_regional_id uuid';

  assert v_com is not null,
    'mutual_planos_externos(uuid) deveria existir e ter comentario';

  assert v_com like '%18 dos 42 ids cobrem 90%%',
    format('o comentario deveria afirmar 18 de 42 (a medicao certa); veio: %s', left(v_com, 200));
  assert v_com like '%29 dos 91%',
    format('o comentario deveria afirmar 29 de 91 na base viva; veio: %s', left(v_com, 200));

  -- Os numeros ERRADOS da 0085 nao podem voltar.
  assert v_com not like '%17 ids%',
    'o comentario voltou a dizer "17 ids" — o off-by-one da 0085 reapareceu';
  assert v_com not like '%26 de 91%',
    'o comentario voltou a dizer "26 de 91" — o off-by-one da 0085 reapareceu';

  -- A 0086 nao toca em comportamento: a funcao continua security definer com
  -- search_path fixo e fechada ao `anon` (rito da 0052).
  assert (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname='public' and p.proname='mutual_planos_externos'),
    'mutual_planos_externos deixou de ser security definer';
  assert (select p.proconfig::text like '%search_path=public%' from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname='public' and p.proname='mutual_planos_externos'),
    'mutual_planos_externos perdeu o search_path fixo';
  assert not (select has_function_privilege('anon', p.oid, 'execute') from pg_proc p
                join pg_namespace n on n.oid = p.pronamespace
               where n.nspname='public' and p.proname='mutual_planos_externos'),
    'mutual_planos_externos ficou chamavel pelo anon';

  raise notice '=== TESTES 0086 (comentario da cobertura do plano) PASSARAM ===';
end $$;
