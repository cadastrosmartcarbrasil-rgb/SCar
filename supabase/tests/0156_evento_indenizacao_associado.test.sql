-- Teste funcional da 0156: indenizacao ao proprio associado na conta a pagar
-- do evento. Prova: (1) o associado DO EVENTO e aceito como favorecido;
-- (2) outro associado e recusado; (3) sem favorecido nenhum segue recusado;
-- (4) fornecedor continua valendo; (5) tirar o associado de uma conta que o
-- tinha e recusado.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; c1 uuid; c2 uuid; ve1 uuid; ev1 uuid; f1 uuid; l1 uuid;
begin
  insert into auth.users (id, email) values (u_adm,'adm156@t.com');
  insert into regionais (nome) values ('Cuiaba 156') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm156@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Associado Furtado','52998224725', r1) returning id into c1;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Outro Associado','11144477735', r1) returning id into c2;
  insert into veiculos (cliente_id, placa, regional_id, status)
    values (c1,'IND1A56', r1, 'ativo') returning id into ve1;
  insert into eventos_sinistro (veiculo_id, cliente_id, data_ocorrencia, tipo_evento, regional_id)
    values (ve1, c1, current_date, 'FURTO', r1) returning id into ev1;
  insert into fornecedores (tipo_pessoa, documento, razao_social)
    values ('PJ','11222333000181','Funilaria 156') returning id into f1;

  -- (1) o associado do evento e o favorecido
  insert into lancamentos_financeiros (tipo, descricao, evento_id, cliente_id, regional_id, valor_original, data_vencimento)
    values ('DESPESA', 'Indenizacao', ev1, c1, r1, 18673, current_date) returning id into l1;
  assert l1 is not null, '(1) indenizacao ao associado do evento e aceita';

  -- (2) outro associado nao
  begin
    insert into lancamentos_financeiros (tipo, descricao, evento_id, cliente_id, regional_id, valor_original, data_vencimento)
      values ('DESPESA', 'Indenizacao errada', ev1, c2, r1, 100, current_date);
    assert false, '(2) associado de fora do evento deveria ser recusado';
  exception when raise_exception then null; end;

  -- (3) sem favorecido segue recusado
  begin
    insert into lancamentos_financeiros (tipo, descricao, evento_id, regional_id, valor_original, data_vencimento)
      values ('DESPESA', 'sem favorecido', ev1, r1, 100, current_date);
    assert false, '(3) sem favorecido deveria ser recusado';
  exception when raise_exception then null; end;

  -- (4) fornecedor continua valendo, mesmo com o associado preenchido junto
  insert into lancamentos_financeiros (tipo, descricao, evento_id, fornecedor_id, cliente_id, regional_id, valor_original, data_vencimento)
    values ('DESPESA', 'Reparo', ev1, f1, c2, r1, 500, current_date);

  -- (5) tirar o associado da indenizacao e recusado
  begin
    update lancamentos_financeiros set cliente_id = null where id = l1;
    assert false, '(5) tirar o favorecido deveria ser recusado';
  exception when raise_exception then null; end;

  raise notice '=== 0156 indenizacao ao associado: TODOS OS TESTES PASSARAM ===';
end $$;
