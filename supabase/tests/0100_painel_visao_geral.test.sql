-- Teste funcional da VISAO GERAL (0100): a carteira lida por data, a
-- distribuicao por unidade/UF/tipo, a serie mensal, o isolamento do gestor e
-- o painel vazio para quem nao e staff.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  u_cli uuid := gen_random_uuid();
  r_sp uuid; r_rn uuid; tv uuid;
  c_sp uuid; c_sp2 uuid; c_rn uuid;
  v_out uuid;
  j jsonb; s jsonb; n int;
begin
  insert into auth.users (id, email) values
    (u_adm,'adm97@t.com'), (u_ges,'ges97@t.com'), (u_cli,'cli97@t.com');
  insert into regionais (nome) values ('RIBEIRAO 97') returning id into r_sp;
  insert into regionais (nome) values ('NATAL 97')    returning id into r_rn;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm97@t.com','admin', null),
    (u_ges,'Gestor RN','ges97@t.com','gestor_regional', r_rn);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, endereco)
    values ('PF','Joao','52998224725', r_sp, '{"uf":"sp"}') returning id into c_sp;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, endereco)
    values ('PF','Maria','11144477735', r_sp, '{"uf":"SP"}') returning id into c_sp2;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, endereco)
    values ('PF','Ana','15350946056', r_rn, '{"uf":"RN"}') returning id into c_rn;

  -- Carteira migrada (cobranca externa): nao gera fatura, mas conta na carteira.
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status,
                        data_ativacao, valor_mensalidade, cobranca_externa)
  values
    (c_sp,  'PVG9A01', r_sp, tv, 'ativo', current_date - 200, 150.00, true),
    (c_sp,  'PVG9A02', r_sp, tv, 'ativo', date_trunc('month', current_date)::date, 100.00, true),
    (c_sp2, 'PVG9A03', r_sp, null, 'vistoria_pendente', current_date - 40, 0, true),
    (c_rn,  'PVG9A04', r_rn, tv, 'ativo', current_date - 90, 200.00, true);
  -- Saiu da base: nao conta na carteira, conta como saida.
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status,
                        data_ativacao, valor_mensalidade, cobranca_externa)
  values (c_rn, 'PVG9A05', r_rn, tv, 'ativo', current_date - 300, 90.00, true)
  returning id into v_out;
  update veiculos set status = 'inativo' where id = v_out;

  insert into eventos_sinistro (veiculo_id, cliente_id, tipo_evento, status, regional_id, data_ocorrencia)
    select id, cliente_id, 'COLISAO', 'ABERTO', regional_id, current_date from veiculos where placa = 'PVG9A01';
  insert into eventos_sinistro (veiculo_id, cliente_id, tipo_evento, status, regional_id, data_ocorrencia)
    select id, cliente_id, 'FURTO', 'CONCLUIDO', regional_id, current_date from veiculos where placa = 'PVG9A04';

  -- ============================================ ADMIN: consolidado
  j := painel_visao_geral(null, 6);
  assert (j->'kpis'->>'veiculos_base')::int = 4, 'base = 4 (o inativo saiu): ' || (j->'kpis'->>'veiculos_base');
  assert (j->'kpis'->>'associados_base')::int = 3, 'associados contam por pessoa';
  assert (j->'kpis'->>'carteira_mensal')::numeric = 450.00, 'carteira = 150+100+0+200';
  assert (j->'kpis'->>'ticket_medio')::numeric = 150.00, 'ticket ignora quem esta sem valor';
  assert (j->'kpis'->>'sem_valor')::int = 1, 'zero vira "sem valor", nunca ticket';
  assert (j->'kpis'->>'cobranca_externa')::int = 4, 'cobranca externa contada';
  assert (j->'kpis'->>'adesoes_mes')::int >= 1, 'adesao do mes contada';
  assert (j->'kpis'->>'saidas_mes')::int = 1, 'saida do mes contada';
  assert (j->'kpis'->>'vistoria_pendente')::int = 1, 'status vistoria_pendente';

  assert jsonb_array_length(j->'por_regional') = 2, 'duas unidades com carteira';
  assert (j->'por_regional'->0->>'nome') = 'RIBEIRAO 97', 'maior unidade primeiro';
  assert (j->'por_regional'->0->>'veiculos')::int = 3, 'Ribeirao com 3';
  assert (select (x->>'veiculos')::int from jsonb_array_elements(j->'por_uf') x where x->>'uf' = 'SP') = 3,
    'UF normalizada em caixa alta ("sp" e "SP" sao a mesma)';
  assert (select (x->>'veiculos')::int from jsonb_array_elements(j->'por_tipo') x where x->>'nome' = 'Sem tipo') = 1,
    'veiculo sem tipo aparece como "Sem tipo", nao some';
  assert (select (x->>'veiculos')::int from jsonb_array_elements(j->'por_plano') x where x->>'nome' = 'Sem plano') = 4,
    'sem plano aparece';

  s := j->'serie';
  assert jsonb_array_length(s) = 6, 'serie com 6 meses';
  assert (s->5->>'mes') = to_char(current_date, 'YYYY-MM'), 'ultimo ponto e o mes corrente';
  assert (s->5->>'base_fim')::int = 4, 'retrato de hoje no mes corrente';
  assert (s->5->>'saidas')::int = 1, 'saida no mes corrente';
  assert jsonb_array_length(painel_visao_geral(null, 12)->'serie') = 12, '12 meses quando pedido';
  assert jsonb_array_length(painel_visao_geral(null, 999)->'serie') = 24, 'teto de 24 meses';

  assert (j->'eventos'->>'abertos')::int = 1, 'evento aberto';
  assert (j->'eventos'->>'total')::int = 2, 'eventos no total';
  assert (select count(*) from jsonb_array_elements(j->'eventos'->'por_tipo')) = 2, 'eventos por tipo';

  assert (j->'pagar'->>'em_aberto')::numeric = 0, 'nada a pagar no cenario';
  assert (select count(*) from faturas) = 0, 'o painel e a cobranca externa nao geram fatura';

  -- ============================================ GESTOR: so a propria unidade
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  j := painel_visao_geral(r_sp, 6);   -- pede a vizinha...
  assert (j->>'regional_id')::uuid = r_rn, '...e recebe a propria';
  assert (j->'kpis'->>'veiculos_base')::int = 1, 'gestor RN ve so o RN';
  assert jsonb_array_length(j->'por_regional') = 1, 'gestor nao ve o ranking das vizinhas';
  assert (j->'eventos'->>'total')::int = 1, 'eventos so da unidade';

  -- ============================================ NAO-STAFF (associado do /portal)
  perform set_config('request.jwt.claim.sub', u_cli::text, false);
  assert painel_visao_geral(null, 6) is null, 'quem nao e staff nao le o painel';

  raise notice '=== TESTES 0100 (painel visao geral) PASSARAM ===';
end $$;
