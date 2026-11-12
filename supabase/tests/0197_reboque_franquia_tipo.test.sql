-- Teste funcional: franquia do reboque pelo tipo do veiculo (0197)
\set ON_ERROR_STOP on
do $$
declare
  u_a uuid := gen_random_uuid();
  r_id uuid; c_id uuid; tv_moto uuid; tv_carro uuid; v_moto uuid; v_carro uuid; v_sem uuid; tv_sem uuid;
  serv uuid; serv_comum uuid; forn uuid;
  a acionamentos_assistencia;
begin
  insert into auth.users (id, email) values (u_a, 'reb197@teste.com');
  insert into regionais (nome) values ('Regional 197') returning id into r_id;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_a, 'Operador 197', 'reb197@teste.com', 'admin', r_id);
  perform set_config('request.jwt.claim.sub', u_a::text, false);

  insert into tipos_veiculo (nome, km_reboque_ida, km_reboque_volta) values ('Moto 197', 200, 200) returning id into tv_moto;
  insert into tipos_veiculo (nome, km_reboque_ida, km_reboque_volta) values ('Passeio 197', 1000, 1000) returning id into tv_carro;
  insert into tipos_veiculo (nome) values ('Sem km 197') returning id into tv_sem;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'Cliente 197', '11144477735', r_id) returning id into c_id;
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, status, data_ativacao)
    values (c_id, 'MOT1A97', 'CG', r_id, tv_moto, 'ativo', current_date - 30) returning id into v_moto;
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, status, data_ativacao)
    values (c_id, 'CAR1A97', 'Onix', r_id, tv_carro, 'ativo', current_date - 30) returning id into v_carro;
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, status, data_ativacao)
    values (c_id, 'SEM1A97', 'X', r_id, tv_sem, 'ativo', current_date - 30) returning id into v_sem;

  insert into servicos_assistencia (descricao, valor_padrao, cobra_km_excedente, valor_km_excedente,
                                    km_franquia, computa_limite, ativo, franquia_pelo_tipo)
    values ('Reboque 197', 200, true, 3, 50, false, true, true) returning id into serv;
  insert into servicos_assistencia (descricao, valor_padrao, cobra_km_excedente, valor_km_excedente,
                                    km_franquia, computa_limite, ativo)
    values ('Comum 197', 100, true, 3, 50, false, true) returning id into serv_comum;

  -- franquia efetiva
  assert franquia_km_servico(serv, v_moto) = 200, 'moto usa 200 km do tipo';
  assert franquia_km_servico(serv, v_carro) = 1000, 'carro usa 1000 km do tipo';
  assert franquia_km_servico(serv, v_sem) = 50, 'tipo sem km cai no servico';
  assert franquia_km_servico(serv_comum, v_carro) = 50, 'servico nao marcado segue o servico';

  -- excedente
  assert km_excedente_servico(serv, 250, v_moto) = 50, 'moto 250 km -> 50 excedentes';
  assert km_excedente_servico(serv, 250, v_carro) = 0, 'carro 250 km dentro da franquia';
  assert km_excedente_servico(serv, 250) = 200, 'a versao antiga (2 args) segue no km do servico';

  -- definir_trajeto usa o veiculo do acionamento
  insert into fornecedores (tipo_pessoa, documento, razao_social, prestador_assistencia)
    values ('PJ', '11222333000181', 'Guincho 197 Ltda', true) returning id into forn;
  a := abrir_acionamento(v_moto, serv, 'Joana', '65999990000', null, null, null, 'parada');
  a := confirmar_prestador_assistencia(a.id, forn, 200, 0, 3, 60);
  a := definir_trajeto_acionamento(a.id, null, null, 230, 180, null, null, 'rota');
  assert a.km_excedente = 30, format('moto 230 km -> 30 excedentes, veio %s', a.km_excedente);
  assert a.valor_total = 290, format('200 + 30 x 3 = 290, veio %s', a.valor_total);

  raise notice '=== TESTES 0197 (franquia do reboque pelo tipo) PASSARAM ===';
end $$;
