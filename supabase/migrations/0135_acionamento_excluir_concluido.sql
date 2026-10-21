-- 0135: EXCLUIR OS CONCLUIDA SEM PAGAMENTO.
--
-- Medido em producao (21/10/2026, logo depois da 0134): os 36 acionamentos
-- estavam CONCLUIDO (31) ou CANCELADO (5), e 22 dos 31 foram concluidos menos
-- de 10 minutos depois de abertos — a equipe abre, gera a OS e conclui na hora.
-- Entao o acionamento "lancado por engano" ja nasce concluido, e a 0134 recusava
-- excluir OS concluida. A regra passa a ser o DINHEIRO, nao o status:
--   * titulo da OS com pagamento registrado -> recusa (estorne antes);
--   * concluida sem pagamento -> exclui, e o titulo em aberto sai junto.
-- So `excluir_acionamento` e recriada (mesma assinatura); trilha, permissao
-- (assistencia.excluir) e o resto da 0134 ficam como estao.

create or replace function excluir_acionamento(p_acionamento_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a        acionamentos_assistencia%rowtype;
  l        lancamentos_financeiros%rowtype;
  v_serv   text;
  v_anexos text[];
  v_fin    text[] := '{}';
begin
  if not is_staff() or not perfil_pode('assistencia', 'excluir') then
    raise exception 'Sem permissao para excluir acionamento (Assistencia 24h > Excluir)'
      using errcode = 'insufficient_privilege';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Informe o motivo da exclusao' using errcode = 'check_violation';
  end if;

  select * into a from acionamentos_assistencia where id = p_acionamento_id for update;
  if not found then
    raise exception 'Acionamento nao encontrado' using errcode = 'no_data_found';
  end if;
  if not (tem_acesso_global() or pode_regional(a.regional_id) or pode_assistencia()) then
    raise exception 'Este acionamento nao esta no seu alcance' using errcode = 'insufficient_privilege';
  end if;
  if a.lancamento_id is not null then
    select * into l from lancamentos_financeiros where id = a.lancamento_id;
    if found and exists (select 1 from baixas_financeiras where lancamento_id = l.id) then
      raise exception 'O titulo desta OS ja tem pagamento registrado. Estorne o pagamento no Financeiro antes de excluir.'
        using errcode = 'check_violation';
    end if;
  end if;

  select descricao into v_serv from servicos_assistencia where id = a.servico_id;
  select coalesce(array_agg(url), '{}') into v_anexos
    from acionamento_anexos where acionamento_id = a.id;
  if l.id is not null then
    select coalesce(array_agg(url_storage), '{}') into v_fin
      from anexos_financeiros where lancamento_id = l.id;
  end if;

  insert into acionamento_exclusoes (
    acionamento_id, protocolo, codigo_os, status, veiculo_id, cliente_id, servico,
    regional_id, dados, motivo, usuario_id
  ) values (
    a.id, a.protocolo, a.codigo_os, a.status::text, a.veiculo_id, a.cliente_id, v_serv,
    a.regional_id,
    jsonb_build_object(
      'acionamento', to_jsonb(a),
      'cotacoes',  coalesce((select jsonb_agg(to_jsonb(c)) from acionamento_cotacoes c where c.acionamento_id = a.id), '[]'::jsonb),
      'historico', coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at) from acionamento_historico h where h.acionamento_id = a.id), '[]'::jsonb),
      'edicoes',   coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from acionamento_edicoes e where e.acionamento_id = a.id), '[]'::jsonb),
      'anexos',    to_jsonb(v_anexos),
      'lancamento', case when l.id is null then null else to_jsonb(l) end,
      'anexos_lancamento', to_jsonb(v_fin)),
    btrim(p_motivo), usuario_atual_id()
  );

  delete from acionamentos_assistencia where id = a.id;   -- cotacoes/historico/edicoes/anexos: cascade
  if l.id is not null then
    delete from lancamentos_financeiros where id = l.id;
  end if;

  return jsonb_build_object(
    'acionamento_id', a.id, 'protocolo', a.protocolo,
    'arquivos', to_jsonb(v_anexos), 'arquivos_financeiro', to_jsonb(v_fin),
    'lancamento_excluido', l.id is not null);
end;
$$;

-- Rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
