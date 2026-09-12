-- Teste funcional da 0075 — o NUMERO DO MOTOR chega ate o veiculo.
--
-- A consulta por placa sempre devolveu chassi, cor e numero do motor; o proxy
-- descartava. Corrigido o descarte, sobrava o outro fim do cano: sem coluna, o
-- dado seria jogado fora de novo — e, pior, seria jogado fora SO na rota da
-- venda, que e justamente onde a placa e consultada primeiro. Esta suite prova
-- que o campo atravessa lead -> Auditoria -> veiculo.
\set ON_ERROR_STOP on
do $$
declare
  u_id uuid := gen_random_uuid();
  r_id uuid; tv uuid; pl uuid; v_id uuid;
  l_id uuid; vist_id uuid; veic uuid;
  v_txt text;
begin
  insert into auth.users (id, email) values (u_id, 'aud75@t.com');
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('Unidade 75', 1.0, 0.15) returning id into r_id;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_id, 'Auditor', 'aud75@t.com', 'admin', r_id);
  perform set_config('request.jwt.claim.sub', u_id::text, false);

  select id into tv from tipos_veiculo limit 1;
  select id into pl from planos_protecao limit 1;
  insert into vendedores (nome, regional_id, ativo) values ('VEND 75', r_id, false)
    returning id into v_id;

  -- ==========================================================================
  -- (A) A COLUNA EXISTE NAS DUAS PONTAS
  -- ==========================================================================
  -- O veiculo nasce por dois caminhos (cadastro direto e rota da venda). Uma
  -- coluna so em `veiculos` faria o motor sumir em toda venda.
  assert exists (select 1 from information_schema.columns
                  where table_name = 'veiculos' and column_name = 'numero_motor'),
    'veiculos.numero_motor tem de existir';
  assert exists (select 1 from information_schema.columns
                  where table_name = 'leads' and column_name = 'numero_motor'),
    'leads.numero_motor tem de existir — senao a venda perde o dado';

  -- ==========================================================================
  -- (B) O MOTOR ATRAVESSA A AUDITORIA, NORMALIZADO
  -- ==========================================================================
  insert into leads (nome, celular, regional_id, consultor_id, status)
    values ('Cliente 75', '11988887777', r_id, u_id, 'EM_AUDITORIA') returning id into l_id;

  update leads set
    nome = 'CLIENTE SETENTA E CINCO', cpf_cnpj = '11144477735', tipo_pessoa = 'PF',
    email = 'c75@t.com', rg_ie = '12.345.678-9', data_nascimento = '1985-03-12',
    endereco = jsonb_build_object('cep','01310100','logradouro','Av Paulista',
                                  'numero','1000','bairro','Bela Vista','cidade','Sao Paulo','uf','SP'),
    placa = 'MTR1A23', chassi = '9BRBD3HE1K0445518', renavam = '12345678901',
    -- como chega da API quando o atendente nao toca: com espaco e caixa baixa
    numero_motor = '  m650484  ',
    marca = 'TOYOTA', modelo = 'COROLLA', ano_fabricacao = 2019, ano_modelo = 2019,
    cor = 'PRETA', valor_fipe = 102077, tipo_veiculo_id = tv,
    crlv_qrcode = 'https://gov.br/crlv/xyz', plano_id = pl, vendedor_id = v_id,
    adesao_forma = 'VENDEDOR_NA_HORA', adesao_valor = 350, adesao_recebida_em = current_date
  where id = l_id;

  insert into vistorias (lead_id, tipo, status, data_vistoria)
    values (l_id, 'inicial', 'PENDENTE', current_date) returning id into vist_id;
  insert into vistoria_anexos (vistoria_id, url, tipo) values
    (vist_id, 'f1.jpg', 'FRENTE'), (vist_id, 'f2.jpg', 'TRASEIRA'),
    (vist_id, 'f3.jpg', 'LATERAL_ESQUERDA'), (vist_id, 'f4.jpg', 'LATERAL_DIREITA'),
    (vist_id, 'f5.jpg', 'CHASSI'), (vist_id, 'f6.jpg', 'HODOMETRO');

  veic := autorizar_entrada_lead(l_id);
  select numero_motor into v_txt from veiculos where id = veic;
  assert v_txt = 'M650484',
    format('o motor tem de chegar ao veiculo em caixa alta e sem espaco; veio %L', v_txt);

  -- o chassi continua normalizado como sempre foi (regressao da 0034)
  select chassi into v_txt from veiculos where id = veic;
  assert v_txt = '9BRBD3HE1K0445518', format('chassi: %L', v_txt);

  -- ==========================================================================
  -- (C) O MOTOR E OPCIONAL — a maioria da base nao tem, e nao pode travar
  -- ==========================================================================
  insert into leads (nome, celular, regional_id, consultor_id, status)
    values ('Cliente 75B', '11977776666', r_id, u_id, 'EM_AUDITORIA') returning id into l_id;
  update leads set
    nome = 'CLIENTE SETENTA E CINCO B', cpf_cnpj = '52998224725', tipo_pessoa = 'PF',
    email = 'c75b@t.com', rg_ie = '12.345.678-9', data_nascimento = '1985-03-12',
    endereco = jsonb_build_object('cep','01310100','logradouro','Av Paulista',
                                  'numero','1000','bairro','Bela Vista','cidade','Sao Paulo','uf','SP'),
    placa = 'MTR2B34', chassi = '9BWZZZ377VT004251', renavam = '10987654321',
    numero_motor = '   ',   -- so espaco: tem de virar NULL, nunca string vazia
    marca = 'VW', modelo = 'GOL', ano_fabricacao = 2020, ano_modelo = 2021,
    cor = 'PRATA', valor_fipe = 45000, tipo_veiculo_id = tv,
    crlv_qrcode = 'https://gov.br/crlv/abc', plano_id = pl, vendedor_id = v_id,
    adesao_forma = 'VENDEDOR_NA_HORA', adesao_valor = 350, adesao_recebida_em = current_date
  where id = l_id;

  insert into vistorias (lead_id, tipo, status, data_vistoria)
    values (l_id, 'inicial', 'PENDENTE', current_date) returning id into vist_id;
  insert into vistoria_anexos (vistoria_id, url, tipo) values
    (vist_id, 'f1.jpg', 'FRENTE'), (vist_id, 'f2.jpg', 'TRASEIRA'),
    (vist_id, 'f3.jpg', 'LATERAL_ESQUERDA'), (vist_id, 'f4.jpg', 'LATERAL_DIREITA'),
    (vist_id, 'f5.jpg', 'CHASSI'), (vist_id, 'f6.jpg', 'HODOMETRO');

  veic := autorizar_entrada_lead(l_id);
  select numero_motor into v_txt from veiculos where id = veic;
  assert v_txt is null,
    format('motor em branco tem de virar NULL (string vazia colide em unique futuro); veio %L', v_txt);

  -- ==========================================================================
  -- (D) DUAS FICHAS PODEM TER O MESMO MOTOR — nao e unique, e de proposito
  -- ==========================================================================
  -- Motor se troca entre carros e base legada repete. A duplicidade que
  -- interessa e relatorio, no padrao das divergencias do parque de
  -- rastreadores (0050) — nao constraint que recusa cadastro no balcao.
  update veiculos set numero_motor = 'M650484' where id = veic;
  assert (select count(*) from veiculos where numero_motor = 'M650484') = 2,
    'o banco NAO deve recusar motor repetido';

  raise notice '=== TESTES 0075 (numero do motor) PASSARAM ===';
end $$;
