-- =====================================================================
-- 0183 — NAO SE EXCLUI PLANO NEM TIPO DE VEICULO EM USO
-- ---------------------------------------------------------------------
-- O defeito (05/11/2026): o PLANO OURO - VEICULOS foi excluido em 30/10 com
-- dois planos do Mutual (88 e 86) ligados a ele no de-para. integracao_vinculos
-- nao tem FK (0082: registro_id aponta para tabelas diferentes), entao o
-- vinculo ficou apontando para um plano inexistente. A carga diaria passou a
-- gravar esse id em veiculos.plano_protecao_id, o banco recusava pela FK e a
-- carga de TODAS as unidades parava no meio — 6 dias sem nenhum veiculo novo,
-- sem aviso nenhum na tela (caso WILSON GABRIEL RODRIGUES DE ALMEIDA MOURA).
--
-- E havia o efeito calado: veiculos.plano_protecao_id e tipo_veiculo_id sao
-- `on delete set null`, entao excluir o plano/tipo TIRAVA o plano/tipo de todo
-- veiculo que o usava, sem avisar.
--
-- A regra: plano ou tipo de veiculo com veiculo cadastrado ou com de-para do
-- Mutual NAO se exclui — o banco recusa e diz o que esta pendurado. Para tirar
-- de circulacao, INATIVE (planos_protecao.ativo / tipos_veiculo.ativo); para
-- excluir de verdade, mova os veiculos e religue o de-para antes.
-- Cotacao, lead e as tabelas de preco/produto continuam seguindo a FK (o
-- historico da cotacao guarda o snapshot; a tabela de preco e do proprio tipo).
-- =====================================================================

create or replace function fn_bloqueia_exclusao_cadastro_em_uso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_veiculos   int := 0;
  v_vinculos   int := 0;
  v_ids        text;
  v_partes     text[] := '{}';
  v_rotulo     text;
begin
  if tg_table_name = 'planos_protecao' then
    select count(*) into v_veiculos from veiculos where plano_protecao_id = old.id;
    v_rotulo := 'o plano "' || coalesce(old.nome, '') || '"';
  elsif tg_table_name = 'tipos_veiculo' then
    select count(*) into v_veiculos from veiculos where tipo_veiculo_id = old.id;
    v_rotulo := 'o tipo de veiculo "' || coalesce(old.nome, '') || '"';
  else
    return old;
  end if;

  select count(*),
         string_agg(entidade || ' ' || id_externo, ', ' order by entidade, id_externo)
           filter (where rn <= 5)
    into v_vinculos, v_ids
    from (select entidade, id_externo,
                 row_number() over (order by entidade, id_externo) rn
            from integracao_vinculos
           where tabela = tg_table_name and registro_id = old.id) x;

  if v_veiculos > 0 then
    v_partes := v_partes || (v_veiculos || ' veiculo(s) cadastrado(s)');
  end if;
  if v_vinculos > 0 then
    v_partes := v_partes || (v_vinculos || ' de-para do Mutual (' || v_ids
                             || case when v_vinculos > 5 then ', ...' else '' end || ')');
  end if;

  if array_length(v_partes, 1) is not null then
    raise exception 'Nao e possivel excluir % — esta em uso por %. Inative-o (marque como inativo) ou, antes de excluir, mova os veiculos e religue o de-para em Integracao Mutual.',
      v_rotulo, array_to_string(v_partes, ' e ')
      using errcode = 'foreign_key_violation';
  end if;

  return old;
end;
$$;

comment on function fn_bloqueia_exclusao_cadastro_em_uso() is
  '0183: recusa excluir plano/tipo de veiculo com veiculo cadastrado ou com de-para do Mutual (integracao_vinculos nao tem FK).';

drop trigger if exists trg_plano_bloqueia_exclusao_em_uso on planos_protecao;
create trigger trg_plano_bloqueia_exclusao_em_uso
  before delete on planos_protecao
  for each row execute function fn_bloqueia_exclusao_cadastro_em_uso();

drop trigger if exists trg_tipo_veiculo_bloqueia_exclusao_em_uso on tipos_veiculo;
create trigger trg_tipo_veiculo_bloqueia_exclusao_em_uso
  before delete on tipos_veiculo
  for each row execute function fn_bloqueia_exclusao_cadastro_em_uso();

-- Rito da 0052.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
