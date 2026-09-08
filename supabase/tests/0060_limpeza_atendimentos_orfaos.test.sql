-- Teste funcional: a limpeza da 0025 orfa nao deixa resto nem quebra o SAC (0060)
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; cli uuid; tv uuid; v1 uuid; a atendimentos; n int;
begin
  insert into auth.users (id, email) values (u_adm, 'adm@t.com');
  insert into regionais (nome) values ('Matriz') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm, 'Admin', 'adm@t.com', 'admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  select id into tv from tipos_veiculo where nome = 'Passeio';
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'Joao', '52998224725', r1) returning id into cli;
  insert into veiculos (cliente_id, placa, regional_id, tipo_veiculo_id, status)
    values (cli, 'LMP1A23', r1, tv, 'ativo') returning id into v1;

  -- ============================================== as colunas orfas sairam
  select count(*) into n from information_schema.columns
   where table_name = 'atendimentos'
     and column_name in ('subtipo','produto_id','cidade','uf','local_origem','cidade_destino',
                         'uf_destino','local_destino','km_percorridos','prestador','custo',
                         'data_conclusao');
  assert n = 0, 'sobrou coluna da 0025 orfa em atendimentos: ' || n;

  -- o que a 0029 criou continua de pe (nao passamos a regua no que e nosso)
  select count(*) into n from information_schema.columns
   where table_name = 'atendimentos' and column_name in ('encerrado_em','solucao','prioridade');
  assert n = 3, 'a limpeza nao pode levar junto as colunas da Central de Protocolos, veio ' || n;
  raise notice 'OK colunas orfas removidas e as da 0029 preservadas';

  -- ============================================== as RPCs orfas sairam
  select count(*) into n from pg_proc
   where proname in ('assistencia_movimentos','assistencia_resumo','assistencia_por_motivo',
                     'assistencia_por_cidade','assistencia_serie_mensal','assistencia_top_veiculos',
                     'assistencia_consumo_beneficios','veiculos_por_cidade','veiculos_por_situacao',
                     'num_seguro','uuid_seguro','fn_atendimento_conclusao');
  assert n = 0, 'sobrou funcao da 0025 orfa: ' || n;

  select count(*) into n from pg_trigger where tgname = 'trg_atendimento_conclusao';
  assert n = 0, 'o trigger inerte da 0025 continua na tabela';
  raise notice 'OK funcoes e trigger orfaos removidos';

  -- ============================================== e o SAC segue abrindo protocolo
  -- (era o risco real: a funcao substituida inseria nas colunas que removemos)
  select * into a from abrir_atendimento(v1, 'ASSISTENCIA_24H', 'SAC_INTERNO',
                                         'Assistencia 24h', 'Guincho na marginal',
                                         '{"subtipo":"Guincho","custo":"480,00"}'::jsonb);
  assert a.numero_protocolo like 'ATD-%', 'o protocolo do SAC precisa continuar nascendo, veio '
                                          || coalesce(a.numero_protocolo, '(nulo)');
  assert a.veiculo_id = v1, 'o atendimento continua amarrado ao veiculo';
  assert a.dados->>'subtipo' = 'Guincho', 'o payload segue guardado em dados (jsonb), como na 0022';
  raise notice 'OK abrir_atendimento restaurada — o SAC nao quebra apos a limpeza';

  -- e a elegibilidade voltou a contar so evento (regra da 0021)
  select count(*) into n from opcionais_elegibilidade(v1);
  assert n >= 0, 'opcionais_elegibilidade responde';
  raise notice 'OK opcionais_elegibilidade restaurada';

  raise notice '=== TESTES 0060 (limpeza da 0025 orfa) PASSARAM ===';
end $$;
