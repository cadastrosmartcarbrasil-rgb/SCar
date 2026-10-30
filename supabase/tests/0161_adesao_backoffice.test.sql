-- Teste funcional da 0161: a rotina da nova adesao — a esteira sem "Cotacao
-- criada" e com "Aguardando vistoria", o envio a Auditoria so com a ficha
-- completa, a adesao que nao trava (padrao: recebida pelo consultor), Renavam
-- e nascimento opcionais, a carencia de 24h, o pedido de instalacao do
-- rastreador e o pro-rata pos-pago no 1o boleto do carne.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; tv uuid; pl uuid; vend uuid;
  l_id uuid; l2 uuid; cot1 uuid; vist uuid; veic uuid;
  n bigint; ok boolean; rec record; st text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_comp date; v_venc date; v_prev date; v_ativ date; v_esperado numeric; v_mens numeric;
begin
  insert into auth.users (id, email) values (u_adm,'adm158@t.com');
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente) values ('U158', 1.0, 0.20) returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm158@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  select id into pl from planos_protecao limit 1;
  update planos_protecao set exige_rastreador = true where id = pl;
  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente, ativo)
    values ('VEND 158', r1, 0.50, 0.10, true) returning id into vend;

  -- ============================================== A) cotacao -> proposta enviada
  insert into leads (nome, celular, regional_id, consultor_id, vendedor_id)
    values ('Bruno Backoffice', '11966665555', r1, u_adm, vend) returning id into l_id;
  assert (select status::text from leads where id = l_id) = 'NOVO', 'lead nasce NOVO';
  assert (select adesao_forma::text from leads where id = l_id) = 'VENDEDOR_NA_HORA',
    'adesao nasce recebida pelo consultor';

  ok := false;
  begin perform mover_lead_status(l_id, 'AGUARDANDO_VISTORIA');
  exception when check_violation then ok := true; end;
  assert ok, 'sem cotacao nao vai para Aguardando vistoria';

  ok := false;
  begin perform mover_lead_status(l_id, 'ORCAMENTO_GERADO');
  exception when others then ok := true; end;
  assert ok, 'Cotacao criada saiu da esteira';

  insert into cotacoes (lead_id, fipe, tipo_veiculo_id, total_mensalidade, taxa_adesao, plano_id)
    values (l_id, 50000, tv, 150, 400, pl) returning id into cot1;
  assert (select status::text from leads where id = l_id) = 'PROPOSTA_ENVIADA',
    'a cotacao leva o lead direto para Proposta enviada';
  raise notice 'OK cotacao -> proposta enviada';

  -- ============================================== B) aceite -> aguardando vistoria
  perform registrar_aceite_venda(l_id, cot1, 'VENDEDOR', 'Bruno Backoffice', '11144477735');
  assert (select status::text from leads where id = l_id) = 'AGUARDANDO_VISTORIA',
    'o aceite entrega ao back-office (Aguardando vistoria)';
  assert lead_em_negociacao(l_id), 'em Aguardando vistoria a cotacao segue editavel';
  raise notice 'OK aceite -> aguardando vistoria';

  -- ============================================== C) a Auditoria so recebe ficha completa
  ok := false;
  begin perform mover_lead_status(l_id, 'APROVADO');
  exception when check_violation then ok := true; end;
  assert ok, 'ficha incompleta nao vai a Auditoria';

  -- Completa SEM renavam, SEM nascimento e SEM forma de adesao.
  update leads set cpf_cnpj = '11144477735', tipo_pessoa = 'PF', email = 'bruno@t.com', rg_ie = '1234567',
    endereco = jsonb_build_object('cep','01310100','logradouro','Rua A','numero','1','bairro','Centro','cidade','Sao Paulo','uf','SP'),
    placa = 'BKO1A58', chassi = '9BWZZZ377VT004258', marca = 'VW', modelo = 'Gol',
    ano_fabricacao = 2020, ano_modelo = 2021, cor = 'Prata', valor_fipe = 50000, tipo_veiculo_id = tv,
    crlv_qrcode = 'https://gov.br/crlv/158', plano_id = pl, adesao_forma = null, renavam = null,
    data_nascimento = null
   where id = l_id;
  insert into vistorias (lead_id, tipo, status) values (l_id, 'inicial', 'PENDENTE') returning id into vist;
  insert into vistoria_anexos (vistoria_id, url, tipo)
  select vist, m.codigo || '.jpg', m.codigo from vistoria_fotos_modelo m where m.obrigatorio and m.ativo;

  select string_agg(item, '; ') into st from checklist_lead(l_id) c where not c.ok;
  assert st is null, format('Renavam, nascimento e forma da adesao nao travam (faltou: %s)', st);

  update leads set renavam = '123' where id = l_id;
  assert not (select c.ok from checklist_lead(l_id) c where c.item like 'Renavam%'), 'Renavam informado errado trava';
  update leads set renavam = null where id = l_id;

  perform mover_lead_status(l_id, 'APROVADO');
  assert (select status::text from leads where id = l_id) = 'EM_AUDITORIA', 'completa: vai para a Auditoria';
  raise notice 'OK auditoria so com ficha completa';

  -- ============================================== D) autorizacao: adesao, carencia, rastreador
  veic := autorizar_entrada_lead(l_id, null, 10);
  select * into rec from veiculos where id = veic;
  assert rec.cobertura_desde between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute',
    'cobertura comeca 24h depois';
  select * into rec from comissoes_vendas where veiculo_id = veic;
  assert rec.is_adesao and rec.status_pagamento::text = 'pago' and rec.valor_comissao = 400,
    'sem forma: adesao recebida pelo consultor (comissao paga, nada no financeiro)';
  assert (select adesao_forma::text from leads where id = l_id) = 'VENDEDOR_NA_HORA', 'a forma fica gravada';
  select count(*) into n from titulos_financeiros where adesao_lead_id = l_id;
  assert n = 0, 'sem boleto de adesao';
  select count(*) into n from atendimentos
   where veiculo_id = veic and assunto like 'Instalacao de rastreador%' and responsavel_id is null;
  assert n = 1, 'pedido de instalacao do rastreador aberto, na fila da unidade';
  raise notice 'OK autorizacao (adesao do consultor, carencia, rastreador)';

  -- ============================================== E) carencia na 24h e no evento
  select * into rec from situacao_assistencia_veiculo(veic);
  assert not rec.pode_acionar and exists (select 1 from unnest(rec.motivos) m where m like 'Carencia%'),
    'na carencia a 24h exige liberacao';
  ok := false;
  begin
    insert into eventos_sinistro (veiculo_id, cliente_id, regional_id, data_ocorrencia, descricao)
    values (veic, (select cliente_id from veiculos where id = veic), r1, v_hoje - 1, 'antes');
  exception when check_violation then ok := true; end;
  assert ok, 'evento antes da cobertura e recusado';
  update veiculos set cobertura_desde = now() - interval '1 hour' where id = veic;
  select * into rec from situacao_assistencia_veiculo(veic);
  assert not exists (select 1 from unnest(rec.motivos) m where m like 'Carencia%'), 'passada a carencia, some';
  raise notice 'OK carencia';

  -- ============================================== F) pro-rata pos-pago no 1o boleto
  -- ativacao 5 dias atras, vencimento no dia que deixe o 1o vencimento viavel.
  v_ativ := v_hoje - 5;
  update veiculos set data_ativacao = v_ativ, dia_vencimento = extract(day from (v_hoje + 10))::int,
    valor_mensalidade = 300 where id = veic;
  -- o calculo esperado, com a mesma regra do carne
  v_comp := date_trunc('month', v_ativ)::date;
  while calcular_vencimento(v_comp, extract(day from (v_hoje + 10))::int) < v_hoje + 2 loop
    v_comp := (v_comp + interval '1 month')::date;
  end loop;
  v_venc := calcular_vencimento(v_comp, extract(day from (v_hoje + 10))::int);
  v_prev := calcular_vencimento((v_comp - interval '1 month')::date, extract(day from (v_hoje + 10))::int);
  v_mens := 300;
  v_esperado := case when greatest(v_ativ, v_prev) > v_prev
                     then least(v_mens, round(v_mens * (v_venc - greatest(v_ativ, v_prev)) / (v_venc - v_prev), 2))
                     else v_mens end;

  select * into rec from gerar_carne_veiculo(veic, 3) where not adesao order by vencimento limit 1;
  assert rec.vencimento = v_venc, format('1o vencimento %s (veio %s)', v_venc, rec.vencimento);
  assert rec.valor = v_esperado and rec.valor < 300,
    format('1o boleto = pro-rata %s (veio %s)', v_esperado, rec.valor);
  select count(*) into n from titulos_financeiros
   where veiculo_id = veic and adesao_lead_id is null and valor = 300;
  assert n = 2, 'os demais sao a mensalidade cheia';
  select count(*) into n from gerar_carne_veiculo(veic, 3);
  assert (select valor from titulos_financeiros where veiculo_id = veic and data_vencimento = v_venc) = v_esperado,
    're-executar nao muda o 1o boleto';
  raise notice 'OK pro-rata no 1o boleto';

  -- ============================================== G) aguardando vistoria nao volta ao pool
  insert into leads (nome, celular, regional_id, consultor_id, vendedor_id, status, ultima_interacao_em, atribuido_em, created_at)
    values ('Parado Vistoria', '11955554444', r1, u_adm, vend, 'AGUARDANDO_VISTORIA',
            now() - interval '60 days', now() - interval '60 days', now() - interval '60 days')
    returning id into l2;
  perform liberar_leads_sem_contato(r1);
  assert (select vendedor_id from leads where id = l2) = vend, 'em Aguardando vistoria o lead nao volta ao pool';
  raise notice 'OK pool';

  raise notice '=== TESTES 0161 (adesao back-office) PASSARAM ===';
end;
$$;
