-- Teste funcional das regras de atribuicao do lead (0041)
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; r2 uuid; v1 uuid; v2 uuid; v3 uuid;
  c1 uuid; ve1 uuid; l_ana uuid; l_outro uuid;
  n int; rec record; res record; v_txt text;
begin
  insert into auth.users (id, email) values (u_adm,'adm@t.com');
  insert into regionais (nome, dias_protecao_lead, dias_sem_contato_lead, distribuicao_lead)
    values ('Smart FML', 30, 7, 'MANUAL') returning id into r1;
  insert into regionais (nome, distribuicao_lead) values ('Cuiaba', 'RODIZIO') returning id into r2;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  insert into vendedores (nome, regional_id) values ('Amanda Hilario', r1) returning id into v1;
  insert into vendedores (nome, regional_id) values ('Bruno Costa', r1) returning id into v2;
  insert into vendedores (nome, regional_id) values ('Carla Cuiaba', r2) returning id into v3;

  -- ============================================================ 1. captura nova
  select * into res from registrar_captura_hotlink('AMANDA', 'Ana Souza', '(11) 98888-1111');
  assert res.tipo = 'NOVO', 'primeira captura e NOVO, veio ' || res.tipo;
  l_ana := res.lead_id;
  select vendedor_id, atribuicao_motivo, recapturas into rec from leads where id = l_ana;
  assert rec.vendedor_id = v1, 'o lead nasce com o dono do link';
  assert rec.atribuicao_motivo = 'HOTLINK', 'motivo da atribuicao, veio ' || rec.atribuicao_motivo;
  select count(*) into n from lead_atribuicoes where lead_id = l_ana;
  assert n = 1, 'a atribuicao entra no historico, veio ' || n;
  raise notice 'OK captura nova pelo hotlink do vendedor';

  -- ============================================ 2. o mesmo contato, outro link
  -- Dentro da protecao, o segundo clique NAO cria lead novo nem troca o dono.
  select count(*) into n from leads;
  select * into res from registrar_captura_hotlink('BRUNO', 'Ana Souza', '11988881111');
  assert res.tipo = 'DUPLICADO', 'segundo clique e DUPLICADO, veio ' || res.tipo;
  assert res.lead_id = l_ana, 'aponta para o lead que ja existia';
  assert res.vendedor_nome = 'Amanda Hilario', 'quem captou primeiro fica, veio ' || res.vendedor_nome;

  select count(*) into n from leads where chave_contato(celular) = '11988881111';
  assert n = 1, 'nao pode nascer um segundo lead da mesma pessoa, veio ' || n;
  select vendedor_id, recapturas into rec from leads where id = l_ana;
  assert rec.vendedor_id = v1, 'o dono nao muda dentro da protecao';
  assert rec.recapturas = 1, 'a nova passagem fica registrada, veio ' || rec.recapturas;
  raise notice 'OK quem captou primeiro fica com o lead (janela de protecao)';

  -- ================================================== 3. protecao expirada
  update leads set ultima_interacao_em = now() - interval '45 days',
                   atribuido_em = now() - interval '45 days',
                   created_at = now() - interval '45 days'
   where id = l_ana;
  assert not protecao_lead_ativa(l_ana), 'passados 45 dias a protecao caiu';

  select * into res from registrar_captura_hotlink('BRUNO', 'Ana Souza', '11988881111');
  assert res.tipo = 'REATIVACAO', 'fora da protecao e REATIVACAO, veio ' || res.tipo;
  select vendedor_id, atribuicao_motivo into rec from leads where id = res.lead_id;
  assert rec.vendedor_id = v2, 'agora quem trouxe leva';
  assert rec.atribuicao_motivo = 'HOTLINK_REATIVACAO', 'motivo, veio ' || rec.atribuicao_motivo;
  raise notice 'OK fora da protecao, quem trouxe de novo leva';

  -- ================================================== 4. ja e associado
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, telefone, regional_id, status)
    values ('PF','Carlos Antigo','11144477735','11977772222', r1, 'ativo') returning id into c1;
  insert into veiculos (cliente_id, placa, regional_id, status)
    values (c1,'AAA1A11', r1, 'ativo') returning id into ve1;

  select * into res from registrar_captura_hotlink('AMANDA', 'Carlos Antigo', '11977772222');
  assert res.tipo = 'CARTEIRA', 'associado nao e venda nova, veio ' || res.tipo;
  select carteira, cliente_carteira_id into rec from leads where id = res.lead_id;
  assert rec.carteira, 'o lead nasce marcado como carteira';
  assert rec.cliente_carteira_id = c1, 'apontando para o associado';

  -- tambem pela PLACA de um veiculo ativo
  select * into res from registrar_captura_hotlink('AMANDA', 'Alguem', '11955550000', null, 'aaa1a11');
  assert res.tipo = 'CARTEIRA', 'a placa de veiculo ativo tambem denuncia a carteira, veio ' || res.tipo;
  raise notice 'OK associado que preenche o formulario nao vira venda nova';

  -- ================================================== 5. rodizio da unidade
  -- O hotlink da UNIDADE nasce sem vendedor; com RODIZIO, cai no proximo da fila.
  select * into res from registrar_captura_hotlink('CUIABA', 'Novo Um', '65911110001');
  select vendedor_id, atribuicao_motivo into rec from leads where id = res.lead_id;
  assert rec.vendedor_id = v3, 'o rodizio escolhe o unico vendedor ativo da unidade';
  assert rec.atribuicao_motivo = 'RODIZIO', 'motivo, veio ' || rec.atribuicao_motivo;

  -- MANUAL: o lead da unidade fica no pool esperando distribuicao
  select * into res from registrar_captura_hotlink('SMARTFML', 'Novo Dois', '11922220002');
  select vendedor_id into v_txt from leads where id = res.lead_id;
  assert v_txt is null, 'com distribuicao MANUAL o lead espera no pool';
  select count(*) into n from leads_sem_vendedor(r1);
  assert n = 1, 'o pool da unidade mostra o lead, veio ' || n;

  perform atribuir_lead(res.lead_id, v2, 'MANUAL', 'distribuido pelo gestor');
  select count(*) into n from leads_sem_vendedor(r1);
  assert n = 0, 'depois de distribuido sai do pool, veio ' || n;
  raise notice 'OK pool da unidade: MANUAL espera, RODIZIO distribui sozinho';

  -- vendedor de outra franquia nao pode receber
  begin
    perform atribuir_lead(res.lead_id, v3, 'MANUAL');
    assert false, 'vendedor de outra unidade nao pode receber o lead';
  exception when check_violation then null; end;
  raise notice 'OK o lead nao atravessa para outra franquia';

  -- ================================================== 6. devolucao por inatividade
  insert into leads (nome, celular, regional_id, vendedor_id, status, atribuido_em, ultima_interacao_em)
    values ('Parado','11933330003', r1, v1, 'NOVO', now() - interval '20 days', now() - interval '20 days')
    returning id into l_outro;

  select liberar_leads_sem_contato(r1) into n;
  assert n >= 1, 'o lead parado tem de voltar ao pool, voltaram ' || n;
  select vendedor_id, atribuicao_motivo into rec from leads where id = l_outro;
  assert rec.vendedor_id is null, 'ficou sem dono';
  assert rec.atribuicao_motivo = 'DEVOLVIDO_SEM_CONTATO', 'motivo, veio ' || rec.atribuicao_motivo;

  -- trabalhar o lead renova a protecao
  insert into leads (nome, celular, regional_id, vendedor_id, status, atribuido_em, ultima_interacao_em)
    values ('Trabalhado','11944440004', r1, v1, 'NOVO', now() - interval '20 days', now() - interval '20 days')
    returning id into l_outro;
  perform registrar_contato_lead(l_outro, 'liguei hoje');
  select liberar_leads_sem_contato(r1) into n;
  select vendedor_id into v_txt from leads where id = l_outro;
  assert v_txt = v1::text, 'quem foi trabalhado hoje nao volta ao pool';
  raise notice 'OK lead parado volta ao pool; lead trabalhado fica';

  -- ================================================== 7. parametro desliga a regra
  update regionais set dias_protecao_lead = 0 where id = r1;
  insert into leads (nome, celular, regional_id, vendedor_id, status, ultima_interacao_em)
    values ('Sem protecao','11955551111', r1, v1, 'NOVO', now()) returning id into l_outro;
  assert not protecao_lead_ativa(l_outro), 'com 0 dias nao existe protecao';
  raise notice 'OK a franquia pode desligar a protecao (0 dias)';

  raise notice '=== TESTES 0041 (atribuicao do lead) PASSARAM ===';
end $$;
