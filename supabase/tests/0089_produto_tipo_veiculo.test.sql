-- Teste funcional do PRODUTO POR TIPO DE VEICULO (0089). O que ele prova:
-- sem tipo marcado nada muda; produto restrito some do motor para o tipo que
-- nao atende (avulso, do plano e obrigatorio); continua para o tipo que atende;
-- a ficha do SAC e a cotacao seguem junto; e quem nao e staff recebe a mesma
-- resposta (a funcao e security definer).
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ass uuid := gen_random_uuid();
  t_passeio uuid; t_moto uuid; p_vidro uuid; p_livre uuid; p_obr uuid; pl uuid;
  r_mat uuid; cli uuid; veic uuid;
  antes_carro numeric; antes_moto numeric; c jsonb; n int;
begin
  -- ===================================================== setup
  insert into auth.users (id, email) values (u_adm, 'adm89@t.com'), (u_ass, 'ass89@t.com');
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm, 'Admin', 'adm89@t.com', 'admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  insert into regionais (nome) values ('Matriz 89') returning id into r_mat;

  select id into t_passeio from tipos_veiculo where nome ilike 'passeio%' limit 1;
  select id into t_moto    from tipos_veiculo where nome ilike 'moto%'    limit 1;
  assert t_passeio is not null and t_moto is not null, 'o seed tem de trazer Passeio e Moto';

  insert into produtos (nome, categoria, metodo_preco, obrigatorio, status, valor_fixo)
    values ('PARABRISA 89', 'VIDROS', 'FIXO', false, true, 15.00) returning id into p_vidro;
  insert into produtos (nome, categoria, metodo_preco, obrigatorio, status, valor_fixo)
    values ('APP 89', 'BENEFICIO', 'FIXO', false, true, 7.00) returning id into p_livre;
  insert into planos_protecao (nome) values ('OURO 89') returning id into pl;
  insert into plano_produtos (plano_id, produto_id) values (pl, p_vidro), (pl, p_livre);

  -- ==========================================================================
  -- (A) A REGRESSAO: sem tipo marcado, o produto vale para todos
  -- ==========================================================================
  assert produto_atende_tipo(p_vidro, t_moto), 'sem linha, atende qualquer tipo';
  assert produto_atende_tipo(p_vidro, null), 'tipo nao informado: atende';
  antes_carro := (cotar_plano(50000, t_passeio, pl)->>'valor_total_mensalidade')::numeric;
  antes_moto  := (cotar_plano(15000, t_moto,    pl)->>'valor_total_mensalidade')::numeric;
  select count(*) into n from jsonb_array_elements(cotar_plano(15000, t_moto, pl)->'detalhamento_produtos') i
   where (i->>'produto_id')::uuid = p_vidro;
  assert n = 1, 'antes de restringir, o parabrisa do plano aparece na moto (o defeito)';

  -- ==========================================================================
  -- (B) RESTRITO A PASSEIO: some da moto, fica no carro
  -- ==========================================================================
  insert into produto_tipos_veiculo (produto_id, tipo_veiculo_id) values (p_vidro, t_passeio);
  assert produto_atende_tipo(p_vidro, t_passeio), 'atende o tipo marcado';
  assert not produto_atende_tipo(p_vidro, t_moto), 'nao atende o tipo nao marcado';

  c := cotar_plano(15000, t_moto, pl);
  select count(*) into n from jsonb_array_elements(c->'detalhamento_produtos') i
   where (i->>'produto_id')::uuid = p_vidro;
  assert n = 0, 'moto no plano Ouro nao leva parabrisa';
  assert (c->>'valor_total_mensalidade')::numeric = antes_moto - 15.00,
    format('o total da moto cai os 15,00 do parabrisa; veio %s, antes %s', c->>'valor_total_mensalidade', antes_moto);
  select count(*) into n from jsonb_array_elements(c->'detalhamento_produtos') i
   where (i->>'produto_id')::uuid = p_livre;
  assert n = 1, 'o produto sem restricao continua no plano da moto';

  assert (cotar_plano(50000, t_passeio, pl)->>'valor_total_mensalidade')::numeric = antes_carro,
    'o carro no mesmo plano nao muda';

  -- Avulso explicito tambem nao entra.
  c := cotar_plano(15000, t_moto, null, array[p_vidro]);
  select count(*) into n from jsonb_array_elements(c->'detalhamento_produtos') i
   where (i->>'produto_id')::uuid = p_vidro;
  assert n = 0, 'avulso que nao atende o tipo nao e cobrado';

  -- ==========================================================================
  -- (C) OBRIGATORIO restrito: sai da base do tipo que nao atende
  -- ==========================================================================
  insert into produtos (nome, categoria, metodo_preco, obrigatorio, status, valor_fixo)
    values ('TAXA CARRO 89', 'BENEFICIO', 'FIXO', true, true, 3.00) returning id into p_obr;
  insert into produto_tipos_veiculo (produto_id, tipo_veiculo_id) values (p_obr, t_passeio);
  select count(*) into n from produtos_obrigatorios_cotacao(t_moto, null, 15000) where produto_id = p_obr;
  assert n = 0, 'obrigatorio restrito a Passeio nao e obrigatorio da moto';
  select count(*) into n from produtos_obrigatorios_cotacao(t_passeio, null, 50000) where produto_id = p_obr;
  assert n = 1, 'e continua obrigatorio do carro';

  -- ==========================================================================
  -- (D) A FICHA DO SAC da moto no plano Ouro
  -- ==========================================================================
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'ASSOCIADO 89', '52998224725', r_mat) returning id into cli;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, valor_fipe,
                        status, data_ativacao, plano_protecao_id, valor_mensalidade, cobranca_externa)
    values (cli, 'MOT8A89', r_mat, t_moto, 15000, 'ativo', current_date, pl, 97.00, true)
    returning id into veic;
  select count(*) into n from opcionais_veiculo(veic) where produto_id = p_vidro;
  assert n = 0, 'a ficha do SAC da moto nao mostra parabrisa';
  assert valor_mensalidade_veiculo(veic) = 97.00, 'o override continua mandando no boleto';

  -- ==========================================================================
  -- (E) QUEM NAO E STAFF recebe a mesma resposta (security definer)
  -- ==========================================================================
  perform set_config('request.jwt.claim.sub', u_ass::text, false);
  assert not produto_atende_tipo(p_vidro, t_moto),
    'fora da equipe a restricao continua valendo — senao o portal veria parabrisa na moto';

  -- Apagar a restricao devolve o produto a todos.
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  delete from produto_tipos_veiculo where produto_id = p_vidro;
  assert (cotar_plano(15000, t_moto, pl)->>'valor_total_mensalidade')::numeric = antes_moto,
    'sem restricao, a moto volta ao preco de antes';

  raise notice '=== 0089 produto_tipo_veiculo: TODOS OS TESTES PASSARAM ===';
end $$;
