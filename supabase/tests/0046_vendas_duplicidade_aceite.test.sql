-- Teste funcional: aviso de duplicidade no CRM + aceite presencial (0046)
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  u_ger uuid := gen_random_uuid();  -- gestor da regional 1
  u_out uuid := gen_random_uuid();  -- consultor da regional 2
  r1 uuid; r2 uuid; v1 uuid; tv uuid; plano uuid;
  l_id uuid; cot uuid; cli uuid; l leads; rec record; n int;
begin
  insert into auth.users (id, email)
    values (u_adm,'adm@t.com'), (u_ger,'ger@t.com'), (u_out,'out@t.com');
  insert into regionais (nome) values ('Smart Centro') returning id into r1;
  insert into regionais (nome) values ('Smart Litoral') returning id into r2;
  insert into usuarios (id, nome, email, papel, regional_id) values
    (u_adm,'Admin','adm@t.com','admin', null),
    (u_ger,'Gestor Centro','ger@t.com','gestor_regional', r1),
    (u_out,'Consultor Litoral','out@t.com','consultor_vendas', r2);

  insert into vendedores (nome, regional_id) values ('Amanda Hilario', r1) returning id into v1;
  select id into tv from tipos_veiculo where nome = 'Passeio';
  select id into plano from planos_protecao where nome = 'Plano Ouro';

  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  insert into leads (nome, celular, cpf_cnpj, placa, regional_id, vendedor_id, consultor_id, created_by)
    values ('Joao da Silva','11988887777','11144477735','ABC1D23', r1, v1, u_ger, u_ger)
    returning id into l_id;

  -- ------------------------------------------------- nada digitado, nada a dizer
  select count(*) into n from classificar_captura_no_escopo(null, null, null);
  assert n = 0, 'sem dado nenhum a funcao nao pode varrer a base, veio ' || n;

  select count(*) into n from classificar_captura_no_escopo('', '', '   ');
  assert n = 0, 'campo em branco tambem nao classifica, veio ' || n;
  raise notice 'OK a classificacao so roda quando ha o que procurar';

  -- ------------------------------------------------- primeiro contato
  select * into rec from classificar_captura_no_escopo('11955554444');
  assert rec.tipo = 'NOVO', 'contato desconhecido e NOVO, veio ' || rec.tipo;
  assert rec.lead_id is null, 'lead novo nao aponta para atendimento nenhum';

  -- ------------------------------------------------- duplicado (celular, CPF e placa)
  select * into rec from classificar_captura_no_escopo('(11) 98888-7777');
  assert rec.tipo = 'DUPLICADO', 'mesmo celular = lead ja aberto, veio ' || rec.tipo;
  assert rec.lead_id = l_id, 'o aviso aponta o lead existente';
  assert rec.vendedor_nome = 'Amanda Hilario', 'o aviso diz com quem esta, veio ' || coalesce(rec.vendedor_nome,'?');
  assert rec.pode_abrir, 'o admin pode abrir o lead apontado';

  select * into rec from classificar_captura_no_escopo(null, '111.444.777-35');
  assert rec.tipo = 'DUPLICADO', 'o CPF formatado tambem encontra, veio ' || rec.tipo;

  select * into rec from classificar_captura_no_escopo(null, null, 'abc1d23');
  assert rec.tipo = 'DUPLICADO', 'a placa em minuscula tambem encontra, veio ' || rec.tipo;
  raise notice 'OK duplicidade e encontrada por celular, CPF ou placa, com ou sem mascara';

  -- ------------------------------------------------- ja e associado
  insert into clientes (nome_razao_social, tipo_pessoa, cpf_cnpj, telefone, regional_id)
    values ('Maria Souza','PF','52998224725','11966665555', r1) returning id into cli;

  select * into rec from classificar_captura_no_escopo(null, '52998224725');
  assert rec.tipo = 'CARTEIRA', 'CPF de associado e CARTEIRA, veio ' || rec.tipo;
  assert rec.detalhe like '%Maria Souza%', 'o aviso diz de quem e a ficha';
  assert not rec.pode_abrir, 'CARTEIRA nao tem lead para abrir';
  raise notice 'OK quem ja e associado aparece como carteira, com o nome do cadastro';

  -- ------------------------------------------------- escopo: a franquia vizinha nao aparece
  perform set_config('request.jwt.claim.sub', u_out::text, false);
  select * into rec from classificar_captura_no_escopo('11988887777');
  assert rec.tipo = 'NOVO', 'lead de outra unidade nao pode vazar, veio ' || rec.tipo;
  assert rec.lead_id is null, 'nem o id do lead da outra franquia';
  raise notice 'OK o aviso respeita o escopo da unidade';

  -- o gestor da unidade dona ve
  perform set_config('request.jwt.claim.sub', u_ger::text, false);
  select * into rec from classificar_captura_no_escopo('11988887777');
  assert rec.tipo = 'DUPLICADO', 'o gestor da casa ve o proprio lead, veio ' || rec.tipo;
  assert rec.pode_abrir, 'e pode abrir';

  -- ------------------------------------------------- aceite presencial
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  update leads set tipo_veiculo_id = tv, valor_fipe = 60000 where id = l_id;
  insert into cotacoes (lead_id, fipe, tipo_veiculo_id, plano_id, itens,
                        total_mensalidade, participacao, taxa_adesao)
    values (l_id, 60000, tv, plano, '[]'::jsonb, 189.90, 2400, 350) returning id into cot;

  -- quem nao trata o lead nao carimba aceite nele
  perform set_config('request.jwt.claim.sub', u_out::text, false);
  begin
    perform registrar_aceite_venda(l_id, cot, 'VENDEDOR', 'Joao da Silva', '11144477735');
    assert false, 'usuario de outra unidade nao pode registrar aceite';
  exception when check_violation then null; end;

  select aceite_em into l.aceite_em from leads where id = l_id;
  assert l.aceite_em is null, 'nada pode ter sido gravado';
  raise notice 'OK o aceite com sessao exige ser dono do atendimento';

  -- o dono colhe o aceite presencial
  perform set_config('request.jwt.claim.sub', u_ger::text, false);
  l := registrar_aceite_venda(l_id, cot, 'VENDEDOR', 'Joao da Silva', '111.444.777-35',
                              null, 'CRM/vendas');
  assert l.aceite_por = 'VENDEDOR', 'aceite colhido pelo vendedor';
  assert l.aceite_documento = '11144477735', 'o documento e gravado so com digitos';
  assert l.status::text = 'EM_NEGOCIACAO', 'o aceite nao pula para a auditoria (regra do 0043)';
  assert l.aceite_cotacao_id = cot, 'fica gravado QUAL cotacao foi aceita';

  select count(*) into n from lead_atribuicoes where lead_id = l_id and motivo = 'ACEITE_VENDEDOR';
  assert n = 1, 'o aceite entra na trilha do lead, veio ' || n;

  -- e nao aceita duas vezes
  begin
    perform registrar_aceite_venda(l_id, cot, 'VENDEDOR', 'Joao da Silva', '11144477735');
    assert false, 'aceite repetido deveria ser recusado';
  exception when check_violation then null; end;
  raise notice 'OK o dono colhe o aceite presencial, uma vez so, com prova do que foi aceito';

  raise notice '=== TESTES 0046 (duplicidade + aceite presencial) PASSARAM ===';
end $$;
