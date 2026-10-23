-- Teste funcional da 0145: adesao pela tabela (cotacao aceita), boleto da
-- adesao emitido pela Smart Car, comissao de adesao no pagamento, carne do
-- veiculo na aprovacao, comissao e DRE da fatura AGRUPADA e a remessa pelo
-- servidor.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_con uuid := gen_random_uuid();
  r1 uuid; tv uuid; pl uuid; vend uuid; vend2 uuid;
  l_id uuid; cot1 uuid; cot2 uuid; vist uuid; veic uuid; cli uuid;
  t_ad uuid; t1 uuid; n bigint; ok boolean; rec record; v_num numeric;
  c2 uuid; va uuid; vb uuid; fa uuid; ta uuid; rem record;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_primeiro date;
begin
  insert into auth.users (id, email) values (u_adm,'adm145@t.com'), (u_con,'con145@t.com');
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('U145', 1.0, 0.20) returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm145@t.com','admin', null),
    (u_con,'Consultor','con145@t.com','consultor_vendas', r1);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  select id into pl from planos_protecao limit 1;
  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente, ativo)
    values ('VEND 145', r1, 0.50, 0.10, true) returning id into vend;
  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente, ativo)
    values ('VEND2 145', r1, 0.50, 0.05, true) returning id into vend2;

  -- ============================================== A) adesao pela tabela
  insert into leads (nome, celular, cpf_cnpj, tipo_pessoa, email, rg_ie, data_nascimento,
                     endereco, placa, chassi, renavam, marca, modelo, ano_fabricacao, ano_modelo,
                     cor, valor_fipe, tipo_veiculo_id, crlv_qrcode, plano_id, vendedor_id,
                     regional_id, consultor_id, status)
  values ('Ana Adesao Tabela', '11977776666', '11144477735', 'PF', 'ana@t.com', '11.222.333-4',
          '1990-02-02',
          jsonb_build_object('cep','01310100','logradouro','Rua A','numero','1','bairro','Centro','cidade','Sao Paulo','uf','SP'),
          'ADS1A45', '9BWZZZ377VT004299', '11122233344', 'VW', 'Gol', 2020, 2021, 'Prata',
          50000, tv, 'https://gov.br/crlv/145', pl, vend, r1, u_adm, 'EM_NEGOCIACAO')
  returning id into l_id;

  insert into cotacoes (lead_id, fipe, tipo_veiculo_id, total_mensalidade, taxa_adesao)
    values (l_id, 50000, tv, 150, 400) returning id into cot1;

  update leads set adesao_forma = 'BOLETO', adesao_valor = 999 where id = l_id;
  assert (select adesao_valor from leads where id = l_id) = 400,
    'o valor digitado tem de ser trocado pelo da tabela (cotacao)';

  -- (created_at explicito: na mesma transacao o default now() empataria)
  insert into cotacoes (lead_id, fipe, tipo_veiculo_id, total_mensalidade, taxa_adesao, created_at)
    values (l_id, 52000, tv, 155, 450, now() + interval '1 second') returning id into cot2;
  assert (select adesao_valor from leads where id = l_id) = 450,
    'cotacao nova (sem aceite) muda a adesao do lead';

  update leads set aceite_cotacao_id = cot1 where id = l_id;
  assert lead_adesao_tabela(l_id) = 400, 'a cotacao ACEITA manda';

  update cotacoes set desconto_percentual = 0 where id = cot1;  -- sem desconto: igual
  assert lead_adesao_tabela(l_id) = 400, 'sem desconto continua a tabela';
  raise notice 'OK adesao vem da cotacao aceita';

  insert into vistorias (lead_id, tipo, status) values (l_id, 'inicial', 'PENDENTE') returning id into vist;
  insert into vistoria_anexos (vistoria_id, url, tipo) values
    (vist,'a.jpg','FRENTE'), (vist,'b.jpg','TRASEIRA'), (vist,'c.jpg','LATERAL_ESQUERDA'),
    (vist,'d.jpg','LATERAL_DIREITA'), (vist,'e.jpg','CHASSI'), (vist,'f.jpg','HODOMETRO');
  update leads set status = 'EM_AUDITORIA' where id = l_id;

  ok := false;
  begin
    perform autorizar_entrada_lead(l_id, null, 40);
  exception when check_violation then ok := true; end;
  assert ok, 'dia de vencimento 40 e recusado';

  ok := false;
  begin
    perform autorizar_entrada_lead(l_id, null, 15, v_hoje - 1);
  exception when check_violation then ok := true; end;
  assert ok, 'vencimento da adesao no passado e recusado';

  -- ============================================== B) boleto da adesao (Smart Car)
  veic := autorizar_entrada_lead(l_id, null, 15, v_hoje + 5);
  select * into rec from veiculos where id = veic;
  assert rec.dia_vencimento = 15, 'o veiculo nasce com o dia de vencimento escolhido';
  cli := rec.cliente_id;
  assert (select adesao_valor from leads where id = l_id) = 400, 'autorizar grava a adesao da cotacao aceita';

  select id into t_ad from titulos_financeiros where adesao_lead_id = l_id;
  assert t_ad is not null, 'a adesao BOLETO vira titulo do SCar';
  select * into rec from titulos_financeiros where id = t_ad;
  assert rec.valor = 400 and rec.data_vencimento = v_hoje + 5 and rec.veiculo_id = veic, 'titulo da adesao certo';
  select count(*) into n from lancamentos_financeiros where observacoes like '%' || l_id::text || '%';
  assert n = 0, 'nao cria mais a conta a receber interna';
  select count(*) into n from comissoes_vendas where veiculo_id = veic;
  assert n = 0, 'a comissao de adesao NAO nasce antes do pagamento';

  select count(*) into n from gerar_carne_veiculo(veic, 0);
  assert n = 1, 'carne de 0 meses devolve so o boleto da adesao';
  assert (select tipo_faturamento from veiculos where id = veic) = 'AGRUPADO_ASSOCIADO', '0 meses nao mexe no faturamento';
  update titulos_financeiros set status = 'pago', valor_pago = 400, data_pagamento = v_hoje where id = t_ad;
  select * into rec from comissoes_vendas where veiculo_id = veic;
  assert rec.is_adesao and rec.valor_comissao = 200 and rec.vendedor_id = vend,
    format('adesao paga: 50%% de 400 = 200 (veio %s)', rec.valor_comissao);
  raise notice 'OK boleto da adesao e comissao de adesao no pagamento';

  -- ============================================== C) o carne do veiculo
  select * into rec from gerar_carne_veiculo(veic, 3) limit 0;
  select count(*), min(vencimento) into n, v_primeiro from gerar_carne_veiculo(veic, 3) where not adesao;
  assert n = 3, format('3 mensalidades (veio %s)', n);
  assert v_primeiro >= v_hoje + 2, 'o primeiro boleto vence a pelo menos 2 dias';
  assert extract(day from v_primeiro) = 15, 'vence no dia escolhido';
  assert (select tipo_faturamento from veiculos where id = veic) = 'INDIVIDUAL_VEICULO', 'o carne e do veiculo';
  select count(*) into n from faturas fa join fatura_itens fi on fi.fatura_id = fa.id
   where fi.veiculo_id = veic and fa.status <> 'CANCELADA' and fa.vencimento < v_hoje + 2;
  assert n = 0, 'a fatura de vencimento inviavel saiu';
  select count(*) into n from titulos_financeiros where veiculo_id = veic and adesao_lead_id is null;
  assert n = 3, 'tres titulos de mensalidade';
  select count(*) into n from gerar_carne_veiculo(veic, 3);
  select count(*) into n from titulos_financeiros where veiculo_id = veic and adesao_lead_id is null;
  assert n = 3, 'carne re-executavel nao duplica';
  select count(*) into n from gerar_carne_veiculo(veic, 4) where not adesao;
  assert n = 4, 'estender o carne acrescenta so o mes novo';
  ok := false;
  begin perform gerar_carne_veiculo(veic, 13); exception when check_violation then ok := true; end;
  assert ok, 'mais de 12 meses e recusado';
  raise notice 'OK carne do veiculo';

  -- recorrencia
  select id into t1 from titulos_financeiros where veiculo_id = veic and adesao_lead_id is null
   order by data_vencimento limit 1;
  update titulos_financeiros set status = 'pago', valor_pago = valor, data_pagamento = v_hoje where id = t1;
  select * into rec from comissoes_vendas where titulo_id = t1;
  assert not rec.is_adesao and rec.valor_comissao = round((select valor from titulos_financeiros where id = t1) * 0.10, 2),
    'mensalidade paga: comissao de recorrencia (10%)';
  raise notice 'OK comissao de recorrencia';

  -- ============================================== D) fatura AGRUPADA: comissao e DRE
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','AGRUPADO 145','52998224725', r1) returning id into c2;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao,
                        valor_mensalidade, dia_vencimento, vendedor_id, tipo_faturamento)
    values (c2,'AGR1A45', r1, tv, 'ativo', v_hoje - 400, 100, 10, vend, 'AGRUPADO_ASSOCIADO') returning id into va;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao,
                        valor_mensalidade, dia_vencimento, vendedor_id, tipo_faturamento)
    values (c2,'AGR2B45', r1, tv, 'ativo', v_hoje - 400, 300, 10, vend2, 'AGRUPADO_ASSOCIADO') returning id into vb;
  select id into fa from faturas
   where cliente_id = c2 and tipo_faturamento = 'AGRUPADO_ASSOCIADO' and status = 'ABERTA'
   order by competencia desc limit 1;
  if fa is null then
    select id into fa from gerar_faturas_cliente_veiculos(c2, (date_trunc('month', v_hoje) + interval '1 month')::date);
  end if;
  ta := (emitir_titulo_fatura(fa)).id;
  assert (select veiculo_id from titulos_financeiros where id = ta) is null, 'titulo agrupado sem veiculo';
  update titulos_financeiros set status = 'pago', valor_pago = valor, data_pagamento = v_hoje where id = ta;
  select count(*) into n from comissoes_vendas where titulo_id = ta;
  assert n = 2, format('uma comissao por veiculo do boleto agrupado (veio %s)', n);
  -- (os dois veiculos ja tinham sido cobrados? entao o primeiro e adesao; sem
  -- vinculo do Mutual o 1o pagamento e adesao — com 50% sobre a parte de cada um)
  select valor_comissao into v_num from comissoes_vendas where titulo_id = ta and veiculo_id = vb;
  assert v_num = round((select valor_pago from titulos_financeiros where id = ta) * 300 / 400 * 0.50, 2)
         or v_num = round((select valor_pago from titulos_financeiros where id = ta) * 300 / 400 * 0.05, 2),
    'a parte do veiculo B e proporcional ao item';

  select count(*) into n from dre_movimentos(v_hoje - 1, v_hoje + 1, null, 'CAIXA')
   where categoria_codigo = '1.1.00' and valor = (select valor_pago from titulos_financeiros where id = ta);
  assert n = 1, 'o boleto AGRUPADO entra no DRE';
  select count(*) into n from dre_movimentos(v_hoje - 1, v_hoje + 1, null, 'CAIXA')
   where categoria_codigo = '1.1.01' and valor = 400;
  assert n = 1, 'o boleto da adesao entra no DRE como adesao';
  raise notice 'OK agrupado: comissao por veiculo e DRE';

  -- ============================================== E) travas do carne
  update veiculos set cobranca_externa = true where id = va;
  ok := false;
  begin perform gerar_carne_veiculo(va, 2); exception when check_violation then ok := true; end;
  assert ok, 'veiculo cobrado no Mutual nao gera carne';

  perform set_config('request.jwt.claim.sub', u_con::text, false);
  ok := false;
  begin perform gerar_carne_veiculo(veic, 2); exception when others then ok := sqlerrm like 'Sem permissao%'; end;
  assert ok, 'consultor de vendas nao emite carne';

  -- ============================================== F) remessa pelo servidor
  perform set_config('request.jwt.claim.sub', '', false);
  select * into rem from criar_remessa_cobranca(
    array(select id from titulos_financeiros where veiculo_id = veic and status = 'pendente'));
  assert rem.total_titulos = 3, format('remessa com os 3 abertos (veio %s)', rem.total_titulos);
  perform marcar_remessa_enviada(rem.id);
  perform registrar_retorno_cobranca(t.id, null, '1', '7489', null, 'pix')
     from titulos_financeiros t where t.veiculo_id = veic and t.status = 'pendente';
  select * into rem from finalizar_remessa(rem.id);
  assert rem.status = 'CONCLUIDA', 'remessa sem sessao (servidor) conclui';
  raise notice 'OK remessa pelo servidor';

  raise notice '=== TESTES 0145 (adesao, carne e comissao) PASSARAM ===';
end $$;
