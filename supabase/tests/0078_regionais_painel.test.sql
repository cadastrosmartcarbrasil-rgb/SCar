-- Teste funcional do PAINEL EXECUTIVO DAS REGIONAIS (0078): a data do churn, a
-- leitura da carteira por DATA, o recorte do plano de contas e o que um gestor
-- de unidade NAO consegue enxergar das vizinhas.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  u_ope uuid := gen_random_uuid();
  r_sp uuid; r_mt uuid; tv uuid;
  cat_rec uuid; cat_desp uuid; cc_evt uuid;
  c_sp uuid; c_sp2 uuid; c_mt uuid;
  v_sp uuid; v_sp2 uuid; v_mt uuid;
  e_sp uuid; l_evt uuid;
  rec record; n bigint; ini date; fim date;
begin
  -- ===================================================== setup
  insert into auth.users (id, email) values
    (u_adm,'adm62@t.com'), (u_ges,'ges62@t.com'), (u_ope,'ope62@t.com');
  insert into regionais (nome, endereco) values
    ('Matriz SP', '{"cidade":"Sao Paulo","uf":"SP"}'::jsonb) returning id into r_sp;
  insert into regionais (nome, endereco) values
    ('Cuiaba', '{"cidade":"Cuiaba","uf":"MT"}'::jsonb) returning id into r_mt;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm62@t.com','admin', null),
    (u_ges,'Gestor MT','ges62@t.com','gestor_regional', r_mt),
    (u_ope,'Atendente','ope62@t.com','sinistro', r_sp);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  select id into cat_rec  from categorias_dre where codigo_estruturado = '1.1.01';
  select id into cat_desp from categorias_dre where tipo = 'CUSTO_VARIAVEL' limit 1;

  ini := (current_date - 29);
  fim := current_date;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Joao SP','52998224725', r_sp) returning id into c_sp;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Maria SP','11144477735', r_sp) returning id into c_sp2;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Ana MT','15350946056', r_mt) returning id into c_mt;

  -- ============================================ A) data_saida (o churn datado)
  -- Veiculo ativo ha 100 dias: entra na carteira do periodo.
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status,
                        data_ativacao, valor_mensalidade)
    values (c_sp,'PNM1A01', r_sp, tv, 'ativo', current_date - 100, 150.00)
    returning id into v_sp;
  assert (select data_saida from veiculos where id = v_sp) is null,
    'veiculo na base nao pode ter data_saida';

  -- Nasce ativado HOJE — conta como novo do periodo.
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status,
                        data_ativacao, valor_mensalidade)
    values (c_sp2,'PNM1A02', r_sp, tv, 'ativo', current_date, 200.00)
    returning id into v_sp2;

  -- MT: ativado ha 60 dias e CANCELADO agora -> a trigger carimba a saida.
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status,
                        data_ativacao, valor_mensalidade)
    values (c_mt,'PNM1A03', r_mt, tv, 'ativo', current_date - 60, 180.00)
    returning id into v_mt;
  update veiculos set status = 'inativo' where id = v_mt;
  assert (select data_saida from veiculos where id = v_mt) = current_date,
    'saida definitiva tem de carimbar data_saida';

  -- Voltar para a base LIMPA a saida (o veiculo nao pode ficar contado como churn).
  update veiculos set status = 'ativo' where id = v_mt;
  assert (select data_saida from veiculos where id = v_mt) is null,
    'voltar para a base tem de limpar data_saida';
  update veiculos set status = 'inativo' where id = v_mt;

  -- SUSPENSO nao e saida: devedor continua na carteira.
  update veiculos set status = 'suspenso' where id = v_sp2;
  assert (select data_saida from veiculos where id = v_sp2) is null,
    'suspenso NAO e saida da base — debito nao e cancelamento';
  update veiculos set status = 'ativo' where id = v_sp2;

  -- ==================================== B) frota lida por DATA, nao por status
  assert frota_na_base(current_date, r_sp) = 2,
    format('SP deveria ter 2 na base hoje, tem %s', frota_na_base(current_date, r_sp));
  -- Ha 50 dias o segundo veiculo de SP nem existia.
  assert frota_na_base(current_date - 50, r_sp) = 1,
    'a leitura por data tem de ignorar quem foi ativado depois';
  -- MT saiu hoje: ha 10 dias ainda estava dentro.
  assert frota_na_base(current_date - 10, r_mt) = 1, 'MT estava na base ha 10 dias';
  assert frota_na_base(current_date, r_mt) = 0, 'MT saiu hoje, nao conta mais';

  -- ================================== C) intervalo de contas (a engrenagem)
  assert codigo_conta_ordenavel('1.10.00') > codigo_conta_ordenavel('1.9.99'),
    'comparar conta como texto mente: 1.10.00 tem de ser MAIOR que 1.9.99';
  assert conta_no_intervalo('1.1.01', '1.0.00', '3.9.99'), 'conta dentro do recorte';
  assert not conta_no_intervalo('4.1.01', '1.0.00', '3.9.99'), 'conta fora do recorte';
  assert conta_no_intervalo('9.9.99', null, null), 'sem recorte, tudo entra';

  -- A base de teste nao tem a linha da empresa (ela nasce em Configuracoes).
  insert into empresa (razao_social) select 'SMART CAR BRASIL'
   where not exists (select 1 from empresa);

  begin
    perform salvar_intervalo_contas_painel('1.0.00', '3.9.99');
  exception when others then
    raise exception 'admin deveria poder salvar o intervalo: %', sqlerrm;
  end;
  select * into rec from intervalo_contas_painel();
  assert rec.conta_de = '1.0.00' and rec.conta_ate = '3.9.99',
    'o intervalo salvo tem de voltar na leitura';

  begin
    perform salvar_intervalo_contas_painel('3.9.99', '1.0.00');
    raise exception 'intervalo invertido deveria ter sido recusado';
  exception when others then
    assert sqlerrm like '%maior que a final%', 'mensagem de intervalo invertido: ' || sqlerrm;
  end;
  begin
    perform salvar_intervalo_contas_painel('1,0,00', null);
    raise exception 'codigo com virgula deveria ter sido recusado';
  exception when others then
    assert sqlerrm like '%invalido%', 'mensagem de codigo invalido: ' || sqlerrm;
  end;

  -- ======================================= D) dinheiro: recebido e evento
  -- Mensalidade paga (titulo) dentro do periodo, em SP.
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento,
                                   data_pagamento, valor_pago, status)
    values (c_sp, v_sp, 150.00, current_date - 5, current_date - 5, 150.00, 'pago');
  -- Mensalidade em ATRASO (posicional, nao do periodo).
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status)
    values (c_sp2, v_sp2, 200.00, current_date - 3, 'pendente');
  -- Mensalidade a vencer.
  insert into titulos_financeiros (cliente_id, veiculo_id, valor, data_vencimento, status)
    values (c_sp, v_sp, 150.00, current_date + 10, 'pendente');

  -- Evento/sinistro em SP, com titulo pago (gasto com evento).
  insert into eventos_sinistro (veiculo_id, cliente_id, data_ocorrencia, tipo_evento,
                                status, regional_id)
    values (v_sp, c_sp, current_date - 7, 'COLISAO', 'REPARO', r_sp)
    returning id into e_sp;
  insert into lancamentos_financeiros (tipo, descricao, categoria_dre_id, evento_id,
                                       regional_id, valor_original, data_vencimento)
    values ('DESPESA','Reparo do evento', cat_desp, e_sp, r_sp, 900.00, current_date - 6)
    returning id into l_evt;
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido)
    values (l_evt, current_date - 6, 900.00, 900.00);

  select * into rec from regionais_painel_resumo(ini, fim, r_sp);
  assert rec.veiculos_ativos = 2, format('ativos SP = %s', rec.veiculos_ativos);
  assert rec.veiculos_novos = 1, format('novos SP = %s', rec.veiculos_novos);
  assert rec.veiculos_cancelados = 0, 'o cancelamento foi em MT, nao em SP';
  assert rec.veiculos_em_evento = 1, format('em evento SP = %s', rec.veiculos_em_evento);
  assert rec.veiculos_inadimplentes = 1, format('inadimplentes SP = %s', rec.veiculos_inadimplentes);
  assert rec.valor_inadimplente = 200.00, format('valor inadimplente = %s', rec.valor_inadimplente);
  assert rec.valor_a_receber = 150.00, format('a receber = %s', rec.valor_a_receber);
  assert rec.valor_recebido = 150.00, format('recebido = %s', rec.valor_recebido);
  assert rec.gasto_eventos = 900.00, format('gasto com evento = %s', rec.gasto_eventos);
  -- Carteira ativa: 150 (ficha) + 200 (ficha) dos dois veiculos de SP.
  assert rec.carteira_ativa = 350.00, format('carteira ativa = %s', rec.carteira_ativa);

  select * into rec from regionais_painel_resumo(ini, fim, r_mt);
  assert rec.veiculos_cancelados = 1, format('churn MT = %s', rec.veiculos_cancelados);
  assert rec.veiculos_ativos = 0, 'MT ficou sem carteira';

  -- O RECORTE DE CONTAS muda o numero: fora dele, a despesa do evento sai.
  select * into rec from regionais_painel_resumo(ini, fim, r_sp, '1.0.00', '1.9.99');
  assert rec.gasto_eventos = 0,
    format('com recorte 1.x a despesa de evento nao entra (veio %s)', rec.gasto_eventos);

  -- ============================================ E) serie temporal
  select count(*) into n from regionais_painel_serie(ini, fim, r_sp);
  assert n = 30, format('30 dias = 30 baldes diarios, veio %s', n);
  select granularidade into rec from regionais_painel_serie(ini, fim, r_sp) limit 1;
  assert (select granularidade from regionais_painel_serie(ini, fim, r_sp) limit 1) = 'DIA',
    'periodo de 30 dias e diario';
  assert (select granularidade from regionais_painel_serie(current_date - 300, fim, r_sp) limit 1) = 'MES',
    'periodo de 300 dias agrupa por mes';
  -- O balde de hoje tem de fechar com o retrato de hoje.
  assert (select ativos from regionais_painel_serie(ini, fim, r_sp) order by balde desc limit 1) = 2,
    'o ultimo balde tem de refletir a carteira de hoje';
  assert (select sinistros from regionais_painel_serie(ini, fim, r_sp)
            where balde = current_date - 7) = 1, 'o sinistro cai no dia da ocorrencia';
  assert (select gasto_eventos from regionais_painel_serie(ini, fim, r_sp)
            where balde = current_date - 6) = 900.00, 'o gasto cai no dia da baixa';

  -- ============================================ F) comparativo por regional
  select count(*) into n from regionais_painel_comparativo(ini, fim);
  assert n = 2, format('o admin ve as 2 unidades, veio %s', n);
  select * into rec from regionais_painel_comparativo(ini, fim) where regional_id = r_sp;
  assert rec.veiculos_ativos = 2 and rec.sinistros = 1,
    format('SP: ativos %s sinistros %s', rec.veiculos_ativos, rec.sinistros);
  assert rec.gasto_eventos = 900.00, format('SP gasto = %s', rec.gasto_eventos);
  assert rec.recebido = 150.00, format('SP recebido = %s', rec.recebido);
  -- Sinistralidade = 900 / 150 = 6.0 (600%): a unidade consome 6x o que arrecada.
  assert rec.sinistralidade = 6.0000, format('SP sinistralidade = %s', rec.sinistralidade);
  assert rec.resultado = -750.00, format('SP resultado = %s', rec.resultado);
  assert rec.inadimplencia = 0.5000, format('SP inadimplencia = %s', rec.inadimplencia);
  assert rec.ativa, 'unidade em operacao volta marcada como ativa';

  -- Unidade INATIVADA (0067) nao desaparece do comparativo: ela operou no
  -- periodo, e esconder apagaria justamente o historico de quem foi fechada.
  update regionais set ativo = false where id = r_mt;
  select count(*) into n from regionais_painel_comparativo(ini, fim);
  assert n = 2, format('a unidade inativada continua na tabela, veio %s', n);
  assert not (select ativa from regionais_painel_comparativo(ini, fim) where regional_id = r_mt),
    'e ela volta MARCADA como inativa';
  update regionais set ativo = true where id = r_mt;

  -- ============================================ G) ISOLAMENTO
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  -- O gestor de MT pede SP e recebe MT (escopo_regional ignora o id pedido).
  select * into rec from regionais_painel_resumo(ini, fim, r_sp);
  assert rec.veiculos_cancelados = 1 and rec.gasto_eventos = 0,
    'gestor de MT pedindo SP tem de receber os numeros de MT';
  select count(*) into n from regionais_painel_comparativo(ini, fim);
  assert n = 1, format('o gestor ve so a propria unidade no ranking, veio %s', n);
  assert (select regional_id from regionais_painel_comparativo(ini, fim)) = r_mt,
    'e a linha tem de ser a dele';
  begin
    perform salvar_intervalo_contas_painel('2.0.00', null);
    raise exception 'gestor regional nao pode mexer no intervalo de contas';
  exception when others then
    assert sqlerrm like '%diretoria%', 'mensagem de alcada: ' || sqlerrm;
  end;

  -- Quem NAO e staff (o associado do /portal e `authenticated` como qualquer um)
  -- nao le a carteira: o escopo vira um id que nao existe.
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, false);
  assert frota_na_base(current_date, null) = 0, 'nao-staff nao conta a frota';
  select * into rec from regionais_painel_resumo(ini, fim, null);
  assert rec.veiculos_ativos = 0 and rec.valor_recebido = 0 and rec.carteira_ativa = 0,
    'nao-staff nao le indicador nenhum';
  select count(*) into n from regionais_painel_comparativo(ini, fim);
  assert n = 0, 'nao-staff nao ve unidade nenhuma';

  raise notice '=== TESTES 0078 (painel executivo das regionais) PASSARAM ===';
end $$;
