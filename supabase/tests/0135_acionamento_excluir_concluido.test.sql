-- Teste funcional da 0135: OS CONCLUIDA sem pagamento pode ser excluida (o
-- titulo em aberto sai junto); com pagamento, recusa.
\set ON_ERROR_STOP on
do $$
declare
  u uuid := gen_random_uuid();
  r_id uuid; c_id uuid; tv uuid; v1 uuid; s_reboque uuid; f1 uuid;
  a acionamentos_assistencia; j jsonb; ok boolean; lanc uuid;
begin
  insert into auth.users (id, email) values (u, 'adm135@teste.com');
  insert into regionais (nome) values ('Regional 135') returning id into r_id;
  insert into usuarios (id, nome, email, papel, regional_id) values (u, 'Admin', 'adm135@teste.com', 'admin', r_id);
  perform set_config('request.jwt.claim.sub', u::text, false);

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'Assistido 135', '11144477735', r_id) returning id into c_id;
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, status)
    values (c_id, 'EXC1A35', 'Onix', r_id, tv, 'ativo') returning id into v1;
  select id into s_reboque from servicos_assistencia where descricao = 'Reboque Passeio';
  insert into fornecedores (tipo_pessoa, documento, razao_social, prestador_assistencia)
    values ('PJ', '11222333000181', 'Guincho 135', true) returning id into f1;

  -- concluida, titulo em aberto: exclui e leva o titulo
  select * into a from abrir_acionamento(v1, s_reboque, 'Assistido', '11999998888');
  select * into a from confirmar_prestador_assistencia(a.id, f1, 230, 0, null, 30);
  select * into a from concluir_acionamento(a.id, 10);
  assert a.status::text = 'CONCLUIDO' and a.lancamento_id is not null, 'OS concluida com titulo';
  lanc := a.lancamento_id;
  j := excluir_acionamento(a.id, 'Aberto na placa errada');
  assert (j->>'lancamento_excluido')::boolean, 'titulo em aberto saiu junto';
  assert not exists (select 1 from acionamentos_assistencia where id = a.id), 'OS concluida excluida';
  assert not exists (select 1 from lancamentos_financeiros where id = lanc), 'titulo apagado';
  assert exists (select 1 from acionamento_exclusoes where acionamento_id = a.id and status = 'CONCLUIDO'),
    'trilha guarda que estava concluida';

  -- concluida e paga: recusa
  select * into a from abrir_acionamento(v1, s_reboque, 'Assistido', '11999998888');
  select * into a from confirmar_prestador_assistencia(a.id, f1, 230, 0, null, 30);
  select * into a from concluir_acionamento(a.id, 10);
  insert into baixas_financeiras (lancamento_id, data_pagamento, valor_pago, valor_liquido)
    values (a.lancamento_id, current_date, 230, 230);
  ok := false;
  begin perform excluir_acionamento(a.id, 'Tentativa com pagamento');
  exception when check_violation then ok := true; end;
  assert ok, 'OS paga nao se exclui';
  assert exists (select 1 from acionamentos_assistencia where id = a.id), 'OS paga intacta';

  assert (select count(*) from pg_proc where proname = 'excluir_acionamento') = 1, 'uma versao so';

  perform set_config('request.jwt.claim.sub', '', false);
  raise notice '=== TESTES DA 0135 PASSARAM ===';
end $$;
