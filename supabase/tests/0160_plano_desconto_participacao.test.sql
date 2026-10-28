-- Teste funcional do PLANO COM DESCONTO NA BASE E PARTICIPACAO MULTIPLICADA (0160).
-- Prova: plano comum nao muda; o Economico (30% / 2x) desconta so os PRODUTOS
-- obrigatorios, mostra o valor de tabela, nao desconta opcional nem rastreador
-- nem adicional regional; a participacao dobra na cotacao, na funcao das telas,
-- no veiculo (com cota) e no snapshot de atualizar_cotacao.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  tv uuid; p_com uuid; p_eco uuid; prod_rcf uuid; r_mat uuid; cota5 uuid;
  cli uuid; veic uuid;
  base jsonb; eco jsonb; eco_av jsonb; base_av jsonb;
  v_obrig numeric; v_desc numeric; n int; v_rcf_base numeric; v_rcf_eco numeric;
  v_part numeric;
begin
  insert into auth.users (id, email) values (u_adm, 'adm160@t.com');
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm, 'Admin', 'adm160@t.com', 'admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  insert into regionais (nome) values ('Matriz 160') returning id into r_mat;

  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  select id into prod_rcf from produtos where categoria = 'RCF' and status order by nome limit 1;
  assert tv is not null and prod_rcf is not null, 'seed com Passeio e um RCF';

  insert into planos_protecao (nome) values ('COMUM 160') returning id into p_com;
  insert into planos_protecao (nome, desconto_base_percentual, multiplicador_participacao)
    values ('ECONOMICO 160', 30, 2) returning id into p_eco;

  -- ===================== (A) regressao: default e plano comum nao mudam
  select count(*) into n from planos_protecao
   where desconto_base_percentual <> 0 or multiplicador_participacao <> 1;
  assert n = 1, 'so o plano do teste tem desconto/multiplicador';
  base := cotar_plano(50000, tv, p_com);
  assert (base->>'desconto_base_valor')::numeric = 0, 'plano comum sem desconto';
  assert (base->>'valor_total_mensalidade')::numeric
       = (cotar_plano(50000, tv)->>'valor_total_mensalidade')::numeric, 'comum = base';
  assert (base->>'franquia_participacao')::numeric = calcular_participacao(50000, tv),
    'participacao comum intacta';

  -- ===================== (B) o desconto: 30% de cada PRODUTO obrigatorio
  eco := cotar_plano(50000, tv, p_eco);
  select coalesce(sum(round((i->>'valor')::numeric * 0.30, 2)), 0) into v_desc
    from jsonb_array_elements(base->'detalhamento_produtos') i
   where i->>'produto_id' is not null and (i->>'obrigatorio')::boolean;
  assert v_desc > 0, 'a base tem produto obrigatorio com valor';
  assert (eco->>'desconto_base_valor')::numeric = v_desc,
    format('desconto %s x esperado %s', eco->>'desconto_base_valor', v_desc);
  assert (eco->>'valor_total_mensalidade')::numeric
       = (base->>'valor_total_mensalidade')::numeric - v_desc, 'total cai o desconto';

  -- cada item com desconto mostra o de/por
  select count(*) into n from jsonb_array_elements(eco->'detalhamento_produtos') i
   where i ? 'valor_tabela'
     and (i->>'valor')::numeric = (i->>'valor_tabela')::numeric - (i->>'desconto_plano')::numeric
     and (i->>'desconto_plano_percentual')::numeric = 30;
  select count(*) into v_obrig from jsonb_array_elements(base->'detalhamento_produtos') i
   where i->>'produto_id' is not null and (i->>'obrigatorio')::boolean and (i->>'valor')::numeric > 0;
  assert n = v_obrig, format('todo produto obrigatorio leva o de/por (%s x %s)', n, v_obrig);
  -- item sem produto (rastreador, adicional) nunca tem desconto
  select count(*) into n from jsonb_array_elements(eco->'detalhamento_produtos') i
   where i->>'produto_id' is null and i ? 'valor_tabela';
  assert n = 0, 'regra do rastreador/adicional sem desconto';
  -- subtotal da taxa adm acompanha
  assert (eco->>'subtotal_taxa_admin')::numeric < (base->>'subtotal_taxa_admin')::numeric
      or (base->>'subtotal_taxa_admin')::numeric = 0, 'subtotal adm com desconto';

  -- ===================== (C) opcional avulso NAO tem desconto
  eco_av  := cotar_plano(50000, tv, p_eco, array[prod_rcf]);
  base_av := cotar_plano(50000, tv, p_com, array[prod_rcf]);
  select (i->>'valor')::numeric into v_rcf_eco from jsonb_array_elements(eco_av->'detalhamento_produtos') i
   where (i->>'produto_id')::uuid = prod_rcf;
  select (i->>'valor')::numeric into v_rcf_base from jsonb_array_elements(base_av->'detalhamento_produtos') i
   where (i->>'produto_id')::uuid = prod_rcf;
  assert v_rcf_eco = v_rcf_base, 'opcional sai cheio no Economico';

  -- ===================== (D) adicional regional segue cheio
  perform salvar_adicional_risco(r_mat, tv, 5.00, 'teste 160');
  assert (cotar_plano(50000, tv, p_eco, '{}', r_mat)->>'valor_total_mensalidade')::numeric
       = (eco->>'valor_total_mensalidade')::numeric + 5, 'adicional sem desconto';

  -- ===================== (E) participacao dobrada
  assert (eco->>'franquia_participacao')::numeric = round(calcular_participacao(50000, tv) * 2, 2),
    'cotar_plano dobra a participacao';
  assert (eco->>'multiplicador_participacao')::numeric = 2, 'retorno anuncia o multiplicador';
  insert into cotas_participacao (codigo, descricao, percentual)
    values ('T160', 'Teste 5%', 0.05) returning id into cota5;
  assert participacao_do_plano(50000, tv, cota5, p_eco) = 5000,
    'cota de 5% vira 10% no Economico (R$ 5.000 em 50k)';
  assert participacao_do_plano(50000, tv, cota5, p_com) = 2500, 'plano comum: 5%';
  assert participacao_do_plano(50000, tv, cota5, null) = 2500, 'sem plano: 5%';

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'ASSOCIADO 160', '52998224725', r_mat) returning id into cli;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, valor_fipe,
                        status, data_ativacao, plano_protecao_id, cota_participacao_id,
                        valor_mensalidade, cobranca_externa)
    values (cli, 'ECO1A60', r_mat, tv, 50000, 'ativo', current_date, p_eco, cota5, 100, true)
    returning id into veic;
  v_part := calcular_participacao_veiculo(veic, 50000);
  assert v_part = 5000, format('veiculo no Economico com cota 5%%: %s', v_part);
  update veiculos set plano_protecao_id = p_com where id = veic;
  assert calcular_participacao_veiculo(veic, 50000) = 2500, 'troca de plano volta a 5%';

  -- ===================== (F) snapshot da cotacao usa o plano
  assert position('participacao_do_plano(' in pg_get_functiondef(
    'atualizar_cotacao(uuid, numeric, uuid, uuid, uuid, uuid[], text, numeric, text, boolean, numeric)'::regprocedure)) > 0,
    'atualizar_cotacao grava a participacao do plano';

  -- ===================== (G) limites no banco
  begin
    update planos_protecao set desconto_base_percentual = 95 where id = p_eco;
    assert false, 'desconto acima de 90 deveria ser recusado';
  exception when check_violation then null; end;
  begin
    update planos_protecao set multiplicador_participacao = 0 where id = p_eco;
    assert false, 'multiplicador 0 deveria ser recusado';
  exception when check_violation then null; end;

  raise notice '=== 0160 PLANO DESCONTO/PARTICIPACAO: TODOS OS TESTES PASSARAM ===';
end;
$$;
