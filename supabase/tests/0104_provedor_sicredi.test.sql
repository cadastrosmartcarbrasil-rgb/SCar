-- Teste da 0104: SICREDI e provedor valido e a remessa amarra a integracao escolhida.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  i_sic uuid; i_mock uuid; rem cobranca_remessas;
begin
  assert exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                  where t.typname = 'provedor_banco' and e.enumlabel = 'SICREDI'),
    'provedor_banco deveria ter SICREDI';

  insert into auth.users (id, email) values (u_adm, 'adm104@t.com');
  insert into usuarios (id, nome, email, papel) values (u_adm, 'Admin', 'adm104@t.com', 'admin');
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- Sicredi nao guarda chave na tabela: api_key nula e aceita.
  insert into integracoes_bancarias (nome, provedor, ambiente, api_key, is_padrao, ativo)
    values ('Sicredi', 'SICREDI', 'sandbox', null, true, true) returning id into i_sic;
  assert (select provedor::text from integracoes_bancarias where id = i_sic) = 'SICREDI';

  -- A remessa grava a integracao que a rota escolheu, mesmo havendo outra.
  insert into integracoes_bancarias (nome, provedor, ambiente, is_padrao, ativo)
    values ('Outro', 'OUTRO', 'sandbox', false, true) returning id into i_mock;
  -- (sem titulo elegivel a funcao cria a remessa vazia; so o vinculo importa aqui)
  rem := criar_remessa_cobranca(array[gen_random_uuid()], i_sic, 'teste 0104');
  assert rem.integracao_id = i_sic, 'a remessa deveria apontar para a integracao Sicredi';
  assert rem.total_titulos = 0;

  raise notice '=== TODOS OS TESTES DA 0104 PASSARAM ===';
end $$;
