-- =============================================================================
-- 0141 — CONFIGURACOES POR ABA e o DRE SEPARADO na grade de permissoes
-- -----------------------------------------------------------------------------
-- Pedido do usuario (22/10/2026): liberar como EXTRA a algumas pessoas topicos
-- de Configuracoes (plano de contas, marcas e modelos...) e, no Financeiro,
-- separar o DRE do contas a pagar/receber.
--
-- Decisoes do usuario:
--   * uma linha por ABA das Configuracoes (Ver/Criar/Editar/Excluir — a 1a versao
--     tinha so Ver/Editar; o usuario pediu o Criar separado em 23/10). Usuarios e permissoes
--     continua so do admin. Seed vazio: ninguem ganha nada na virada (hoje a
--     tela e so do admin); libera-se por perfil (0111/0130) ou extra (0116);
--   * o DRE vira a linha `financeiro_dre` (Ver/Exportar), semeada para TODOS que
--     hoje tem "Financeiro — ver" (ninguem perde na virada; o admin retira depois);
--   * alcance: SO AS UNIDADES DA PESSOA. O DRE ja passa por escopo_regional; a
--     permissao nova nao amplia unidade nenhuma.
--
-- No banco a trava de gravacao de cada cadastro passa a ser
-- `tem_acesso_global() or perfil_pode('cfg_<aba>', <criar|editar|excluir>)`, uma por
-- operacao (as que eram so
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
      and p_acao in ('ver', 'criar', 'editar', 'excluir'));
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

-- Criar e Excluir: quem ja recebeu "Editar" na 1a versao (que valia incluir, alterar
-- e excluir) fica com os dois — ninguem perde o que o admin acabou de liberar.
insert into perfil_permissoes (papel, modulo, acao, concedida)
select e.papel, e.modulo, a.acao, e.concedida
  from perfil_permissoes e
 cross join (values ('criar'), ('excluir')) a(acao)
 where e.modulo like 'cfg\_%' and e.acao = 'editar'
   and not exists (select 1 from perfil_permissoes x
                    where x.papel = e.papel and x.modulo = e.modulo and x.acao = a.acao);

insert into usuario_permissoes (usuario_id, modulo, acao, motivo, expira_em, concedido_por)
select e.usuario_id, e.modulo, a.acao,
       'Configuracoes (0141): Criar/Excluir separados do Editar ja concedido',
       e.expira_em, e.concedido_por
  from usuario_permissoes e
 cross join (values ('criar'), ('excluir')) a(acao)
 where e.modulo like 'cfg\_%' and e.acao = 'editar'
   and not exists (select 1 from usuario_permissoes x
                    where x.usuario_id = e.usuario_id and x.modulo = e.modulo and x.acao = a.acao);

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
-- Cada cadastro: INSERT pede `criar`, UPDATE pede `editar`, DELETE pede `excluir`
-- (as telas gravam com insert/update/delete separados). As tabelas de LIGACAO
-- (tipos do produto, itens do plano, apelidos da cor) sao regravadas ao salvar o
-- cadastro-pai, entao valem para quem cria OU edita. O `_write` antigo (for all) sai.

drop policy if exists categorias_write on categorias_dre;
drop policy if exists categorias_insert on categorias_dre;
drop policy if exists categorias_update on categorias_dre;
drop policy if exists categorias_delete on categorias_dre;
create policy categorias_insert on categorias_dre for insert to authenticated with check ((select pode_configurar('cfg_plano_contas', 'criar')));
create policy categorias_update on categorias_dre for update to authenticated using ((select pode_configurar('cfg_plano_contas', 'editar'))) with check ((select pode_configurar('cfg_plano_contas', 'editar')));
create policy categorias_delete on categorias_dre for delete to authenticated using ((select pode_configurar('cfg_plano_contas', 'excluir')));

drop policy if exists cc_write on centros_custo;
drop policy if exists cc_insert on centros_custo;
drop policy if exists cc_update on centros_custo;
drop policy if exists cc_delete on centros_custo;
create policy cc_insert on centros_custo for insert to authenticated with check ((select pode_configurar('cfg_centros_custo', 'criar')));
create policy cc_update on centros_custo for update to authenticated using ((select pode_configurar('cfg_centros_custo', 'editar'))) with check ((select pode_configurar('cfg_centros_custo', 'editar')));
create policy cc_delete on centros_custo for delete to authenticated using ((select pode_configurar('cfg_centros_custo', 'excluir')));

drop policy if exists marcas_write on marcas;
drop policy if exists marcas_insert on marcas;
drop policy if exists marcas_update on marcas;
drop policy if exists marcas_delete on marcas;
create policy marcas_insert on marcas for insert to authenticated with check ((select pode_configurar('cfg_marcas_modelos', 'criar')));
create policy marcas_update on marcas for update to authenticated using ((select pode_configurar('cfg_marcas_modelos', 'editar'))) with check ((select pode_configurar('cfg_marcas_modelos', 'editar')));
create policy marcas_delete on marcas for delete to authenticated using ((select pode_configurar('cfg_marcas_modelos', 'excluir')));

drop policy if exists modelos_write on modelos;
drop policy if exists modelos_insert on modelos;
drop policy if exists modelos_update on modelos;
drop policy if exists modelos_delete on modelos;
create policy modelos_insert on modelos for insert to authenticated with check ((select pode_configurar('cfg_marcas_modelos', 'criar')));
create policy modelos_update on modelos for update to authenticated using ((select pode_configurar('cfg_marcas_modelos', 'editar'))) with check ((select pode_configurar('cfg_marcas_modelos', 'editar')));
create policy modelos_delete on modelos for delete to authenticated using ((select pode_configurar('cfg_marcas_modelos', 'excluir')));

drop policy if exists prod_write on produtos;
drop policy if exists prod_insert on produtos;
drop policy if exists prod_update on produtos;
drop policy if exists prod_delete on produtos;
create policy prod_insert on produtos for insert to authenticated with check ((select pode_configurar('cfg_produtos', 'criar')));
create policy prod_update on produtos for update to authenticated using ((select pode_configurar('cfg_produtos', 'editar'))) with check ((select pode_configurar('cfg_produtos', 'editar')));
create policy prod_delete on produtos for delete to authenticated using ((select pode_configurar('cfg_produtos', 'excluir')));

drop policy if exists ptv_write on produto_tipos_veiculo;
create policy ptv_write on produto_tipos_veiculo for all to authenticated using ((select pode_configurar('cfg_produtos', 'criar') or pode_configurar('cfg_produtos', 'editar'))) with check ((select pode_configurar('cfg_produtos', 'criar') or pode_configurar('cfg_produtos', 'editar')));

-- Planos eram so do admin: seguem admin + a permissao (o financeiro nao ganha).

drop policy if exists planos_write on planos_protecao;
drop policy if exists planos_insert on planos_protecao;
drop policy if exists planos_update on planos_protecao;
drop policy if exists planos_delete on planos_protecao;
create policy planos_insert on planos_protecao for insert to authenticated with check ((select is_admin() or perfil_pode('cfg_planos', 'criar')));
create policy planos_update on planos_protecao for update to authenticated using ((select is_admin() or perfil_pode('cfg_planos', 'editar'))) with check ((select is_admin() or perfil_pode('cfg_planos', 'editar')));
create policy planos_delete on planos_protecao for delete to authenticated using ((select is_admin() or perfil_pode('cfg_planos', 'excluir')));

drop policy if exists pp_write on plano_produtos;
create policy pp_write on plano_produtos for all to authenticated using ((select pode_configurar('cfg_planos', 'criar') or pode_configurar('cfg_planos', 'editar'))) with check ((select pode_configurar('cfg_planos', 'criar') or pode_configurar('cfg_planos', 'editar')));

drop policy if exists tv_write on tipos_veiculo;
drop policy if exists tv_insert on tipos_veiculo;
drop policy if exists tv_update on tipos_veiculo;
drop policy if exists tv_delete on tipos_veiculo;
create policy tv_insert on tipos_veiculo for insert to authenticated with check ((select pode_configurar('cfg_tipos_veiculo', 'criar')));
create policy tv_update on tipos_veiculo for update to authenticated using ((select pode_configurar('cfg_tipos_veiculo', 'editar'))) with check ((select pode_configurar('cfg_tipos_veiculo', 'editar')));
create policy tv_delete on tipos_veiculo for delete to authenticated using ((select pode_configurar('cfg_tipos_veiculo', 'excluir')));

drop policy if exists cores_write on cores;
drop policy if exists cores_insert on cores;
drop policy if exists cores_update on cores;
drop policy if exists cores_delete on cores;
create policy cores_insert on cores for insert to authenticated with check ((select pode_configurar('cfg_cores', 'criar')));
create policy cores_update on cores for update to authenticated using ((select pode_configurar('cfg_cores', 'editar'))) with check ((select pode_configurar('cfg_cores', 'editar')));
create policy cores_delete on cores for delete to authenticated using ((select pode_configurar('cfg_cores', 'excluir')));

drop policy if exists cor_apelidos_write on cor_apelidos;
create policy cor_apelidos_write on cor_apelidos for all to authenticated using ((select pode_configurar('cfg_cores', 'criar') or pode_configurar('cfg_cores', 'editar'))) with check ((select pode_configurar('cfg_cores', 'criar') or pode_configurar('cfg_cores', 'editar')));

drop policy if exists cotas_write on cotas_participacao;
drop policy if exists cotas_insert on cotas_participacao;
drop policy if exists cotas_update on cotas_participacao;
drop policy if exists cotas_delete on cotas_participacao;
create policy cotas_insert on cotas_participacao for insert to authenticated with check ((select pode_configurar('cfg_cotas', 'criar')));
create policy cotas_update on cotas_participacao for update to authenticated using ((select pode_configurar('cfg_cotas', 'editar'))) with check ((select pode_configurar('cfg_cotas', 'editar')));
create policy cotas_delete on cotas_participacao for delete to authenticated using ((select pode_configurar('cfg_cotas', 'excluir')));

drop policy if exists tipos_evento_write on tipos_evento;
drop policy if exists tipos_evento_insert on tipos_evento;
drop policy if exists tipos_evento_update on tipos_evento;
drop policy if exists tipos_evento_delete on tipos_evento;
create policy tipos_evento_insert on tipos_evento for insert to authenticated with check ((select pode_configurar('cfg_tipos_evento', 'criar')));
create policy tipos_evento_update on tipos_evento for update to authenticated using ((select pode_configurar('cfg_tipos_evento', 'editar'))) with check ((select pode_configurar('cfg_tipos_evento', 'editar')));
create policy tipos_evento_delete on tipos_evento for delete to authenticated using ((select pode_configurar('cfg_tipos_evento', 'excluir')));

drop policy if exists ta_write on tipos_alerta;
drop policy if exists ta_insert on tipos_alerta;
drop policy if exists ta_update on tipos_alerta;
drop policy if exists ta_delete on tipos_alerta;
create policy ta_insert on tipos_alerta for insert to authenticated with check ((select pode_configurar('cfg_alertas', 'criar')));
create policy ta_update on tipos_alerta for update to authenticated using ((select pode_configurar('cfg_alertas', 'editar'))) with check ((select pode_configurar('cfg_alertas', 'editar')));
create policy ta_delete on tipos_alerta for delete to authenticated using ((select pode_configurar('cfg_alertas', 'excluir')));

-- Documentos e prazos do evento: eram so do admin.

drop policy if exists evento_doc_modelo_write on evento_documentos_modelo;
drop policy if exists evento_doc_modelo_insert on evento_documentos_modelo;
drop policy if exists evento_doc_modelo_update on evento_documentos_modelo;
drop policy if exists evento_doc_modelo_delete on evento_documentos_modelo;
create policy evento_doc_modelo_insert on evento_documentos_modelo for insert to authenticated with check ((select is_admin() or perfil_pode('cfg_documentos_evento', 'criar')));
create policy evento_doc_modelo_update on evento_documentos_modelo for update to authenticated using ((select is_admin() or perfil_pode('cfg_documentos_evento', 'editar'))) with check ((select is_admin() or perfil_pode('cfg_documentos_evento', 'editar')));
create policy evento_doc_modelo_delete on evento_documentos_modelo for delete to authenticated using ((select is_admin() or perfil_pode('cfg_documentos_evento', 'excluir')));

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
drop policy if exists cb_insert on contas_bancarias;
drop policy if exists cb_update on contas_bancarias;
drop policy if exists cb_delete on contas_bancarias;
create policy cb_insert on contas_bancarias for insert to authenticated with check ((select pode_configurar('cfg_contas_bancarias', 'criar')));
create policy cb_update on contas_bancarias for update to authenticated using ((select pode_configurar('cfg_contas_bancarias', 'editar'))) with check ((select pode_configurar('cfg_contas_bancarias', 'editar')));
create policy cb_delete on contas_bancarias for delete to authenticated using ((select pode_configurar('cfg_contas_bancarias', 'excluir')));

-- Integracoes bancarias: nem ver era de todo staff.
drop policy if exists integracoes_all on integracoes_bancarias;
drop policy if exists integracoes_select on integracoes_bancarias;
create policy integracoes_select on integracoes_bancarias for select to authenticated
  using ((select pode_configurar('cfg_integracoes', 'ver')));

drop policy if exists integracoes_write on integracoes_bancarias;
drop policy if exists integracoes_insert on integracoes_bancarias;
drop policy if exists integracoes_update on integracoes_bancarias;
drop policy if exists integracoes_delete on integracoes_bancarias;
create policy integracoes_insert on integracoes_bancarias for insert to authenticated with check ((select pode_configurar('cfg_integracoes', 'criar')));
create policy integracoes_update on integracoes_bancarias for update to authenticated using ((select pode_configurar('cfg_integracoes', 'editar'))) with check ((select pode_configurar('cfg_integracoes', 'editar')));
create policy integracoes_delete on integracoes_bancarias for delete to authenticated using ((select pode_configurar('cfg_integracoes', 'excluir')));

-- Empresa: a ficha, os mandatos, a diretoria e os documentos.

drop policy if exists empresa_write on empresa;
drop policy if exists empresa_insert on empresa;
drop policy if exists empresa_update on empresa;
drop policy if exists empresa_delete on empresa;
create policy empresa_insert on empresa for insert to authenticated with check ((select pode_configurar('cfg_empresa', 'criar')));
create policy empresa_update on empresa for update to authenticated using ((select pode_configurar('cfg_empresa', 'editar'))) with check ((select pode_configurar('cfg_empresa', 'editar')));
create policy empresa_delete on empresa for delete to authenticated using ((select pode_configurar('cfg_empresa', 'excluir')));

drop policy if exists mandatos_write on mandatos;
drop policy if exists mandatos_insert on mandatos;
drop policy if exists mandatos_update on mandatos;
drop policy if exists mandatos_delete on mandatos;
create policy mandatos_insert on mandatos for insert to authenticated with check ((select pode_configurar('cfg_empresa', 'criar')));
create policy mandatos_update on mandatos for update to authenticated using ((select pode_configurar('cfg_empresa', 'editar'))) with check ((select pode_configurar('cfg_empresa', 'editar')));
create policy mandatos_delete on mandatos for delete to authenticated using ((select pode_configurar('cfg_empresa', 'excluir')));

drop policy if exists diretoria_write on diretoria;
drop policy if exists diretoria_insert on diretoria;
drop policy if exists diretoria_update on diretoria;
drop policy if exists diretoria_delete on diretoria;
create policy diretoria_insert on diretoria for insert to authenticated with check ((select pode_configurar('cfg_empresa', 'criar')));
create policy diretoria_update on diretoria for update to authenticated using ((select pode_configurar('cfg_empresa', 'editar'))) with check ((select pode_configurar('cfg_empresa', 'editar')));
create policy diretoria_delete on diretoria for delete to authenticated using ((select pode_configurar('cfg_empresa', 'excluir')));

drop policy if exists empdocs_write on empresa_documentos;
drop policy if exists empdocs_insert on empresa_documentos;
drop policy if exists empdocs_update on empresa_documentos;
drop policy if exists empdocs_delete on empresa_documentos;
create policy empdocs_insert on empresa_documentos for insert to authenticated with check ((select pode_configurar('cfg_empresa', 'criar')));
create policy empdocs_update on empresa_documentos for update to authenticated using ((select pode_configurar('cfg_empresa', 'editar'))) with check ((select pode_configurar('cfg_empresa', 'editar')));
create policy empdocs_delete on empresa_documentos for delete to authenticated using ((select pode_configurar('cfg_empresa', 'excluir')));

-- Logo e documentos da empresa (Storage). Em producao `storage.objects` pertence ao
-- `supabase_storage_admin` e o SQL Editor roda como `postgres`: mexer nas policies
-- dali da `must be owner of table objects` e, sem este bloco, derrubava a migration
-- INTEIRA (o editor roda tudo numa transacao — foi o que aconteceu em 22/10/2026).
-- Onde nao ha permissao, pula com aviso e o upload segue so da matriz.
do $$
begin
  drop policy if exists storage_empresa_write on storage.objects;
  create policy storage_empresa_write on storage.objects for all to authenticated
    using (bucket_id = 'empresa' and (select pode_configurar('cfg_empresa', 'editar')))
    with check (bucket_id = 'empresa' and (select pode_configurar('cfg_empresa', 'editar')));
  drop policy if exists storage_empdocs_all on storage.objects;
  create policy storage_empdocs_all on storage.objects for all to authenticated
    using (bucket_id = 'empresa-docs' and (select is_staff()))
    with check (bucket_id = 'empresa-docs' and (select pode_configurar('cfg_empresa', 'criar')));
exception when insufficient_privilege then
  raise notice '0141: policies do Storage (empresa) nao alteradas: % (upload segue so da matriz)', sqlerrm;
end $$;

-- Regionais: incluir/editar/excluir pela aba. Excluir unidade com movimento o banco
-- ja recusa (0067). Ver a lista inteira passa a valer para `cfg_regionais.ver`.

drop policy if exists regionais_write on regionais;
drop policy if exists regionais_insert on regionais;
drop policy if exists regionais_update on regionais;
drop policy if exists regionais_delete on regionais;
create policy regionais_insert on regionais for insert to authenticated with check ((select is_admin() or perfil_pode('cfg_regionais', 'criar')));
create policy regionais_update on regionais for update to authenticated using ((select is_admin() or perfil_pode('cfg_regionais', 'editar'))) with check ((select is_admin() or perfil_pode('cfg_regionais', 'editar')));
create policy regionais_delete on regionais for delete to authenticated using ((select is_admin() or perfil_pode('cfg_regionais', 'excluir')));

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

-- Vendedores: a aba vale nas UNIDADES da pessoa; excluir segue so do admin (0102),
-- porque apagar vendedor desliga a carteira dele em silencio.
drop policy if exists vendedores_insert on vendedores;
create policy vendedores_insert on vendedores for insert to authenticated
  with check (is_admin()
              or (auth_papel() = 'gestor_regional' and regional_id = auth_regional_id())
              or (perfil_pode('cfg_vendedores', 'criar') and pode_regional(regional_id)));
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
