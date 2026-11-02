-- ============================================================================
-- 0169 — E-MAILS DE COBRANCA na grade de permissoes (pedido do usuario, 02/11/2026)
-- ============================================================================
-- "Somente aos perfis pre-determinados ou como extra para alguns, nao serao todos
-- que vao mexer nisso." Ate aqui o painel (0168) era de admin + financeiro por
-- tem_acesso_global(), sem como liberar ou tirar de alguem.
--
-- (A) celulas novas na grade (0111): `cobranca_emails` . ver | editar
--       ver    = abrir o painel (KPIs, fila, regua, supressoes, pre-visualizacao)
--       editar = pausar/ligar producao, lista de teste, janela/taxa, regua, reenviar,
--                cancelar, suprimir/liberar, rodar agora e mandar teste
--     Seed: so o FINANCEIRO (o mesmo de hoje); admin sempre; perfis personalizados e os
--     demais papeis nascem sem. Liberar = grade do perfil ou extra por usuario (0116).
-- (B) pode_emails_cobranca(acao) = perfil_pode('cobranca_emails', acao).
-- (C) RLS das 5 tabelas email_* e as 6 RPCs da 0168 passam a usar (B). As RPCs sao
--     trocadas pelo literal da definicao EM VIGOR (padrao da 0152): sem reescrever corpo.
--     O caminho sem sessao (a rotina/crontab, service_role) segue igual.
-- Re-executavel.
-- ============================================================================

-- (A) a grade -----------------------------------------------------------------
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
    ('cobranca_emails','ver'), ('cobranca_emails','editar'),
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
                       ('veiculos'),('rastreadores'),('eventos'),('cobranca'),('cobranca_emails'),('revistoria'),
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

-- seed: todo papel/perfil ja presente na grade ganha a linha; so o financeiro concedido
insert into perfil_permissoes (papel, modulo, acao, concedida)
select k.papel, 'cobranca_emails', a.acao, (k.papel = 'financeiro')
  from (select distinct papel from perfil_permissoes) k
 cross join (values ('ver'), ('editar')) a(acao)
 where not exists (select 1 from perfil_permissoes x
                    where x.papel = k.papel and x.modulo = 'cobranca_emails' and x.acao = a.acao);

-- (B) o helper ----------------------------------------------------------------
create or replace function pode_emails_cobranca(p_acao text default 'ver')
returns boolean
language sql stable security definer set search_path = public
as $$
  select perfil_pode('cobranca_emails', coalesce(p_acao, 'ver'))
      or (coalesce(p_acao, 'ver') = 'ver' and perfil_pode('cobranca_emails', 'editar'));
$$;
comment on function pode_emails_cobranca(text) is
  'E-mails de cobranca (0169): a celula cobranca_emails.<acao> da grade (perfil ou extra; admin sempre). Editar inclui ver.';

-- (C) RLS ---------------------------------------------------------------------
drop policy if exists email_config_select on email_config;
create policy email_config_select on email_config for select to authenticated
  using ((select pode_emails_cobranca('ver')));
drop policy if exists email_config_update on email_config;
create policy email_config_update on email_config for update to authenticated
  using ((select pode_emails_cobranca('editar'))) with check ((select pode_emails_cobranca('editar')));

drop policy if exists email_regua_select on email_regua;
create policy email_regua_select on email_regua for select to authenticated
  using ((select pode_emails_cobranca('ver')));
drop policy if exists email_regua_update on email_regua;
create policy email_regua_update on email_regua for update to authenticated
  using ((select pode_emails_cobranca('editar'))) with check ((select pode_emails_cobranca('editar')));

drop policy if exists email_outbox_select on email_outbox;
create policy email_outbox_select on email_outbox for select to authenticated
  using ((select pode_emails_cobranca('ver')));
drop policy if exists email_eventos_select on email_eventos;
create policy email_eventos_select on email_eventos for select to authenticated
  using ((select pode_emails_cobranca('ver')));
drop policy if exists email_supressoes_select on email_supressoes;
create policy email_supressoes_select on email_supressoes for select to authenticated
  using ((select pode_emails_cobranca('ver')));

-- (C) as RPCs, pela troca do literal na definicao em vigor -----------------------
do $$
declare
  r record;
  v_def text;
  v_novo text;
begin
  for r in
    select * from (values
      ('enfileirar_avisos_cobranca(date)', 'not tem_acesso_global()', 'not pode_emails_cobranca(''editar'')'),
      ('suprimir_email_manual(text,text)', 'not tem_acesso_global()', 'not pode_emails_cobranca(''editar'')'),
      ('liberar_supressao_email(uuid,text)', 'not tem_acesso_global()', 'not pode_emails_cobranca(''editar'')'),
      ('reenviar_email(uuid)', 'not tem_acesso_global()', 'not pode_emails_cobranca(''editar'')'),
      ('cancelar_email(uuid,text)', 'not tem_acesso_global()', 'not pode_emails_cobranca(''editar'')'),
      ('email_painel_resumo(integer)', 'not tem_acesso_global()', 'not pode_emails_cobranca(''ver'')')
    ) t(fn, de, para)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.para in v_def) > 0 then
      continue; -- ja trocada (re-execucao)
    end if;
    if position(r.de in v_def) = 0 then
      raise exception '0169: % nao tem o trecho esperado (%)', r.fn, r.de;
    end if;
    v_novo := replace(v_def, r.de, r.para);
    execute v_novo;
  end loop;
end;
$$;

-- rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
