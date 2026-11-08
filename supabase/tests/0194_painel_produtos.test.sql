-- Teste funcional da aba PRODUTOS do painel (0194): opcionais por tipo, ranking,
-- receita pela tabela, produto sem preco contado, quem saiu da base fora,
-- isolamento do gestor e NULL para nao-staff.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  u_cli uuid := gen_random_uuid();
  r_sp uuid; r_rn uuid; tv uuid; tm uuid;
  c1 uuid; c2 uuid;
  v1 uuid; v2 uuid; v3 uuid; v_out uuid;
  p_rcf uuid; p_vid uuid; p_zero uuid;
  j jsonb; n int;
begin
  insert into auth.users (id, email) values
    (u_adm,'adm194@t.com'), (u_ges,'ges194@t.com'), (u_cli,'cli194@t.com');
  insert into regionais (nome) values ('SP 194') returning id into r_sp;
  insert into regionais (nome) values ('RN 194') returning id into r_rn;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm194@t.com','admin', null),
    (u_ges,'Gestor RN','ges194@t.com','gestor_regional', r_rn);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  select id into tm from tipos_veiculo where nome ilike 'moto%' limit 1;

  insert into produtos (nome, categoria, metodo_preco, valor_fixo, obrigatorio, status)
    values ('RCF 194', 'RCF', 'FIXO', 10.00, false, true) returning id into p_rcf;
  insert into produtos (nome, categoria, metodo_preco, valor_fixo, obrigatorio, status)
    values ('Vidros 194', 'VIDROS', 'FIXO', 20.00, false, true) returning id into p_vid;
  insert into produtos (nome, categoria, metodo_preco, valor_fixo, obrigatorio, status)
    values ('Bonus 194', 'BENEFICIO', 'FIXO', 0, false, true) returning id into p_zero;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Joao','52998224725', r_sp) returning id into c1;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Ana','15350946056', r_rn) returning id into c2;

  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade, cobranca_externa)
    values (c1, 'PRD9A01', r_sp, tv, 'ativo', current_date - 30, 150, true) returning id into v1;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade, cobranca_externa)
    values (c1, 'PRD9A02', r_sp, tm, 'ativo', current_date - 30, 90, true) returning id into v2;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade, cobranca_externa)
    values (c2, 'PRD9A03', r_rn, tv, 'ativo', current_date - 30, 150, true) returning id into v3;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status, data_ativacao, valor_mensalidade, cobranca_externa)
    values (c2, 'PRD9A04', r_rn, tv, 'ativo', current_date - 300, 150, true) returning id into v_out;
  update veiculos set status = 'inativo' where id = v_out;

  insert into veiculo_produtos (veiculo_id, produto_id) values
    (v1, p_rcf), (v1, p_vid), (v1, p_zero),
    (v2, p_rcf),
    (v3, p_rcf),
    (v_out, p_vid);  -- saiu da base: nao conta

  -- ============================================ ADMIN: consolidado
  j := painel_produtos(null);
  assert (j->'kpis'->>'veiculos_base')::int = 3, 'base = 3: ' || (j->'kpis'->>'veiculos_base');
  assert (j->'kpis'->>'veiculos_com_opcional')::int = 3, 'tres com opcional';
  assert (j->'kpis'->>'contratacoes')::int = 5, 'cinco contratacoes (o inativo fora): ' || (j->'kpis'->>'contratacoes');
  assert (j->'kpis'->>'receita_mensal')::numeric = 50.00, 'receita = 10+20+0+10+10';
  assert (j->'kpis'->>'sem_preco')::int = 1, 'bonus sem preco contado';
  assert (j->'kpis'->>'produtos_distintos')::int = 3, 'tres produtos';

  assert (j->'produtos'->0->>'nome') = 'RCF 194', 'ranking comeca pelo mais contratado';
  assert (j->'produtos'->0->>'contratacoes')::int = 3, 'RCF tres vezes';
  assert (j->'produtos'->0->>'receita')::numeric = 30.00, 'RCF R$ 30';

  select count(*) into n from jsonb_array_elements(j->'por_tipo') e where e->>'tipo' = (select nome from tipos_veiculo where id = tv)
    and (e->>'veiculos')::int = 2 and (e->>'contratacoes')::int = 4 and (e->>'receita')::numeric = 40.00;
  assert n = 1, 'passeio: 2 veiculos, 4 contratacoes, R$ 40: ' || (j->>'por_tipo');

  select count(*) into n from jsonb_array_elements(j->'matriz') e
   where e->>'produto' = 'RCF 194' and e->>'tipo' = (select nome from tipos_veiculo where id = tm) and (e->>'contratacoes')::int = 1;
  assert n = 1, 'matriz produto x tipo';

  -- ============================================ GESTOR: so a unidade dele
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  j := painel_produtos(r_sp);  -- pede a vizinha, recebe a propria
  assert (j->'kpis'->>'veiculos_base')::int = 1, 'gestor ve so RN';
  assert (j->'kpis'->>'contratacoes')::int = 1, 'uma contratacao em RN';

  -- ============================================ NAO STAFF
  perform set_config('request.jwt.claim.sub', u_cli::text, false);
  assert painel_produtos(null) is null, 'nao-staff recebe NULL';

  raise notice '=== TESTES 0194 (painel de produtos) PASSARAM ===';
end $$;
