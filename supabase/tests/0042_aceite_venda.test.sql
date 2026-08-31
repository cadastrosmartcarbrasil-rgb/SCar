-- Teste funcional do aceite da proposta no hotlink (0042)
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; v1 uuid; tv uuid; plano uuid; cot uuid; l_id uuid; tok uuid;
  n int; rec record; res record; l leads;
begin
  insert into auth.users (id, email) values (u_adm,'adm@t.com');
  insert into regionais (nome) values ('Smart FML') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  insert into vendedores (nome, regional_id) values ('Amanda Hilario', r1) returning id into v1;
  select id into tv from tipos_veiculo where nome = 'Passeio';
  select id into plano from planos_protecao where nome = 'Plano Ouro';

  -- ------------------------------------------------- captura devolve o token
  select * into res from registrar_captura_hotlink('AMANDA', 'Joao da Silva', '(11) 98888-1111');
  l_id := res.lead_id;
  tok  := res.token_publico;
  assert tok is not null, 'a captura tem de devolver o token da sessao publica';

  select * into rec from lead_por_token_publico(tok);
  assert rec.lead_id = l_id, 'o token localiza o atendimento';
  assert rec.em_negociacao, 'lead novo esta em negociacao';
  assert not rec.aceito, 'ainda sem aceite';

  -- token inventado nao acha nada
  select count(*) into n from lead_por_token_publico(gen_random_uuid());
  assert n = 0, 'token invalido nao pode devolver lead, veio ' || n;
  raise notice 'OK a sessao publica e achada so pelo token';

  -- ------------------------------------------------- a cotacao aceita
  update leads set tipo_veiculo_id = tv, valor_fipe = 60000, placa = 'ABC1D23' where id = l_id;
  insert into cotacoes (lead_id, fipe, tipo_veiculo_id, plano_id, itens,
                        total_mensalidade, participacao, taxa_adesao)
    values (l_id, 60000, tv, plano, '[]'::jsonb, 189.90, 2400, 350)
    returning id into cot;

  -- ------------------------------------------------- validacoes do aceite
  begin
    perform registrar_aceite_venda(l_id, cot, 'CLIENTE', 'Joao', '11144477735');
    assert false, 'nome sem sobrenome deveria ser recusado';
  exception when check_violation then null; end;

  begin
    perform registrar_aceite_venda(l_id, cot, 'CLIENTE', 'Joao da Silva', '11111111111');
    assert false, 'CPF invalido deveria ser recusado';
  exception when check_violation then null; end;

  begin
    perform registrar_aceite_venda(l_id, cot, 'OUTRO', 'Joao da Silva', '11144477735');
    assert false, 'so CLIENTE ou VENDEDOR podem aceitar';
  exception when check_violation then null; end;
  raise notice 'OK o aceite exige nome completo, documento valido e quem aceitou';

  -- cotacao de OUTRO lead nao pode ser aceita aqui
  declare
    l2 uuid; cot2 uuid;
  begin
    insert into leads (nome, celular, regional_id, status) values ('Outro','11955550000', r1, 'NOVO')
      returning id into l2;
    insert into cotacoes (lead_id, fipe, tipo_veiculo_id, itens, total_mensalidade, participacao, taxa_adesao)
      values (l2, 50000, tv, '[]'::jsonb, 150, 2000, 350) returning id into cot2;
    begin
      perform registrar_aceite_venda(l_id, cot2, 'CLIENTE', 'Joao da Silva', '11144477735');
      assert false, 'nao pode aceitar a proposta de outro atendimento';
    exception when check_violation then null; end;
  end;
  raise notice 'OK a proposta aceita tem de ser a deste atendimento';

  -- ------------------------------------------------- aceite valido
  l := registrar_aceite_venda(l_id, cot, 'CLIENTE', 'Joao da Silva', '111.444.777-35',
                              '200.100.50.25', 'Mozilla/5.0');
  assert l.aceite_em is not null, 'gravou a data do aceite';
  assert l.aceite_por = 'CLIENTE', 'quem aceitou';
  assert l.aceite_documento = '11144477735', 'documento so com digitos, veio ' || l.aceite_documento;
  assert l.aceite_ip = '200.100.50.25', 'IP guardado como prova';
  assert l.aceite_cotacao_id = cot, 'qual proposta foi aceita';
  assert l.cpf_cnpj = '11144477735', 'o CPF do aceite completa a ficha';
  assert l.plano_id = plano, 'o plano da cotacao aceita vai para o lead';

  -- Desde o 0043 o aceite NAO pula para a auditoria: ele marca o lead e o
  -- deixa em EM_NEGOCIACAO, para o vendedor ainda ajustar a cotacao.
  assert l.status::text = 'EM_NEGOCIACAO',
    'aceite mantem o lead trabalhavel, veio ' || l.status::text;
  raise notice 'OK o aceite registra e mantem o lead na mao do vendedor';

  -- fica no historico de atribuicao
  select count(*) into n from lead_atribuicoes where lead_id = l_id and motivo = 'ACEITE_CLIENTE';
  assert n = 1, 'o aceite entra na trilha, veio ' || n;

  -- ------------------------------------------------- nao aceita duas vezes
  begin
    perform registrar_aceite_venda(l_id, cot, 'CLIENTE', 'Joao da Silva', '11144477735');
    assert false, 'aceite repetido deveria ser recusado';
  exception when check_violation then null; end;

  select aceito, em_negociacao into rec from lead_por_token_publico(tok);
  assert rec.aceito, 'a pagina publica ve que ja foi aceito';
  raise notice 'OK proposta aceita nao pode ser aceita de novo';

  -- ------------------------------------------------- aceite pelo vendedor
  declare
    l3 uuid; cot3 uuid; res3 record; l3r leads;
  begin
    select * into res3 from registrar_captura_hotlink('AMANDA', 'Maria Souza', '11977776666');
    l3 := res3.lead_id;
    update leads set tipo_veiculo_id = tv, valor_fipe = 40000 where id = l3;
    insert into cotacoes (lead_id, fipe, tipo_veiculo_id, plano_id, itens,
                          total_mensalidade, participacao, taxa_adesao)
      values (l3, 40000, tv, plano, '[]'::jsonb, 149.90, 1800, 350) returning id into cot3;

    l3r := registrar_aceite_venda(l3, cot3, 'VENDEDOR', 'Maria Souza', '11144477735');
    assert l3r.aceite_por = 'VENDEDOR', 'aceite presencial pelo vendedor';
    assert l3r.status::text = 'EM_NEGOCIACAO', 'segue a mesma regra do 0043';
  end;
  raise notice 'OK o vendedor pode colher o aceite presencialmente';

  raise notice '=== TESTES 0042 (aceite da venda) PASSARAM ===';
end $$;
