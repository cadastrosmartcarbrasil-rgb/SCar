-- Teste funcional da 0150: o BOLETO AVULSO do SAC — catalogo, permissao,
-- validacoes, a emissao pela maquina da 2a via e o que ele NAO e (mensalidade:
-- fora do painel de inadimplencia, da trava da 24h; DRE na categoria do tipo).
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_con uuid := gen_random_uuid();
  r1 uuid; tv uuid; c1 uuid; c2 uuid; ve uuid; ve2 uuid;
  t_vist uuid; t_avulso uuid; t_venda uuid;
  rn uuid; rn2 uuid; tit uuid; ok boolean; n bigint; d record;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into auth.users (id, email) values (u_adm,'adm150@t.com'), (u_con,'con150@t.com');
  insert into regionais (nome) values ('U150') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm150@t.com','admin', null),
    (u_con,'Consultor','con150@t.com','consultor_vendas', r1);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','AVULSO 150','52998224725', r1) returning id into c1;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','OUTRO 150','11144477735', r1) returning id into c2;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade, cobranca_externa)
    values (c1,'AVL1A50', r1, tv, 'ativo', v_hoje - 100, 150, true) returning id into ve;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade, cobranca_externa)
    values (c2,'AVL2B50', r1, tv, 'ativo', v_hoje - 100, 150, true) returning id into ve2;

  -- ============================================== A) catalogo
  select count(*) into n from tipos_boleto_avulso where ativo;
  assert n = 11, format('a lista inicial tem 11 tipos (veio %s)', n);
  select id into t_vist from tipos_boleto_avulso where nome = 'Vistoria';
  select id into t_avulso from tipos_boleto_avulso where nome = 'Avulso';
  select id into t_venda from tipos_boleto_avulso where nome = 'Venda de Rastreador';
  assert (select exige_veiculo from tipos_boleto_avulso where id = t_vist), 'vistoria exige o veiculo';
  assert (select c.codigo_estruturado from tipos_boleto_avulso t join categorias_dre c on c.id = t.categoria_dre_id
           where t.nome = 'Adesão') = '3.1.1.03', 'adesao vai para a receita de adesao';

  -- ============================================== B) validacoes
  ok := false;
  begin perform criar_boleto_avulso(c1, t_vist, 80, v_hoje + 5);
  exception when check_violation then ok := true; end;
  assert ok, 'vistoria sem veiculo e recusada';

  ok := false;
  begin perform criar_boleto_avulso(c1, t_vist, 80, v_hoje + 5, ve2);
  exception when check_violation then ok := true; end;
  assert ok, 'veiculo de outro associado e recusado';

  ok := false;
  begin perform criar_boleto_avulso(c1, t_avulso, 0, v_hoje + 5);
  exception when check_violation then ok := true; end;
  assert ok, 'valor zero e recusado';

  ok := false;
  begin perform criar_boleto_avulso(c1, t_avulso, 50, v_hoje - 1);
  exception when check_violation then ok := true; end;
  assert ok, 'vencimento no passado e recusado';

  ok := false;
  begin perform criar_boleto_avulso(c1, t_avulso, 50, v_hoje + 91);
  exception when check_violation then ok := true; end;
  assert ok, 'vencimento depois de 90 dias e recusado';

  update tipos_boleto_avulso set ativo = false where id = t_venda;
  ok := false;
  begin perform criar_boleto_avulso(c1, t_venda, 50, v_hoje + 5);
  exception when check_violation then ok := true; end;
  assert ok, 'tipo inativo e recusado';
  update tipos_boleto_avulso set ativo = true where id = t_venda;

  -- ============================================== C) permissao
  perform set_config('request.jwt.claim.sub', u_con::text, false);
  ok := false;
  begin perform criar_boleto_avulso(c1, t_avulso, 50, v_hoje + 5);
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'consultor de vendas sem Cobranca: Criar nao emite';
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- ============================================== D) emissao (vencido de proposito, para testar as travas)
  rn := criar_boleto_avulso(c1, t_vist, 80, v_hoje + 3, ve, 'vistoria de retorno');
  select id into tit from titulos_financeiros where renegociacao_id = rn;
  assert (select tipo from cobranca_renegociacoes where id = rn) = 'AVULSO', 'renegociacao AVULSO';
  assert (select situacao from cobranca_renegociacoes where id = rn) = 'EMITINDO', 'nasce emitindo';
  assert (select tipo_avulso_id from titulos_financeiros where id = tit) = t_vist, 'titulo marcado com o tipo';
  assert (select observacao from titulos_financeiros where id = tit) = 'Boleto avulso — Vistoria: vistoria de retorno', 'observacao';
  assert (select count(*) from cobranca_renegociacao_origens where renegociacao_id = rn) = 0, 'sem origens';

  assert finalizar_emissao_renegociacao(rn, null, jsonb_build_array(jsonb_build_object(
    'titulo_id', tit, 'nosso_numero', '261000150', 'linha_digitavel', '7489...150'))) = 'EMITIDA';
  assert (select count(*) from renegociacoes_do_cliente(c1) where tipo = 'AVULSO') = 1, 'aparece na lista do associado';

  -- sem veiculo (Avulso)
  rn2 := criar_boleto_avulso(c1, t_avulso, 40, v_hoje + 3);
  assert (select veiculo_id from titulos_financeiros where renegociacao_id = rn2) is null, 'sem veiculo';
  assert finalizar_emissao_renegociacao(rn2, null, '[]'::jsonb) = 'ERRO', 'sem linha digitavel o banco recusou';
  assert (select status::text from titulos_financeiros where renegociacao_id = rn2) = 'cancelado', 'recusa cancela o titulo';

  -- ============================================== E) nao e mensalidade
  update titulos_financeiros set data_vencimento = v_hoje - 30 where id = tit;
  assert not exists (select 1 from cobranca_boletos_base() where boleto_id = tit), 'fora do painel de inadimplencia';
  assert (select boletos from vencidos_veiculo(ve, 1)) = 0, 'nao bloqueia a 24h';

  update titulos_financeiros set status = 'pago', valor_pago = 80, data_pagamento = v_hoje where id = tit;
  select * into d from dre_movimentos(v_hoje - 1, v_hoje + 1, null, 'CAIXA') where valor = 80;
  assert d.categoria_codigo = '3.1.1.04', format('DRE na categoria do tipo (veio %s)', d.categoria_codigo);

  raise notice '=== 0150 boleto avulso: TODOS OS TESTES PASSARAM ===';
end $$;
