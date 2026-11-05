-- Teste funcional da 0183. Prova: (1) plano com de-para do Mutual nao se exclui;
-- (2) plano com veiculo nao se exclui e o veiculo NAO perde o plano; (3) a mensagem
-- diz o que esta pendurado; (4) plano sem uso se exclui; (5) o mesmo para tipo de
-- veiculo; (6) inativar continua livre.
\set ON_ERROR_STOP on
do $$
declare
  r1 uuid; c1 uuid; ve uuid;
  p_vinc uuid; p_veic uuid; p_livre uuid;
  t_vinc uuid; t_veic uuid; t_livre uuid;
  msg text; n int;
begin
  insert into regionais (nome) values ('Unidade 183') returning id into r1;
  insert into planos_protecao (nome) values ('PLANO VINC 183') returning id into p_vinc;
  insert into planos_protecao (nome) values ('PLANO VEIC 183') returning id into p_veic;
  insert into planos_protecao (nome) values ('PLANO LIVRE 183') returning id into p_livre;
  insert into tipos_veiculo (nome) values ('TIPO VINC 183') returning id into t_vinc;
  insert into tipos_veiculo (nome) values ('TIPO VEIC 183') returning id into t_veic;
  insert into tipos_veiculo (nome) values ('TIPO LIVRE 183') returning id into t_livre;

  insert into integracao_vinculos (entidade, id_externo, tabela, registro_id)
    values ('PLAN', '88', 'planos_protecao', p_vinc), ('PLAN', '86', 'planos_protecao', p_vinc),
           ('VEHICLE_CATEGORY', '21/1', 'tipos_veiculo', t_vinc);

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, celular)
    values ('PF', 'CLIENTE 183', '52998224725', r1, '65999990000') returning id into c1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, plano_protecao_id, status, cobranca_externa)
    values (c1, 'TST1A73', r1, t_veic, p_veic, 'inativo', true) returning id into ve;

  -- (1) e (3): de-para do Mutual
  begin
    delete from planos_protecao where id = p_vinc;
    assert false, 'plano com de-para nao pode ser excluido';
  exception when foreign_key_violation then
    get stacked diagnostics msg = message_text;
    assert msg like '%PLANO VINC 183%' and msg like '%2 de-para do Mutual%' and msg like '%PLAN 86, PLAN 88%',
      'mensagem nomeia o plano e os de-paras: ' || msg;
  end;

  -- (2): veiculo
  begin
    delete from planos_protecao where id = p_veic;
    assert false, 'plano com veiculo nao pode ser excluido';
  exception when foreign_key_violation then
    get stacked diagnostics msg = message_text;
    assert msg like '%1 veiculo(s)%', 'mensagem conta os veiculos: ' || msg;
  end;
  select count(*) into n from veiculos where id = ve and plano_protecao_id = p_veic;
  assert n = 1, 'o veiculo nao perdeu o plano';

  -- (4): sem uso
  delete from planos_protecao where id = p_livre;
  select count(*) into n from planos_protecao where id = p_livre;
  assert n = 0, 'plano sem uso se exclui';

  -- (5): tipo de veiculo
  begin
    delete from tipos_veiculo where id = t_vinc;
    assert false, 'tipo com de-para nao pode ser excluido';
  exception when foreign_key_violation then null;
  end;
  begin
    delete from tipos_veiculo where id = t_veic;
    assert false, 'tipo com veiculo nao pode ser excluido';
  exception when foreign_key_violation then null;
  end;
  select count(*) into n from veiculos where id = ve and tipo_veiculo_id = t_veic;
  assert n = 1, 'o veiculo nao perdeu o tipo';
  delete from tipos_veiculo where id = t_livre;
  select count(*) into n from tipos_veiculo where id = t_livre;
  assert n = 0, 'tipo sem uso se exclui';

  -- (6): inativar segue livre
  update planos_protecao set ativo = false where id = p_vinc;
  select count(*) into n from planos_protecao where id = p_vinc and not ativo;
  assert n = 1, 'inativar o plano em uso continua permitido';

  -- religar o de-para libera a exclusao
  delete from integracao_vinculos where registro_id = p_vinc;
  delete from planos_protecao where id = p_vinc;
  select count(*) into n from planos_protecao where id = p_vinc;
  assert n = 0, 'sem o de-para, o plano se exclui';

  raise notice '=== TESTES 0183 (exclusao de cadastro em uso) PASSARAM ===';
end;
$$;
