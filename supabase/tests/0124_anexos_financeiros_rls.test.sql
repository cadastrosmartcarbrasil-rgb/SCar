-- Teste da 0124: quem ve o titulo anexa nele (inclusive a 24h na matriz);
-- quem nao ve, nao anexa.
\set ON_ERROR_STOP on
do $$
declare
  u_24h uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  r_a uuid; r_b uuid;
  l_matriz uuid; l_a uuid; l_b uuid;
  n bigint;
  recusou boolean;
begin
  insert into auth.users (id, email) values (u_24h,'a24h124@t.com'), (u_ges,'ges124@t.com');
  insert into regionais (nome) values ('Unidade A 124') returning id into r_a;
  insert into regionais (nome) values ('Unidade B 124') returning id into r_b;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_24h,'Operador 24h','a24h124@t.com','assistencia_24h', null),
    (u_ges,'Consultor A','ges124@t.com','consultor_vendas', r_a);

  insert into lancamentos_financeiros (tipo, descricao, regional_id, valor_original, data_vencimento)
    values ('DESPESA','Guincho matriz', null, 140, current_date) returning id into l_matriz;
  insert into lancamentos_financeiros (tipo, descricao, regional_id, valor_original, data_vencimento)
    values ('DESPESA','Conta A', r_a, 10, current_date) returning id into l_a;
  insert into lancamentos_financeiros (tipo, descricao, regional_id, valor_original, data_vencimento)
    values ('DESPESA','Conta B', r_b, 10, current_date) returning id into l_b;

  -- o operador da 24h ve a conta da matriz (lanc_assistencia) e anexa nela
  perform set_config('request.jwt.claim.sub', u_24h::text, false);
  execute 'set local role authenticated';
  insert into anexos_financeiros (lancamento_id, nome_arquivo, url_storage)
    values (l_matriz, 'comp.jpeg', 'x/comp.jpeg');
  select count(*) into n from anexos_financeiros where lancamento_id = l_matriz;
  execute 'reset role';
  assert n = 1, 'a 24h tem de ver o anexo que gravou, viu ' || n;
  raise notice 'OK quem ve o titulo pela 24h anexa nele';

  -- o consultor (sem a 24h) anexa na propria unidade e NAO na vizinha
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  execute 'set local role authenticated';
  insert into anexos_financeiros (lancamento_id, nome_arquivo, url_storage)
    values (l_a, 'a.pdf', 'x/a.pdf');
  recusou := false;
  begin
    insert into anexos_financeiros (lancamento_id, nome_arquivo, url_storage)
      values (l_b, 'b.pdf', 'x/b.pdf');
  exception when insufficient_privilege then recusou := true;
  end;
  select count(*) into n from anexos_financeiros where lancamento_id in (l_matriz, l_b);
  execute 'reset role';
  assert recusou, 'o consultor nao pode anexar no titulo da unidade vizinha';
  assert n = 0, 'o consultor nao pode ver anexo da matriz nem da vizinha, viu ' || n;
  raise notice 'OK o consultor fica na unidade dele';

  raise notice '=== TESTES 0124 PASSARAM ===';
end $$;
