-- Teste funcional: peso do anexo da vistoria e a lista para a auditoria (0047)
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r1 uuid; tv uuid; l_id uuid; vist uuid; n int; rec record;
begin
  insert into auth.users (id, email) values (u_adm, 'adm@t.com');
  insert into regionais (nome) values ('Smart Centro') returning id into r1;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm, 'Admin', 'adm@t.com', 'admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);

  select id into tv from tipos_veiculo where nome = 'Passeio';
  insert into leads (nome, celular, regional_id, tipo_veiculo_id, consultor_id, created_by)
    values ('Joao da Silva', '11988887777', r1, tv, u_adm, u_adm) returning id into l_id;

  insert into vistorias (lead_id, tipo, status, data_vistoria)
    values (l_id, 'inicial', 'PENDENTE', current_date) returning id into vist;

  -- ------------------------------------------------- teto de peso no banco
  begin
    insert into vistoria_anexos (vistoria_id, url, tipo, descricao, tamanho_bytes)
      values (vist, 'vistorias/x/gigante.jpg', 'FRENTE', 'gigante.jpg', 12 * 1024 * 1024);
    assert false, 'foto acima de 10 MB deveria ser recusada pelo banco';
  exception when check_violation then null; end;

  select count(*) into n from vistoria_anexos where vistoria_id = vist;
  assert n = 0, 'nada pode ter entrado, veio ' || n;
  raise notice 'OK o teto de 10 MB vale no banco, nao so na tela';

  -- ------------------------------------------------- anexo dentro do teto
  insert into vistoria_anexos (vistoria_id, url, tipo, descricao, tamanho_bytes, enviado_por)
    values (vist, 'vistorias/x/frente.jpg', 'FRENTE', 'frente.jpg', 480 * 1024, u_adm);

  -- foto antiga (sem peso registrado) continua valendo
  insert into vistoria_anexos (vistoria_id, url, tipo, descricao)
    values (vist, 'vistorias/x/traseira.jpg', 'TRASEIRA', 'traseira.jpg');

  -- ------------------------------------------------- o que a auditoria ve
  select * into rec from fotos_vistoria_lead(l_id) where codigo = 'FRENTE';
  assert rec.enviada, 'a pose com foto tem de vir marcada';
  assert rec.url = 'vistorias/x/frente.jpg', 'o caminho no bucket acompanha';
  assert rec.tamanho_bytes = 480 * 1024, 'o peso acompanha, veio ' || coalesce(rec.tamanho_bytes, -1);
  assert rec.enviada_em is not null, 'a data do envio acompanha';
  assert rec.arquivo = 'frente.jpg', 'o nome do arquivo acompanha';

  select * into rec from fotos_vistoria_lead(l_id) where codigo = 'TRASEIRA';
  assert rec.enviada and rec.tamanho_bytes is null, 'anexo antigo aparece sem o peso';

  select * into rec from fotos_vistoria_lead(l_id) where codigo = 'CHASSI';
  assert not rec.enviada, 'pose sem foto continua pendente';
  assert rec.url is null and rec.enviada_em is null, 'e sem dado de arquivo';
  raise notice 'OK a lista de poses entrega data, peso e nome do arquivo';

  -- ------------------------------------------------- repetiu, vale a mais recente
  -- `created_at` explicito: dentro da mesma transacao o default `now()` seria
  -- identico ao da primeira foto e nao haveria "mais recente" (gotcha ja
  -- conhecido da auditoria da OS 24h).
  insert into vistoria_anexos (vistoria_id, url, tipo, descricao, tamanho_bytes, created_at)
    values (vist, 'vistorias/x/frente-2.jpg', 'FRENTE', 'frente-2.jpg', 300 * 1024,
            now() + interval '5 minutes');

  select count(*) into n from fotos_vistoria_lead(l_id) where codigo = 'FRENTE';
  assert n = 1, 'a pose continua aparecendo uma vez so, veio ' || n;
  select * into rec from fotos_vistoria_lead(l_id) where codigo = 'FRENTE';
  assert rec.arquivo = 'frente-2.jpg', 'refazer a foto mostra a mais recente, veio ' || rec.arquivo;
  raise notice 'OK refazer a foto substitui a que a auditoria ve';

  raise notice '=== TESTES 0047 (peso e conferencia das fotos) PASSARAM ===';
end $$;
