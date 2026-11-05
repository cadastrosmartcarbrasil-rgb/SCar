-- Teste funcional da 0184. Prova: (1) a tela lista os produtos do Mutual dos
-- migrados com o peso; (2) o de-para grava OPCIONAL/BASE/IGNORAR e recusa
-- OPCIONAL sem produto; (3) aplicar so simula sem confirmar; (4) aplicar grava
-- o opcional, pula o que o plano traz e o que nao atende o tipo; (5) e
-- re-executavel e nunca apaga opcional do SCar; (6) quem nao e matriz e recusado.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  r1 uuid; tv uuid; tmoto uuid; pl uuid; c1 uuid; v1 uuid; v2 uuid;
  p_res uuid; p_vid uuid; p_moto uuid; p_scar uuid;
  rec record; n bigint;
begin
  insert into auth.users (id, email) values (u_adm, 'adm184@t.com'), (u_ges, 'ges184@t.com');
  insert into regionais (nome) values ('U184') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm, 'Admin 184', 'adm184@t.com', 'admin', null),
    (u_ges, 'Gestor 184', 'ges184@t.com', 'gestor_regional', r1);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  select id into tmoto from tipos_veiculo where nome ilike 'moto%' limit 1;
  insert into planos_protecao (nome) values ('ESSENCIAL 184') returning id into pl;
  insert into produtos (nome, valor_fixo) values ('Carro Reserva 184', 30) returning id into p_res;
  insert into produtos (nome, valor_fixo) values ('Vidros 184', 20) returning id into p_vid;
  insert into produtos (nome, valor_fixo) values ('Terceiros Moto 184', 15) returning id into p_moto;
  insert into produtos (nome, valor_fixo) values ('Saude 184', 5) returning id into p_scar;
  insert into plano_produtos (plano_id, produto_id) values (pl, p_vid);          -- o plano ja traz vidros
  insert into produto_tipos_veiculo (produto_id, tipo_veiculo_id) values (p_moto, tmoto);  -- so moto

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, celular)
    values ('PF', 'MIGRADO 184', '52998224725', r1, '65999990000') returning id into c1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, plano_protecao_id, status, cobranca_externa)
    values (c1, 'MUT1A84', r1, tv, pl, 'ativo', true) returning id into v1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, plano_protecao_id, status, cobranca_externa)
    values (c1, 'MUT2B84', r1, tv, pl, 'inativo', true) returning id into v2;
  insert into veiculo_produtos (veiculo_id, produto_id) values (v1, p_scar);   -- incluido aqui no SCar

  insert into integracao_vinculos (entidade, id_externo, tabela, registro_id) values
    ('CONTRACT_OBJECT', '9001', 'veiculos', v1), ('CONTRACT_OBJECT', '9002', 'veiculos', v2);
  insert into mutual_captura (entidade, id_externo, payload) values
    ('CONTRACT_OBJECT_PRODUCT', '9001', jsonb_build_object('contract_object_id', '9001', 'products', jsonb_build_array(
       jsonb_build_object('product_id', 10, 'product_name', 'Taxa Administrativa'),
       jsonb_build_object('product_id', 20, 'product_name', 'Carros Reserva'),
       jsonb_build_object('product_id', 30, 'product_name', 'Vidros'),
       jsonb_build_object('product_id', 40, 'product_name', 'B-PROTECAO TERCEIRO MOTO')))),
    ('CONTRACT_OBJECT_PRODUCT', '9002', jsonb_build_object('contract_object_id', '9002', 'products', jsonb_build_array(
       jsonb_build_object('product_id', 20, 'product_name', 'Carros Reserva'))));

  -- (1) a tela
  select count(*) into n from mutual_produtos_externos(r1);
  assert n = 4, 'quatro produtos do Mutual na unidade';
  select * into rec from mutual_produtos_externos(r1) where chave = 'sem_nivel:CARROS RESERVA:AUTO';
  assert rec.veiculos = 2 and rec.veiculos_na_base = 1 and rec.nome like 'Carros Reserva%' and rec.acao is null,
    'peso do carro reserva: 2 veiculos, 1 na base, sem de-para';

  -- (2) o de-para
  begin
    perform mutual_definir_produto('sem_nivel:CARROS RESERVA:AUTO', 'OPCIONAL', null, 'Carros Reserva');
    assert false, 'OPCIONAL sem produto precisa ser recusado';
  exception when others then null;
  end;
  perform mutual_definir_produto('nome:TAXA ADMINISTRATIVA', 'BASE', null, 'Taxa Administrativa');
  perform mutual_definir_produto('sem_nivel:CARROS RESERVA:AUTO', 'OPCIONAL', p_res, 'Carros Reserva');
  perform mutual_definir_produto('sem_nivel:VIDROS:AUTO', 'OPCIONAL', p_vid, 'Vidros');
  perform mutual_definir_produto('nome:B PROTECAO TERCEIRO MOTO', 'OPCIONAL', p_moto, 'B-PROTECAO TERCEIRO MOTO');
  select acao, produto_nome into rec from mutual_produtos_externos(r1) where chave = 'sem_nivel:CARROS RESERVA:AUTO';
  assert rec.acao = 'OPCIONAL' and rec.produto_nome = 'Carro Reserva 184', 'de-para gravado e lido';

  -- (3) simulacao
  select * into rec from mutual_aplicar_opcionais(r1, false);
  assert rec.a_inserir = 2 and rec.veiculos_alcancados = 2, 'carro reserva nos 2 veiculos';
  assert rec.ja_no_plano = 1, 'vidros ja vem no plano';
  assert rec.fora_do_tipo = 1, 'terceiros de moto nao atende carro';
  assert rec.produtos_sem_de_para = 0 and rec.inseridos = 0, 'simulacao nao grava';
  select count(*) into n from veiculo_produtos where veiculo_id in (v1, v2);
  assert n = 1, 'nada gravado na simulacao (so o opcional do SCar)';

  -- (4) aplicar
  select * into rec from mutual_aplicar_opcionais(r1, true);
  assert rec.inseridos = 2, 'dois opcionais gravados';
  assert exists (select 1 from veiculo_produtos where veiculo_id = v1 and produto_id = p_res), 'v1 com carro reserva';
  assert exists (select 1 from veiculo_produtos where veiculo_id = v2 and produto_id = p_res), 'v2 com carro reserva';
  assert not exists (select 1 from veiculo_produtos where produto_id in (p_vid, p_moto)), 'nem o do plano nem o de outro tipo';

  -- (5) re-executavel e nao apaga o do SCar
  select * into rec from mutual_aplicar_opcionais(r1, true);
  assert rec.inseridos = 0 and rec.ja_tinham = 2, 'segunda rodada nao duplica';
  assert exists (select 1 from veiculo_produtos where veiculo_id = v1 and produto_id = p_scar), 'opcional do SCar preservado';

  -- desfazer o de-para
  perform mutual_definir_produto('nome:TAXA ADMINISTRATIVA', null);
  select acao into rec from mutual_produtos_externos(r1) where chave = 'nome:TAXA ADMINISTRATIVA';
  assert rec.acao is null, 'de-para desfeito';

  -- produto em uso no de-para nao se apaga
  begin
    delete from produtos where id = p_res;
    assert false, 'produto com de-para nao pode ser apagado';
  exception when foreign_key_violation then null;
  end;

  -- (6) gestor nao mexe
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  begin
    perform mutual_definir_produto('nome:TAXA ADMINISTRATIVA', 'BASE');
    assert false, 'gestor nao define o de-para';
  exception when others then
    if sqlerrm not like '%matriz%' then raise; end if;
  end;
  select count(*) into n from mutual_produtos_externos(r1);
  assert n = 0, 'gestor nao le a lista';

  raise notice '=== TESTES 0184 (de-para dos produtos do Mutual) PASSARAM ===';
end;
$$;
