-- 0163 — plano preferencial: coluna existe, default false, aceita mais de um.
do $$
declare
  v_a uuid; v_b uuid;
begin
  assert exists (select 1 from information_schema.columns
                  where table_name = 'planos_protecao' and column_name = 'preferencial'
                    and is_nullable = 'NO' and column_default = 'false'),
    'coluna preferencial ausente ou com default errado';

  insert into planos_protecao (nome) values ('PREF TESTE A') returning id into v_a;
  insert into planos_protecao (nome, preferencial) values ('PREF TESTE B', true) returning id into v_b;
  assert (select preferencial from planos_protecao where id = v_a) = false, 'default deveria ser false';
  update planos_protecao set preferencial = true where id = v_a;
  assert (select count(*) from planos_protecao where preferencial and id in (v_a, v_b)) = 2,
    'deveria aceitar mais de um preferencial (um por tipo)';

  raise notice '=== TESTES 0163 (plano preferencial) PASSARAM ===';
end $$;
