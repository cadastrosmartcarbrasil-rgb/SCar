-- Teste funcional da rota de venda completa (0034)
\set ON_ERROR_STOP on
do $$
declare
  u_id uuid := gen_random_uuid();
  u_vend uuid := gen_random_uuid();
  r_id uuid; v_id uuid; tv uuid; pl uuid;
  l_id uuid; vist_id uuid; veic uuid; cli uuid;
  n int; v_txt text; v_num numeric;
  rec record;
begin
  -- ------------------------------------------------------------------ setup
  insert into auth.users (id, email) values (u_id, 'aud@teste.com'), (u_vend, 'vend@teste.com');
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('Franquia SP', 1.0, 0.15) returning id into r_id;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_id, 'Auditor', 'aud@teste.com', 'admin', r_id),
           (u_vend, 'Vendedor Joao', 'vend@teste.com', 'consultor_vendas', r_id);
  perform set_config('request.jwt.claim.sub', u_id::text, false);

  -- ------------------------------------------------- (A) teto da comissao
  insert into vendedores (usuario_id, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente)
    values (u_vend, r_id, 1.0, 0.05) returning id into v_id;
  raise notice 'OK vendedor dentro do teto da regional';

  begin
    update vendedores set taxa_comissao_recorrente = 0.20 where id = v_id;
    raise exception 'FALHOU: aceitou comissao do vendedor acima da regional';
  exception when check_violation then
    raise notice 'OK vendedor nao pode passar a comissao da regional';
  end;

  begin
    update regionais set taxa_comissao_recorrente = 0.02 where id = r_id;
    raise exception 'FALHOU: reduziu a regional deixando vendedor acima';
  exception when check_violation then
    raise notice 'OK regional nao pode cair abaixo do vendedor sem ajustar antes';
  end;

  select * into rec from limite_comissao_regional(r_id);
  assert rec.adesao = 1.0 and rec.recorrente = 0.15, 'limite_comissao_regional';

  -- ------------------------------------------------- (B) checklist do lead
  select id into tv from tipos_veiculo limit 1;
  select id into pl from planos_protecao limit 1;

  insert into leads (nome, celular, regional_id, consultor_id, status)
    values ('Maria', '11999999999', r_id, u_id, 'EM_AUDITORIA') returning id into l_id;

  select count(*) into n from checklist_lead(l_id) where not ok;
  assert n > 10, 'lead vazio deveria ter muitos pendentes, veio ' || n;
  assert not lead_pronto_para_base(l_id), 'lead vazio nao pode estar pronto';
  raise notice 'OK checklist acusa lead incompleto';

  -- a autorizacao TEM de recusar enquanto falta dado
  begin
    perform autorizar_entrada_lead(l_id);
    raise exception 'FALHOU: entrou na base sem ficha completa';
  exception when check_violation then
    raise notice 'OK entrada na base bloqueada por cadastro incompleto';
  end;

  -- ------------------------------------------------- preenche a ficha toda
  update leads set
    nome = 'Maria Souza Lima', cpf_cnpj = '11144477735', tipo_pessoa = 'PF',
    email = 'maria@teste.com', rg_ie = '12.345.678-9', data_nascimento = '1985-03-12',
    endereco = jsonb_build_object('cep','01310100','logradouro','Av Paulista',
                                  'numero','1000','bairro','Bela Vista','cidade','Sao Paulo','uf','SP'),
    placa = 'ABC1D23', chassi = '9BWZZZ377VT004251', renavam = '12345678901',
    marca = 'VW', modelo = 'Gol', ano_fabricacao = 2020, ano_modelo = 2021, cor = 'Prata',
    valor_fipe = 45000, tipo_veiculo_id = tv, crlv_qrcode = 'https://gov.br/crlv/xyz',
    plano_id = pl, vendedor_id = v_id,
    adesao_forma = 'VENDEDOR_NA_HORA', adesao_valor = 350, adesao_recebida_em = current_date
  where id = l_id;

  -- vistoria com fotos (ainda sem veiculo: nasce no lead)
  insert into vistorias (lead_id, tipo, status, data_vistoria)
    values (l_id, 'inicial', 'PENDENTE', current_date) returning id into vist_id;
  insert into vistoria_anexos (vistoria_id, url, tipo) values
    (vist_id, 'f1.jpg', 'frente'), (vist_id, 'f2.jpg', 'traseira'), (vist_id, 'f3.jpg', 'lateral');

  select count(*) into n from checklist_lead(l_id) where not ok;
  assert n = 1, 'so as fotos deveriam faltar, faltam ' || n;
  select item into v_txt from checklist_lead(l_id) where not ok;
  assert v_txt like 'Fotos%', 'o pendente deveria ser as fotos, veio ' || v_txt;
  raise notice 'OK checklist exige o minimo de fotos da vistoria';

  insert into vistoria_anexos (vistoria_id, url, tipo) values (vist_id, 'f4.jpg', 'motor');
  assert lead_pronto_para_base(l_id), 'com tudo preenchido deveria estar pronto';

  -- ------------------------------------------------- (C) adesao na mao do vendedor
  veic := autorizar_entrada_lead(l_id);
  assert veic is not null, 'deveria devolver o veiculo criado';
  raise notice 'OK entrada na base com ficha completa';

  select * into rec from veiculos where id = veic;
  assert rec.chassi = '9BWZZZ377VT004251', 'chassi nao migrou';
  assert rec.renavam = '12345678901', 'renavam nao migrou';
  assert rec.cor = 'Prata' and rec.ano_fabricacao = 2020, 'ficha do veiculo incompleta';
  assert rec.vendedor_id = v_id, 'vendedor nao vinculado ao veiculo';
  assert rec.plano_protecao_id = pl, 'plano nao vinculado';

  select * into rec from clientes where id = (select cliente_id from leads where id = l_id);
  assert rec.rg_ie = '12.345.678-9', 'RG nao migrou para o associado';
  assert rec.endereco->>'cep' = '01310100', 'endereco nao migrou';
  raise notice 'OK ficha do associado e do veiculo migradas por inteiro';

  select count(*) into n from vistorias where veiculo_id = veic and lead_id = l_id;
  assert n = 1, 'a vistoria da venda deveria virar a vistoria do veiculo';
  raise notice 'OK vistoria da venda vira vistoria do veiculo';

  -- adesao na mao do vendedor NAO pode gerar nada no financeiro
  select count(*) into n from lancamentos_financeiros
   where observacoes like '%' || l_id::text || '%';
  assert n = 0, 'adesao recebida pelo vendedor nao pode entrar no financeiro, achei ' || n;

  select count(*) into n from comissoes_vendas
   where veiculo_id = veic and is_adesao and status_pagamento = 'pago';
  assert n = 1, 'deveria registrar a comissao ja quitada na origem';
  raise notice 'OK adesao recebida pelo vendedor fica fora do caixa';

  -- ------------------------------------------------- adesao pelo nosso sistema
  insert into leads (nome, celular, cpf_cnpj, tipo_pessoa, email, rg_ie, data_nascimento,
                     endereco, placa, chassi, renavam, marca, modelo, ano_fabricacao, ano_modelo,
                     cor, valor_fipe, tipo_veiculo_id, crlv_qrcode, plano_id, vendedor_id,
                     regional_id, consultor_id, status, adesao_forma, adesao_valor)
  values ('Jose Carlos Silva', '11988888888', '52998224725', 'PF', 'jose@teste.com', '99.888.777-6',
          '1979-01-05',
          jsonb_build_object('cep','01310100','logradouro','Rua B','numero','20','bairro','Centro','cidade','Sao Paulo','uf','SP'),
          'XYZ9K88', '9BWZZZ377VT004252', '98765432109', 'Fiat', 'Argo', 2022, 2023, 'Branco',
          60000, tv, 'https://gov.br/crlv/abc', pl, v_id, r_id, u_id, 'EM_AUDITORIA', 'BOLETO', 500)
  returning id into l_id;

  insert into vistorias (lead_id, tipo, status) values (l_id, 'inicial', 'PENDENTE') returning id into vist_id;
  insert into vistoria_anexos (vistoria_id, url) values
    (vist_id, 'a.jpg'), (vist_id, 'b.jpg'), (vist_id, 'c.jpg'), (vist_id, 'd.jpg');

  veic := autorizar_entrada_lead(l_id);

  select count(*) into n from lancamentos_financeiros
   where tipo = 'RECEITA' and observacoes like '%' || l_id::text || '%';
  assert n = 1, 'adesao no boleto deveria virar titulo a receber, achei ' || n;

  select valor_comissao into v_num from comissoes_vendas
   where veiculo_id = veic and is_adesao;
  assert v_num = 500.00, 'vendedor com 100% de adesao deveria ter 500, veio ' || v_num;
  select count(*) into n from comissoes_vendas
   where veiculo_id = veic and is_adesao and status_pagamento = 'pendente';
  assert n = 1, 'comissao deveria nascer pendente para repasse';
  raise notice 'OK adesao pelo nosso sistema vira receita + comissao pendente';

  -- ------------------------------------------------- repasse ao vendedor
  select id into v_txt from comissoes_vendas where veiculo_id = veic and is_adesao;
  perform repassar_comissao_vendedor(v_txt::uuid);
  select count(*) into n from lancamentos_financeiros
   where tipo = 'DESPESA' and observacoes like '%' || v_txt || '%';
  assert n = 1, 'o repasse deveria virar contas a pagar';
  assert (select status_pagamento from comissoes_vendas where id = v_txt::uuid) = 'pago',
         'comissao deveria ficar paga apos o repasse';
  raise notice 'OK repasse da comissao vira contas a pagar';

  raise notice '=== TESTES 0034 (rota de venda completa) PASSARAM ===';
end $$;
