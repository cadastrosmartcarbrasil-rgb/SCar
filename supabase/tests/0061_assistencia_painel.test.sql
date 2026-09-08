-- Teste funcional do PAINEL da Assistencia 24h (0061): o que ele conta, de onde
-- tira o custo e a praca, e o que ele NAO deixa um gestor de unidade enxergar.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  r_sp uuid; r_mt uuid; tv uuid; cat_desp uuid;
  c_sp uuid; c_sp2 uuid; c_mt uuid;
  v_sp uuid; v_sp2 uuid; v_mt uuid; v_mt2 uuid;
  f1 uuid; s_reboque uuid; s_chave uuid;
  a acionamentos_assistencia; rec record; ini date; fim date; n int;
begin
  -- setup -------------------------------------------------------------------
  insert into auth.users (id, email) values (u_adm,'adm@t.com'), (u_ges,'ges@t.com');
  insert into regionais (nome) values ('Matriz SP') returning id into r_sp;
  insert into regionais (nome) values ('Cuiaba')   returning id into r_mt;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm@t.com','admin', null),
    (u_ges,'Gestor MT','ges@t.com','gestor_regional', r_mt);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  select id into cat_desp from categorias_dre where tipo = 'DESPESA_FIXA' limit 1;
  select id into s_reboque from servicos_assistencia where descricao = 'Reboque Passeio';
  select id into s_chave   from servicos_assistencia where descricao ilike 'chaveiro%';
  update servicos_assistencia set categoria_dre_id = cat_desp where id in (s_reboque, s_chave);
  -- Reboque: 2 usos a cada 12 meses (para testar "veiculos no limite").
  update servicos_assistencia
     set computa_limite = true, limite_quantidade = 2, limite_janela_meses = 12
   where id = s_reboque;
  -- Chaveiro: sem limite nesta massa (o seed traz 1 uso e a trava barraria o
  -- acionamento que criamos so para depois CANCELAR).
  update servicos_assistencia set computa_limite = false where id = s_chave;

  insert into fornecedores (tipo_pessoa, documento, razao_social, prestador_assistencia)
    values ('PJ','11222333000181','Guincho A', true) returning id into f1;
  insert into prestador_servicos (fornecedor_id, servico_id, valor_acordado, valor_km)
    values (f1, s_reboque, 230, 4.00), (f1, s_chave, 150, 0);

  -- Frota: SP tem 2 veiculos (praca grande), MT tem 2 (praca pequena)
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, endereco, regional_id)
    values ('PF','Joao SP','52998224725','{"cidade":"Ribeirão Preto","estado":"sp"}'::jsonb, r_sp)
    returning id into c_sp;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, endereco, regional_id)
    values ('PF','Maria SP','11144477735','{"cidade":"RIBEIRAO PRETO","estado":"SP"}'::jsonb, r_sp)
    returning id into c_sp2;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, endereco, regional_id)
    values ('PF','Ana MT','15350946056','{"cidade":"Cuiabá","estado":"MT"}'::jsonb, r_mt)
    returning id into c_mt;

  insert into veiculos (cliente_id, placa, marca, modelo, regional_id, tipo_veiculo_id, status)
    values (c_sp,'PNL1A01','FIAT','ARGO', r_sp, tv, 'ativo')   returning id into v_sp;
  insert into veiculos (cliente_id, placa, marca, modelo, regional_id, tipo_veiculo_id, status)
    values (c_sp2,'PNL1A02','VW','GOL',   r_sp, tv, 'ativo')   returning id into v_sp2;
  insert into veiculos (cliente_id, placa, marca, modelo, regional_id, tipo_veiculo_id, status)
    values (c_mt,'PNL1A03','GM','ONIX',   r_mt, tv, 'ativo')   returning id into v_mt;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status)
    values (c_mt,'PNL1A04', r_mt, tv, 'suspenso')              returning id into v_mt2;

  ini := date_trunc('month', current_date)::date;
  fim := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;

  -- ============================================== massa de acionamentos
  -- SP #1: reboque concluido, com origem informada  (custo 230 + 20km*4 = 310)
  select * into a from abrir_acionamento(v_sp, s_reboque, 'Joao', '11999998888',
    '{"logradouro":"Rod. Anhanguera km 30","cidade":"Ribeirão Preto","uf":"SP"}'::jsonb,
    '{}'::jsonb, 120, null);
  select * into a from confirmar_prestador_assistencia(a.id, f1, 230, 20, 4.00, 45);
  select * into a from concluir_acionamento(a.id, 120);

  -- SP #1 de novo: segundo reboque do MESMO veiculo -> reincidente e NO LIMITE (2/2)
  select * into a from abrir_acionamento(v_sp, s_reboque, 'Joao', null,
    '{"cidade":"RIBEIRAO PRETO","uf":"SP"}'::jsonb, '{}'::jsonb, null, null);
  select * into a from confirmar_prestador_assistencia(a.id, f1, 230, 0, null, 30);

  -- SP #2: chaveiro SEM origem -> a praca tem de cair no endereco do associado
  select * into a from abrir_acionamento(v_sp2, s_chave, 'Maria', null,
    '{}'::jsonb, '{}'::jsonb, null, null);
  select * into a from confirmar_prestador_assistencia(a.id, f1, 150, 0, null, 30);

  -- MT: um acionamento valido e um CANCELADO (o cancelado nao pode contar)
  select * into a from abrir_acionamento(v_mt, s_chave, 'Ana', null,
    '{"cidade":"Cuiabá","uf":"MT"}'::jsonb, '{}'::jsonb, null, null);
  select * into a from confirmar_prestador_assistencia(a.id, f1, 150, 0, null, 30);
  select * into a from abrir_acionamento(v_mt, s_chave, 'Ana', null,
    '{"cidade":"Cuiabá","uf":"MT"}'::jsonb, '{}'::jsonb, null, null);
  select * into a from confirmar_prestador_assistencia(a.id, f1, 9999, 0, null, 30);
  perform cancelar_acionamento(a.id, 'teste: nao pode entrar no painel');

  -- ============================================== (A) resumo
  select * into rec from assist_painel_resumo(ini, fim);
  assert rec.acionamentos = 4,
    format('4 acionamentos validos (o cancelado fica de fora), veio %s', rec.acionamentos);
  assert rec.custo_total = 310 + 230 + 150 + 150,
    format('o custo e o valor_total da OS, veio %s', rec.custo_total);
  assert rec.veiculos_ativos = 3, format('3 veiculos ativos, veio %s', rec.veiculos_ativos);
  assert rec.veiculos_bloqueados = 1, format('suspenso conta como bloqueado, veio %s', rec.veiculos_bloqueados);
  assert rec.veiculos_acionaram = 3, format('3 veiculos acionaram, veio %s', rec.veiculos_acionaram);
  assert rec.reincidentes = 1, format('so o v_sp acionou 2x, veio %s', rec.reincidentes);
  assert rec.custo_por_veiculo = round(840.0 / 3, 2),
    format('custo por veiculo ativo, veio %s', rec.custo_por_veiculo);
  raise notice 'OK resumo: volume, custo real da OS e reincidencia';

  -- ============================================== (B) o cancelado nao entra em lugar nenhum
  select count(*) into n from assist_painel_movimentos(ini, fim) where custo = 9999;
  assert n = 0, 'OS cancelada nao pode aparecer no painel';
  raise notice 'OK acionamento cancelado fica fora de toda a leitura';

  -- ============================================== (C) praca: origem e o fallback
  select count(*) into n from assist_painel_por_praca(ini, fim)
   where cidade = 'RIBEIRAO PRETO' and uf = 'SP' and acionamentos = 3;
  assert n = 1, 'os 3 de Ribeirao Preto agrupam apesar do acento e da caixa (1 deles sem origem)';

  select * into rec from assist_painel_por_praca(ini, fim) where cidade = 'RIBEIRAO PRETO';
  assert rec.veiculos = 2, format('a frota da praca vem junto, veio %s', rec.veiculos);
  assert rec.taxa = round(3.0 / 2, 4), format('taxa = acionamentos/frota, veio %s', rec.taxa);
  raise notice 'OK praca normalizada, com fallback no endereco e taxa sobre a frota local';

  -- ============================================== (D) por servico e o teto do limite
  select * into rec from assist_painel_por_servico(ini, fim) where servico = 'Reboque Passeio';
  assert rec.acionamentos = 2, format('2 reboques, veio %s', rec.acionamentos);
  assert rec.computa_limite, 'o reboque computa limite';
  assert rec.veiculos_no_limite = 1,
    format('o v_sp usou 2 de 2 e esta no teto, veio %s', rec.veiculos_no_limite);
  raise notice 'OK por servico aponta quem ja encostou no limite contratado';

  -- ============================================== (E) reincidencia
  select * into rec from assist_painel_reincidencia(ini, fim, null, 5);
  assert rec.placa = 'PNL1A01', format('o topo e quem mais acionou, veio %s', rec.placa);
  assert rec.acionamentos = 2, format('com 2 acionamentos, veio %s', rec.acionamentos);
  assert rec.descricao = 'FIAT ARGO', format('marca+modelo, veio %s', coalesce(rec.descricao,'(nulo)'));
  raise notice 'OK reincidencia ordenada por consumo';

  -- ============================================== (F) serie mensal
  select count(*) into n from assist_painel_serie(3);
  assert n = 3, format('a serie devolve 3 meses mesmo com mes vazio, veio %s', n);
  select acionamentos into n from assist_painel_serie(3)
   where competencia = date_trunc('month', current_date)::date;
  assert n = 4, format('o mes corrente tem os 4 validos, veio %s', n);
  raise notice 'OK serie mensal preenche mes sem movimento com zero';

  -- ============================================== (G) ISOLAMENTO por unidade
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  select * into rec from assist_painel_resumo(ini, fim);
  assert rec.acionamentos = 1,
    format('o gestor de Cuiaba so ve o acionamento dele, veio %s', rec.acionamentos);
  assert rec.custo_total = 150, format('e so o custo dele, veio %s', rec.custo_total);

  -- ...e nao adianta forcar a unidade do vizinho no parametro
  select * into rec from assist_painel_resumo(ini, fim, r_sp);
  assert rec.acionamentos = 1,
    format('forcar p_regional_id nao abre a unidade vizinha, veio %s', rec.acionamentos);
  select count(*) into n from assist_painel_reincidencia(ini, fim, r_sp, 10);
  assert n = 1, format('nem pela reincidencia, veio %s', n);
  raise notice 'OK escopo_regional fecha o painel para quem nao tem acesso global';

  raise notice '=== TESTES 0061 (painel da Assistencia 24h) PASSARAM ===';
end $$;
