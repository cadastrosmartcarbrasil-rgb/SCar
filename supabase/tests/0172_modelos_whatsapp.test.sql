-- Teste funcional da 0172. Prova: (1) quem tem a celula grava o modelo de WhatsApp;
-- (2) qualquer pessoa da equipe le pela RPC (sem ler a tabela); (3) o e-mail nao vem junto;
-- (4) quem nao e equipe nao le; (5) o servidor sem sessao le.
\set ON_ERROR_STOP on
do $$
declare
  fin uuid := gen_random_uuid();
  con uuid := gen_random_uuid();
  cli uuid := gen_random_uuid();
  r1 uuid; n int; j jsonb;
begin
  insert into regionais (nome) values ('Unidade 172') returning id into r1;
  insert into auth.users (id, email) values (fin, 'fin172@t.com'), (con, 'con172@t.com'), (cli, 'cli172@t.com');
  insert into usuarios (id, nome, email, papel, regional_id) values
    (fin, 'Financeiro 172', 'fin172@t.com', 'financeiro', null),
    (con, 'Consultor 172', 'con172@t.com', 'consultor_vendas', r1);

  perform set_config('request.jwt.claim.sub', fin::text, false);
  perform salvar_modelo_comunicacao('WHATSAPP', 'proposta', '{"texto":"Oi {saudacao} {link}"}'::jsonb, 'teste');
  perform salvar_modelo_comunicacao('EMAIL', 'lembrete', '{"assunto":"x"}'::jsonb, null);

  -- consultor: nao le a tabela, mas le pela RPC
  perform set_config('request.jwt.claim.sub', con::text, false);
  execute 'set local role authenticated';
  select count(*) into n from comunicacao_modelos;
  assert n = 0, 'consultor nao le a tabela';
  select count(*) into n from modelos_whatsapp();
  assert n = 1, 'consultor le o WhatsApp pela RPC (sem o e-mail)';
  select textos into j from modelos_whatsapp() where codigo = 'proposta';
  assert j->>'texto' = 'Oi {saudacao} {link}', 'texto gravado';
  execute 'reset role';

  -- quem nao e equipe (associado do portal)
  perform set_config('request.jwt.claim.sub', cli::text, false);
  select count(*) into n from modelos_whatsapp();
  assert n = 0, 'quem nao e equipe nao le';

  -- servidor sem sessao
  perform set_config('request.jwt.claim.sub', '', false);
  select count(*) into n from modelos_whatsapp();
  assert n = 1, 'servidor le';

  raise notice '=== TESTES 0172 (modelos de WhatsApp) PASSARAM ===';
end;
$$;
