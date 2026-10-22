-- =============================================================================
-- 0141 — CONFIGURACOES POR ABA e o DRE SEPARADO na grade de permissoes
-- -----------------------------------------------------------------------------
-- Pedido do usuario (22/10/2026): liberar como EXTRA a algumas pessoas topicos
-- de Configuracoes (plano de contas, marcas e modelos...) e, no Financeiro,
-- separar o DRE do contas a pagar/receber.
--
-- Decisoes do usuario:
--   * uma linha por ABA das Configuracoes (Ver/Editar). Usuarios e permissoes
--     continua so do admin. Seed vazio: ninguem ganha nada na virada (hoje a
--     tela e so do admin); libera-se por perfil (0111/0130) ou extra (0116);
--   * o DRE vira a linha `financeiro_dre` (Ver/Exportar), semeada para TODOS que
--     hoje tem "Financeiro — ver" (ninguem perde na virada; o admin retira depois);
--   * alcance: SO AS UNIDADES DA PESSOA. O DRE ja passa por escopo_regional; a
--     permissao nova nao amplia unidade nenhuma.
--
-- No banco a trava de gravacao de cada cadastro passa a ser
-- `tem_acesso_global() or perfil_pode('cfg_<aba>', 'editar')` (as que eram so
-- admin seguem so admin + a permissao). Ver e de todo staff, como antes, salvo
-- Integracoes bancarias (so quem tem a permissao) e Regionais (a lista inteira
-- para quem tem `cfg_regionais.ver`).
-- =============================================================================

-- (A) as celulas novas -------------------------------------------------------------
create or replace function permissao_celula_valida(p_modulo text, p_acao text)
returns boolean
language sql immutable
as $$
  select (p_modulo, p_acao) in (
    ('painel','ver'), ('painel','exportar'),
    ('sac','ver'), ('sac','criar'), ('sac','editar'), ('sac','transferir'), ('sac','fechar'),
    ('protocolos','ver'), ('protocolos','criar'), ('protocolos','editar'),
      ('protocolos','transferir'), ('protocolos','fechar'),
    ('assistencia','ver'), ('assistencia','criar'), ('assistencia','editar'),
      ('assistencia','excluir'),
      ('assistencia','cancelar'), ('assistencia','transferir'), ('assistencia','fechar'),
    ('vendas','ver'), ('vendas','criar'), ('vendas','editar'), ('vendas','excluir'),
      ('vendas','exportar'), ('vendas','cancelar'), ('vendas','transferir'), ('vendas','fechar'),
    ('associados','ver'), ('associados','criar'), ('associados','editar'),
      ('associados','excluir'), ('associados','exportar'),
    ('veiculos','ver'), ('veiculos','criar'), ('veiculos','editar'), ('veiculos','excluir'),
      ('veiculos','exportar'), ('veiculos','cancelar'),
    ('rastreadores','ver'), ('rastreadores','criar'), ('rastreadores','editar'),
      ('rastreadores','transferir'), ('rastreadores','baixar'),
    ('eventos','ver'), ('eventos','criar'), ('eventos','editar'), ('eventos','excluir'),
      ('eventos','exportar'), ('eventos','cancelar'), ('eventos','transferir'), ('eventos','fechar'),
    ('cobranca','ver'), ('cobranca','criar'), ('cobranca','editar'), ('cobranca','exportar'),
      ('cobranca','baixar'), ('cobranca','cancelar'),
    ('revistoria','ver'), ('revistoria','criar'), ('revistoria','fechar'), ('revistoria','cancelar'),
    ('precificacao','ver'), ('precificacao','editar'), ('precificacao','exportar'),
    ('fornecedores','ver'), ('fornecedores','criar'), ('fornecedores','editar'),
      ('fornecedores','excluir'), ('fornecedores','exportar'),
    ('financeiro','ver'), ('financeiro','criar'), ('financeiro','editar'), ('financeiro','excluir'),
      ('financeiro','exportar'), ('financeiro','baixar'), ('financeiro','estornar'),
      ('financeiro','cancelar'),
    ('financeiro_dre','ver'), ('financeiro_dre','exportar'),
    ('comunicados','ver'), ('comunicados','criar'), ('comunicados','editar'), ('comunicados','excluir'),
    ('termos_modelos','ver'), ('termos_modelos','criar'), ('termos_modelos','editar'),
      ('termos_modelos','excluir'),
    ('termos','ver'), ('termos','criar'), ('termos','exportar'), ('termos','cancelar')
  )
  or (p_modulo in ('cfg_empresa', 'cfg_regionais', 'cfg_vendedores', 'cfg_marcas_modelos',
                   'cfg_tipos_veiculo', 'cfg_cores', 'cfg_cotas', 'cfg_tipos_evento',
                   'cfg_documentos_evento', 'cfg_alertas', 'cfg_produtos', 'cfg_planos',
                   'cfg_contas_bancarias', 'cfg_integracoes', 'cfg_plano_contas',
                   'cfg_centros_custo')
      and p_acao in ('ver', 'editar'));
$$;

create or replace function minhas_permissoes()
returns text[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(k order by k), '{}') from (
    select c.modulo || '.' || c.acao as k
      from (
        select m.modulo, a.acao
          from (values ('painel'),('sac'),('protocolos'),('assistencia'),('vendas'),('associados'),
                       ('veiculos'),('rastreadores'),('eventos'),('cobranca'),('revistoria'),
                       ('precificacao'),('fornecedores'),('financeiro'),('financeiro_dre'),('comunicados'),
                       ('termos_modelos'),('termos'),
                       ('cfg_empresa'),('cfg_regionais'),('cfg_vendedores'),('cfg_marcas_modelos'),
                       ('cfg_tipos_veiculo'),('cfg_cores'),('cfg_cotas'),('cfg_tipos_evento'),
                       ('cfg_documentos_evento'),('cfg_alertas'),('cfg_produtos'),('cfg_planos'),
                       ('cfg_contas_bancarias'),('cfg_integracoes'),('cfg_plano_contas'),
                       ('cfg_centros_custo')) m(modulo)
         cross join (values ('ver'),('criar'),('editar'),('excluir'),('exportar'),('baixar'),
                            ('estornar'),('cancelar'),('transferir'),('fechar')) a(acao)
         where permissao_celula_valida(m.modulo, a.acao)
      ) c
     where perfil_pode(c.modulo, c.acao)
    union all
    select k from unnest(array['desconto', 'liberar_24h', 'leads']) k where papel_pode(k)
  ) t;
$$;

/** Pode gravar o cadastro daquela aba das Configuracoes? (global, ou a permissao). */
create or replace function pode_configurar(p_modulo text, p_acao text default 'editar')
returns boolean
language sql stable security definer set search_path = public
as $$
  select tem_acesso_global() or perfil_pode(p_modulo, p_acao);
$$;

-- (B) seed --------------------------------------------------------------------------
-- Configuracoes: nenhuma linha concedida (o admin libera). As linhas existem
-- com `false` para a grade mostrar o "—" em vez de "nao se aplica".
insert into perfil_permissoes (papel, modulo, acao, concedida)
select k.papel, m.modulo, a.acao, false
  from (select distinct papel from perfil_permissoes) k
 cross join (values ('cfg_empresa'), ('cfg_regionais'), ('cfg_vendedores'), ('cfg_marcas_modelos'),
                    ('cfg_tipos_veiculo'), ('cfg_cores'), ('cfg_cotas'), ('cfg_tipos_evento'),
                    ('cfg_documentos_evento'), ('cfg_alertas'), ('cfg_produtos'), ('cfg_planos'),
                    ('cfg_contas_bancarias'), ('cfg_integracoes'), ('cfg_plano_contas'),
                    ('cfg_centros_custo')) m(modulo)
 cross join (values ('ver'), ('editar')) a(acao)
 where not exists (select 1 from perfil_permissoes x
                    where x.papel = k.papel and x.modulo = m.modulo and x.acao = a.acao);

-- DRE: quem tem "Financeiro — ver" hoje continua com o DRE (papeis e perfis).
insert into perfil_permissoes (papel, modulo, acao, concedida)
select f.papel, 'financeiro_dre', a.acao, f.concedida
  from perfil_permissoes f
 cross join (values ('ver'), ('exportar')) a(acao)
 where f.modulo = 'financeiro' and f.acao = 'ver'
   and not exists (select 1 from perfil_permissoes x
                    where x.papel = f.papel and x.modulo = 'financeiro_dre' and x.acao = a.acao);

-- ...e quem recebeu "Financeiro — ver" como EXTRA tambem (0116).
insert into usuario_permissoes (usuario_id, modulo, acao, motivo, expira_em, concedido_por)
select e.usuario_id, 'financeiro_dre', 'ver',
       'DRE separado do Financeiro (0141): mantido de quem ja tinha Financeiro como extra',
       e.expira_em, e.concedido_por
  from usuario_permissoes e
 where e.modulo = 'financeiro' and e.acao = 'ver'
   and not exists (select 1 from usuario_permissoes x
                    where x.usuario_id = e.usuario_id and x.modulo = 'financeiro_dre' and x.acao = 'ver');

-- (C) o DRE pede a linha `financeiro_dre` ---------------------------------------------
create or replace function pode_ver_dre()
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is null or perfil_pode('financeiro_dre', 'ver');
$$;

create or replace function gerar_dre_completo(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid default null,
  p_regime      text default 'CAIXA',
  p_centro_custo_id uuid default null
)
returns table (
  grupo            tipo_categoria_dre,
  categoria_codigo text,
  categoria_nome   text,
  total            numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select grupo, categoria_codigo, categoria_nome, round(sum(valor), 2)
    from dre_movimentos(p_data_inicio, p_data_fim, p_regional_id, p_regime)
   where (p_centro_custo_id is null or centro_custo_id = p_centro_custo_id)
     and (select pode_ver_dre())
   group by grupo, categoria_codigo, categoria_nome
  having round(sum(valor), 2) <> 0
   order by grupo, categoria_codigo;
$$;

create or replace function gerar_dre_mensal(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid default null,
  p_regime      text default 'CAIXA',
  p_centro_custo_id uuid default null
)
returns table (
  mes               date,
  receita           numeric,
  custo_variavel    numeric,
  despesa_fixa      numeric,
  resultado_liquido numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with meses as (
    select generate_series(date_trunc('month', p_data_inicio),
                           date_trunc('month', p_data_fim), interval '1 month')::date as mes
     where (select pode_ver_dre())
  ),
  mov as (
    select date_trunc('month', data)::date as mes, grupo, valor
      from dre_movimentos(p_data_inicio, p_data_fim, p_regional_id, p_regime)
     where (p_centro_custo_id is null or centro_custo_id = p_centro_custo_id)
       and data is not null
       and (select pode_ver_dre())
  )
  select m.mes,
         coalesce(round(sum(mov.valor) filter (where mov.grupo = 'RECEITA'), 2), 0),
         coalesce(round(sum(mov.valor) filter (where mov.grupo = 'CUSTO_VARIAVEL'), 2), 0),
         coalesce(round(sum(mov.valor) filter (where mov.grupo = 'DESPESA_FIXA'), 2), 0),
         coalesce(round(sum(mov.valor), 2), 0)
    from meses m
    left join mov on mov.mes = m.mes
   group by m.mes
   order by m.mes;
$$;

-- `gerar_dre_resumo_completo` le `gerar_dre_completo`, entao ja obedece.

-- Receitas x despesas por centro de custo: a permissao do DRE e, de passagem, a
-- UNIDADE de quem chama (a versao da 0052 aceitava o id pedido, e sem id lia a
-- empresa inteira).
create or replace function resumo_por_centro_custo(
  p_data_inicio date,
  p_data_fim    date,
  p_regional_id uuid default null
)
returns table (
  centro_custo_id uuid,
  centro_custo    text,
  codigo          text,
  receitas        numeric,
  despesas        numeric,
  resultado       numeric,
  lancamentos     integer
)
language sql
stable
security definer
set search_path = public
as $$
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
     and ((select escopo_regional(p_regional_id)) is null
          or l.regional_id = (select escopo_regional(p_regional_id)))
     and (is_staff() or auth.uid() is null)
     and (select pode_ver_dre())
   group by cc.id, cc.nome, cc.codigo
   order by 6 desc;
$$;

-- (D) as travas de gravacao das Configuracoes ------------------------------------------
drop policy if exists categorias_write on categorias_dre;
create policy categorias_write on categorias_dre for all to authenticated
  using ((select pode_configurar('cfg_plano_contas'))) with check ((select pode_configurar('cfg_plano_contas')));

drop policy if exists cc_write on centros_custo;
create policy cc_write on centros_custo for all to authenticated
  using ((select pode_configurar('cfg_centros_custo'))) with check ((select pode_configurar('cfg_centros_custo')));

drop policy if exists marcas_write on marcas;
create policy marcas_write on marcas for all to authenticated
  using ((select pode_configurar('cfg_marcas_modelos'))) with check ((select pode_configurar('cfg_marcas_modelos')));
drop policy if exists modelos_write on modelos;
create policy modelos_write on modelos for all to authenticated
  using ((select pode_configurar('cfg_marcas_modelos'))) with check ((select pode_configurar('cfg_marcas_modelos')));

drop policy if exists prod_write on produtos;
create policy prod_write on produtos for all to authenticated
  using ((select pode_configurar('cfg_produtos'))) with check ((select pode_configurar('cfg_produtos')));
drop policy if exists ptv_write on produto_tipos_veiculo;
create policy ptv_write on produto_tipos_veiculo for all to authenticated
  using ((select pode_configurar('cfg_produtos'))) with check ((select pode_configurar('cfg_produtos')));

-- Planos eram so do admin: seguem admin + a permissao (o financeiro nao ganha).
drop policy if exists planos_write on planos_protecao;
create policy planos_write on planos_protecao for all to authenticated
  using ((select is_admin() or perfil_pode('cfg_planos', 'editar')))
  with check ((select is_admin() or perfil_pode('cfg_planos', 'editar')));
drop policy if exists pp_write on plano_produtos;
create policy pp_write on plano_produtos for all to authenticated
  using ((select pode_configurar('cfg_planos'))) with check ((select pode_configurar('cfg_planos')));

drop policy if exists tv_write on tipos_veiculo;
create policy tv_write on tipos_veiculo for all to authenticated
  using ((select pode_configurar('cfg_tipos_veiculo'))) with check ((select pode_configurar('cfg_tipos_veiculo')));

drop policy if exists cores_write on cores;
create policy cores_write on cores for all to authenticated
  using ((select pode_configurar('cfg_cores'))) with check ((select pode_configurar('cfg_cores')));
drop policy if exists cor_apelidos_write on cor_apelidos;
create policy cor_apelidos_write on cor_apelidos for all to authenticated
  using ((select pode_configurar('cfg_cores'))) with check ((select pode_configurar('cfg_cores')));

drop policy if exists cotas_write on cotas_participacao;
create policy cotas_write on cotas_participacao for all to authenticated
  using ((select pode_configurar('cfg_cotas'))) with check ((select pode_configurar('cfg_cotas')));

drop policy if exists tipos_evento_write on tipos_evento;
create policy tipos_evento_write on tipos_evento for all to authenticated
  using ((select pode_configurar('cfg_tipos_evento'))) with check ((select pode_configurar('cfg_tipos_evento')));

drop policy if exists ta_write on tipos_alerta;
create policy ta_write on tipos_alerta for all to authenticated
  using ((select pode_configurar('cfg_alertas'))) with check ((select pode_configurar('cfg_alertas')));

-- Documentos e prazos do evento: eram so do admin.
drop policy if exists evento_doc_modelo_write on evento_documentos_modelo;
create policy evento_doc_modelo_write on evento_documentos_modelo for all to authenticated
  using ((select is_admin() or perfil_pode('cfg_documentos_evento', 'editar')))
  with check ((select is_admin() or perfil_pode('cfg_documentos_evento', 'editar')));

create or replace function salvar_marcos_prazo_evento(
  p_aviso integer, p_atencao integer, p_urgencia integer, p_critico integer
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not (is_admin() or perfil_pode('cfg_documentos_evento', 'editar')) then
    raise exception 'Sem permissao para alterar os marcos do prazo regulatorio.' using errcode = 'insufficient_privilege';
  end if;
  if p_aviso is null or p_atencao is null or p_urgencia is null or p_critico is null then
    raise exception 'Informe os quatro marcos.' using errcode = 'check_violation';
  end if;
  if not (p_aviso >= 1 and p_aviso < p_atencao and p_atencao < p_urgencia and p_urgencia < p_critico and p_critico <= 90) then
    raise exception 'Os marcos precisam ser crescentes (aviso < atencao < urgencia < critico) e no maximo 90 dias, o prazo legal.'
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from empresa) then
    raise exception 'Cadastre a empresa em Configuracoes -> Empresa antes de ajustar os marcos.' using errcode = 'no_data_found';
  end if;
  update empresa
     set prazo_evento_aviso_dias = p_aviso,
         prazo_evento_atencao_dias = p_atencao,
         prazo_evento_urgencia_dias = p_urgencia,
         prazo_evento_critico_dias = p_critico;
end;
$$;

drop policy if exists cb_write on contas_bancarias;
create policy cb_write on contas_bancarias for all to authenticated
  using ((select pode_configurar('cfg_contas_bancarias'))) with check ((select pode_configurar('cfg_contas_bancarias')));

-- Integracoes bancarias: nem ver era de todo staff.
drop policy if exists integracoes_all on integracoes_bancarias;
drop policy if exists integracoes_select on integracoes_bancarias;
create policy integracoes_select on integracoes_bancarias for select to authenticated
  using ((select pode_configurar('cfg_integracoes', 'ver')));
create policy integracoes_all on integracoes_bancarias for all to authenticated
  using ((select pode_configurar('cfg_integracoes'))) with check ((select pode_configurar('cfg_integracoes')));

drop policy if exists empresa_write on empresa;
create policy empresa_write on empresa for all to authenticated
  using ((select pode_configurar('cfg_empresa'))) with check ((select pode_configurar('cfg_empresa')));
drop policy if exists mandatos_write on mandatos;
create policy mandatos_write on mandatos for all to authenticated
  using ((select pode_configurar('cfg_empresa'))) with check ((select pode_configurar('cfg_empresa')));
drop policy if exists diretoria_write on diretoria;
create policy diretoria_write on diretoria for all to authenticated
  using ((select pode_configurar('cfg_empresa'))) with check ((select pode_configurar('cfg_empresa')));
drop policy if exists empdocs_write on empresa_documentos;
create policy empdocs_write on empresa_documentos for all to authenticated
  using ((select pode_configurar('cfg_empresa'))) with check ((select pode_configurar('cfg_empresa')));
drop policy if exists storage_empresa_write on storage.objects;
create policy storage_empresa_write on storage.objects for all to authenticated
  using (bucket_id = 'empresa' and (select pode_configurar('cfg_empresa')))
  with check (bucket_id = 'empresa' and (select pode_configurar('cfg_empresa')));
-- Documentos da empresa: ler segue de todo staff; gravar, a aba Empresa.
drop policy if exists storage_empdocs_all on storage.objects;
create policy storage_empdocs_all on storage.objects for all to authenticated
  using (bucket_id = 'empresa-docs' and (select is_staff()))
  with check (bucket_id = 'empresa-docs' and (select pode_configurar('cfg_empresa')));

-- Regionais: gravar era so do admin; incluir/editar passa a valer para a permissao,
-- EXCLUIR unidade continua so do admin (e o banco ainda recusa a que tem movimento, 0067).
-- Ver a lista inteira passa a valer para `cfg_regionais.ver`.
drop policy if exists regionais_write on regionais;
drop policy if exists regionais_insert on regionais;
drop policy if exists regionais_update on regionais;
drop policy if exists regionais_delete on regionais;
create policy regionais_insert on regionais for insert to authenticated
  with check ((select is_admin() or perfil_pode('cfg_regionais', 'editar')));
create policy regionais_update on regionais for update to authenticated
  using ((select is_admin() or perfil_pode('cfg_regionais', 'editar')))
  with check ((select is_admin() or perfil_pode('cfg_regionais', 'editar')));
create policy regionais_delete on regionais for delete to authenticated
  using ((select is_admin()));
drop policy if exists regionais_select on regionais;
create policy regionais_select on regionais for select to authenticated
  using ((select tem_acesso_global() or perfil_pode('cfg_regionais', 'ver'))
         or id = any((select regionais_do_usuario())::uuid[]));

create or replace function regionais_listar(p_incluir_inativas boolean default true)
returns table (
  id uuid, nome text, codigo text, cnpj text, telefone text, email text,
  cidade text, uf text, ativo boolean, inativada_em timestamptz,
  responsavel_id uuid, responsavel_nome text,
  usuarios bigint, vendedores bigint, vendedores_ativos bigint,
  associados bigint, veiculos bigint, veiculos_ativos bigint,
  leads bigint, lancamentos bigint, pode_excluir boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_todas boolean := tem_acesso_global() or perfil_pode('cfg_regionais', 'ver');
begin
  if not is_staff() then
    raise exception 'Sem permissao' using errcode = 'insufficient_privilege';
  end if;

  return query
  select r.id, r.nome, r.codigo, r.cnpj, r.telefone, r.email,
         nullif(r.endereco->>'cidade','')::text,
         nullif(r.endereco->>'uf','')::text,
         r.ativo, r.inativada_em,
         r.responsavel_id, u.nome,
         c.usuarios, c.vendedores, c.vendedores_ativos,
         c.associados, c.veiculos, c.veiculos_ativos, c.leads, c.lancamentos,
         (c.usuarios + c.vendedores + c.associados + c.veiculos
          + c.leads + c.lancamentos) = 0
    from regionais r
    left join usuarios u on u.id = r.responsavel_id
    cross join lateral (
      select
        (select count(*) from usuarios   x where x.regional_id = r.id) as usuarios,
        (select count(*) from vendedores x where x.regional_id = r.id) as vendedores,
        (select count(*) from vendedores x where x.regional_id = r.id and x.ativo) as vendedores_ativos,
        (select count(*) from clientes   x where x.regional_id = r.id) as associados,
        (select count(*) from veiculos   x where x.regional_id = r.id) as veiculos,
        (select count(*) from veiculos   x where x.regional_id = r.id
                                            and x.status::text = 'ativo')  as veiculos_ativos,
        (select count(*) from leads      x where x.regional_id = r.id) as leads,
        (select count(*) from lancamentos_financeiros x where x.regional_id = r.id) as lancamentos
    ) c
   where (v_todas or r.id = any (regionais_do_usuario()))
     and (coalesce(p_incluir_inativas, true) or r.ativo)
   order by r.ativo desc, r.nome;
end;
$$;

-- Vendedores: a permissao vale nas UNIDADES da pessoa (excluir segue so admin).
drop policy if exists vendedores_insert on vendedores;
create policy vendedores_insert on vendedores for insert to authenticated
  with check (is_admin()
              or (auth_papel() = 'gestor_regional' and regional_id = auth_regional_id())
              or (perfil_pode('cfg_vendedores', 'editar') and pode_regional(regional_id)));
drop policy if exists vendedores_update on vendedores;
create policy vendedores_update on vendedores for update to authenticated
  using      (is_admin()
              or (auth_papel() = 'gestor_regional' and regional_id = auth_regional_id())
              or (perfil_pode('cfg_vendedores', 'editar') and pode_regional(regional_id)))
  with check (is_admin()
              or (auth_papel() = 'gestor_regional' and regional_id = auth_regional_id())
              or (perfil_pode('cfg_vendedores', 'editar') and pode_regional(regional_id)));

-- Rito da 0052 -----------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
