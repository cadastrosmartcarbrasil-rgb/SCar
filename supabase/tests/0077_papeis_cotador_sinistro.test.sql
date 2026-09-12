-- Teste funcional da aposentadoria do `cotador` e do papel `sinistro` sobre o
-- EVENTO (0077).
--
-- O que ele tem de provar, e nesta ordem de importancia:
--   1. o SAC NAO quebrou — abrir e ver evento continua sendo de todo staff da
--      unidade (era o risco real desta migration);
--   2. tratar o evento e gastar nele passou a ser do time de sinistro;
--   3. `sinistro` saiu da 24h;
--   4. `cotador` nao entra mais, nem pela porta do servidor.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  u_sin uuid := gen_random_uuid();
  u_sac uuid := gen_random_uuid();   -- atendente comum: consultor_vendas
  u_cot uuid := gen_random_uuid();   -- nasce cotador e tem de sair de la
  u_out uuid := gen_random_uuid();   -- sinistro de OUTRA unidade
  r1 uuid; r2 uuid; c1 uuid; ve1 uuid; ev1 uuid; cot1 uuid; m1 uuid;
  n int; t text; papeis_novos text[];
begin
  -- ------------------------------------------------------------------ setup
  insert into auth.users (id, email) values
    (u_adm,'adm@t.com'), (u_ges,'ges@t.com'), (u_sin,'sin@t.com'),
    (u_sac,'sac@t.com'), (u_cot,'cot@t.com'), (u_out,'out@t.com');
  insert into regionais (nome) values ('Cuiaba') returning id into r1;
  insert into regionais (nome) values ('Natal')  returning id into r2;

  -- O cotador e inserido ANTES da constraint valer? Nao: a constraint ja foi
  -- aplicada pela migration. Entao o proprio insert tem de ser recusado — e e
  -- isso que o teste 4 confere. Aqui ele nasce consultor_vendas.
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm@t.com','admin', null),
    (u_ges,'Gestor','ges@t.com','gestor_regional', r1),
    (u_sin,'Regulador','sin@t.com','sinistro', r1),
    (u_sac,'Atendente','sac@t.com','consultor_vendas', r1),
    (u_cot,'Ex-Cotador','cot@t.com','consultor_vendas', r1),
    (u_out,'Regulador RN','out@t.com','sinistro', r2);

  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Cliente Um','11144477735', r1) returning id into c1;
  insert into veiculos (cliente_id, placa, regional_id, status)
    values (c1,'AAA1A11', r1, 'ativo') returning id into ve1;

  -- ============================================================ 1. O SAC
  -- O associado liga e o atendente registra o evento. Ele NAO e do time de
  -- sinistro, e isto tem de continuar passando: nao existe papel `sac`, e
  -- travar aqui derrubaria o caminho mais comum do modulo.
  perform set_config('request.jwt.claim.sub', u_sac::text, false);
  execute 'set local role authenticated';
  insert into eventos_sinistro (veiculo_id, cliente_id, data_ocorrencia, tipo_evento, regional_id)
    values (ve1, c1, current_date, 'COLISAO', r1) returning id into ev1;
  select count(*) into n from eventos_sinistro;
  execute 'reset role';
  assert ev1 is not null, 'o SAC precisa continuar ABRINDO evento';
  assert n = 1, 'o SAC precisa continuar VENDO o evento, veio ' || n;
  raise notice 'OK abrir e ver evento seguem sendo de todo staff da unidade';

  -- ...mas TRATAR, nao. O update e o corte desta migration.
  perform set_config('request.jwt.claim.sub', u_sac::text, false);
  execute 'set local role authenticated';
  update eventos_sinistro set status = 'EM_ANALISE' where id = ev1;
  execute 'reset role';
  select status::text into t from eventos_sinistro where id = ev1;
  assert t = 'ABERTO', 'atendente comum nao move o evento, veio ' || t;

  -- e nao gasta dinheiro nele
  perform set_config('request.jwt.claim.sub', u_sac::text, false);
  execute 'set local role authenticated';
  begin
    insert into cotacoes_pecas (evento_id, fornecedor_nome, valor_total)
      values (ev1, 'Auto Pecas do Ze', 4200);
    assert false, 'atendente comum nao deveria cotar peca';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  raise notice 'OK tratar o evento e gastar nele saiu do staff generico';

  -- ============================================== 2. O TIME DE SINISTRO
  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  execute 'set local role authenticated';
  update eventos_sinistro set status = 'EM_ANALISE' where id = ev1;
  insert into cotacoes_pecas (evento_id, fornecedor_nome, valor_total)
    values (ev1, 'Auto Pecas do Ze', 4200) returning id into cot1;
  execute 'reset role';
  select status::text into t from eventos_sinistro where id = ev1;
  assert t = 'EM_ANALISE', 'o time de sinistro move o evento, veio ' || t;
  assert cot1 is not null, 'o time de sinistro cota peca';

  -- o gestor da unidade tambem trata (responde pela franquia)
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  execute 'set local role authenticated';
  update eventos_sinistro set status = 'COTACAO_PECAS' where id = ev1;
  execute 'reset role';
  select status::text into t from eventos_sinistro where id = ev1;
  assert t = 'COTACAO_PECAS', 'gestor regional trata o evento da unidade, veio ' || t;
  raise notice 'OK sinistro e gestor tratam o evento';

  -- ===================================== 3. A UNIDADE AINDA SEGURA
  -- `sinistro` nao e passe livre: continua preso a propria unidade.
  perform set_config('request.jwt.claim.sub', u_out::text, false);
  execute 'set local role authenticated';
  update eventos_sinistro set status = 'NEGADO' where id = ev1;
  select count(*) into n from eventos_sinistro;
  execute 'reset role';
  select status::text into t from eventos_sinistro where id = ev1;
  assert t = 'COTACAO_PECAS', 'sinistro de outra unidade nao trata, veio ' || t;
  assert n = 0, 'sinistro de outra unidade nem enxerga, veio ' || n;
  raise notice 'OK o papel nao atravessa a unidade';

  -- ================================ 3-bis. A TRAMITACAO (o caminho da TELA)
  -- `transferir_protocolo` e SECURITY DEFINER: ela nao passa por policy, entao
  -- se a trava nao estiver DENTRO dela o card "Tramitar" contorna tudo o que
  -- foi feito acima. Este bloco e o que prova que a porta nao ficou pela metade.

  -- opinar continua sendo de todo staff da unidade: juridico e vistoria opinam
  -- no sinistro sem serem o time dele
  perform set_config('request.jwt.claim.sub', u_sac::text, false);
  perform transferir_protocolo(ev1, null, 'Cliente enviou o boletim de ocorrencia');
  select status::text into t from eventos_sinistro where id = ev1;
  assert t = 'COTACAO_PECAS', 'parecer nao muda status, veio ' || t;

  -- mas mudar o STATUS pela tramitacao, nao
  begin
    perform transferir_protocolo(ev1, null, 'Vou negar', 'NEGADO');
    assert false, 'atendente comum nao deveria mudar o status pela tramitacao';
  exception when raise_exception then null; end;
  select status::text into t from eventos_sinistro where id = ev1;
  assert t = 'COTACAO_PECAS', 'status intacto depois da recusa, veio ' || t;

  -- o time de sinistro muda
  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  perform transferir_protocolo(ev1, null, 'Peritagem concluida', 'REPARO');
  select status::text into t from eventos_sinistro where id = ev1;
  assert t = 'REPARO', 'o time de sinistro muda o status pela tramitacao, veio ' || t;

  -- e o piso virou a UNIDADE: ate a 0077 bastava `is_staff()`, entao um
  -- atendente de outra franquia tramitava evento alheio pela RPC
  perform set_config('request.jwt.claim.sub', u_out::text, false);
  begin
    perform transferir_protocolo(ev1, null, 'Bisbilhotando');
    assert false, 'staff de outra unidade nao deveria tramitar';
  exception when raise_exception then null; end;
  raise notice 'OK a tramitacao (SECURITY DEFINER) fechou junto com as policies';

  -- ============================================ 4. SINISTRO SAIU DA 24H
  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  assert pode_assistencia() = false, 'sinistro nao opera mais a 24h';
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  assert pode_assistencia() = true, 'gestor regional continua operando a 24h';
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  assert pode_assistencia() = true, 'admin continua operando a 24h';
  raise notice 'OK sinistro saiu da assistencia 24h';

  -- ============================================ 5. COTADOR APOSENTADO
  begin
    insert into usuarios (id, nome, email, papel) values
      (gen_random_uuid(), 'Novo Cotador', 'novo@t.com', 'cotador');
    assert false, 'o banco deveria recusar papel cotador';
  exception when check_violation then null; end;

  begin
    update usuarios set papel = 'cotador' where id = u_cot;
    assert false, 'o banco deveria recusar virar cotador';
  exception when check_violation then null; end;

  select count(*) into n from usuarios where papel::text = 'cotador';
  assert n = 0, 'ninguem sobra como cotador, veio ' || n;
  raise notice 'OK cotador nao entra nem pela porta do servidor';

  -- O MURAL SEGUE AS PESSOAS.
  -- A migracao de `memos.papeis` roda sobre linhas PRE-EXISTENTES, que um banco
  -- recem-criado nao tem — entao o que da para provar aqui e o que importa:
  -- (a) a transformacao nao duplica o papel quando os DOIS ja estavam no
  --     endereco (foi por isso que ela tem `distinct`), e
  -- (b) quem veio do cotador realmente RECEBE o que e endereçado ao destino.
  select array_agg(distinct p) into papeis_novos
    from unnest(array_replace(array['cotador','consultor_vendas','sinistro']::text[],
                              'cotador', 'consultor_vendas')) p;
  assert array_length(papeis_novos, 1) = 2,
    'endereco com os dois papeis nao pode duplicar, veio ' || array_length(papeis_novos, 1);
  assert 'consultor_vendas' = any (papeis_novos) and 'sinistro' = any (papeis_novos),
    'a troca preserva os demais papeis do endereco';

  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  insert into memos (titulo, mensagem, categoria, prioridade, papeis, publicado_por)
    values ('Aviso', 'Corpo do aviso', 'COMUNICADO', 'MEDIA',
            array['consultor_vendas']::text[], u_adm) returning id into m1;

  perform set_config('request.jwt.claim.sub', u_cot::text, false);
  select count(*) into n from memos_do_usuario() where id = m1;
  assert n = 1, 'quem veio do cotador recebe o aviso do destino novo, veio ' || n;
  raise notice 'OK o mural segue as pessoas';

  raise notice '=== TESTES 0077 (papeis: cotador aposentado, sinistro no evento) PASSARAM ===';
end $$;
