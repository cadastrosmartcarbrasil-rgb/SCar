-- Teste funcional da REGRA DO RASTREADOR POR REGIONAL (0173). Prova: sem regra
-- da unidade vale a da matriz (nada muda); a unidade pode baixar o limite, mudar
-- o valor ou desobrigar; o opcional aparece so quando a regra efetiva nao cobra;
-- so quem edita preco grava; remover volta a matriz.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_cons uuid := gen_random_uuid();
  t_moto uuid; r_sp uuid; r_nat uuid; p_opc uuid;
  c jsonb; n int; base numeric; ok boolean;
  rr record; cli uuid; vei uuid;
begin
  insert into auth.users (id, email) values (u_adm, 'adm173@t.com'), (u_cons, 'cons173@t.com');
  insert into regionais (nome) values ('SP 173') returning id into r_sp;
  insert into regionais (nome) values ('NAT 173') returning id into r_nat;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm, 'Admin', 'adm173@t.com', 'admin', null),
    (u_cons, 'Consultor', 'cons173@t.com', 'consultor_vendas', r_sp);

  select id into t_moto from tipos_veiculo where nome ilike 'moto%' limit 1;
  update tipos_veiculo
     set exige_rastreador = true, valor_limite_isencao = 15999.99, valor_mensalidade_rastreador = 35
   where id = t_moto;
  insert into produtos (nome, categoria, metodo_preco, obrigatorio, status, valor_fixo, rastreador_avulso)
    values ('RAST OPC 173', 'RASTREADOR', 'FIXO', false, true, 35, true) returning id into p_opc;

  -- (A) sem regra da unidade: a da matriz
  select * into rr from regra_rastreador(t_moto, r_sp);
  assert rr.origem = 'MATRIZ' and rr.exige and rr.limite = 15999.99, 'sem linha vale a matriz';
  assert rastreador_obrigatorio(20000, t_moto, r_sp), 'acima do limite da matriz e obrigatorio';
  assert not rastreador_obrigatorio(12000, t_moto, r_sp), 'abaixo nao';
  base := (cotar_plano(12000, t_moto)->>'valor_total_mensalidade')::numeric;
  assert (cotar_plano(12000, t_moto, null, '{}', r_sp)->>'valor_total_mensalidade')::numeric = base,
    'sem regra nem adicional a unidade cota igual a matriz';

  -- (B) consultor nao grava
  perform set_config('request.jwt.claim.sub', u_cons::text, false);
  begin
    perform salvar_regra_rastreador_regional(r_sp, t_moto, true, 9999.99, 40);
    ok := false;
  exception when others then ok := true;
  end;
  assert ok, 'quem nao edita preco nao grava a regra';
  assert regional_de_quem_cota() = r_sp, 'a unidade de quem cota e a do usuario';

  -- (C) admin baixa o limite de SP para 9.999,99 e muda o valor para 40
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  perform salvar_regra_rastreador_regional(r_sp, t_moto, true, 9999.99, 40, 'risco SP');
  select * into rr from regra_rastreador(t_moto, r_sp);
  assert rr.origem = 'REGIONAL' and rr.limite = 9999.99 and rr.valor = 40, 'regra da unidade gravada';
  -- regravar nao duplica
  perform salvar_regra_rastreador_regional(r_sp, t_moto, true, 9999.99, 40, 'risco SP');
  select count(*) into n from regional_regra_rastreador where regional_id = r_sp;
  assert n = 1, 'uma linha por unidade e tipo';

  -- moto de 12 mil: em SP ja e obrigatorio (regra cobra 40, opcional some); na matriz e em Natal nao
  c := cotar_plano(12000, t_moto, null, array[p_opc], r_sp);
  select count(*) into n from jsonb_array_elements(c->'detalhamento_produtos') i
   where i->>'produto_id' is null and i->>'categoria' = 'RASTREADOR' and (i->>'valor')::numeric = 40;
  assert n = 1, 'em SP a regra da unidade cobra o rastreador (R$ 40)';
  select count(*) into n from jsonb_array_elements(c->'detalhamento_produtos') i
   where (i->>'produto_id')::uuid = p_opc;
  assert n = 0, 'em SP o opcional nao entra (ja e obrigatorio)';
  assert (c->>'valor_total_mensalidade')::numeric = base + 40, 'base + 40 da regra';

  c := cotar_plano(12000, t_moto, null, array[p_opc], r_nat);
  select count(*) into n from jsonb_array_elements(c->'detalhamento_produtos') i
   where (i->>'produto_id')::uuid = p_opc;
  assert n = 1, 'em Natal (matriz) o opcional e cobrado abaixo do limite';
  assert (c->>'valor_total_mensalidade')::numeric = base + 35, 'base + 35 do opcional';
  assert (cotar_plano(12000, t_moto, null, array[p_opc])->>'valor_total_mensalidade')::numeric = base + 35,
    'sem unidade continua a matriz';

  -- (C2) veiculo na base SEM override segue a regra da unidade que o precificou
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','ASSOCIADO 173','52998224725', r_sp) returning id into cli;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, valor_fipe, status, data_ativacao, regional_preco_id)
    values (cli, 'RST1A73', r_sp, t_moto, 12000, 'ativo', current_date, r_sp) returning id into vei;
  assert valor_mensalidade_veiculo(vei) = base + 40,
    format('veiculo de SP sem override cobra o rastreador da unidade: %s', valor_mensalidade_veiculo(vei));
  update veiculos set valor_mensalidade = 99 where id = vei;
  assert valor_mensalidade_veiculo(vei) = 99, 'override continua mandando';

  -- (D) desobrigar em Natal: acima do limite da matriz deixa de cobrar e o opcional volta
  perform salvar_regra_rastreador_regional(r_nat, t_moto, false, 0, 0);
  assert not rastreador_obrigatorio(50000, t_moto, r_nat), 'Natal desobrigou';
  c := cotar_plano(50000, t_moto, null, array[p_opc], r_nat);
  select count(*) into n from jsonb_array_elements(c->'detalhamento_produtos') i
   where i->>'produto_id' is null and i->>'categoria' = 'RASTREADOR';
  assert n = 0, 'desobrigado nao cobra a regra';
  select count(*) into n from jsonb_array_elements(c->'detalhamento_produtos') i
   where (i->>'produto_id')::uuid = p_opc;
  assert n = 1, 'desobrigado, o rastreador vira opcional';

  -- (E) a grade da tela
  select count(*) into n from regras_rastreador_do_tipo(t_moto) where personalizada;
  assert n = 2, 'duas unidades personalizadas';

  -- (F) remover volta a matriz
  perform remover_regra_rastreador_regional(r_sp, t_moto);
  select * into rr from regra_rastreador(t_moto, r_sp);
  assert rr.origem = 'MATRIZ', 'remover volta a matriz';
  assert not rastreador_obrigatorio(12000, t_moto, r_sp), 'e 12 mil volta a ser opcional em SP';

  -- (G) limite negativo e recusado
  begin
    perform salvar_regra_rastreador_regional(r_sp, t_moto, true, -1, 35);
    ok := false;
  exception when others then ok := true;
  end;
  assert ok, 'limite negativo recusado';

  raise notice '=== 0173 rastreador_regional: TODOS OS TESTES PASSARAM ===';
end $$;
