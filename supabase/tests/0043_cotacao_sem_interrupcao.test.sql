-- A cotacao publica nao para no meio; o aceite nao trava o vendedor (0043)
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; v1 uuid; v2 uuid; tv uuid; plano uuid;
  c1 uuid; ve1 uuid; cot uuid; l_id uuid;
  n int; rec record; res record; res2 record; l leads;
begin
  insert into auth.users (id, email) values (u_adm,'adm@t.com');
  insert into regionais (nome) values ('Smart FML') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm,'Admin','adm@t.com','admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  insert into vendedores (nome, regional_id) values ('Amanda Hilario', r1) returning id into v1;
  insert into vendedores (nome, regional_id) values ('Bruno Costa', r1) returning id into v2;
  select id into tv from tipos_veiculo where nome = 'Passeio';
  select id into plano from planos_protecao where nome = 'Plano Ouro';

  -- ============================================ (A) associado da base cota igual
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, email, telefone,
                        endereco, regional_id, status)
    values ('PF','Carlos Antigo','11144477735','carlos@t.com','11977772222',
            '{"cep":"01310100","logradouro":"Av Paulista","numero":"1000","cidade":"Sao Paulo","uf":"SP"}'::jsonb,
            r1, 'ativo') returning id into c1;
  insert into veiculos (cliente_id, placa, regional_id, status)
    values (c1,'AAA1A11', r1, 'ativo') returning id into ve1;

  select * into res from registrar_captura_hotlink('AMANDA', 'Carlos Antigo', '11977772222');
  assert res.tipo = 'CARTEIRA', 'segue reconhecendo o associado, veio ' || res.tipo;
  assert res.token_publico is not null, 'e devolve token para a cotacao continuar';
  assert res.mensagem not like '%atendimento%',
    'a mensagem nao pode mandar esperar humano: ' || res.mensagem;

  select * into rec from lead_por_token_publico(res.token_publico);
  assert rec.em_negociacao, 'o associado precisa poder cotar na hora';
  assert rec.carteira, 'mas o lead fica marcado como carteira';

  -- a ficha veio pronta (e o que evita redigitar e duplicar cadastro)
  select cpf_cnpj, email, tipo_pessoa::text as tipo, endereco->>'cidade' as cidade,
         cliente_existente_id
    into rec from leads where id = res.lead_id;
  assert rec.cpf_cnpj = '11144477735', 'CPF do associado veio junto, veio ' || coalesce(rec.cpf_cnpj,'nulo');
  assert rec.email = 'carlos@t.com', 'e-mail do cadastro veio junto';
  assert rec.tipo = 'PF', 'tipo de pessoa veio junto';
  assert rec.cidade = 'Sao Paulo', 'endereco copiado, veio ' || coalesce(rec.cidade,'nulo');
  assert rec.cliente_existente_id = c1, 'aponta o associado para reaproveitar a ficha';
  raise notice 'OK associado da base cota normalmente, com a ficha ja preenchida';

  -- ============================================ (A) duplicado continua no mesmo lead
  select * into res from registrar_captura_hotlink('AMANDA', 'Joao da Silva', '11988881111');
  l_id := res.lead_id;
  assert res.tipo = 'NOVO', 'primeiro contato';

  select * into res2 from registrar_captura_hotlink('BRUNO', 'Joao da Silva', '11988881111');
  assert res2.tipo = 'DUPLICADO', 'segundo clique e duplicado, veio ' || res2.tipo;
  assert res2.lead_id = l_id, 'continua no atendimento que ja existe';
  assert res2.token_publico is not null, 'e devolve o token para a cotacao seguir';

  select * into rec from lead_por_token_publico(res2.token_publico);
  assert rec.lead_id = l_id, 'o token e o do atendimento original';
  assert rec.em_negociacao, 'e ele pode cotar agora, sem esperar ninguem';

  select vendedor_id into rec from leads where id = l_id;
  assert rec.vendedor_id = v1, 'quem captou primeiro continua dono';
  select count(*) into n from leads where chave_contato(celular) = '11988881111';
  assert n = 1, 'sem lead duplicado, veio ' || n;
  raise notice 'OK recaptura continua a cotacao no atendimento existente';

  -- ============================================ (B) aceite deixa o vendedor trabalhar
  update leads set tipo_veiculo_id = tv, valor_fipe = 60000 where id = l_id;
  insert into cotacoes (lead_id, fipe, tipo_veiculo_id, plano_id, itens,
                        total_mensalidade, participacao, taxa_adesao)
    values (l_id, 60000, tv, plano, '[]'::jsonb, 189.90, 2400, 350) returning id into cot;

  l := registrar_aceite_venda(l_id, cot, 'CLIENTE', 'Joao da Silva', '11144477735',
                              '200.100.50.25', 'Mozilla/5.0');
  assert l.aceite_em is not null, 'o aceite fica registrado';
  assert l.aceite_por = 'CLIENTE', 'quem aceitou';
  assert l.aceite_cotacao_id = cot, 'qual proposta foi aceita';

  -- o ponto do 0043: NAO pula para a auditoria
  assert l.status::text = 'EM_NEGOCIACAO',
    'aceite mantem o lead trabalhavel, veio ' || l.status::text;
  assert lead_em_negociacao(l_id),
    'sem isto a cotacao congela e o vendedor nao ajusta mais nada';
  raise notice 'OK depois do aceite o vendedor ainda ajusta a cotacao';

  -- e a esteira segue normal quando a equipe manda para a auditoria
  perform mover_lead_status(l_id, 'APROVADO', 'ficha completa');
  select status::text into rec from leads where id = l_id;
  assert rec.status = 'EM_AUDITORIA', 'a equipe leva para a auditoria, veio ' || rec.status;
  raise notice 'OK a equipe e quem envia para a auditoria';

  -- aceite so uma vez
  begin
    perform registrar_aceite_venda(l_id, cot, 'CLIENTE', 'Joao da Silva', '11144477735');
    assert false, 'aceite repetido continua recusado';
  exception when check_violation then null; end;
  raise notice 'OK aceite unico';

  raise notice '=== TESTES 0043 (cotacao sem interrupcao) PASSARAM ===';
end $$;
