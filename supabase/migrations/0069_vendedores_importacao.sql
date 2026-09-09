-- ============================================================================
-- SCar :: 0069_vendedores_importacao.sql
-- IMPORTACAO DE VENDEDORES POR PLANILHA.
--
-- Por que planilha e nao API: metade do cadastro (comissao, banco, PIX, prazo)
-- NAO existe no sistema de origem — e acordo comercial. E sao centenas, nao
-- milhares: nao ha escala que pague uma integracao.
--
-- AS TRES DECISOES QUE MORAM AQUI (a tela pode mudar, elas nao):
--
-- 1. TODO MUNDO ENTRA INATIVO por padrao. O relatorio de origem marcou 363 de
--    379 como "Ativo", mas "ativo" la significa "nao apagado", nao "vendendo
--    hoje". Importar 363 vendedores ativos criaria 363 hotlinks captando lead
--    e 363 configuracoes de comissao para conferir. Ativar e ato deliberado,
--    um a um — ou com `p_respeitar_status`, que a tela so oferece com o numero
--    na frente.
--
-- 2. COMISSAO ENTRA ZERADA quando a planilha nao traz. Zero nao paga ninguem
--    por engano; um palpite paga. Quem negocia digita depois.
--
-- 3. NUNCA cria acesso ao portal (`usuario_id` fica nulo, 0035). Importar 379
--    acessos e criar 379 senhas que ninguem controla — e, desde a 0068, 379
--    logins que contam como equipe.
--
-- Idempotencia: a chave e o DOCUMENTO (so digitos) e, sem ele, o E-MAIL.
-- Reimportar ATUALIZA a mesma linha — a primeira carga nunca e a definitiva.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) O documento passa a ser chave de verdade
--
-- PARCIAL porque o campo e opcional (0035): com unique cheio, o segundo
-- vendedor sem documento colidiria com o primeiro — o gotcha de
-- `fornecedores.documento` (0051) e de `usuarios.documento` (0068).
-- Guardamos so digitos para o "529.982.247-25" da planilha e o "52998224725"
-- digitado na tela serem a MESMA pessoa.
-- ----------------------------------------------------------------------------
update vendedores
   set documento = regexp_replace(documento, '\D', '', 'g')
 where documento is not null
   and documento <> regexp_replace(documento, '\D', '', 'g');

create unique index if not exists uq_vendedor_documento
  on vendedores (documento) where documento is not null;

comment on column vendedores.documento is
  'CPF/CNPJ so com digitos. Chave de reconciliacao da importacao por planilha (0069).';

-- ----------------------------------------------------------------------------
-- (B) A carga
-- ----------------------------------------------------------------------------
/**
 * Importa/atualiza vendedores a partir de um array jsonb.
 *
 * Cada elemento:
 *   nome (obrigatorio) · documento · email · telefone · regional_id (obrigatorio)
 *   ativo_na_origem · codigo · comissao_adesao_pct · comissao_recorrente_pct
 *   banco · agencia · conta · chave_pix · observacoes
 *
 * ATENCAO A UNIDADE DO PERCENTUAL: o payload traz PERCENTUAL (10 = 10%) e a
 * funcao divide por 100 ao gravar, porque `vendedores.taxa_comissao_*` e
 * `numeric(6,4)` (0.1000 = 10%). O nome do campo carrega o `_pct` de proposito:
 * mandar fracao aqui daria uma comissao 100x menor, calada.
 *
 * ATOMICA: uma linha recusada derruba a carga inteira. E o que se quer — meia
 * importacao de equipe e pior que nenhuma, porque ninguem sabe onde parou.
 * Por isso a TELA valida antes (teto de comissao da franquia, unidade ativa,
 * regional mapeada) e so manda o que passa.
 */
create or replace function importar_vendedores(
  p_linhas             jsonb,
  p_respeitar_status   boolean default false
)
returns table (criados integer, atualizados integer)
language plpgsql security definer set search_path = public as $$
declare
  r          jsonb;
  v_doc      text;
  v_email    text;
  v_id       uuid;
  v_ativo    boolean;
  v_criados  integer := 0;
  v_atualiz  integer := 0;
begin
  if not tem_acesso_global() then
    raise exception 'Apenas admin ou financeiro importam a equipe de vendas.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'Envie um array de linhas.' using errcode = 'invalid_parameter_value';
  end if;

  for r in select * from jsonb_array_elements(p_linhas) loop
    if coalesce(trim(r->>'nome'), '') = '' then
      raise exception 'Linha sem nome.' using errcode = 'check_violation';
    end if;
    if r->>'regional_id' is null then
      -- Neste sistema `regional_id` nulo significa MATRIZ (0067): aceitar nulo
      -- aqui jogaria a equipe de uma franquia inteira para dentro da matriz.
      raise exception 'Vendedor "%" sem unidade. A unidade e obrigatoria na importacao.',
        r->>'nome' using errcode = 'check_violation';
    end if;

    v_doc   := nullif(regexp_replace(coalesce(r->>'documento', ''), '\D', '', 'g'), '');
    v_email := nullif(lower(trim(coalesce(r->>'email', ''))), '');
    v_ativo := case when p_respeitar_status
                    then coalesce((r->>'ativo_na_origem')::boolean, false)
                    else false end;

    -- Acha o cadastro existente: documento manda; e-mail e a reserva.
    v_id := null;
    if v_doc is not null then
      select id into v_id from vendedores where documento = v_doc limit 1;
    end if;
    if v_id is null and v_email is not null then
      select id into v_id from vendedores where lower(email) = v_email limit 1;
    end if;

    if v_id is null then
      insert into vendedores (
        nome, documento, email, telefone, regional_id, ativo, codigo,
        taxa_comissao_adesao, taxa_comissao_recorrente,
        banco, agencia, conta, chave_pix, observacoes
      ) values (
        trim(r->>'nome'), v_doc, v_email, nullif(trim(coalesce(r->>'telefone','')),''),
        (r->>'regional_id')::uuid, v_ativo,
        nullif(upper(regexp_replace(coalesce(r->>'codigo',''), '[^A-Za-z0-9]', '', 'g')), ''),
        coalesce((r->>'comissao_adesao_pct')::numeric, 0) / 100,
        coalesce((r->>'comissao_recorrente_pct')::numeric, 0) / 100,
        nullif(trim(coalesce(r->>'banco','')),''),
        nullif(trim(coalesce(r->>'agencia','')),''),
        nullif(trim(coalesce(r->>'conta','')),''),
        nullif(trim(coalesce(r->>'chave_pix','')),''),
        nullif(trim(coalesce(r->>'observacoes','')),'')
      );
      v_criados := v_criados + 1;
    else
      -- Reimportacao ATUALIZA o que a planilha traz e NAO apaga o que ela nao
      -- traz: quem ja configurou comissao e banco na tela nao perde isso porque
      -- o relatorio de origem nao tem essas colunas.
      update vendedores v set
        nome        = trim(r->>'nome'),
        documento   = coalesce(v_doc, v.documento),
        email       = coalesce(v_email, v.email),
        telefone    = coalesce(nullif(trim(coalesce(r->>'telefone','')),''), v.telefone),
        regional_id = (r->>'regional_id')::uuid,
        ativo       = case when p_respeitar_status then v_ativo else v.ativo end,
        taxa_comissao_adesao =
          coalesce((r->>'comissao_adesao_pct')::numeric / 100, v.taxa_comissao_adesao),
        taxa_comissao_recorrente =
          coalesce((r->>'comissao_recorrente_pct')::numeric / 100, v.taxa_comissao_recorrente),
        banco       = coalesce(nullif(trim(coalesce(r->>'banco','')),''), v.banco),
        agencia     = coalesce(nullif(trim(coalesce(r->>'agencia','')),''), v.agencia),
        conta       = coalesce(nullif(trim(coalesce(r->>'conta','')),''), v.conta),
        chave_pix   = coalesce(nullif(trim(coalesce(r->>'chave_pix','')),''), v.chave_pix),
        observacoes = coalesce(nullif(trim(coalesce(r->>'observacoes','')),''), v.observacoes),
        updated_at  = now()
      where v.id = v_id;
      v_atualiz := v_atualiz + 1;
    end if;
  end loop;

  criados := v_criados;
  atualizados := v_atualiz;
  return next;
end;
$$;

-- Rito de seguranca (0052).
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
