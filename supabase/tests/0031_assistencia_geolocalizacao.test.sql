-- Teste funcional do 0031: geolocalizacao da OS 24h — sincronia jsonb -> colunas
-- planas, KM excedente calculado pela distancia da rota, recalculo dos valores
-- na edicao do trajeto e links de navegacao (Google/Waze).
\set ON_ERROR_STOP on
do $$
declare
  u_a uuid := gen_random_uuid();
  r_id uuid; c_id uuid; tv uuid; v_id uuid;
  serv uuid; forn uuid;
  a acionamentos_assistencia; lnk record;
begin
  -- setup -------------------------------------------------------------------
  insert into auth.users (id, email) values (u_a, 'geo@teste.com');
  insert into regionais (nome) values ('Regional Geo') returning id into r_id;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_a, 'Operador Geo', 'geo@teste.com', 'admin', r_id);
  perform set_config('request.jwt.claim.sub', u_a::text, false);

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'Cliente Geo', '11144477735', r_id) returning id into c_id;
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  if tv is null then insert into tipos_veiculo (nome) values ('Passeio') returning id into tv; end if;
  insert into veiculos (cliente_id, placa, modelo, regional_id, tipo_veiculo_id, status, data_ativacao)
    values (c_id, 'GEO1A11', 'Onix', r_id, tv, 'ativo', current_date - 30) returning id into v_id;

  -- servico com franquia de 50 km e R$ 3,00 por km excedente
  insert into servicos_assistencia (descricao, valor_padrao, cobra_km_excedente, valor_km_excedente,
                                    km_franquia, computa_limite, ativo)
    values ('Reboque Geo Teste', 200, true, 3, 50, false, true) returning id into serv;

  insert into fornecedores (tipo_pessoa, documento, razao_social, prestador_assistencia)
    values ('PJ', '11222333000181', 'Guincho Geo Ltda', true) returning id into forn;

  -- ------------------------------------------- A) jsonb -> colunas planas
  a := abrir_acionamento(
    v_id, serv, 'Joana', '65999990000',
    jsonb_build_object('logradouro', 'Avenida Mato Grosso', 'numero', '240',
                       'bairro', 'Centro-Norte', 'cidade', 'Cuiaba', 'uf', 'MT',
                       'lat', '-15.5989', 'lng', '-56.0949'),
    jsonb_build_object('logradouro', 'Rua Mirassol', 'numero', '54',
                       'bairro', 'Alvorada', 'cidade', 'Cuiaba', 'uf', 'MT',
                       'lat', '-15.5801', 'lng', '-56.0712'),
    null, 'veiculo parado'
  );
  assert a.endereco_origem = 'Avenida Mato Grosso, 240, Centro-Norte, Cuiaba, MT',
    format('endereco de origem: %s', a.endereco_origem);
  assert a.latitude_origem = -15.5989 and a.longitude_origem = -56.0949, 'coordenadas da origem';
  assert a.endereco_destino like 'Rua Mirassol, 54%', 'endereco de destino';
  assert a.latitude_destino = -15.5801, 'coordenada do destino';

  -- ------------------------------------- B) KM excedente pela rota calculada
  assert km_excedente_servico(serv, 40) = 0, 'dentro da franquia nao gera excedente';
  assert km_excedente_servico(serv, 72.4) = 22.4, 'excedente = distancia - franquia';

  -- prestador confirmado (OS gerada) para depois validar o recalculo
  a := confirmar_prestador_assistencia(a.id, forn, 200, 0, 3, 60);
  assert a.codigo_os is not null, 'OS gerada';
  assert a.valor_total = 200, 'sem excedente, total = servico';

  -- rota calculada: 72,4 km -> 22,4 km excedentes x R$3 = R$ 67,20
  a := definir_trajeto_acionamento(a.id, null, null, 72.4, 95, 'polyline_fake');
  assert a.distancia_km_calculada = 72.4, 'distancia gravada';
  assert a.duracao_minutos = 95, 'duracao gravada';
  assert a.rota_calculada_em is not null, 'carimba quando a rota foi calculada';
  assert a.km_excedente = 22.4, format('km excedente: %s', a.km_excedente);
  assert a.valor_km_excedente = 67.20, format('valor do km excedente: %s', a.valor_km_excedente);
  assert a.valor_total = 267.20, format('total da OS: %s', a.valor_total);
  assert a.km_previsto = 72.4, 'km previsto acompanha a rota';

  -- ------------------------------ C) edicao do trajeto recalcula tudo de novo
  a := definir_trajeto_acionamento(
    a.id,
    null,
    jsonb_build_object('logradouro', 'Avenida Historiador Rubens de Mendonca',
                       'cidade', 'Cuiaba', 'uf', 'MT', 'lat', '-15.5750', 'lng', '-56.0800'),
    60, 80, 'polyline_nova'
  );
  assert a.endereco_destino like 'Avenida Historiador%', 'destino novo espelhado na coluna plana';
  assert a.latitude_destino = -15.5750, 'coordenada do destino novo';
  assert a.km_excedente = 10, format('km excedente recalculado: %s', a.km_excedente);
  assert a.valor_total = 230, format('total recalculado: %s', a.valor_total);

  -- o titulo em Contas a Pagar acompanha o novo valor (sincronia do 0027)
  a := concluir_acionamento(a.id, 60);
  assert a.lancamento_id is not null, 'lancamento gerado';
  assert (select valor_original from lancamentos_financeiros where id = a.lancamento_id) = 230,
    'contas a pagar com o valor recalculado';

  -- override manual do atendente prevalece sobre o calculo da rota
  a := definir_trajeto_acionamento(a.id, null, null, 60, null, null, 4, 'acordo com o prestador');
  assert a.km_excedente = 4, format('override manual: %s', a.km_excedente);

  -- a edicao do trajeto fica na auditoria da OS (trigger do 0027)
  assert exists (select 1 from acionamento_edicoes where acionamento_id = a.id and campo = 'km_excedente'),
    'edicao do trajeto auditada';

  -- ------------------------------------------------- D) links de navegacao
  select * into lnk from links_navegacao_acionamento(a.id);
  assert lnk.google_rota like 'https://www.google.com/maps/dir/?api=1&origin=-15.5989,-56.0949&destination=%',
    format('link do google: %s', lnk.google_rota);
  assert lnk.google_rota like '%travelmode=driving', 'rota de carro';
  assert lnk.waze_origem = 'https://waze.com/ul?ll=-15.5989,-56.0949&navigate=yes',
    format('link do waze: %s', lnk.waze_origem);

  -- sem coordenada, cai no endereco em texto (url encodado)
  update acionamentos_assistencia
     set origem = jsonb_build_object('logradouro', 'Rua Sem GPS', 'cidade', 'Cuiaba', 'uf', 'MT')
   where id = a.id;
  select * into lnk from links_navegacao_acionamento(a.id);
  assert lnk.google_origem like '%query=Rua+Sem+GPS,+Cuiaba,+MT',
    format('fallback por endereco: %s', lnk.google_origem);

  raise notice '=== TESTES 0031 (geolocalizacao da assistencia 24h) PASSARAM ===';
end $$;
