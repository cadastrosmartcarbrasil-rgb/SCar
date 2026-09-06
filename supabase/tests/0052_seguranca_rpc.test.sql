-- Teste funcional: quem pode chamar o que (0052)
-- O foco e o associado do /portal: ele TEM login (authenticated) e nao pode
-- alcancar dado da operacao por RPC `security definer`.
\set ON_ERROR_STOP on
do $$
declare
  u_adm  uuid := gen_random_uuid();
  u_ges  uuid := gen_random_uuid();
  u_cli  uuid := gen_random_uuid();   -- associado do portal: auth.users SEM linha em usuarios
  r1 uuid; r2 uuid; cli uuid; cat uuid; n int;
begin
  insert into auth.users (id, email) values (u_adm,'adm@t.com'), (u_ges,'ges@t.com'), (u_cli,'cli@t.com');
  insert into regionais (nome) values ('Cuiaba') returning id into r1;
  insert into regionais (nome) values ('Natal')  returning id into r2;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm, 'Admin',  'adm@t.com', 'admin', null),
    (u_ges, 'Gestor', 'ges@t.com', 'gestor_regional', r1);

  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id, auth_user_id)
    values ('PF', 'Maria Associada', '52998224725', r1, u_cli) returning id into cli;

  -- um movimento de caixa em CADA unidade, para o DRE ter o que somar
  select id into cat from categorias_dre where tipo = 'RECEITA' limit 1;
  insert into movimentacoes_caixa (tipo, valor, data_competencia, categoria_dre_id, regional_id, descricao)
    values ('RECEITA', 1000, current_date, cat, r1, 'Receita Cuiaba'),
           ('RECEITA', 7777, current_date, cat, r2, 'Receita Natal');

  -- ===================================================================== staff
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select count(*) into n from gerar_dre(current_date - 30, current_date + 1);
  assert n > 0, 'admin tem de ler o DRE, veio ' || n;
  select count(*) into n from classificar_captura(r1, '11988887777', null, null);
  assert n = 1, 'staff usa a classificacao de captura';
  raise notice 'OK a equipe continua enxergando o que e dela';

  -- ============================================== o ASSOCIADO do portal (logado)
  perform set_config('request.jwt.claim.sub', u_cli::text, false);
  assert not is_staff(), 'associado nao e staff (nao tem linha em usuarios)';

  select count(*) into n from gerar_dre(current_date - 30, current_date + 1);
  assert n = 0, 'ASSOCIADO NAO PODE LER O DRE DA EMPRESA — veio ' || n || ' linha(s)';

  select count(*) into n from resumo_por_centro_custo(current_date - 30, current_date + 1);
  assert n = 0, 'nem o resumo por centro de custo, veio ' || n;

  begin
    perform classificar_captura(r1, '11988887777', null, null);
    assert false, 'associado nao pode consultar se um telefone/CPF esta na base';
  exception when others then
    assert sqlerrm like '%permissao%', 'mensagem inesperada: ' || sqlerrm;
  end;

  begin
    perform liberar_leads_sem_contato(r1);
    assert false, 'associado nao pode devolver leads ao pool';
  exception when others then null;
  end;

  select count(*) into n from cliente_da_pessoa(null, '52998224725', null);
  assert n = 0 or (select cliente_da_pessoa(null, '52998224725', null)) is null,
    'busca de pessoa por CPF nao responde para quem nao e da equipe';
  raise notice 'OK o associado logado nao alcanca DRE, carteira nem busca por CPF';

  -- ================================================= escopo do gestor de unidade
  perform set_config('request.jwt.claim.sub', u_ges::text, false);
  select coalesce(sum(total), 0) into n from gerar_dre(current_date - 30, current_date + 1);
  assert n = 1000, 'o gestor ve so a receita da PROPRIA unidade, veio ' || n;
  select coalesce(sum(total), 0) into n from gerar_dre(current_date - 30, current_date + 1, r2);
  assert n = 1000, 'pedir a unidade vizinha nao muda o que volta, veio ' || n;
  raise notice 'OK o DRE respeita o escopo da unidade mesmo pedindo outra';

  -- ===================================================== superficie do anon (RPC)
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'execute');
  assert n = 0, 'nenhuma funcao pode ficar executavel pela chave anon, sobraram ' || n;
  raise notice 'OK a chave anon (a do navegador) nao chama mais nenhuma RPC';

  -- ============================================ policy de atribuicao de lead
  select count(*) into n from pg_policies
   where tablename = 'lead_atribuicoes' and policyname = 'latrib_insert'
     and with_check like '%is_staff%';
  assert n = 1, 'a policy de lead_atribuicoes tem de exigir staff';
  raise notice 'OK lead_atribuicoes nao aceita mais insert de qualquer logado';

  raise notice '=== TESTES 0052 (seguranca das RPCs) PASSARAM ===';
end $$;
