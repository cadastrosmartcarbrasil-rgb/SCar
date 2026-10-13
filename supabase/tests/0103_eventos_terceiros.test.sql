-- Teste funcional da 0103: terceiros do evento e favorecido nas compras.
--
-- O que ele tem de provar:
--   1. o vinculo "Terceiro do Evento X do Associado Y" e do BANCO: o terceiro
--      herda o associado do evento mesmo que a tela mande outro, ganha codigo
--      <protocolo>-T01.., nao troca de evento e acompanha o evento;
--   2. o recorte da 0077: atendente CADASTRA (abrir e atendimento), so quem
--      TRATA o evento altera; outra unidade e o associado do portal nao veem;
--   3. conta a pagar de evento sem favorecido e recusada; fornecedor OU
--      terceiro resolvem; titulo legado continua recebendo baixa.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_sin uuid := gen_random_uuid();
  u_sac uuid := gen_random_uuid();   -- atendente comum (consultor_vendas)
  u_out uuid := gen_random_uuid();   -- sinistro de OUTRA unidade
  u_cli uuid := gen_random_uuid();   -- associado no portal
  r1 uuid; r2 uuid; c1 uuid; c2 uuid; ve1 uuid; ve2 uuid; ev1 uuid; ev2 uuid;
  t1 uuid; t2 uuid; t3 uuid; f1 uuid; l1 uuid; l2 uuid; leg uuid;
  n int; t text; protocolo text;
begin
  -- ------------------------------------------------------------------ setup
  insert into auth.users (id, email) values
    (u_adm,'adm103@t.com'), (u_sin,'sin103@t.com'), (u_sac,'sac103@t.com'),
    (u_out,'out103@t.com'), (u_cli,'cli103@t.com');
  insert into regionais (nome) values ('Cuiaba 103') returning id into r1;
  insert into regionais (nome) values ('Natal 103')  returning id into r2;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm103@t.com','admin', null),
    (u_sin,'Regulador','sin103@t.com','sinistro', r1),
    (u_sac,'Atendente','sac103@t.com','consultor_vendas', r1),
    (u_out,'Regulador RN','out103@t.com','sinistro', r2);

  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, auth_user_id)
    values ('PF','Associado Y','52998224725', r1, u_cli) returning id into c1;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Outro Associado','11144477735', r1) returning id into c2;
  insert into veiculos (cliente_id, placa, regional_id, status)
    values (c1,'TRC1A03', r1, 'ativo') returning id into ve1;
  insert into veiculos (cliente_id, placa, regional_id, status)
    values (c2,'TRC2A03', r1, 'ativo') returning id into ve2;
  insert into eventos_sinistro (veiculo_id, cliente_id, data_ocorrencia, tipo_evento, regional_id)
    values (ve1, c1, current_date, 'COLISAO', r1) returning id, numero_protocolo into ev1, protocolo;
  insert into eventos_sinistro (veiculo_id, cliente_id, data_ocorrencia, tipo_evento, regional_id)
    values (ve2, c2, current_date, 'COLISAO', r1) returning id into ev2;
  insert into fornecedores (tipo_pessoa, documento, razao_social)
    values ('PJ','11222333000181','Funilaria 103') returning id into f1;

  -- ================================================= 1. O VINCULO E DO BANCO
  -- O atendente registra a ligacao e anota a outra parte (abrir e atendimento).
  -- A tela manda o associado ERRADO de proposito: o banco corrige.
  perform set_config('request.jwt.claim.sub', u_sac::text, false);
  execute 'set local role authenticated';
  insert into evento_terceiros (evento_id, cliente_id, nome, cpf_cnpj, papel, veiculo_placa)
    values (ev1, c2, 'Fulano Terceiro', '111.444.777-35', 'VITIMA', 'xyz-9a87') returning id into t1;
  insert into evento_terceiros (evento_id, cliente_id, nome)
    values (ev1, c1, 'Ciclano Terceiro') returning id into t2;
  execute 'reset role';

  select count(*) into n from evento_terceiros
   where evento_id = ev1 and cliente_id = c1 and regional_id = r1;
  assert n = 2, 'o terceiro herda associado e unidade DO EVENTO, vieram ' || n;
  select codigo into t from evento_terceiros where id = t1;
  assert t = protocolo || '-T01', 'codigo do 1o terceiro, veio ' || t;
  select codigo into t from evento_terceiros where id = t2;
  assert t = protocolo || '-T02', 'codigo do 2o terceiro, veio ' || t;
  select cpf_cnpj || '/' || veiculo_placa into t from evento_terceiros where id = t1;
  assert t = '11144477735/XYZ9A87', 'documento e placa normalizados, veio ' || t;
  assert (select possui_terceiros from eventos_sinistro where id = ev1), 'evento marcado com terceiros';
  select count(*) into n from historico_protocolo where evento_id = ev1 and acao_realizada = 'TERCEIRO';
  assert n = 2, 'cada cadastro de terceiro vai ao historico, vieram ' || n;
  raise notice 'OK terceiro amarrado ao Evento X do Associado Y pelo banco';

  begin
    insert into evento_terceiros (evento_id, cliente_id, nome, cpf_cnpj) values (ev1, c1, 'X', '12345678900');
    assert false, 'CPF invalido deveria ser recusado';
  exception when check_violation then null; end;

  begin
    update evento_terceiros set evento_id = ev2 where id = t1;
    assert false, 'terceiro nao pode trocar de evento';
  exception when raise_exception then null; end;

  -- o associado do evento mudou (correcao de cadastro): o terceiro acompanha
  update eventos_sinistro set cliente_id = c2 where id = ev1;
  select count(*) into n from evento_terceiros where evento_id = ev1 and cliente_id = c2;
  assert n = 2, 'terceiros acompanham o associado do evento, vieram ' || n;
  update eventos_sinistro set cliente_id = c1 where id = ev1;
  raise notice 'OK documento invalido, troca de evento e associado divergente barrados';

  -- ======================================================= 2. O RECORTE 0077
  -- atendente NAO altera (tratar e do time)
  perform set_config('request.jwt.claim.sub', u_sac::text, false);
  execute 'set local role authenticated';
  update evento_terceiros set status = 'INDENIZADO' where id = t1;
  execute 'reset role';
  select status::text into t from evento_terceiros where id = t1;
  assert t = 'EM_ANALISE', 'atendente comum nao trata o terceiro, veio ' || t;

  -- o time de sinistro altera, e a mudanca de status vai ao historico
  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  execute 'set local role authenticated';
  update evento_terceiros set status = 'EM_REPARO' where id = t1;
  execute 'reset role';
  select status::text into t from evento_terceiros where id = t1;
  assert t = 'EM_REPARO', 'o time de sinistro trata o terceiro, veio ' || t;
  select count(*) into n from historico_protocolo where evento_id = ev1 and acao_realizada = 'TERCEIRO_STATUS';
  assert n = 1, 'mudanca de status do terceiro no historico, vieram ' || n;

  -- outra unidade nao ve nem cadastra
  perform set_config('request.jwt.claim.sub', u_out::text, false);
  execute 'set local role authenticated';
  select count(*) into n from evento_terceiros;
  begin
    insert into evento_terceiros (evento_id, cliente_id, nome) values (ev1, c1, 'Intruso');
    assert false, 'outra unidade nao deveria cadastrar terceiro';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  assert n = 0, 'outra unidade nao ve terceiro, viu ' || n;

  -- o associado ve o proprio evento no portal, mas NAO a outra parte (LGPD)
  perform set_config('request.jwt.claim.sub', u_cli::text, false);
  execute 'set local role authenticated';
  select count(*) into n from evento_terceiros;
  execute 'reset role';
  assert n = 0, 'associado do portal nao ve dados do terceiro, viu ' || n;
  raise notice 'OK atendente cadastra, so quem trata altera; unidade vizinha e portal nao veem';

  -- ================================================== 3. FAVORECIDO OBRIGATORIO
  perform set_config('request.jwt.claim.sub', u_sin::text, false);
  execute 'set local role authenticated';
  begin
    insert into lancamentos_financeiros (tipo, descricao, evento_id, regional_id, valor_original, data_vencimento)
      values ('DESPESA', 'sem favorecido', ev1, r1, 100, current_date);
    assert false, 'conta a pagar de evento sem favorecido deveria ser recusada';
  exception when raise_exception then null; end;

  insert into lancamentos_financeiros (tipo, descricao, evento_id, fornecedor_id, evento_terceiro_id, regional_id, valor_original, data_vencimento)
    values ('DESPESA', 'funilaria do terceiro', ev1, f1, t1, r1, 1500, current_date) returning id into l1;
  -- indenizacao: sem fornecedor, o favorecido e o terceiro; o evento vem do terceiro
  insert into lancamentos_financeiros (tipo, descricao, evento_terceiro_id, regional_id, valor_original, data_vencimento)
    values ('DESPESA', 'indenizacao', t2, r1, 500, current_date) returning id into l2;
  -- receita (participacao do associado) nao exige favorecido
  insert into lancamentos_financeiros (tipo, descricao, evento_id, regional_id, valor_original, data_vencimento)
    values ('RECEITA', 'participacao', ev1, r1, 50, current_date);

  begin
    insert into lancamentos_financeiros (tipo, descricao, evento_id, evento_terceiro_id, regional_id, valor_original, data_vencimento)
      values ('DESPESA', 'terceiro de outro evento', ev2, t1, r1, 1, current_date);
    assert false, 'terceiro de outro evento deveria ser recusado';
  exception when raise_exception then null; end;

  begin
    update lancamentos_financeiros set fornecedor_id = null, evento_terceiro_id = null where id = l1;
    assert false, 'tirar o favorecido de conta do evento deveria ser recusado';
  exception when raise_exception then null; end;
  execute 'reset role';

  select evento_id::text into t from lancamentos_financeiros where id = l2;
  assert t = ev1::text, 'indenizacao herda o evento do terceiro';

  -- legado (antes da 0103): conta de evento sem favorecido continua recebendo baixa
  alter table lancamentos_financeiros disable trigger trg_lanc_evento_favorecido;
  insert into lancamentos_financeiros (tipo, descricao, evento_id, regional_id, valor_original, data_vencimento)
    values ('DESPESA', 'legado', ev1, r1, 80, current_date) returning id into leg;
  alter table lancamentos_financeiros enable trigger trg_lanc_evento_favorecido;
  insert into baixas_financeiras (lancamento_id, valor_pago) values (leg, 80);
  select status::text into t from lancamentos_financeiros where id = leg;
  assert t = 'quitado', 'titulo legado sem favorecido segue quitando, veio ' || t;

  -- terceiro com dinheiro lancado nao some
  begin
    delete from evento_terceiros where id = t2;
    assert false, 'terceiro com lancamento nao pode ser apagado';
  exception when foreign_key_violation then null; end;
  raise notice 'OK conta a pagar do evento sempre tem favorecido (fornecedor ou terceiro)';

  -- ===================================================== a unidade acompanha
  update eventos_sinistro set regional_id = r2 where id = ev1;
  select count(*) into n from evento_terceiros where evento_id = ev1 and regional_id = r2;
  assert n = 2, 'terceiros acompanham a unidade do evento, vieram ' || n;
  raise notice 'OK a unidade do evento leva os terceiros junto';
  raise notice 'TODOS OS TESTES DA 0103 PASSARAM';
end $$;
