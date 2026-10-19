-- Teste da 0125: o time da 24h cria e edita servico; nao apaga; consultor nao grava.
\set ON_ERROR_STOP on
do $$
declare
  u_24h uuid := gen_random_uuid();
  u_con uuid := gen_random_uuid();
  s_id uuid;
  n bigint;
  recusou boolean;
begin
  insert into auth.users (id, email) values (u_24h,'a24h125@t.com'), (u_con,'con125@t.com');
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_24h,'Operador 24h','a24h125@t.com','assistencia_24h', null),
    (u_con,'Consultor','con125@t.com','consultor_vendas', null);

  perform set_config('request.jwt.claim.sub', u_24h::text, false);
  execute 'set local role authenticated';
  insert into servicos_assistencia (descricao, valor_padrao) values ('EVENTO MOTO 125', 0) returning id into s_id;
  update servicos_assistencia set valor_padrao = 90 where id = s_id;
  delete from servicos_assistencia where id = s_id;
  execute 'reset role';
  select count(*) into n from servicos_assistencia where id = s_id and valor_padrao = 90;
  assert n = 1, 'o time da 24h cria e edita, mas nao apaga o servico';
  raise notice 'OK o time da 24h cria e edita o servico';

  perform set_config('request.jwt.claim.sub', u_con::text, false);
  execute 'set local role authenticated';
  recusou := false;
  begin
    insert into servicos_assistencia (descricao, valor_padrao) values ('NAO PODE 125', 0);
  exception when insufficient_privilege then recusou := true;
  end;
  execute 'reset role';
  assert recusou, 'o consultor nao pode cadastrar servico da 24h';
  raise notice 'OK quem nao opera a 24h nao grava';

  raise notice '=== TESTES 0125 PASSARAM ===';
end $$;
