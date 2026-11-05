-- Teste funcional: FIPE e cota decididas pelo servidor; adesao praticada (0180)
\set ON_ERROR_STOP on
do $$
declare
  u_con uuid := gen_random_uuid();
  r1 uuid; tv uuid; mk uuid; md uuid; cota6 uuid; cota10 uuid;
  q1 uuid; q2 uuid; q_alto uuid; l_id uuid; l2 uuid; cot uuid; cot2 uuid;
  rec record; ok boolean; n int; v_total numeric; v_lim numeric;
begin
  insert into auth.users (id, email) values (u_con,'con180@t.com');
  insert into regionais (nome) values ('U180') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values (u_con,'Consultor','con180@t.com','gestor_regional', r1);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;

  -- catalogo: o modelo TRACKER tem cota V6
  select id into cota6 from cotas_participacao where codigo = 'V6';
  select id into cota10 from cotas_participacao where codigo = 'V10';
  insert into marcas (nome) values ('CHEVROLET180') returning id into mk;
  insert into modelos (marca_id, nome, cota_participacao_id) values (mk, 'TRACKER LTZ 180', cota6) returning id into md;

  -- consultas feitas pelo SERVIDOR (sem sessao = service_role)
  insert into fipe_consultas (origem, placa, codigo_fipe, marca, modelo, valor, mes_referencia)
    values ('PLACA', 'ABC1D80', '004001-1', 'CHEVROLET180', 'TRACKER LTZ 180', 80000, 'novembro/2026') returning id into q1;
  insert into fipe_consultas (origem, placa, codigo_fipe, marca, modelo, valor)
    values ('PLACA', 'XYZ9Z99', '009999-9', 'CHEVROLET180', 'TRACKER LTZ 180', 30000) returning id into q2;

  -- ===================== o navegador (a trava ligada)
  perform set_config('request.jwt.claim.sub', u_con::text, false);
  perform set_config('scar.forcar_trava_fipe', 'on', false);

  -- (d) sem consulta FIPE: gravar valor FIPE e recusado
  ok := false;
  begin
    insert into leads (nome, celular, regional_id, consultor_id, placa, valor_fipe)
      values ('Sem Consulta', '11900000001', r1, u_con, 'ABC1D80', 80000);
  exception when check_violation then ok := true; end;
  assert ok, 'lead com FIPE sem consulta e recusado';

  -- (b)+(c) lead com consulta: FIPE e cota adulteradas sao ignoradas
  insert into leads (nome, celular, regional_id, consultor_id, placa, tipo_veiculo_id, valor_fipe,
                     fipe_consulta_id, cota_participacao_id)
    values ('Fulano Fipe', '11900000002', r1, u_con, 'ABC-1D80', tv, 10000, q1, cota10)
    returning id into l_id;
  select * into rec from leads where id = l_id;
  assert rec.valor_fipe = 80000, format('lead: FIPE da consulta, nao a digitada (%s)', rec.valor_fipe);
  assert rec.cota_participacao_id = cota6, 'lead: cota do catalogo, nao a escolhida';
  assert rec.codigo_fipe = '004001-1', 'lead: codigo FIPE da consulta';

  -- consulta de OUTRA placa e recusada
  ok := false;
  begin update leads set fipe_consulta_id = q2 where id = l_id;
  exception when check_violation then ok := true; end;
  assert ok, 'consulta de outra placa e recusada';

  -- cotacao: FIPE, cota e PRECO adulterados sao ignorados
  insert into cotacoes (lead_id, fipe, tipo_veiculo_id, total_mensalidade, taxa_adesao, cota_participacao_id, fipe_consulta_id)
    values (l_id, 10000, tv, 1, 0, cota10, q1) returning id into cot;
  select * into rec from cotacoes where id = cot;
  v_total := (cotar_plano(80000, tv, null, '{}'::uuid[], rec.regional_id)->>'valor_total_mensalidade')::numeric;
  assert rec.fipe = 80000, format('cotacao: FIPE da consulta (%s)', rec.fipe);
  assert rec.cota_participacao_id = cota6, 'cotacao: cota do catalogo';
  assert rec.cota_percentual = 6, format('cotacao: snapshot do %% da cota (%s)', rec.cota_percentual);
  assert rec.total_mensalidade = v_total, format('cotacao: preco do motor (%s x %s)', rec.total_mensalidade, v_total);
  assert rec.fipe_codigo = '004001-1' and rec.fipe_mes_referencia = 'novembro/2026' and rec.fipe_consultado_em is not null,
    'cotacao: snapshot da consulta';

  -- update direto adulterando a FIPE: volta ao da consulta
  update cotacoes set fipe = 5000, cota_participacao_id = cota10 where id = cot;
  select * into rec from cotacoes where id = cot;
  assert rec.fipe = 80000 and rec.cota_participacao_id = cota6, 'update adulterado e ignorado';

  -- cotacao sem consulta e recusada
  ok := false;
  begin insert into cotacoes (lead_id, fipe, tipo_veiculo_id, total_mensalidade) values (l_id, 80000, tv, 150);
  exception when check_violation then ok := true; end;
  assert ok, 'cotacao sem consulta e recusada';

  -- desconto continua funcionando (nao regrava FIPE)
  update cotacoes set modo_envio = 'CONSOLIDADA' where id = cot;
  assert (select fipe from cotacoes where id = cot) = 80000, 'mudar outra coluna nao mexe na FIPE';

  -- valor protegido (0175): so quando a FIPE da consulta passa do limite
  v_lim := limite_fipe_tipo(tv);
  if v_lim is not null then
    insert into fipe_consultas (origem, placa, marca, modelo, valor) values ('PLACA', 'ALT0A80', 'X', 'Y', v_lim + 50000)
      returning id into q_alto;
    insert into leads (nome, celular, regional_id, consultor_id, placa, tipo_veiculo_id, valor_fipe, fipe_consulta_id)
      values ('Carro Caro', '11900000003', r1, u_con, 'ALT0A80', tv, v_lim, q_alto) returning id into l2;
    insert into cotacoes (lead_id, fipe, tipo_veiculo_id, total_mensalidade, fipe_consulta_id)
      values (l2, v_lim, tv, 0, q_alto) returning id into cot2;
    select * into rec from cotacoes where id = cot2;
    assert rec.fipe = v_lim and rec.valor_fipe_mercado = v_lim + 50000, 'valor protegido pelo limite continua valendo';
  end if;

  -- atualizar_cotacao aceita a consulta nova
  select count(*) into n from pg_proc where proname = 'atualizar_cotacao';
  assert n = 1, 'uma versao de atualizar_cotacao';

  -- (a) adesao: sugerida x praticada, com quem e quando
  update leads set adesao_valor = 250.5 where id = l_id;
  select * into rec from leads where id = l_id;
  assert rec.adesao_valor = 250.50 and rec.adesao_sugerida = (select taxa_adesao from cotacoes where id = cot),
    format('adesao: praticada e sugerida (%s / %s)', rec.adesao_valor, rec.adesao_sugerida);
  assert rec.adesao_alterada_por = u_con and rec.adesao_alterada_em is not null, 'adesao: quem alterou';
  select count(*) into n from lead_adesao_historico where lead_id = l_id and valor_novo = 250.50;
  assert n = 1, 'adesao: trilha';
  ok := false;
  begin update leads set adesao_valor = -1 where id = l_id;
  exception when check_violation then ok := true; end;
  assert ok, 'adesao negativa e recusada';
  update leads set adesao_valor = 0 where id = l_id;
  assert (select adesao_valor from leads where id = l_id) = 0, 'adesao zero e aceita';

  -- (e) o hotlink (servidor, sem a trava): com a consulta, o snapshot entra igual
  perform set_config('scar.forcar_trava_fipe', 'off', false);
  perform set_config('request.jwt.claim.sub', '', false);
  insert into cotacoes (lead_id, fipe, tipo_veiculo_id, total_mensalidade, fipe_consulta_id)
    values (l_id, 80000, tv, 999, q1) returning id into cot2;
  select * into rec from cotacoes where id = cot2;
  assert rec.fipe = 80000 and rec.cota_percentual = 6 and rec.fipe_codigo = '004001-1', 'hotlink: snapshot da consulta';
  assert rec.total_mensalidade = v_total, 'hotlink: preco do motor';
  -- servidor sem consulta (cargas, SQL Editor) segue livre
  insert into cotacoes (lead_id, fipe, tipo_veiculo_id, total_mensalidade) values (l_id, 70000, tv, 150);

  -- a consulta e imutavel e o navegador nao grava consulta
  ok := false;
  begin update fipe_consultas set valor = 1 where id = q1;
  exception when check_violation then ok := true; end;
  assert ok, 'consulta imutavel';
  assert not has_table_privilege('authenticated', 'fipe_consultas', 'INSERT'), 'navegador nao grava consulta';

  raise notice '=== TESTES 0180 (FIPE e cota pelo servidor, adesao) PASSARAM ===';
end $$;
