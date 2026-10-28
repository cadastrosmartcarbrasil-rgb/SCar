-- Teste funcional da 0158: Assistencia Profissional — limite e unidade que
-- paga, fora do desconto, carimbada no veiculo, comissao inteira do vendedor
-- e o de-para dos migrados do Mutual.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; tv uuid; pl uuid; vend uuid;
  l_id uuid; cot uuid; vist uuid; veic uuid; cli uuid; t1 uuid; t2 uuid;
  ok boolean; rec record; v_base numeric; n bigint; v2 uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into auth.users (id, email) values (u_adm,'adm158@t.com');
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente, percentual_maximo_desconto_venda)
    values ('U158', 1.0, 0.20, 20) returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values (u_adm,'Admin','adm158@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  select id into pl from planos_protecao limit 1;
  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente, ativo)
    values ('VEND 158', r1, 0.50, 0.10, true) returning id into vend;

  insert into leads (nome, celular, cpf_cnpj, tipo_pessoa, email, rg_ie, data_nascimento,
                     endereco, placa, chassi, renavam, marca, modelo, ano_fabricacao, ano_modelo,
                     cor, valor_fipe, tipo_veiculo_id, crlv_qrcode, plano_id, vendedor_id,
                     regional_id, consultor_id, status)
  values ('Bia Assistencia', '11966665555', '11144477735', 'PF', 'bia@t.com', '11.222.333-4',
          '1990-02-02',
          jsonb_build_object('cep','01310100','logradouro','Rua A','numero','1','bairro','Centro','cidade','Sao Paulo','uf','SP'),
          'APR1A58', '9BWZZZ377VT004258', '11122233358', 'VW', 'Gol', 2020, 2021, 'Prata',
          50000, tv, 'https://gov.br/crlv/158', pl, vend, r1, u_adm, 'EM_NEGOCIACAO')
  returning id into l_id;

  -- ============================================== A) qualquer unidade cobra (0159)
  insert into cotacoes (lead_id, fipe, tipo_veiculo_id, total_mensalidade, taxa_adesao, valor_assistencia_profissional)
    values (l_id, 50000, tv, 150, 400, 10) returning id into cot;
  assert (select total_com_desconto from cotacoes where id = cot) = 160,
    'unidade que nao repassa tambem cobra a Assistencia (0159)';
  delete from cotacoes where id = cot;

  insert into cotacoes (lead_id, fipe, tipo_veiculo_id, total_mensalidade, taxa_adesao)
    values (l_id, 50000, tv, 150, 400) returning id into cot;
  assert (select total_com_desconto from cotacoes where id = cot) = 150, 'sem assistencia o total e a tabela';

  update regionais set paga_assistencia_profissional = true where id = r1;
  select * into rec from assistencia_profissional_regras(l_id);
  assert rec.paga and rec.minimo = 1 and rec.maximo = 40 and rec.regional_id = r1, 'regras da unidade do vendedor';

  -- ============================================== B) limite
  ok := false;
  begin update cotacoes set valor_assistencia_profissional = 41 where id = cot;
  exception when check_violation then ok := true; end;
  assert ok, 'acima do maximo e recusado';
  ok := false;
  begin update cotacoes set valor_assistencia_profissional = 0.5 where id = cot;
  exception when check_violation then ok := true; end;
  assert ok, 'abaixo do minimo e recusado';

  update cotacoes set valor_assistencia_profissional = 20 where id = cot;
  assert (select total_com_desconto from cotacoes where id = cot) = 170, 'tabela 150 + assistencia 20';

  -- ============================================== C) fora do desconto
  update cotacoes set desconto_percentual = 10 where id = cot;
  select * into rec from cotacoes where id = cot;
  assert rec.desconto_valor_mensalidade = 15, format('desconto so sobre a tabela (veio %s)', rec.desconto_valor_mensalidade);
  assert rec.total_com_desconto = 155, format('150 - 15 + 20 = 155 (veio %s)', rec.total_com_desconto);
  update cotacoes set desconto_percentual = 0 where id = cot;

  -- reconfigurar a unidade nao trava a cotacao antiga em outra edicao
  update regionais set assistencia_profissional_max = 10 where id = r1;
  update cotacoes set modo_envio = 'CONSOLIDADA' where id = cot;
  assert (select valor_assistencia_profissional from cotacoes where id = cot) = 20, 'valor antigo preservado';
  update regionais set assistencia_profissional_max = 40 where id = r1;
  raise notice 'OK limite, unidade e desconto';

  -- ============================================== D) atualizar_cotacao
  perform atualizar_cotacao(cot, p_valor_assistencia_profissional := 25);
  select * into rec from cotacoes where id = cot;
  assert rec.valor_assistencia_profissional = 25, 'atualizar_cotacao grava a assistencia';
  assert rec.total_com_desconto = rec.total_mensalidade + 25, 'total = tabela recalculada + 25';
  assert not exists (select 1 from jsonb_array_elements(rec.itens) i where i->>'nome' ilike '%profission%'),
    'a assistencia NUNCA vira item do detalhamento';
  perform atualizar_cotacao(cot, p_modo_envio := 'DETALHADA');
  assert (select valor_assistencia_profissional from cotacoes where id = cot) = 25, 'nulo mantem';
  v_base := (select total_mensalidade from cotacoes where id = cot);
  raise notice 'OK atualizar_cotacao';

  -- ============================================== E) entra no veiculo
  update leads set aceite_cotacao_id = cot, adesao_forma = 'VENDEDOR_NA_HORA' where id = l_id;
  insert into vistorias (lead_id, tipo, status) values (l_id, 'inicial', 'PENDENTE') returning id into vist;
  insert into vistoria_anexos (vistoria_id, url, tipo) values
    (vist,'a.jpg','FRENTE'), (vist,'b.jpg','TRASEIRA'), (vist,'c.jpg','LATERAL_ESQUERDA'),
    (vist,'d.jpg','LATERAL_DIREITA'), (vist,'e.jpg','CHASSI'), (vist,'f.jpg','HODOMETRO');
  update leads set status = 'EM_AUDITORIA' where id = l_id;
  veic := autorizar_entrada_lead(l_id, null, 15, v_hoje + 5);
  select * into rec from veiculos where id = veic;
  cli := rec.cliente_id;
  assert rec.valor_assistencia_profissional = 25, 'o veiculo nasce com a assistencia da cotacao aceita';
  assert valor_mensalidade_veiculo(veic) = round(v_base + coalesce(rec.valor_adicional_regional, 0) + 25, 2),
    format('mensalidade = tabela + 25 (veio %s, base %s)', valor_mensalidade_veiculo(veic), v_base);
  update veiculos set valor_mensalidade = 300 where id = veic;
  assert valor_mensalidade_veiculo(veic) = 300, 'override ja inclui a assistencia: nao soma de novo';
  raise notice 'OK veiculo';

  -- ============================================== F) comissao OU assistencia (0159)
  update veiculos set valor_mensalidade = 175 where id = veic;
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status)
    values (cli, veic, 175, v_hoje, 'pendente') returning id into t1;
  update titulos_financeiros set status = 'pago', valor_pago = 175, data_pagamento = v_hoje where id = t1;
  select * into rec from comissoes_vendas where titulo_id = t1;
  assert not rec.is_adesao, 'mensalidade (a adesao ja foi do vendedor na hora)';
  assert rec.valor_assistencia_profissional = 25, 'a unidade repassa: a assistencia e do vendedor';
  assert rec.valor_comissao = 25, format('so a assistencia, sem percentual (veio %s)', rec.valor_comissao);

  update regionais set paga_assistencia_profissional = false where id = r1;
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status)
    values (cli, veic, 175, v_hoje, 'pendente') returning id into t2;
  update titulos_financeiros set status = 'pago', valor_pago = 175, data_pagamento = v_hoje where id = t2;
  select * into rec from comissoes_vendas where titulo_id = t2;
  assert rec.valor_assistencia_profissional = 0 and rec.valor_comissao = 17.5,
    format('unidade que nao repassa: 10%% sobre o valor cheio, com a assistencia dentro (veio %s)', rec.valor_comissao);
  raise notice 'OK comissao';

  -- ============================================== G) migrados do Mutual
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','MIGRADO 158','52998224725', r1) returning id into cli;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao,
                        valor_mensalidade, cobranca_externa)
    values (cli, 'MUT1A58', r1, tv, 'ativo', v_hoje - 30, 210, true) returning id into v2;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao,
                        valor_mensalidade, cobranca_externa)
    values (cli, 'MUT2B58', r1, tv, 'ativo', v_hoje - 30, 190, true) returning id into veic;
  insert into integracao_vinculos (entidade, id_externo, tabela, registro_id) values
    ('CONTRACT_OBJECT', '9001', 'veiculos', v2), ('CONTRACT_OBJECT', '9002', 'veiculos', veic);
  insert into mutual_captura (entidade, id_externo, payload) values
    ('CONTRACT_OBJECT_PRODUCT', '9001', jsonb_build_object('contract_object_id', 9001, 'products', jsonb_build_array(
       jsonb_build_object('product_id', 1, 'product_name', 'Taxa Administrativa'),
       jsonb_build_object('product_id', 482, 'product_name', '7 ASSISTENCIA PROFISSIONAL 28MIG', 'subproduct_config_id', 1344)))),
    ('CONTRACT_OBJECT_PRODUCT', '9002', jsonb_build_object('contract_object_id', 9002, 'products', jsonb_build_array(
       jsonb_build_object('product_id', 53, 'product_name', 'Assistência Profissional', 'subproduct_config_id', 690))));

  assert mutual_valor_assistencia_do_nome('7 ASSISTENCIA PROFISSIONAL 28MIG') = 28, 'valor do nome legado';
  assert mutual_valor_assistencia_do_nome('Assistência Profissional') is null, 'o novo nao tem valor no nome';
  select * into rec from mutual_assistencia_profissional_veiculos(r1) where veiculo_id = v2;
  assert rec.situacao = 'APLICAR' and rec.valor_mutual = 28, 'legado: aplicar 28';
  select * into rec from mutual_assistencia_profissional_veiculos(r1) where veiculo_id = veic;
  assert rec.situacao = 'SEM_VALOR' and rec.subproduct_config_id = '690', 'novo sem valor: pede a configuracao';

  perform mutual_definir_valor_assistencia_profissional('690', 18);
  select * into rec from mutual_assistencia_profissional_configs() where subproduct_config_id = '690';
  assert rec.valor = 18 and rec.veiculos = 1, 'configuracao com valor e peso';

  select * into rec from mutual_aplicar_assistencia_profissional(r1, false);
  assert rec.aplicar = 2 and rec.gravados = 0, 'sem confirmar so conta';
  assert (select valor_assistencia_profissional from veiculos where id = v2) = 0, 'simulacao nao grava';
  select * into rec from mutual_aplicar_assistencia_profissional(r1, true);
  assert rec.gravados = 2, 'confirmar grava os dois';
  assert (select valor_assistencia_profissional from veiculos where id = v2) = 28, 'legado gravado';
  assert (select valor_assistencia_profissional from veiculos where id = veic) = 18, 'novo gravado pela configuracao';
  assert valor_mensalidade_veiculo(v2) = 210, 'o boleto do migrado NAO muda (override)';

  update veiculos set valor_assistencia_profissional = 30 where id = v2;
  select * into rec from mutual_aplicar_assistencia_profissional(r1, true);
  assert rec.diferente = 1 and (select valor_assistencia_profissional from veiculos where id = v2) = 30,
    'valor diferente ja gravado nao e trocado';
  raise notice 'OK migrados do Mutual';

  raise notice '=== TESTES 0158 (assistencia profissional) PASSARAM ===';
end $$;
