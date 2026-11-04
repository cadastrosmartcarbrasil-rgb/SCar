-- Teste funcional: desconto no veiculo que ja esta na base (0179)
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_con uuid := gen_random_uuid();
  r1 uuid; tv uuid; cli uuid; veic uuid; ped uuid; fat uuid;
  rec record; n int; ok boolean; v_comp date; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into auth.users (id, email) values (u_adm,'adm179@t.com'), (u_con,'con179@t.com');
  insert into regionais (nome, percentual_maximo_desconto_venda) values ('U179', 10) returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Diretoria','adm179@t.com','admin', null),
    (u_con,'Atendente','con179@t.com','gestor_regional', r1);
  update papel_permissoes set concedida = false where papel = 'gestor_regional' and permissao = 'desconto';
  select id into tv from tipos_veiculo limit 1;
  insert into clientes (nome_razao_social, cpf_cnpj, tipo_pessoa, regional_id)
    values ('CICLANO BASE', '52998224725', 'PF', r1) returning id into cli;
  insert into veiculos (cliente_id, placa, marca, modelo, ano_modelo, tipo_veiculo_id, regional_id, status,
                        valor_mensalidade, dia_vencimento, data_ativacao, tipo_faturamento)
    values (cli, 'BSE1A79', 'FIAT', 'ARGO', 2020, tv, r1, 'ativo', 200, 10, v_hoje - 90, 'INDIVIDUAL_VEICULO')
    returning id into veic;

  -- uma fatura aberta, sem boleto, no futuro
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  v_comp := (date_trunc('month', v_hoje) + interval '1 month')::date;
  perform gerar_faturas_cliente_veiculos(cli, v_comp, array[veic]);
  select fa.id into fat from faturas fa join fatura_itens fi on fi.fatura_id = fa.id
   where fi.veiculo_id = veic and fa.competencia = v_comp;
  assert fat is not null, 'fatura aberta criada';

  -- ======================= A) quem nao aprova pede
  perform set_config('request.jwt.claim.sub', u_con::text, false);
  assert not pode_aprovar_desconto(), 'gestor sem a alcada';

  ok := false;
  begin update veiculos set desconto_mensalidade = 30 where id = veic;
  exception when check_violation then ok := true; end;
  assert ok, 'update direto do desconto e recusado';

  ok := false;
  begin perform solicitar_desconto_veiculo(veic, 'PERCENTUAL', 15, null, 'cliente antigo');
  exception when check_violation then ok := true; end;
  assert ok, 'acima do limite da unidade';

  ok := false;
  begin perform solicitar_desconto_veiculo(veic, 'VALOR', 10, null, '');
  exception when check_violation then ok := true; end;
  assert ok, 'justificativa obrigatoria';

  select (solicitar_desconto_veiculo(veic, 'VALOR', 20, null, 'retencao')).id into ped;
  select * into rec from veiculo_desconto_pedidos where id = ped;
  assert rec.situacao = 'PENDENTE' and rec.desconto = 20 and rec.percentual = 10, format('pedido pendente (%s)', rec);
  assert (select desconto_mensalidade from veiculos where id = veic) = 0, 'pendente nao muda o veiculo';
  select count(*) into n from descontos_do_veiculo(veic);
  assert n = 1, 'historico do veiculo';

  -- ======================= B) a diretoria aprova
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select count(*) into n from descontos_pendentes() where origem = 'VEICULO' and id = ped;
  assert n = 1, 'pedido na fila da diretoria';
  assert descontos_pendentes_contagem() >= 1, 'contagem inclui o veiculo';
  perform decidir_desconto_veiculo(ped, true, null);
  select * into rec from veiculos where id = veic;
  assert rec.desconto_mensalidade = 20 and rec.desconto_mensalidade_ate is null, 'desconto no veiculo';
  select valor_total into rec from faturas where id = fat;
  assert rec.valor_total = 180, format('fatura aberta recalculada (%s)', rec.valor_total);

  -- proximo lote ja nasce com o desconto
  perform gerar_faturas_cliente_veiculos(cli, (v_comp + interval '1 month')::date, array[veic]);
  select fi.valor, fi.desconto into rec from fatura_itens fi join faturas fa on fa.id = fi.fatura_id
   where fi.veiculo_id = veic and fa.competencia = (v_comp + interval '1 month')::date;
  assert rec.valor = 180 and rec.desconto = 20, 'novo lote com o desconto';

  -- ======================= C) retirar
  perform set_config('request.jwt.claim.sub', u_con::text, false);
  ok := false;
  begin perform remover_desconto_veiculo(veic, '');
  exception when check_violation then ok := true; end;
  assert ok, 'retirar exige motivo';
  perform remover_desconto_veiculo(veic, 'fim da negociacao');
  assert (select desconto_mensalidade from veiculos where id = veic) = 0, 'desconto retirado';
  assert (select valor_total from faturas where id = fat) = 200, 'fatura aberta volta ao cheio';

  -- ======================= D) quem aprova grava direto; recusa exige motivo
  perform set_config('request.jwt.claim.sub', u_con::text, false);
  select (solicitar_desconto_veiculo(veic, 'PERCENTUAL', 5, v_hoje + 30, 'campanha')).id into ped;
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  ok := false;
  begin perform decidir_desconto_veiculo(ped, false, '');
  exception when check_violation then ok := true; end;
  assert ok, 'recusa sem motivo';
  perform decidir_desconto_veiculo(ped, false, 'fora da politica');
  assert (select situacao from veiculo_desconto_pedidos where id = ped) = 'RECUSADO', 'recusado';
  perform solicitar_desconto_veiculo(veic, 'PERCENTUAL', 5, v_hoje + 30, 'campanha');
  select * into rec from veiculos where id = veic;
  assert rec.desconto_mensalidade = 10 and rec.desconto_mensalidade_ate = v_hoje + 30, 'diretoria aplica direto';

  raise notice '=== TESTES 0179 (desconto no veiculo da base) PASSARAM ===';
end $$;
