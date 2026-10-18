-- Teste funcional da 0116: permissao EXTRA por usuario (so soma, com validade e
-- trilha) e COPIAR o perfil de outro usuario.
\set ON_ERROR_STOP on
do $$
declare
  adm uuid := gen_random_uuid();
  con uuid := gen_random_uuid();   -- consultor que ganha extras
  co2 uuid := gen_random_uuid();   -- outro consultor (mesmo papel, sem extra)
  sup uuid := gen_random_uuid();   -- supervisor de origem da copia
  nov uuid := gen_random_uuid();   -- destino da copia
  r1 uuid; r2 uuid; c1 uuid; n int; ok boolean; arr text[]; j jsonb;
begin
  insert into regionais (nome) values ('Unidade 116') returning id into r1;
  insert into regionais (nome) values ('Outra 116') returning id into r2;
  insert into auth.users (id, email) values
    (adm, 'adm116@t.com'), (con, 'con116@t.com'), (co2, 'co2116@t.com'),
    (sup, 'sup116@t.com'), (nov, 'nov116@t.com');
  insert into usuarios (id, nome, email, papel, regional_id) values
    (adm, 'Admin 116', 'adm116@t.com', 'admin', null),
    (con, 'Consultor A', 'con116@t.com', 'consultor_vendas', r1),
    (co2, 'Consultor B', 'co2116@t.com', 'consultor_vendas', r1),
    (sup, 'Supervisora', 'sup116@t.com', 'supervisor', null),
    (nov, 'Novato', 'nov116@t.com', 'consultor_vendas', r1);
  insert into supervisor_regionais (usuario_id, regional_id) values (sup, r1), (sup, r2);
  insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, regional_id)
    values ('PF', 'Apagavel 116', '11144477735', r1) returning id into c1;

  -- ponto de partida: consultor nao exclui associado nem aprova desconto
  perform set_config('request.jwt.claim.sub', con::text, false);
  assert not perfil_pode('associados', 'excluir'), 'consultor sem excluir pelo papel';
  assert not pode_aprovar_desconto(), 'consultor sem alcada de desconto';

  -- so o admin concede
  begin
    perform salvar_permissoes_usuario(con, '[{"modulo":"associados","acao":"excluir"}]', 'teste');
    ok := false;
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'consultor nao concede extra a si mesmo';

  perform set_config('request.jwt.claim.sub', adm::text, false);
  -- motivo obrigatorio, celula invalida e modulo fixo recusados, validade no passado recusada
  begin
    perform salvar_permissoes_usuario(con, '[{"modulo":"associados","acao":"excluir"}]', '  ');
    ok := false;
  exception when others then ok := true; end;
  assert ok, 'extra sem motivo recusado';
  begin
    perform salvar_permissoes_usuario(con, '[{"modulo":"painel","acao":"excluir"}]', 'x');
    ok := false;
  exception when others then ok := true; end;
  assert ok, 'celula que nao existe recusada';
  begin
    perform salvar_permissoes_usuario(con, '[{"modulo":"configuracoes","acao":"ver"}]', 'x');
    ok := false;
  exception when others then ok := true; end;
  assert ok, 'modulo fixo nao vira extra';
  begin
    perform salvar_permissoes_usuario(con, '[{"modulo":"veiculos","acao":"excluir","expira_em":"2000-01-01"}]', 'x');
    ok := false;
  exception when others then ok := true; end;
  assert ok, 'validade no passado recusada';
  begin
    perform salvar_permissoes_usuario(adm, '[{"modulo":"veiculos","acao":"excluir"}]', 'x');
    ok := false;
  exception when others then ok := true; end;
  assert ok, 'admin nao recebe extra';

  n := salvar_permissoes_usuario(con,
    '[{"modulo":"associados","acao":"excluir"},{"modulo":"alcada","acao":"desconto","expira_em":"2999-12-31"}]',
    'Cobre o gestor nas ferias');
  assert n = 2, 'duas concessoes';
  select count(*) into n from usuario_permissoes_log where usuario_id = con;
  assert n = 2, 'trilha das duas';
  -- salvar a mesma lista de novo nao muda nada
  n := salvar_permissoes_usuario(con,
    '[{"modulo":"associados","acao":"excluir"},{"modulo":"alcada","acao":"desconto","expira_em":"2999-12-31"}]', null);
  assert n = 0, 'idempotente';

  -- o extra vale para ELE, nao para o colega de mesmo papel
  perform set_config('request.jwt.claim.sub', con::text, false);
  assert perfil_pode('associados', 'excluir'), 'consultor A exclui pelo extra';
  assert pode_aprovar_desconto(), 'alcada pelo extra';
  arr := minhas_permissoes();
  assert 'associados.excluir' = any(arr) and 'desconto' = any(arr), 'minhas_permissoes traz o extra';
  select count(*) into n from permissoes_extras_usuario(con);
  assert n = 2, 'a pessoa le os proprios extras';
  select count(*) into n from permissoes_extras_usuario(co2);
  assert n = 0, 'nao le os do colega';

  -- EXCLUIR no banco obedece o extra (policy restrictive)
  execute 'set local role authenticated';
  delete from clientes where id = c1;
  execute 'reset role';
  select count(*) into n from clientes where id = c1;
  assert n = 0, 'consultor com extra exclui de verdade';

  perform set_config('request.jwt.claim.sub', co2::text, false);
  assert not perfil_pode('associados', 'excluir'), 'colega de mesmo papel segue sem';
  assert not pode_aprovar_desconto(), 'colega sem alcada';

  -- extra vencido deixa de valer sozinho
  update usuario_permissoes set expira_em = current_date - 2
   where usuario_id = con and modulo = 'alcada';
  perform set_config('request.jwt.claim.sub', con::text, false);
  assert not pode_aprovar_desconto(), 'extra vencido nao vale';
  select vigente into ok from permissoes_extras_usuario(con) where modulo = 'alcada';
  assert not ok, 'tela ve o vencido como nao vigente';

  -- inativo nao tem nada, nem o extra
  perform set_config('request.jwt.claim.sub', '', false);
  update usuarios set ativo = false where id = con;
  perform set_config('request.jwt.claim.sub', con::text, false);
  assert not perfil_pode('associados', 'excluir'), 'inativo perde o extra';
  perform set_config('request.jwt.claim.sub', '', false);
  update usuarios set ativo = true where id = con;

  -- retirar: o que nao vem na lista sai, com trilha
  perform set_config('request.jwt.claim.sub', adm::text, false);
  n := salvar_permissoes_usuario(con, '[{"modulo":"associados","acao":"excluir"}]', 'fim das ferias');
  assert n = 1, 'uma retirada';
  select count(*) into n from usuario_permissoes where usuario_id = con;
  assert n = 1, 'sobrou um extra';
  select count(*) into n from usuario_permissoes_log where usuario_id = con and para = 'retirada';
  assert n = 1, 'retirada na trilha';

  -- ---------------------------------------------------------------- COPIAR
  perform set_config('request.jwt.claim.sub', con::text, false);
  begin
    perform copiar_perfil_usuario(sup, nov, true, null);
    ok := false;
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'so admin copia perfil';

  perform set_config('request.jwt.claim.sub', adm::text, false);
  begin
    perform copiar_perfil_usuario(nov, nov, true, null);
    ok := false;
  exception when others then ok := true; end;
  assert ok, 'origem igual ao destino recusada';

  -- origem com extra: a supervisora ganha 'eventos.editar'
  perform salvar_permissoes_usuario(sup, '[{"modulo":"eventos","acao":"editar"}]', 'trata eventos');
  j := copiar_perfil_usuario(sup, nov, true, 'novo supervisor');
  assert j->>'papel_para' = 'supervisor' and j->>'papel_de' = 'consultor_vendas', 'papel copiado';
  assert (j->>'extras')::int = 1 and (j->>'unidades_supervisor')::int = 2, 'extras e unidades copiados';
  select papel::text = 'supervisor' and regional_id is null into ok from usuarios where id = nov;
  assert ok, 'destino com o papel e a unidade (global) da origem';
  select count(*) into n from supervisor_regionais where usuario_id = nov;
  assert n = 2, 'unidades do supervisor copiadas';
  select count(*) into n from usuario_permissoes_log where usuario_id = nov and origem = 'COPIA';
  assert n >= 3, 'trilha da copia (papel, unidade, extra, supervisor)';

  perform set_config('request.jwt.claim.sub', nov::text, false);
  assert perfil_pode('eventos', 'editar'), 'destino tem o extra copiado';
  assert r2 = any(regionais_do_usuario()), 'destino enxerga as unidades da supervisora';

  -- copiar sem a unidade mantem a do destino; copiar de quem nao e supervisor limpa as unidades
  perform set_config('request.jwt.claim.sub', adm::text, false);
  update usuarios set regional_id = r2 where id = nov;
  j := copiar_perfil_usuario(co2, nov, false, null);
  select papel::text = 'consultor_vendas' and regional_id = r2 into ok from usuarios where id = nov;
  assert ok, 'papel do consultor, unidade mantida';
  select count(*) into n from supervisor_regionais where usuario_id = nov;
  assert n = 0, 'unidades de supervisor limpas';
  select count(*) into n from usuario_permissoes where usuario_id = nov;
  assert n = 0, 'extras do destino sao os da origem (nenhum)';

  -- o ultimo admin ativo nao e rebaixado por copia
  begin
    perform copiar_perfil_usuario(co2, adm, true, null);
    ok := false;
  exception when others then ok := true; end;
  assert ok, 'copia nao rebaixa o ultimo admin';
  select papel::text = 'admin' into ok from usuarios where id = adm;
  assert ok, 'admin intacto';

  -- nada aberto ao anon
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public'
     and p.proname in ('salvar_permissoes_usuario','copiar_perfil_usuario','permissoes_extras_usuario',
                       'permissao_extra_vigente','permissao_extra_valida')
     and has_function_privilege('anon', p.oid, 'execute');
  assert n = 0, 'RPCs fechadas ao anon';

  raise notice '=== TESTES 0116 (permissoes extras por usuario e copia de perfil) PASSARAM ===';
end;
$$;
