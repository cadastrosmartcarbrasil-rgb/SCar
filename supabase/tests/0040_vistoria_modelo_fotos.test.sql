-- Teste funcional do modelo de fotos da vistoria (0040)
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_v1  uuid := gen_random_uuid();
  r1 uuid; v1 uuid; l_id uuid; vist uuid; tipo_moto uuid; l_moto uuid;
  n int; rec record; ok_fotos boolean; det text;
begin
  insert into auth.users (id, email) values (u_adm,'adm@t.com'), (u_v1,'v1@t.com');
  insert into regionais (nome) values ('Smart FML') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm@t.com','admin', null),
    (u_v1,'Amanda','v1@t.com','consultor_vendas', r1);

  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  insert into vendedores (usuario_id, nome, regional_id) values (u_v1,'Amanda Hilario', r1)
    returning id into v1;

  -- lead do HOTLINK: sem consultor_id, so com vendedor_id
  insert into leads (nome, celular, regional_id, vendedor_id, origem_hotlink, status)
    values ('Lead do Hotlink','11999990001', r1, v1, 'AMANDA', 'NOVO') returning id into l_id;

  -- ------------------------------------------------------- catalogo de poses
  select count(*) into n from vistoria_fotos_modelo where ativo and obrigatorio;
  assert n = 6, 'o padrao tem 6 poses obrigatorias, veio ' || n;
  select count(*) into n from vistoria_fotos_modelo where ativo;
  assert n = 10, 'o padrao tem 10 poses no total, veio ' || n;

  select count(*) into n from fotos_vistoria_lead(l_id);
  assert n = 10, 'o app recebe a lista inteira de poses, veio ' || n;
  select count(*) into n from fotos_vistoria_lead(l_id) where enviada;
  assert n = 0, 'nada enviado ainda, veio ' || n;
  raise notice 'OK catalogo de poses e a lista do app';

  -- ------------------------------------------------------- fotos por pose
  insert into vistorias (lead_id, tipo, status) values (l_id, 'venda', 'PENDENTE')
    returning id into vist;

  -- quatro fotos DA MESMA POSE nao podem valer como vistoria feita
  insert into vistoria_anexos (vistoria_id, url, tipo) values
    (vist, 'vendas/1.jpg', 'FRENTE'), (vist, 'vendas/2.jpg', 'FRENTE'),
    (vist, 'vendas/3.jpg', 'FRENTE'), (vist, 'vendas/4.jpg', 'FRENTE');

  select ok, detalhe into ok_fotos, det from checklist_lead(l_id)
   where item = 'Fotos obrigatorias da vistoria';
  assert not ok_fotos, 'quatro fotos da mesma pose nao sao uma vistoria';
  assert det like '1 de 6%', 'conta poses distintas, veio ' || det;

  select count(*) into n from fotos_vistoria_lead(l_id) where enviada;
  assert n = 1, 'repetir a pose nao duplica a linha, veio ' || n;
  raise notice 'OK a contagem e de poses, nao de arquivos';

  -- completa as outras cinco obrigatorias
  insert into vistoria_anexos (vistoria_id, url, tipo) values
    (vist, 'vendas/5.jpg', 'TRASEIRA'), (vist, 'vendas/6.jpg', 'LATERAL_ESQUERDA'),
    (vist, 'vendas/7.jpg', 'LATERAL_DIREITA'), (vist, 'vendas/8.jpg', 'CHASSI'),
    (vist, 'vendas/9.jpg', 'HODOMETRO');

  select ok, detalhe into ok_fotos, det from checklist_lead(l_id)
   where item = 'Fotos obrigatorias da vistoria';
  assert ok_fotos, 'com as 6 poses obrigatorias tem de passar: ' || det;
  raise notice 'OK checklist passa com as poses obrigatorias completas';

  -- ------------------------------------------------------- pose por tipo de veiculo
  insert into tipos_veiculo (nome) values ('Motocicleta') returning id into tipo_moto;
  insert into vistoria_fotos_modelo (codigo, nome, instrucao, obrigatorio, ordem, tipo_veiculo_id)
    values ('NUMERO_MOTOR', 'Numero do motor', 'Gravacao do motor da moto', true, 11, tipo_moto);

  insert into leads (nome, celular, regional_id, vendedor_id, tipo_veiculo_id, status)
    values ('Lead Moto','11999990002', r1, v1, tipo_moto, 'NOVO') returning id into l_moto;

  select count(*) into n from fotos_vistoria_lead(l_moto) where codigo = 'NUMERO_MOTOR';
  assert n = 1, 'a moto pede a foto do numero do motor, veio ' || n;
  select count(*) into n from fotos_vistoria_lead(l_id) where codigo = 'NUMERO_MOTOR';
  assert n = 0, 'o carro nao pede a foto exclusiva da moto, veio ' || n;
  raise notice 'OK pose exclusiva de um tipo de veiculo';

  -- ------------------------------------------------------- RLS do vendedor
  -- O lead do hotlink nao tem consultor_id: sem a correcao do 0040 o dono do
  -- link nao enxergaria a propria vistoria.
  perform set_config('request.jwt.claim.sub', u_v1::text, false);
  execute 'set local role authenticated';
  select count(*) into n from vistorias where lead_id = l_id;
  execute 'reset role';
  assert n = 1, 'o vendedor tem de alcancar a vistoria do proprio lead, veio ' || n;

  execute 'set local role authenticated';
  insert into vistoria_anexos (vistoria_id, url, tipo) values (vist, 'vendas/10.jpg', 'MOTOR');
  execute 'reset role';
  select count(*) into n from fotos_vistoria_lead(l_id) where codigo = 'MOTOR' and enviada;
  assert n = 1, 'o vendedor consegue anexar a foto, veio ' || n;
  raise notice 'OK o dono do hotlink faz a vistoria do proprio lead';

  -- ------------------------------------------------- itens que ja vem no plano
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  declare
    plano uuid; prod_a uuid; prod_b uuid;
  begin
    insert into produtos (nome, metodo_preco, valor_fixo, obrigatorio, categoria)
      values ('Carro Reserva 30 dias TESTE', 'FIXO', 45, false, 'BENEFICIO') returning id into prod_a;
    insert into produtos (nome, metodo_preco, valor_fixo, obrigatorio, categoria)
      values ('Vidros Completa TESTE', 'FIXO', 30, false, 'BENEFICIO') returning id into prod_b;
    insert into planos_protecao (nome, taxa_administrativa, cota_participacao, coberturas)
      values ('Diamante TESTE', 0, 0, '{}'::jsonb) returning id into plano;
    insert into plano_produtos (plano_id, produto_id) values (plano, prod_a);

    select count(*) into n from produtos_do_plano(plano);
    assert n = 1, 'o plano leva 1 item amarrado, veio ' || n;
    select produto_id into rec from produtos_do_plano(plano);
    assert rec.produto_id = prod_a, 'e o item certo';

    -- o outro produto NAO esta no plano: continua sendo avulso de verdade
    select count(*) into n from produtos_do_plano(plano) where produto_id = prod_b;
    assert n = 0, 'produto fora do plano nao pode aparecer como incluso';

    -- e ele nao entra em produtos_obrigatorios_cotacao (nao e obrigatorio no
    -- cadastro) — que e exatamente por que a tela precisava desta funcao nova
    select count(*) into n from produtos_obrigatorios_cotacao(tipo_moto, plano, 50000)
     where produto_id = prod_a;
    assert n = 0, 'confirma o buraco que produtos_do_plano preenche';
  end;
  raise notice 'OK a tela sabe o que ja vem no combo';

  raise notice '=== TESTES 0040 (modelo de fotos da vistoria) PASSARAM ===';
end $$;
