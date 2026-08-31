-- Teste funcional do cadastro completo do vendedor (0035)
\set ON_ERROR_STOP on
do $$
declare
  u_id uuid := gen_random_uuid();
  u2   uuid := gen_random_uuid();
  r_id uuid; v1 uuid; v2 uuid; v3 uuid;
  n int; v_txt text; rec record;
begin
  insert into auth.users (id, email) values (u_id, 'adm@t.com'), (u2, 'joao@t.com');
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente,
                         dia_pagto_entrada_padrao, dia_pagto_recorrencia_padrao)
    values ('Smart FML', 1.0, 0.15, 5, 10) returning id into r_id;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_id, 'Admin', 'adm@t.com', 'admin', r_id),
           (u2, 'Joao Portal', 'joao@t.com', 'consultor_vendas', r_id);
  perform set_config('request.jwt.claim.sub', u_id::text, false);

  -- ------------------------------------------------- cadastro sem usuario
  insert into vendedores (nome, email, telefone, regional_id,
                          taxa_comissao_adesao, taxa_comissao_recorrente, chave_pix)
    values ('Amanda Angelo Hilario', 'amanda@t.com', '(65) 99999-0001', r_id, 1.0, 0.05, 'amanda@pix')
    returning id into v1;
  assert (select usuario_id from vendedores where id = v1) is null,
    'vendedor deve poder existir sem acesso ao portal';
  raise notice 'OK vendedor cadastrado antes de ter acesso ao portal';

  -- ------------------------------------------------- codigo automatico
  select codigo into v_txt from vendedores where id = v1;
  assert v_txt = 'AMANDA', 'codigo deveria sair do primeiro nome, veio ' || v_txt;

  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('Amanda Souza', r_id, 0, 0) returning id into v2;
  select codigo into v_txt from vendedores where id = v2;
  assert v_txt = 'AMANDA2', 'codigo repetido deveria ganhar sufixo, veio ' || v_txt;
  raise notice 'OK codigo gerado do nome e desambiguado';

  -- acento e espaco nao entram no codigo
  insert into vendedores (nome, regional_id) values ('Clisthoffer da Silva', r_id) returning id into v3;
  assert (select codigo from vendedores where id = v3) = 'CLISTHOFFER', 'codigo com acento/limpeza';

  -- ------------------------------------------------- nome herdado do usuario
  update vendedores set usuario_id = u2, nome = '' where id = v3;
  assert (select nome from vendedores where id = v3) = 'Joao Portal',
    'sem nome proprio, herda o do usuario do portal';
  raise notice 'OK nome herdado do usuario quando em branco';

  -- ------------------------------------------------- teto da comissao segue valendo (0034)
  begin
    update vendedores set taxa_comissao_recorrente = 0.99 where id = v1;
    raise exception 'FALHOU: passou o teto da regional';
  exception when check_violation then
    raise notice 'OK teto da franquia continua valendo no cadastro completo';
  end;

  -- ------------------------------------------------- prazo herdado da franquia
  select * into rec from prazo_pagamento_vendedor(v1);
  assert rec.dia_entrada = 5 and rec.dia_recorrencia = 10, 'deveria herdar o padrao da franquia';
  assert rec.entrada_herdada and rec.recorrencia_herdada, 'deveria marcar como herdado';

  update vendedores set dia_pagto_recorrencia = 20 where id = v1;
  select * into rec from prazo_pagamento_vendedor(v1);
  assert rec.dia_recorrencia = 20 and not rec.recorrencia_herdada, 'o dia proprio tem de vencer o padrao';
  assert rec.dia_entrada = 5 and rec.entrada_herdada, 'o que nao foi definido continua herdado';
  raise notice 'OK prazo de pagamento proprio x padrao da franquia';

  -- dia invalido e recusado
  begin
    update vendedores set dia_pagto_entrada = 9 where id = v1;
    raise exception 'FALHOU: aceitou dia da semana 9';
  exception when check_violation then
    raise notice 'OK dia da semana fora de 1..7 e recusado';
  end;

  -- ------------------------------------------------- listagem da tela
  select count(*) into n from listar_vendedores();
  assert n = 3, 'listar_vendedores deveria trazer os 3, veio ' || n;

  select * into rec from listar_vendedores(null, 'amanda@t.com');
  assert rec.codigo = 'AMANDA', 'busca por e-mail';
  assert rec.regional_nome = 'Smart FML', 'a lista precisa trazer a franquia';
  assert rec.teto_adesao = 1.0 and rec.teto_recorrente = 0.15, 'a lista precisa trazer o teto herdado';
  assert not rec.tem_portal, 'Amanda ainda nao tem acesso ao portal';
  raise notice 'OK listagem com franquia, teto e situacao do portal';

  select * into rec from listar_vendedores(null, 'CLISTHOFFER');
  assert rec.tem_portal, 'quem tem usuario vinculado deve aparecer com portal';

  -- ------------------------------------------------- hotlink
  select count(*) into n from vendedor_por_codigo('amanda');
  assert n = 1, 'hotlink deve achar o vendedor pelo codigo, sem diferenciar caixa';

  update vendedores set ativo = false where id = v1;
  select count(*) into n from vendedor_por_codigo('AMANDA');
  assert n = 0, 'hotlink de vendedor inativo nao pode resolver';
  raise notice 'OK hotlink resolve por codigo e ignora inativo';

  raise notice '=== TESTES 0035 (cadastro completo do vendedor) PASSARAM ===';
end $$;
