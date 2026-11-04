-- Teste funcional: desconto na mensalidade com aprovacao da diretoria (0178)
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_con uuid := gen_random_uuid();
  r1 uuid; tv uuid; l_id uuid; cot uuid; cli uuid; veic uuid; tit uuid; ped uuid;
  rec record; n int; ok boolean; v_comp date; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into auth.users (id, email) values (u_adm,'adm178@t.com'), (u_con,'con178@t.com');
  insert into regionais (nome, percentual_maximo_desconto_venda) values ('U178', 5) returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Diretoria','adm178@t.com','admin', null),
    (u_con,'Consultor','con178@t.com','consultor_vendas', r1);
  select id into tv from tipos_veiculo limit 1;

  -- ================================================= A) a proposta
  perform set_config('request.jwt.claim.sub', u_con::text, false);
  insert into leads (nome, celular, regional_id, consultor_id) values ('Fulano Desconto', '11977776666', r1, u_con)
    returning id into l_id;
  insert into cotacoes (lead_id, fipe, tipo_veiculo_id, total_mensalidade, taxa_adesao)
    values (l_id, 50000, tv, 150, 400) returning id into cot;

  perform definir_desconto_cotacao(cot, 'PERCENTUAL', 3, v_hoje + 60, 'fechar hoje');
  select * into rec from cotacoes where id = cot;
  assert rec.desconto_situacao = 'PENDENTE', 'desconto do consultor fica pendente';
  assert rec.desconto_valor_mensalidade = 4.50 and rec.total_com_desconto = 145.50, 'desconto so na mensalidade';
  assert rec.adesao_com_desconto = 400 and rec.desconto_valor_adesao = 0, 'adesao sem desconto';

  ok := false;
  begin perform definir_desconto_cotacao(cot, 'PERCENTUAL', 10, null, null);
  exception when check_violation then ok := true; end;
  assert ok, 'acima do limite da unidade e recusado';

  perform definir_desconto_cotacao(cot, 'VALOR', 6, v_hoje + 40, null);
  select * into rec from cotacoes where id = cot;
  assert rec.desconto_percentual = 4 and rec.desconto_valor_mensalidade = 6 and rec.desconto_situacao = 'PENDENTE',
    'desconto em R$ vira o % equivalente';

  ok := false;
  begin update cotacoes set desconto_situacao = 'APROVADO' where id = cot;
  exception when others then ok := true; end;
  assert ok or (select desconto_situacao from cotacoes where id = cot) = 'PENDENTE', 'consultor nao se aprova';

  select c.ok into ok from checklist_lead(l_id) c where c.item = 'Desconto aprovado pela diretoria';
  assert not ok, 'desconto pendente trava o checklist';
  assert descontos_pendentes_contagem() = 0, 'consultor nao ve a fila';

  -- ================================================= B) a diretoria decide
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  assert descontos_pendentes_contagem() = 1, 'a diretoria ve o pedido';
  select count(*) into n from descontos_pendentes() where origem = 'COTACAO' and id = cot;
  assert n = 1, 'pedido na fila';
  ok := false;
  begin perform decidir_desconto_cotacao(cot, false, '');
  exception when check_violation then ok := true; end;
  assert ok, 'recusa exige motivo';
  perform decidir_desconto_cotacao(cot, true, null);
  select c.ok into ok from checklist_lead(l_id) c where c.item = 'Desconto aprovado pela diretoria';
  assert ok, 'aprovado libera o checklist';

  -- mudar o desconto depois de aprovado pede aprovacao de novo
  perform set_config('request.jwt.claim.sub', u_con::text, false);
  perform definir_desconto_cotacao(cot, 'VALOR', 5, v_hoje + 40, null);
  assert (select desconto_situacao from cotacoes where id = cot) = 'PENDENTE', 'alterou: volta a pendente';
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  perform decidir_desconto_cotacao(cot, true, null);
  perform definir_desconto_cotacao(cot, 'VALOR', 6, v_hoje + 40, null);
  assert (select desconto_situacao from cotacoes where id = cot) = 'APROVADO', 'quem aprova ja aprova';

  -- ================================================= C) o veiculo e as faturas
  insert into clientes (nome_razao_social, cpf_cnpj, tipo_pessoa, regional_id)
    values ('FULANO DESCONTO', '52998224725', 'PF', r1) returning id into cli;
  insert into veiculos (cliente_id, placa, marca, modelo, ano_modelo, tipo_veiculo_id, regional_id, status,
                        valor_mensalidade, dia_vencimento, data_ativacao, tipo_faturamento)
    values (cli, 'DSC1A78', 'FIAT', 'ARGO', 2020, tv, r1, 'ativo', 150, 10, v_hoje - 60, 'INDIVIDUAL_VEICULO')
    returning id into veic;
  update leads set veiculo_id = veic, cliente_id = cli where id = l_id;
  select * into rec from veiculos where id = veic;
  assert rec.desconto_mensalidade = 6 and rec.desconto_mensalidade_ate = v_hoje + 40, 'o desconto aprovado vai ao veiculo';

  -- faturas: a do mes que vence dentro da validade leva o desconto; a de 3 meses depois nao
  v_comp := date_trunc('month', v_hoje)::date;
  perform gerar_faturas_cliente_veiculos(cli, v_comp, array[veic]);
  perform gerar_faturas_cliente_veiculos(cli, (v_comp + interval '3 months')::date, array[veic]);
  select fi.valor, fi.desconto, fa.valor_total into rec
    from fatura_itens fi join faturas fa on fa.id = fi.fatura_id
   where fi.veiculo_id = veic and fa.competencia = v_comp;
  assert rec.desconto = 6 and rec.valor = 144 and rec.valor_total = 144, format('fatura do mes com desconto (%s)', rec);
  select fi.valor, fi.desconto into rec
    from fatura_itens fi join faturas fa on fa.id = fi.fatura_id
   where fi.veiculo_id = veic and fa.competencia = (v_comp + interval '3 months')::date;
  assert rec.desconto = 0 and rec.valor = 150, 'depois da validade volta ao cheio';

  -- tirar o desconto do veiculo devolve o cheio nas faturas sem boleto
  update veiculos set desconto_mensalidade = 0 where id = veic;
  select fi.valor, fa.valor_total into rec
    from fatura_itens fi join faturas fa on fa.id = fi.fatura_id
   where fi.veiculo_id = veic and fa.competencia = v_comp;
  assert rec.valor = 150 and rec.valor_total = 150, 'recalcula a fatura aberta';

  -- ================================================= D) desconto na edicao do boleto
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status)
    values (cli, veic, 200, v_hoje + 10, 'pendente') returning id into tit;
  perform set_config('request.jwt.claim.sub', u_con::text, false);
  perform ajustar_titulo(tit, v_hoje + 15, 30, null, 'cliente pediu');
  select * into rec from titulos_financeiros where id = tit;
  assert rec.valor = 200 and rec.data_vencimento = v_hoje + 15, 'sem alcada: so o vencimento muda';
  select id into ped from titulo_desconto_pedidos where titulo_id = tit and situacao = 'PENDENTE';
  assert ped is not null, 'pedido de desconto criado';

  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select count(*) into n from descontos_pendentes() where origem = 'TITULO';
  assert n = 1, 'pedido do boleto na fila';
  perform decidir_desconto_titulo(ped, true, null);
  assert (select valor from titulos_financeiros where id = tit) = 170, 'aprovado: desconto aplicado';
  assert descontos_pendentes_contagem() = 0, 'fila vazia';

  raise notice '=== TESTES 0178 (desconto com aprovacao) PASSARAM ===';
end $$;
