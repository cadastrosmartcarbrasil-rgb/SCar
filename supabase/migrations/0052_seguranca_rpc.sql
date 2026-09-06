-- ============================================================================
-- SCar :: 0052_seguranca_rpc.sql
--
-- FECHANDO AS PORTAS ABERTAS DA CAMADA DE RPC.
--
-- Duas falhas reais, encontradas na auditoria de fim de projeto:
--
-- (1) NO POSTGRES, `execute` EM FUNCAO E CONCEDIDO A `public` POR PADRAO.
--     Como o PostgREST expoe toda funcao do schema `public` como RPC, isso
--     significa que TODAS as nossas funcoes eram chamaveis com a chave `anon`
--     — a mesma que vai no bundle do navegador, visivel para qualquer um.
--     Funcao `security definer` ignora RLS por definicao: a protecao tinha de
--     estar na propria funcao, e em varias nao estava.
--
-- (2) `authenticated` NAO E SO A EQUIPE. O associado do /portal tem login
--     (0044) e e `authenticated` como qualquer atendente. Entao "so quem esta
--     logado" nunca foi controle de acesso: quem le o DRE, a carteira de leads
--     ou a ficha de um lead precisa ser STAFF (linha em `usuarios`).
--
-- O que esta migration faz:
--   (A) Revoga `execute` de `public`/`anon` em todas as funcoes do schema e
--       concede explicitamente a `authenticated` e `service_role`. As paginas
--       publicas (hotlink e cotacao) nao perdem nada: elas ja rodam
--       server-side com `service_role`.
--   (B) Poe a trava DENTRO das funcoes que liam ou escreviam sem checar quem
--       chama — em especial o DRE, que devolvia o resultado inteiro da
--       empresa para qualquer usuario logado.
--   (C) Fecha a policy de `lead_atribuicoes`, que aceitava insert de qualquer
--       um desde que o lead existisse.
--
-- Padrao da trava: `is_staff() or auth.uid() is null`.
--   . com sessao  -> tem de ser staff (associado do portal fica de fora);
--   . sem sessao  -> e o caminho publico, que roda por `service_role` no
--                    servidor (hotlink, cotacao, webhook) e ja e confiavel.
--   . `anon` nao chega aqui, porque perdeu o `execute` no item (A).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.classificar_captura(p_regional_id uuid, p_celular text DEFAULT NULL::text, p_cpf_cnpj text DEFAULT NULL::text, p_placa text DEFAULT NULL::text)
 RETURNS TABLE(tipo text, lead_id uuid, vendedor_id uuid, vendedor_nome text, cliente_id uuid, detalhe text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare
  v_cli  uuid;
  v_lead leads;
  v_nome text;
begin
  -- Trava de acesso (0052): SECURITY DEFINER ignora RLS, entao a funcao
  -- precisa dizer quem pode chamar. `auth.uid() is null` e o caminho
  -- publico (service_role, sem sessao); com sessao, so staff.
  if not (is_staff() or auth.uid() is null) then
    raise exception 'Sem permissao para esta consulta';
  end if;
  v_cli := cliente_da_pessoa(p_celular, p_cpf_cnpj, p_placa);
  if v_cli is not null then
    return query
      select 'CARTEIRA', null::uuid, null::uuid, null::text, v_cli,
             'Ja e associado: ' || coalesce((select nome_razao_social from clientes where id = v_cli), '');
    return;
  end if;

  select * into v_lead from leads where id = lead_da_pessoa(p_regional_id, p_celular, p_cpf_cnpj, p_placa);
  if not found then
    return query select 'NOVO', null::uuid, null::uuid, null::text, null::uuid, 'Primeiro contato';
    return;
  end if;

  select coalesce(v.nome, 'sem vendedor') into v_nome
    from vendedores v where v.id = v_lead.vendedor_id;

  if protecao_lead_ativa(v_lead.id) then
    return query
      select 'DUPLICADO', v_lead.id, v_lead.vendedor_id, v_nome, null::uuid,
             'Lead aberto com ' || coalesce(v_nome, 'a unidade') || ' desde ' ||
             to_char(v_lead.created_at, 'DD/MM/YYYY');
  else
    return query
      select 'REATIVACAO', v_lead.id, v_lead.vendedor_id, v_nome, null::uuid,
             case when v_lead.status::text = 'PERDIDO'
                  then 'Lead perdido em ' || to_char(coalesce(v_lead.updated_at, v_lead.created_at), 'DD/MM/YYYY')
                  else 'Sem contato desde ' ||
                       to_char(coalesce(v_lead.ultima_interacao_em, v_lead.created_at), 'DD/MM/YYYY') end;
  end if;
end;
$fn$;

CREATE OR REPLACE FUNCTION public.cliente_da_pessoa(p_celular text DEFAULT NULL::text, p_cpf_cnpj text DEFAULT NULL::text, p_placa text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
  -- Trava de acesso (0052): idem, para o retorno escalar.
  select case when is_staff() or auth.uid() is null then (select c.id
    from clientes c
   where c.status::text <> 'cancelado'
     and (
       (chave_contato(p_cpf_cnpj) is not null
         and chave_contato(c.cpf_cnpj) = chave_contato(p_cpf_cnpj))
       or (chave_contato(p_celular) is not null
         and chave_contato(c.telefone) = chave_contato(p_celular))
       or (nullif(trim(p_placa), '') is not null
         and exists (select 1 from veiculos v
                      where v.cliente_id = c.id
                        and upper(v.placa) = upper(trim(p_placa))
                        and v.status::text not in ('baixado', 'excluido')))
     )
   order by c.created_at
   limit 1) end;
$fn$;

CREATE OR REPLACE FUNCTION public.fotos_vistoria_lead(p_lead_id uuid)
 RETURNS TABLE(codigo text, nome text, instrucao text, obrigatorio boolean, ordem smallint, anexo_id uuid, url text, enviada boolean, enviada_em timestamp with time zone, tamanho_bytes bigint, arquivo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
  -- Trava de acesso (0052): a consulta so responde a staff; o caminho
  -- publico (service_role) roda sem sessao.
  select * from (
with l as (select * from leads where id = p_lead_id),
  vist as (
    select id from vistorias where lead_id = p_lead_id
     order by created_at desc limit 1
  ),
  modelo as (
    select m.* from vistoria_fotos_modelo m, l
     where m.ativo
       and (m.tipo_veiculo_id is null or m.tipo_veiculo_id = l.tipo_veiculo_id)
  ),
  -- uma foto por pose: se o vendedor repetir, vale a mais recente
  foto as (
    select distinct on (upper(coalesce(a.tipo, ''))) upper(coalesce(a.tipo, '')) as codigo,
           a.id, a.url, a.created_at, a.tamanho_bytes, a.descricao
      from vistoria_anexos a
     where a.vistoria_id = (select id from vist)
     -- `a.id` desempata: dois anexos gravados na MESMA transacao tem o mesmo
     -- `created_at` (o default e `now()`), e sem isto a escolha seria arbitraria.
     order by upper(coalesce(a.tipo, '')), a.created_at desc, a.id desc
  )
  select m.codigo, m.nome, m.instrucao, m.obrigatorio, m.ordem,
         f.id, f.url, f.id is not null,
         f.created_at, f.tamanho_bytes, f.descricao
    from modelo m
    left join foto f on f.codigo = m.codigo
   order by m.ordem, m.codigo
  ) _x where is_staff() or auth.uid() is null;
$fn$;

CREATE OR REPLACE FUNCTION public.interacoes_protocolo(p_atendimento_id uuid)
 RETURNS TABLE(id uuid, tipo tipo_interacao_protocolo, mensagem text, de_status status_atendimento, para_status status_atendimento, de_usuario text, para_usuario text, interno boolean, operador text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
  -- Trava de acesso (0052): a consulta so responde a staff; o caminho
  -- publico (service_role) roda sem sessao.
  select * from (
select i.id, i.tipo, i.mensagem, i.de_status, i.para_status,
         du.nome, pu.nome, i.interno, coalesce(ou_.nome, 'sistema'), i.created_at
    from protocolo_interacoes i
    left join usuarios du on du.id = i.de_usuario
    left join usuarios pu on pu.id = i.para_usuario
    left join usuarios ou_ on ou_.id = i.usuario_id
   where i.atendimento_id = p_atendimento_id
   order by i.created_at
  ) _x where is_staff() or auth.uid() is null;
$fn$;

CREATE OR REPLACE FUNCTION public.lead_da_pessoa(p_regional_id uuid, p_celular text DEFAULT NULL::text, p_cpf_cnpj text DEFAULT NULL::text, p_placa text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
  -- Trava de acesso (0052): idem, para o retorno escalar.
  select case when is_staff() or auth.uid() is null then (select l.id
    from leads l
   where (p_regional_id is null or l.regional_id = p_regional_id)
     and l.status::text <> 'ATIVO'
     and (
       (chave_contato(p_celular) is not null
         and chave_contato(l.celular) = chave_contato(p_celular))
       or (chave_contato(p_cpf_cnpj) is not null
         and chave_contato(l.cpf_cnpj) = chave_contato(p_cpf_cnpj))
       or (nullif(trim(p_placa), '') is not null
         and upper(l.placa) = upper(trim(p_placa)))
     )
   order by coalesce(l.ultima_interacao_em, l.created_at) desc
   limit 1) end;
$fn$;

CREATE OR REPLACE FUNCTION public.lead_pronto_para_base(p_lead_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
  -- Trava de acesso (0052): idem, para o retorno escalar.
  select case when is_staff() or auth.uid() is null then (select coalesce(bool_and(ok), false) from checklist_lead(p_lead_id)) end;
$fn$;

CREATE OR REPLACE FUNCTION public.liberar_leads_sem_contato(p_regional_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare
  v_lead record;
  n int := 0;
begin
  -- Trava de acesso (0052): SECURITY DEFINER ignora RLS, entao a funcao
  -- precisa dizer quem pode chamar. `auth.uid() is null` e o caminho
  -- publico (service_role, sem sessao); com sessao, so staff.
  if not (is_staff() or auth.uid() is null) then
    raise exception 'Sem permissao para esta consulta';
  end if;
  for v_lead in
    select l.id, l.vendedor_id, p.dias_sem_contato
      from leads l
      cross join lateral parametros_atribuicao(l.regional_id) p
     where l.vendedor_id is not null
       and l.status::text not in ('PERDIDO', 'ATIVO', 'EM_AUDITORIA', 'APROVADO')
       and p.dias_sem_contato > 0
       and (p_regional_id is null or l.regional_id = p_regional_id)
       and coalesce(l.ultima_interacao_em, l.atribuido_em, l.created_at)
             < now() - make_interval(days => p.dias_sem_contato)
  loop
    perform atribuir_lead(v_lead.id, null, 'DEVOLVIDO_SEM_CONTATO',
      'Sem interacao ha mais de ' || v_lead.dias_sem_contato || ' dia(s)');
    n := n + 1;
  end loop;
  return n;
end;
$fn$;

CREATE OR REPLACE FUNCTION public.resumo_por_centro_custo(p_data_inicio date, p_data_fim date, p_regional_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(centro_custo_id uuid, centro_custo text, codigo text, receitas numeric, despesas numeric, resultado numeric, lancamentos integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
  -- Trava de acesso (0052): a consulta so responde a staff; o caminho
  -- publico (service_role) roda sem sessao.
  select * from (
select cc.id,
         coalesce(cc.nome, 'Sem centro de custo'),
         cc.codigo,
         round(coalesce(sum(b.valor_liquido) filter (where l.tipo = 'RECEITA'), 0), 2),
         round(coalesce(sum(b.valor_liquido) filter (where l.tipo = 'DESPESA'), 0), 2),
         round(
           coalesce(sum(b.valor_liquido) filter (where l.tipo = 'RECEITA'), 0)
           - coalesce(sum(b.valor_liquido) filter (where l.tipo = 'DESPESA'), 0), 2),
         count(*)::int
    from baixas_financeiras b
    join lancamentos_financeiros l on l.id = b.lancamento_id
    left join centros_custo cc on cc.id = l.centro_custo_id
   where b.data_pagamento between p_data_inicio and p_data_fim
     and l.status <> 'cancelado'
     and (p_regional_id is null or l.regional_id = p_regional_id)
   group by cc.id, cc.nome, cc.codigo
   order by 6 desc
  ) _x where is_staff() or auth.uid() is null;
$fn$;

-- ----------------------------------------------------------------------------
-- Devolver leads ao pool e trabalho de GESTAO, nao de qualquer atendente.
-- (a versao acima recebeu a trava generica; aqui ela fica no nivel certo)
-- ----------------------------------------------------------------------------
create or replace function liberar_leads_sem_contato(p_regional_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_lead record;
  n int := 0;
begin
  -- Devolver lead ao pool e decisao de GESTAO (o dono perde a carteira dele).
  if not (pode_ver_carteira_regional() or auth.uid() is null) then
    raise exception 'Somente a gestao da unidade devolve leads ao pool';
  end if;

  for v_lead in
    select l.id, l.vendedor_id, p.dias_sem_contato
      from leads l
      cross join lateral parametros_atribuicao(l.regional_id) p
     where l.vendedor_id is not null
       and l.status::text not in ('PERDIDO', 'ATIVO', 'EM_AUDITORIA', 'APROVADO')
       and p.dias_sem_contato > 0
       -- escopo: o gestor mexe na PROPRIA unidade; passar o id de outra nao adianta
       and (escopo_regional(p_regional_id) is null
            or l.regional_id = escopo_regional(p_regional_id))
       and coalesce(l.ultima_interacao_em, l.atribuido_em, l.created_at)
             < now() - make_interval(days => p.dias_sem_contato)
  loop
    perform atribuir_lead(v_lead.id, null, 'DEVOLVIDO_SEM_CONTATO',
      'Sem interacao ha mais de ' || v_lead.dias_sem_contato || ' dia(s)');
    n := n + 1;
  end loop;
  return n;
end;
$fn$;
CREATE OR REPLACE FUNCTION public.gerar_dre(p_data_inicio date, p_data_fim date, p_regional_id uuid, p_centro_custo_id uuid)
 RETURNS TABLE(grupo tipo_categoria_dre, categoria_codigo text, categoria_nome text, total numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
  with escopo as (
    -- 0052: a regional NAO e mais o que o chamador pede, e o que ele pode ver.
    select escopo_regional(p_regional_id) as reg
  ),
  base as (
    -- Movimentacoes de caixa classificadas por categoria DRE
    select cat.tipo as grupo, cat.codigo_estruturado as categoria_codigo, cat.nome as categoria_nome,
           case when m.tipo = 'RECEITA' then m.valor else -m.valor end as valor
      from movimentacoes_caixa m
      join categorias_dre cat on cat.id = m.categoria_dre_id
     where m.data_competencia between p_data_inicio and p_data_fim
       and m.status <> 'cancelado'
       and ((select reg from escopo) is null or m.regional_id = (select reg from escopo))
       and p_centro_custo_id is null   -- caixa nao tem centro de custo

    union all

    -- Receita recorrente reconhecida por titulos pagos (sem lancamento no caixa)
    select 'RECEITA'::tipo_categoria_dre, '1.1.00', 'Receita de Mensalidades (Titulos)', t.valor_pago
      from titulos_financeiros t
      join veiculos v on v.id = t.veiculo_id
     where t.status = 'pago'
       and t.data_pagamento between p_data_inicio and p_data_fim
       and not exists (select 1 from movimentacoes_caixa mc where mc.titulo_id = t.id)
       and ((select reg from escopo) is null or v.regional_id = (select reg from escopo))
       and p_centro_custo_id is null

    union all

    -- Custo de sinistro: notas fiscais de eventos (custo variavel)
    select 'CUSTO_VARIAVEL'::tipo_categoria_dre, '3.1.00', 'Custo com Sinistros (Notas Fiscais)', -nf.valor_nota
      from notas_fiscais_evento nf
      join eventos_sinistro e on e.id = nf.evento_id
     where nf.data_emissao between p_data_inicio and p_data_fim
       and ((select reg from escopo) is null or e.regional_id = (select reg from escopo))
       and p_centro_custo_id is null

    union all

    -- Contas a pagar/receber liquidadas (regime de caixa), por centro de custo.
    -- E aqui que entra a despesa da Assistencia 24h (centro ASSIST24).
    select coalesce(cat.tipo::text, case when l.tipo = 'RECEITA' then 'RECEITA' else 'DESPESA_FIXA' end)::tipo_categoria_dre,
           coalesce(cat.codigo_estruturado, case when l.tipo = 'RECEITA' then '1.9.00' else '4.9.00' end),
           coalesce(cat.nome, case when l.tipo = 'RECEITA' then 'Outras Receitas' else 'Outras Despesas' end),
           case when l.tipo = 'RECEITA' then b.valor_liquido else -b.valor_liquido end
      from baixas_financeiras b
      join lancamentos_financeiros l on l.id = b.lancamento_id
      left join categorias_dre cat on cat.id = l.categoria_dre_id
     where b.data_pagamento between p_data_inicio and p_data_fim
       and l.status <> 'cancelado'
       and ((select reg from escopo) is null or l.regional_id = (select reg from escopo))
       and (p_centro_custo_id is null or l.centro_custo_id = p_centro_custo_id)
  )
  select grupo, categoria_codigo, categoria_nome, round(sum(valor), 2) as total
    from base
   where is_staff()
   group by grupo, categoria_codigo, categoria_nome
   order by grupo, categoria_codigo;
$fn$;

-- ============================================================================
-- (C) `lead_atribuicoes` aceitava insert de QUALQUER usuario logado
--     A checagem era so "o lead existe" — nao "voce pode mexer neste lead".
--     Quem escreve de verdade sao as RPCs (security definer), entao a policy
--     pode exigir staff sem atrapalhar ninguem.
-- ============================================================================
drop policy if exists latrib_insert on lead_atribuicoes;
create policy latrib_insert on lead_atribuicoes for insert to authenticated
  with check (is_staff() and exists (select 1 from leads l where l.id = lead_id));

-- ============================================================================
-- (A) A superficie publica de RPC
--
-- `execute` em funcao nasce concedido a `public` — e o PostgREST publica toda
-- funcao do schema como RPC. Resultado: a chave `anon` (que vai no navegador)
-- chamava qualquer funcao nossa, inclusive as `security definer`.
--
-- Aqui isso e revertido de uma vez, e passa a valer tambem para o que for
-- criado daqui em diante (`alter default privileges`).
--
-- As paginas publicas NAO dependem de `anon`: `/v/<codigo>` e `/cotacao/<token>`
-- sao server components com `service_role`, e as rotas `/api/v1/hotlink/*`
-- tambem. Por isso `anon` fica sem nenhum `execute` — nao ha caminho publico
-- que precise dele.
-- ============================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;

grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema public to service_role;

-- ATENCAO AO RITO: `alter default privileges ... revoke execute from public`
-- NAO resolve — o `execute` de PUBLIC em funcao e embutido no Postgres e volta
-- em toda funcao nova. Testado: mesmo com a default privilege gravada, a
-- funcao criada em seguida nasce com `=X/` (PUBLIC).
--
-- Entao a regra do projeto passa a ser: **toda migration que cria funcao
-- termina com este bloco**. Quem esquecer nao passa no `npm run test:db` — o
-- teste 0052 falha listando as funcoes que ficaram abertas para a chave anon.
alter default privileges in schema public grant execute on functions to authenticated, service_role;

comment on schema public is
  'RPC: execute revogado de public/anon (0052). Migration que cria funcao repete o revoke/grant no fim.';
