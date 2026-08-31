-- Teste funcional do portal da Regional (0036)
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_g1  uuid := gen_random_uuid();
  u_g2  uuid := gen_random_uuid();
  r1 uuid; r2 uuid; v1 uuid; v2 uuid; c1 uuid; ve1 uuid; l1 uuid;
  n int; v_num numeric; v_txt text; rec record;
begin
  -- ------------------------------------------------------------------ setup
  insert into auth.users (id, email) values (u_adm,'adm@t.com'), (u_g1,'g1@t.com'), (u_g2,'g2@t.com');
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('Smart FML', 1.0, 0.15) returning id into r1;
  insert into regionais (nome, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('Gabriela Cuiaba', 1.0, 0.10) returning id into r2;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm@t.com','admin', null),
    (u_g1,'Gestor FML','g1@t.com','gestor_regional', r1),
    (u_g2,'Gestor Cuiaba','g2@t.com','gestor_regional', r2);

  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  -- ------------------------------------------------- codigo/hotlink da regional
  select codigo into v_txt from regionais where id = r1;
  assert v_txt = 'SMARTFML', 'codigo da regional deveria sair do nome, veio ' || v_txt;

  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('Amanda Hilario', r1, 1.0, 0.05) returning id into v1;
  insert into vendedores (nome, regional_id, taxa_comissao_adesao, taxa_comissao_recorrente)
    values ('Bruno Costa', r1, 1.0, 0.03) returning id into v2;

  select * into rec from resolver_hotlink('AMANDA');
  assert rec.tipo = 'VENDEDOR' and rec.vendedor_id = v1, 'hotlink de vendedor';
  select * into rec from resolver_hotlink('smartfml');
  assert rec.tipo = 'REGIONAL' and rec.regional_id = r1, 'hotlink da propria regional';
  raise notice 'OK hotlink resolve vendedor e regional';

  -- ------------------------------------------------- dados de venda
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Cliente Um','11144477735', r1) returning id into c1;
  insert into veiculos (cliente_id, placa, regional_id, vendedor_id, status)
    values (c1,'AAA1A11', r1, v1, 'ativo') returning id into ve1;

  -- leads: 2 pelo hotlink (1 convertido) e 1 interno
  insert into leads (nome, celular, regional_id, vendedor_id, origem_hotlink, status, veiculo_id)
    values ('Lead Um','11999990001', r1, v1, 'AMANDA', 'ATIVO', ve1) returning id into l1;
  insert into leads (nome, celular, regional_id, vendedor_id, origem_hotlink, status)
    values ('Lead Dois','11999990002', r1, v1, 'AMANDA', 'NOVO');
  insert into leads (nome, celular, regional_id, vendedor_id, status)
    values ('Lead Tres','11999990003', r1, v2, 'NOVO');
  -- lead de OUTRA regional, que nao pode vazar
  insert into leads (nome, celular, regional_id, status)
    values ('Lead Cuiaba','11999990004', r2, 'NOVO');

  insert into comissoes_vendas (vendedor_id, veiculo_id, valor_comissao, is_adesao, status_pagamento)
    values (v1, ve1, 500, true, 'pendente');

  insert into lancamentos_financeiros (tipo, descricao, regional_id, valor_original,
                                       data_emissao, data_vencimento, competencia)
    values ('RECEITA','Mensalidade regional', r1, 1000, current_date, current_date, current_date),
           ('DESPESA','Aluguel da unidade', r1, 400, current_date, current_date, current_date);
  -- despesa da MATRIZ (regional nula) — nao pode entrar no portal da franquia
  insert into lancamentos_financeiros (tipo, descricao, regional_id, valor_original,
                                       data_emissao, data_vencimento, competencia)
    values ('DESPESA','Despesa da matriz', null, 9999, current_date, current_date, current_date);

  -- ------------------------------------------------- painel (como gestor da FML)
  perform set_config('request.jwt.claim.sub', u_g1::text, false);
  select * into rec from regional_painel(r1, current_date - 1, current_date + 1);
  assert rec.leads_periodo = 3, 'leads da unidade, veio ' || rec.leads_periodo;
  assert rec.leads_hotlink = 2, 'leads por hotlink, veio ' || rec.leads_hotlink;
  assert rec.leads_convertidos = 1, 'convertidos, veio ' || rec.leads_convertidos;
  assert rec.taxa_conversao = 33.3, 'taxa de conversao, veio ' || rec.taxa_conversao;
  assert rec.vendedores_ativos = 2, 'vendedores ativos, veio ' || rec.vendedores_ativos;
  assert rec.comissao_vendedores_pend = 500, 'comissao pendente, veio ' || rec.comissao_vendedores_pend;
  assert rec.contas_receber_aberto = 1000, 'a receber da unidade, veio ' || rec.contas_receber_aberto;
  assert rec.contas_pagar_aberto = 400,
    'a pagar deveria ser SO da unidade (sem a matriz), veio ' || rec.contas_pagar_aberto;
  raise notice 'OK painel da franquia, sem misturar com a matriz';

  -- ------------------------------------------------- desempenho da equipe
  select count(*) into n from regional_desempenho_vendedores(r1, current_date - 1, current_date + 1);
  assert n = 2, 'equipe da unidade, veio ' || n;
  select * into rec from regional_desempenho_vendedores(r1, current_date - 1, current_date + 1)
   where nome = 'Amanda Hilario';
  assert rec.leads = 2 and rec.leads_hotlink = 2, 'leads da Amanda';
  assert rec.convertidos = 1 and rec.taxa_conversao = 50.0, 'conversao da Amanda, veio ' || rec.taxa_conversao;
  assert rec.comissao_pendente = 500, 'comissao pendente da Amanda';
  raise notice 'OK desempenho por vendedor';

  -- ------------------------------------------------- extrato e leads
  select count(*) into n from regional_comissoes(r1);
  assert n = 1, 'extrato de comissoes, veio ' || n;
  select count(*) into n from regional_comissoes(r1, 'pago');
  assert n = 0, 'filtro por status do extrato';

  select count(*) into n from regional_leads(r1);
  assert n = 3, 'leads da unidade, veio ' || n;
  select count(*) into n from regional_leads(r1, null, null, true);
  assert n = 2, 'somente hotlink, veio ' || n;
  raise notice 'OK extrato de comissoes e leads dos hotlinks';

  -- ------------------------------------------------- ISOLAMENTO entre franquias
  perform set_config('request.jwt.claim.sub', u_g2::text, false);
  -- mesmo PEDINDO a regional alheia, o escopo forca a propria
  select * into rec from regional_painel(r1, current_date - 1, current_date + 1);
  assert rec.leads_periodo = 1, 'gestor de Cuiaba so pode ver os proprios leads, veio ' || rec.leads_periodo;
  assert rec.contas_receber_aberto = 0, 'nao pode ver o financeiro da outra franquia';

  select count(*) into n from regional_desempenho_vendedores(r1, current_date - 1, current_date + 1);
  assert n = 0, 'nao pode ver a equipe da outra franquia, veio ' || n;

  select count(*) into n from regional_comissoes(r1);
  assert n = 0, 'nao pode ver comissoes da outra franquia, veio ' || n;

  select count(*) into n from regional_leads(r1);
  assert n = 1, 'leads de outra franquia nao vazam, veio ' || n;
  raise notice 'OK uma franquia nunca enxerga a outra, nem pedindo o id dela';

  raise notice '=== TESTES 0036 (portal da regional) PASSARAM ===';
end $$;
