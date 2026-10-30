-- Teste funcional da 0162: plano por tipo de veiculo (e a trava na cotacao),
-- beneficios pre-marcados, o modelo do catalogo com a cota pela marca/modelo da
-- FIPE e os opcionais da cotacao chegando ao veiculo na autorizacao.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; tv_carro uuid; tv_moto uuid; pl_moto uuid; pl_todos uuid; vend uuid;
  prod_vidro uuid; prod_brisa uuid; mk uuid; md uuid; cota uuid;
  l_id uuid; cot uuid; vist uuid; veic uuid; ok boolean; rec record; n bigint; st text;
begin
  insert into auth.users (id, email) values (u_adm,'adm162@t.com');
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente) values ('U162', 1.0, 0.20) returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values (u_adm,'Admin','adm162@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into tv_carro from tipos_veiculo where nome ilike 'passeio%' limit 1;
  select id into tv_moto from tipos_veiculo where id <> tv_carro limit 1;
  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente, ativo)
    values ('VEND 162', r1, 0.50, 0.10, true) returning id into vend;

  -- ============================================== A) plano por tipo
  insert into planos_protecao (nome, ativo) values ('MOTO 162', true) returning id into pl_moto;
  insert into planos_protecao (nome, ativo) values ('TODOS 162', true) returning id into pl_todos;
  insert into plano_tipos_veiculo values (pl_moto, tv_moto);
  assert plano_atende_tipo(pl_moto, tv_moto), 'plano de moto atende moto';
  assert not plano_atende_tipo(pl_moto, tv_carro), 'plano de moto nao atende carro';
  assert plano_atende_tipo(pl_todos, tv_carro) and plano_atende_tipo(pl_todos, tv_moto), 'sem tipo marcado = todos';
  assert plano_atende_tipo(null, tv_carro), 'cobertura base atende todos';

  insert into leads (nome, celular, regional_id, consultor_id, vendedor_id)
    values ('Carla Carro', '11977776666', r1, u_adm, vend) returning id into l_id;
  ok := false;
  begin
    insert into cotacoes (lead_id, fipe, tipo_veiculo_id, total_mensalidade, taxa_adesao, plano_id)
      values (l_id, 50000, tv_carro, 150, 400, pl_moto);
  exception when check_violation then ok := true; end;
  assert ok, 'cotacao de carro com plano de moto e recusada';
  raise notice 'OK plano por tipo';

  -- ============================================== B) beneficios pre-marcados
  insert into produtos (nome, categoria, metodo_preco, valor_fixo, obrigatorio, status)
    values ('VIDROS COMPLETO 162', 'VIDROS', 'FIXO', 20, false, true) returning id into prod_vidro;
  insert into produtos (nome, categoria, metodo_preco, valor_fixo, obrigatorio, status)
    values ('PARABRISA 162', 'VIDROS', 'FIXO', 10, false, true) returning id into prod_brisa;
  insert into plano_sugestoes values (pl_todos, prod_vidro);
  select count(*) into n from plano_sugestoes where plano_id = pl_todos;
  assert n = 1, 'sugestao gravada';
  raise notice 'OK sugestoes';

  -- ============================================== C) modelo do catalogo pela FIPE
  insert into cotas_participacao (codigo, percentual, descricao) values ('V62', 0.062, 'teste') returning id into cota;
  insert into marcas (nome) values ('MARCATESTE') returning id into mk;
  insert into modelos (marca_id, nome, cota_participacao_id) values (mk, 'ONIX PLUS 1.0 MT LTZ', cota) returning id into md;
  insert into modelos (marca_id, nome) values (mk, 'S10 CABINE DUPLA 2.8');
  select * into rec from modelo_do_catalogo('GM - Marcateste', 'Onix Plus LTZ 1.0 Flex Mec.');
  assert rec.modelo_id = md, format('achou o modelo (veio %s)', rec.modelo);
  assert rec.cota_id = cota and rec.cota_percentual = 0.062, 'com a cota do catalogo';
  select count(*) into n from modelo_do_catalogo('Outra Marca Qualquer', 'Onix Plus');
  assert n = 0, 'marca desconhecida nao chuta';
  select count(*) into n from modelo_do_catalogo('Marcateste', 'XYZWK 9000');
  assert n = 0, 'modelo sem parecido nao chuta';
  raise notice 'OK modelo do catalogo';

  -- ============================================== D) opcionais da cotacao vao para o veiculo
  insert into cotacoes (lead_id, fipe, tipo_veiculo_id, total_mensalidade, taxa_adesao, plano_id, opcionais_ids)
    values (l_id, 50000, tv_carro, 170, 400, pl_todos, array[prod_brisa]) returning id into cot;
  perform registrar_aceite_venda(l_id, cot, 'VENDEDOR', 'Carla Carro', '11144477735');
  update leads set cpf_cnpj = '11144477735', tipo_pessoa = 'PF', email = 'carla@t.com', rg_ie = '1234567',
    endereco = jsonb_build_object('cep','01310100','logradouro','Rua A','numero','1','bairro','Centro','cidade','Sao Paulo','uf','SP'),
    placa = 'CRL1A62', chassi = '9BWZZZ377VT004262', marca = 'VW', modelo = 'Gol',
    ano_fabricacao = 2020, ano_modelo = 2021, cor = 'Prata', valor_fipe = 50000, tipo_veiculo_id = tv_carro,
    crlv_qrcode = 'https://gov.br/crlv/162', plano_id = pl_todos
   where id = l_id;
  insert into vistorias (lead_id, tipo, status) values (l_id, 'inicial', 'PENDENTE') returning id into vist;
  insert into vistoria_anexos (vistoria_id, url, tipo)
  select vist, m.codigo || '.jpg', m.codigo from vistoria_fotos_modelo m where m.obrigatorio and m.ativo;
  select string_agg(item, '; ') into st from checklist_lead(l_id) c where not c.ok;
  assert st is null, format('ficha completa (faltou: %s)', st);
  perform mover_lead_status(l_id, 'APROVADO');
  veic := autorizar_entrada_lead(l_id, null, 10);
  assert exists (select 1 from veiculo_produtos where veiculo_id = veic and produto_id = prod_brisa),
    'o opcional da cotacao chegou ao veiculo';
  select count(*) into n from veiculo_produtos where veiculo_id = veic;
  assert n = 1, 'so o que foi contratado';
  raise notice 'OK opcionais no veiculo';

  raise notice '=== TESTES 0162 PASSARAM ===';
end $$;
