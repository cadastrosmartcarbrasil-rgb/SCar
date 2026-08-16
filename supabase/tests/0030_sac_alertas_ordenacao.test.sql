-- Teste funcional do 0030: alertas do veiculo (abertura idempotente, tipo
-- desativado no catalogo continua visivel, resolucao com autor) e ordenacao
-- padrao das listagens de veiculo (ativos primeiro).
\set ON_ERROR_STOP on
do $$
declare
  u_a uuid := gen_random_uuid();
  r_id uuid; c_id uuid; tv uuid;
  v_ativo uuid; v_susp uuid; v_inativo uuid; v_baixado uuid; v_evento uuid;
  ta_doc uuid; ta_vist uuid; ta_off uuid;
  al veiculo_alertas; rec record; placas text[];
begin
  -- setup -------------------------------------------------------------------
  insert into auth.users (id, email) values (u_a, 'alerta@teste.com');
  insert into regionais (nome) values ('Regional Alertas') returning id into r_id;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_a, 'Atendente Alerta', 'alerta@teste.com', 'admin', r_id);
  perform set_config('request.jwt.claim.sub', u_a::text, false);

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'Cliente Alertas', '11144477735', r_id) returning id into c_id;
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  if tv is null then insert into tipos_veiculo (nome) values ('Passeio') returning id into tv; end if;

  -- ativacao em datas diferentes p/ conferir o desempate (recentes primeiro)
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, status, data_ativacao)
    values (c_id, 'ALT1A11', 'Onix',   r_id, tv, 'ativo',    current_date - 10) returning id into v_ativo;
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, status, data_ativacao)
    values (c_id, 'ALT2B22', 'HB20',   r_id, tv, 'suspenso', current_date - 20) returning id into v_susp;
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, status, data_ativacao)
    values (c_id, 'ALT3C33', 'Argo',   r_id, tv, 'inativo',  current_date - 30) returning id into v_inativo;
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, status, data_ativacao)
    values (c_id, 'ALT4D44', 'Ka',     r_id, tv, 'baixado',  current_date - 40) returning id into v_baixado;
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, status, data_ativacao)
    values (c_id, 'ALT5E55', 'Mobi',   r_id, tv, 'em_evento', current_date - 5) returning id into v_evento;

  select id into ta_doc  from tipos_alerta where nome = 'Falta de documentos';
  select id into ta_vist from tipos_alerta where nome = 'Vistoria pendente';

  -- ------------------------------------------------ A) abertura e idempotencia
  al := abrir_alerta_veiculo(v_ativo, ta_doc, 'CRLV 2026 pendente');
  assert al.ativo, 'alerta nasce ativo';
  assert al.created_by = u_a, 'grava quem abriu';

  -- abrir de novo o MESMO tipo nao duplica (era o que fazia o SAC contar 2)
  al := abrir_alerta_veiculo(v_ativo, ta_doc, 'CRLV 2026 e comprovante');
  assert (select count(*) from veiculo_alertas where veiculo_id = v_ativo and ativo) = 1,
    'nao pode duplicar alerta ativo do mesmo tipo';
  assert al.mensagem = 'CRLV 2026 e comprovante', 'mensagem e atualizada na reabertura';

  -- ---------------------------- B) tipo desativado no catalogo continua visivel
  -- (o bug da placa EWG9B46: o formulario montava as opcoes so com tipos ativos)
  insert into tipos_alerta (nome, descricao, severidade, ativo)
    values ('Bloqueio Administrativo Legado', 'tipo aposentado', 'ALTA', false)
    returning id into ta_off;
  perform abrir_alerta_veiculo(v_ativo, ta_off, 'pendencia herdada da migracao');

  assert (select count(*) from alertas_veiculo(v_ativo)) = 2,
    'os dois alertas ativos precisam aparecer na ficha';
  select * into rec from alertas_veiculo(v_ativo) where tipo_alerta_id = ta_off;
  assert rec.tipo_ativo = false, 'o tipo vem marcado como desativado no catalogo';
  assert rec.nome = 'Bloqueio Administrativo Legado', 'o nome do tipo acompanha o alerta';

  -- o que a ficha mostra e exatamente o que o SAC conta
  assert (select alertas_qtd from veiculos_do_cliente(c_id) where id = v_ativo)
       = (select count(*) from alertas_veiculo(v_ativo)),
    'contador do SAC e lista da ficha precisam bater';

  -- ------------------------------------------------------------ C) resolucao
  select * into rec from alertas_veiculo(v_ativo) where tipo_alerta_id = ta_doc;
  al := resolver_alerta_veiculo(rec.id, 'documento recebido no atendimento');
  assert not al.ativo, 'resolver desativa o alerta';
  assert al.resolvido_por = u_a and al.resolvido_em is not null, 'grava quem resolveu e quando';
  assert (select alertas_qtd from veiculos_do_cliente(c_id) where id = v_ativo) = 1,
    'o contador do SAC cai ao resolver';

  -- resolvido some da fila, mas continua no historico
  assert not exists (select 1 from alertas_veiculo(v_ativo) where id = al.id),
    'alerta resolvido sai da lista ativa';
  assert exists (select 1 from alertas_veiculo(v_ativo, true) where id = al.id),
    'alerta resolvido fica no historico';

  -- resolver duas vezes e recusado
  begin
    perform resolver_alerta_veiculo(al.id, 'de novo');
    assert false, 'deveria recusar resolver alerta ja resolvido';
  exception when others then null;
  end;

  -- e o tipo resolvido pode ser reaberto (novo ciclo)
  al := abrir_alerta_veiculo(v_ativo, ta_doc, 'voltou a pendencia');
  assert al.ativo, 'reabertura cria um alerta novo';

  -- --------------------------------------------------------- D) ordenacao
  assert ordem_status_veiculo('ativo') < ordem_status_veiculo('suspenso'),
    'ativo vem antes de suspenso';
  assert ordem_status_veiculo('suspenso') < ordem_status_veiculo('inativo'),
    'suspenso vem antes de inativo';
  assert ordem_status_veiculo('inativo') < ordem_status_veiculo('baixado'),
    'inativo vem antes de cancelado/baixado';

  select array_agg(placa order by ord) into placas
    from (select placa, row_number() over () as ord from veiculos_do_cliente(c_id)) x;
  assert placas = array['ALT1A11','ALT5E55','ALT2B22','ALT3C33','ALT4D44'],
    format('ordem inesperada: %s', placas);

  -- veiculo excluido nao entra na listagem do SAC
  update veiculos set status = 'excluido' where id = v_baixado;
  assert not exists (select 1 from veiculos_do_cliente(c_id) where id = v_baixado),
    'veiculo excluido fica fora da listagem';

  -- desempate por data de ativacao (mais recente primeiro) entre dois ativos
  update veiculos set status = 'ativo' where id = v_susp;   -- ativado ha 20 dias
  select placa into rec from veiculos_do_cliente(c_id) limit 1;
  assert rec.placa = 'ALT1A11', format('o ativo mais recente deve liderar, veio %s', rec.placa);

  raise notice '=== TESTES 0030 (alertas do veiculo + ordenacao) PASSARAM ===';
end $$;
