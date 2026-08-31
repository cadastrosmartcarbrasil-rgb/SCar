-- Teste funcional do portal do vendedor (0038)
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  u_v1  uuid := gen_random_uuid();
  u_v2  uuid := gen_random_uuid();
  r1 uuid; v1 uuid; v2 uuid; c1 uuid; ve1 uuid; l_hot uuid; l_novo uuid;
  n int; v_num numeric; rec record;
begin
  -- ------------------------------------------------------------------ setup
  insert into auth.users (id, email) values
    (u_adm,'adm@t.com'), (u_ges,'ges@t.com'), (u_v1,'v1@t.com'), (u_v2,'v2@t.com');
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente,
                         dia_pagto_entrada_padrao, dia_pagto_recorrencia_padrao)
    values ('Smart FML', 1.0, 0.15, 5, 20) returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm@t.com','admin', null),
    (u_ges,'Gestor','ges@t.com','gestor_regional', r1),
    (u_v1,'Amanda Hilario','v1@t.com','consultor_vendas', r1),
    (u_v2,'Bruno Costa','v2@t.com','consultor_vendas', r1);

  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  insert into vendedores (usuario_id, nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente)
    values (u_v1,'Amanda Hilario', r1, 1.0, 0.05) returning id into v1;
  insert into vendedores (usuario_id, nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente,
                          dia_pagto_recorrencia)
    values (u_v2,'Bruno Costa', r1, 1.0, 0.03, 28) returning id into v2;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Cliente Um','11144477735', r1) returning id into c1;
  insert into veiculos (cliente_id, placa, regional_id, vendedor_id, status)
    values (c1,'AAA1A11', r1, v1, 'ativo') returning id into ve1;

  -- lead do HOTLINK: chega sem consultor_id (quem cria e o service_role)
  insert into leads (nome, celular, regional_id, vendedor_id, origem_hotlink, status)
    values ('Lead do Hotlink','11999990001', r1, v1, 'AMANDA', 'NOVO') returning id into l_hot;
  -- lead convertido da Amanda
  insert into leads (nome, celular, regional_id, vendedor_id, status, veiculo_id)
    values ('Lead Convertido','11999990002', r1, v1, 'ATIVO', ve1);
  -- lead do Bruno, que a Amanda nao pode ver
  insert into leads (nome, celular, regional_id, vendedor_id, status)
    values ('Lead do Bruno','11999990003', r1, v2, 'NOVO');

  insert into comissoes_vendas (vendedor_id, veiculo_id, valor_comissao, is_adesao, status_pagamento)
    values (v1, ve1, 500, true, 'pendente');
  insert into comissoes_vendas (vendedor_id, veiculo_id, valor_comissao, is_adesao, status_pagamento)
    values (v1, ve1, 120, false, 'pago');
  insert into comissoes_vendas (vendedor_id, valor_comissao, is_adesao, status_pagamento)
    values (v2, 300, true, 'pendente');

  -- ========================================================== identidade
  perform set_config('request.jwt.claim.sub', u_v1::text, false);
  assert vendedor_atual() = v1, 'vendedor_atual deveria resolver pelo usuario logado';

  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  assert vendedor_atual() is null, 'quem nao e vendedor nao tem vendedor_atual';
  raise notice 'OK vendedor_atual resolve pelo login';

  -- ========================================================== painel
  perform set_config('request.jwt.claim.sub', u_v1::text, false);
  select * into rec from vendedor_painel(current_date - 1, current_date + 1);
  assert rec.vendedor_id = v1, 'painel do proprio vendedor';
  assert rec.leads_periodo = 2, 'leads da Amanda, veio ' || rec.leads_periodo;
  assert rec.leads_hotlink = 1, 'leads pelo hotlink, veio ' || rec.leads_hotlink;
  assert rec.leads_convertidos = 1, 'convertidos, veio ' || rec.leads_convertidos;
  assert rec.leads_abertos = 1, 'em aberto, veio ' || rec.leads_abertos;
  assert rec.taxa_conversao = 50.0, 'taxa de conversao, veio ' || rec.taxa_conversao;
  assert rec.comissao_pendente = 500, 'comissao pendente, veio ' || rec.comissao_pendente;
  assert rec.comissao_paga = 120, 'comissao paga no periodo, veio ' || rec.comissao_paga;
  -- dia herdado da franquia (a Amanda nao definiu o proprio)
  assert rec.dia_entrada = 5, 'dia de entrada herdado da franquia, veio ' || rec.dia_entrada;
  assert rec.dia_recorrencia = 20, 'dia de recorrencia herdado, veio ' || rec.dia_recorrencia;
  raise notice 'OK painel do vendedor';

  -- ========================================================== leads e comissoes
  select count(*) into n from vendedor_leads();
  assert n = 2, 'so os leads da Amanda, veio ' || n;
  select count(*) into n from vendedor_leads('NOVO');
  assert n = 1, 'filtro por status, veio ' || n;
  select count(*) into n from vendedor_leads(null, 'Bruno');
  assert n = 0, 'busca nao alcanca lead de outro vendedor, veio ' || n;

  select count(*) into n from vendedor_comissoes();
  assert n = 2, 'comissoes da Amanda, veio ' || n;
  select coalesce(sum(valor_comissao),0) into v_num from vendedor_comissoes('pendente');
  assert v_num = 500, 'comissao pendente da Amanda, veio ' || v_num;
  raise notice 'OK leads e comissoes so do proprio vendedor';

  -- ========================================================== ISOLAMENTO
  -- Bruno logado: as mesmas RPCs devolvem a carteira DELE, sem parametro nenhum
  perform set_config('request.jwt.claim.sub', u_v2::text, false);
  select count(*) into n from vendedor_leads();
  assert n = 1, 'Bruno so ve o proprio lead, veio ' || n;
  select coalesce(sum(valor_comissao),0) into v_num from vendedor_comissoes();
  assert v_num = 300, 'comissao do Bruno, veio ' || v_num;

  -- Consulta DIRETA na tabela (sem RPC): a RLS tambem tem de segurar.
  -- O harness roda como dono das tabelas, que ignora RLS — por isso o teste
  -- assume o papel `authenticated`, que e como o app chega no banco.
  execute 'set local role authenticated';
  select count(*) into n from leads;
  execute 'reset role';
  assert n = 1, 'RLS: vendedor le so a propria carteira, veio ' || n;
  raise notice 'OK um vendedor nao alcanca a carteira do outro (RPC e RLS)';

  -- o gestor da unidade continua vendo tudo
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  execute 'set local role authenticated';
  select count(*) into n from leads;
  execute 'reset role';
  assert n = 3, 'gestor regional continua vendo a unidade inteira, veio ' || n;
  raise notice 'OK gestor da franquia mantem a visao da unidade';

  -- ========================================================== novo lead
  perform set_config('request.jwt.claim.sub', u_v2::text, false);
  l_novo := vendedor_criar_lead('Interessada Nova', '(11) 98888-7777', null, 'bbb2b22');
  select vendedor_id, regional_id, placa, status::text into rec from leads where id = l_novo;
  assert rec.vendedor_id = v2, 'o lead nasce amarrado a quem cadastrou';
  assert rec.regional_id = r1, 'e na franquia do vendedor';
  assert rec.placa = 'BBB2B22', 'placa normalizada, veio ' || rec.placa;
  assert rec.status = 'NOVO', 'status inicial';

  begin
    perform vendedor_criar_lead('Sem telefone', '123');
    assert false, 'celular invalido deveria ser recusado';
  exception when check_violation then null; end;
  raise notice 'OK novo lead pelo portal nasce no proprio vendedor';

  -- ========================================================== perfil
  select * into rec from vendedor_perfil();
  assert rec.id = v2, 'perfil do proprio vendedor';
  assert rec.teto_recorrente = 0.15, 'teto herdado da franquia, veio ' || rec.teto_recorrente;
  assert rec.taxa_recorrente = 0.03, 'a propria comissao, veio ' || rec.taxa_recorrente;
  assert rec.dia_recorrencia = 28, 'dia proprio vence o padrao, veio ' || rec.dia_recorrencia;
  assert rec.recorrencia_herdada = false, 'dia proprio nao e herdado';

  perform vendedor_atualizar_perfil('(11) 97777-6666', 'Nubank', '0001', '12345-6', 'v2@t.com');
  select telefone, chave_pix, taxa_comissao_recorrente into rec from vendedores where id = v2;
  assert rec.telefone = '(11) 97777-6666', 'telefone atualizado';
  assert rec.chave_pix = 'v2@t.com', 'chave pix atualizada';
  assert rec.taxa_comissao_recorrente = 0.03, 'a comissao NAO pode mudar por aqui';

  -- E pela tabela? A RLS de vendedores so deixa admin/gestor escrever.
  execute 'set local role authenticated';
  update vendedores set taxa_comissao_recorrente = 0.15 where id = v2;
  execute 'reset role';
  select taxa_comissao_recorrente into v_num from vendedores where id = v2;
  assert v_num = 0.03, 'RLS: vendedor nao pode aumentar a propria comissao, veio ' || v_num;
  raise notice 'OK vendedor edita contato/banco, nunca a propria comissao';

  raise notice '=== TESTES 0038 (portal do vendedor) PASSARAM ===';
end $$;
