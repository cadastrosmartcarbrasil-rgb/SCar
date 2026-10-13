-- Teste funcional da 0102: quem inclui / ativa / inativa / EXCLUI vendedor, e a
-- carteira que o painel da franquia passou a mostrar.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ges uuid := gen_random_uuid();
  u_viz uuid := gen_random_uuid();
  r_a uuid; r_b uuid; tv uuid;
  c1 uuid; c2 uuid;
  v_del uuid; v_vivo uuid;
  rec record; n bigint; ini date; fim date;
begin
  -- ===================================================== setup
  insert into auth.users (id, email) values
    (u_adm,'adm95@t.com'), (u_ges,'ges95@t.com'), (u_viz,'viz95@t.com');
  insert into regionais (nome) values ('Unidade A') returning id into r_a;
  insert into regionais (nome) values ('Unidade B') returning id into r_b;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm95@t.com','admin', null),
    (u_ges,'Gestor A','ges95@t.com','gestor_regional', r_a),
    (u_viz,'Gestor B','viz95@t.com','gestor_regional', r_b);

  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;
  ini := current_date - 29;
  fim := current_date;

  -- ============================================ A) o gestor INCLUI na unidade dele
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  execute 'set local role authenticated';
  insert into vendedores (nome, regional_id) values ('Vendedor Novo', r_a)
    returning id into v_vivo;
  execute 'reset role';
  assert v_vivo is not null, 'o gestor tem de conseguir cadastrar vendedor na unidade dele';
  raise notice 'OK o gestor da unidade INCLUI vendedor';

  -- ... e NAO na unidade vizinha (o with check e o que recusa)
  begin
    execute 'set local role authenticated';
    insert into vendedores (nome, regional_id) values ('Invasor', r_b);
    execute 'reset role';
    assert false, 'gestor nao pode cadastrar vendedor na unidade vizinha';
  exception when others then
    execute 'reset role';
    assert sqlerrm like '%row-level security%' or sqlerrm like '%policy%',
      'esperava recusa da RLS, veio: ' || sqlerrm;
  end;
  raise notice 'OK o gestor nao alcanca a unidade vizinha';

  -- ============================================ B) INATIVAR e REATIVAR sao UPDATE
  -- E a distincao que a policy unica `for all` nao sabia fazer: inativar nao e
  -- excluir, e o gestor continua podendo os dois sentidos.
  execute 'set local role authenticated';
  execute format('update vendedores set ativo = false where id = %L', v_vivo);
  get diagnostics n = row_count;
  execute 'reset role';
  assert n = 1, 'o gestor tem de conseguir INATIVAR o vendedor, linhas: ' || n;
  assert (select ativo from vendedores where id = v_vivo) = false, 'o vendedor ficou ativo';

  execute 'set local role authenticated';
  execute format('update vendedores set ativo = true where id = %L', v_vivo);
  get diagnostics n = row_count;
  execute 'reset role';
  assert n = 1, 'o gestor tem de conseguir REATIVAR o vendedor, linhas: ' || n;
  assert (select ativo from vendedores where id = v_vivo) = true, 'o vendedor nao reativou';
  raise notice 'OK o gestor ATIVA e INATIVA (e nenhum dos dois e exclusao)';

  -- ============================================ C) EXCLUIR: so o admin
  insert into vendedores (nome, regional_id) values ('Vendedor Descartavel', r_a)
    returning id into v_del;

  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  execute 'set local role authenticated';
  execute format('delete from vendedores where id = %L', v_del);
  get diagnostics n = row_count;
  execute 'reset role';
  -- RLS de DELETE nao levanta erro: ela simplesmente nao alcanca a linha.
  assert n = 0, 'o gestor NAO pode excluir vendedor, linhas apagadas: ' || n;
  assert exists (select 1 from vendedores where id = v_del), 'o vendedor foi apagado pelo gestor';
  raise notice 'OK o gestor NAO exclui vendedor';

  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  execute 'set local role authenticated';
  execute format('delete from vendedores where id = %L', v_del);
  get diagnostics n = row_count;
  execute 'reset role';
  assert n = 1, 'o admin tem de conseguir excluir, linhas apagadas: ' || n;
  raise notice 'OK o admin exclui';

  -- ============================================ D) o painel mostra a CARTEIRA
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Joao A','52998224725', r_a) returning id into c1;
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF','Maria A','11144477735', r_a) returning id into c2;

  -- Na carteira: ativo + vistoria_pendente (os dois com cobranca externa, como
  -- a carga do Mutual deixa) e um inadimplente sem valor.
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status,
                        data_ativacao, valor_mensalidade, cobranca_externa)
    values (c1,'PQR1A01', r_a, tv, 'ativo', current_date - 30, 150.00, true);
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status,
                        data_ativacao, valor_mensalidade, cobranca_externa)
    values (c1,'PQR1A02', r_a, tv, 'vistoria_pendente', current_date - 10, 200.00, true);
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status,
                        data_ativacao, valor_mensalidade, cobranca_externa)
    values (c2,'PQR1A03', r_a, tv, 'inadimplente', current_date - 60, null, false);
  -- FORA da carteira: suspenso nao conta.
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status,
                        data_ativacao, valor_mensalidade)
    values (c2,'PQR1A04', r_a, tv, 'suspenso', current_date - 90, 90.00);

  select * into rec from regional_painel(r_a, ini, fim);

  assert rec.veiculos_carteira = 3,
    'a carteira e ativo+vistoria_pendente+inadimplente (suspenso fora), veio ' || rec.veiculos_carteira;
  -- E o numero ANTIGO fica intacto: so `status = ativo`. E a regressao que
  -- prova que a coluna nova nao mudou o significado da velha.
  assert rec.veiculos_ativos = 1,
    'veiculos_ativos continua sendo so o status ativo, veio ' || rec.veiculos_ativos;
  assert rec.veiculos_inadimplentes = 1,
    'um inadimplente na carteira, veio ' || rec.veiculos_inadimplentes;
  assert rec.veiculos_cobranca_externa = 2,
    'dois em cobranca externa, veio ' || rec.veiculos_cobranca_externa;
  assert rec.veiculos_sem_valor = 1,
    'o veiculo sem valor tem de ser contado, veio ' || rec.veiculos_sem_valor;
  assert rec.carteira_mensal = 350.00,
    'a carteira soma so quem esta nela (150+200), veio ' || rec.carteira_mensal;
  assert rec.associados = 2, 'dois associados na unidade, veio ' || rec.associados;
  assert rec.vendedores_cadastrados = 1,
    'um vendedor cadastrado (o descartavel foi excluido), veio ' || rec.vendedores_cadastrados;
  assert rec.vendedores_ativos = 1, 'um vendedor ativo, veio ' || rec.vendedores_ativos;
  raise notice 'OK o painel mostra a carteira, a cobranca externa e os associados';

  -- ============================================ E) isolamento continua de pe
  -- O gestor da unidade B pede a unidade A e recebe a DELE (escopo_regional).
  perform set_config('request.jwt.claim.sub', u_viz::text, false);
  select * into rec from regional_painel(r_a, ini, fim);
  assert rec.veiculos_carteira = 0 and rec.associados = 0,
    'o gestor vizinho nao pode enxergar a carteira da unidade A';
  raise notice 'OK o escopo_regional continua ignorando o id pedido';

  raise notice '=== TESTES 0102 (portal da franquia: equipe e carteira) PASSARAM ===';
end $$;
