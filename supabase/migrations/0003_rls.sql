-- ============================================================================
-- SCar :: 0003_rls.sql
-- Row Level Security. Modelo multi-tenant por regional + Portal do Associado.
--
-- Papeis com acesso GLOBAL (todas as regionais): admin, financeiro.
-- Papeis com acesso REGIONAL: gestor_regional, consultor_vendas, sinistro, cotador.
-- Associados (Portal): so enxergam os proprios dados (clientes.auth_user_id).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helpers de escopo
-- ----------------------------------------------------------------------------
create or replace function is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.usuarios where id = auth.uid()); $$;

create or replace function tem_acesso_global()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(auth_papel() in ('admin', 'financeiro'), false); $$;

-- true se o staff logado pode operar sobre a regional informada
create or replace function pode_regional(p_regional uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select tem_acesso_global()
      or (is_staff() and p_regional is not null and auth_regional_id() = p_regional);
$$;

-- ----------------------------------------------------------------------------
-- Habilita RLS em todas as tabelas
-- ----------------------------------------------------------------------------
alter table regionais            enable row level security;
alter table usuarios             enable row level security;
alter table vendedores           enable row level security;
alter table clientes             enable row level security;
alter table planos_protecao      enable row level security;
alter table veiculos             enable row level security;
alter table categorias_dre       enable row level security;
alter table titulos_financeiros  enable row level security;
alter table movimentacoes_caixa  enable row level security;
alter table comissoes_vendas     enable row level security;
alter table eventos_sinistro     enable row level security;
alter table historico_protocolo  enable row level security;
alter table anexos_evento        enable row level security;
alter table cotacoes_pecas       enable row level security;
alter table itens_cotacao        enable row level security;
alter table notas_fiscais_evento enable row level security;
alter table email_templates      enable row level security;

-- ============================================================================
-- REGIONAIS
-- ============================================================================
create policy regionais_select on regionais for select to authenticated
  using (tem_acesso_global() or id = auth_regional_id());
create policy regionais_write on regionais for all to authenticated
  using (is_admin()) with check (is_admin());

-- ============================================================================
-- USUARIOS  (cada um le a si; admin/gestor gerenciam)
-- ============================================================================
create policy usuarios_select_self on usuarios for select to authenticated
  using (id = auth.uid() or tem_acesso_global()
         or (auth_papel() = 'gestor_regional' and regional_id = auth_regional_id()));
create policy usuarios_update_self on usuarios for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy usuarios_admin_write on usuarios for all to authenticated
  using (is_admin()) with check (is_admin());

-- ============================================================================
-- PLANOS DE PROTECAO  (catalogo: leitura para staff, escrita admin)
-- ============================================================================
create policy planos_select on planos_protecao for select to authenticated
  using (is_staff());
create policy planos_write on planos_protecao for all to authenticated
  using (is_admin()) with check (is_admin());

-- ============================================================================
-- VENDEDORES
-- ============================================================================
create policy vendedores_select on vendedores for select to authenticated
  using (pode_regional(regional_id) or usuario_id = auth.uid());
create policy vendedores_write on vendedores for all to authenticated
  using (is_admin() or (auth_papel() = 'gestor_regional' and regional_id = auth_regional_id()))
  with check (is_admin() or (auth_papel() = 'gestor_regional' and regional_id = auth_regional_id()));

-- ============================================================================
-- CLIENTES  (staff por regional + Portal: o proprio associado)
-- ============================================================================
create policy clientes_select on clientes for select to authenticated
  using (pode_regional(regional_id) or auth_user_id = auth.uid());
create policy clientes_write on clientes for all to authenticated
  using (pode_regional(regional_id)) with check (pode_regional(regional_id));

-- ============================================================================
-- VEICULOS  (staff por regional + Portal: veiculos do associado)
-- ============================================================================
create policy veiculos_select on veiculos for select to authenticated
  using (
    pode_regional(regional_id)
    or cliente_id = auth_cliente_id()
  );
create policy veiculos_write on veiculos for all to authenticated
  using (pode_regional(regional_id)) with check (pode_regional(regional_id));

-- ============================================================================
-- FINANCEIRO
-- ============================================================================
-- titulos: staff (global/regional via cliente) + Portal (proprios titulos)
create policy titulos_select on titulos_financeiros for select to authenticated
  using (
    tem_acesso_global()
    or cliente_id = auth_cliente_id()
    or exists (select 1 from clientes c
               where c.id = cliente_id and pode_regional(c.regional_id))
  );
create policy titulos_write on titulos_financeiros for all to authenticated
  using (tem_acesso_global()
         or exists (select 1 from clientes c where c.id = cliente_id and pode_regional(c.regional_id)))
  with check (tem_acesso_global()
         or exists (select 1 from clientes c where c.id = cliente_id and pode_regional(c.regional_id)));

-- categorias_dre: catalogo contabil, leitura staff, escrita global
create policy categorias_select on categorias_dre for select to authenticated
  using (is_staff());
create policy categorias_write on categorias_dre for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

-- movimentacoes_caixa: acesso global ou regional
create policy movcaixa_select on movimentacoes_caixa for select to authenticated
  using (pode_regional(regional_id));
create policy movcaixa_write on movimentacoes_caixa for all to authenticated
  using (pode_regional(regional_id)) with check (pode_regional(regional_id));

-- comissoes: staff financeiro/global; o proprio vendedor le as suas
create policy comissoes_select on comissoes_vendas for select to authenticated
  using (
    tem_acesso_global()
    or exists (select 1 from vendedores v
               where v.id = vendedor_id
                 and (v.usuario_id = auth.uid() or pode_regional(v.regional_id)))
  );
create policy comissoes_write on comissoes_vendas for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

-- ============================================================================
-- EVENTOS / SINISTROS
-- ============================================================================
create policy eventos_select on eventos_sinistro for select to authenticated
  using (
    pode_regional(regional_id)
    or cliente_id = auth_cliente_id()
  );
-- Portal pode ABRIR evento para o proprio veiculo; staff cria por regional
create policy eventos_insert on eventos_sinistro for insert to authenticated
  with check (
    pode_regional(regional_id)
    or cliente_id = auth_cliente_id()
  );
create policy eventos_update on eventos_sinistro for update to authenticated
  using (pode_regional(regional_id)) with check (pode_regional(regional_id));
create policy eventos_delete on eventos_sinistro for delete to authenticated
  using (is_admin());

-- historico: leitura conforme evento; escrita por staff da regional (ou via RPC)
create policy historico_select on historico_protocolo for select to authenticated
  using (exists (select 1 from eventos_sinistro e
                 where e.id = evento_id
                   and (pode_regional(e.regional_id) or e.cliente_id = auth_cliente_id())));
create policy historico_insert on historico_protocolo for insert to authenticated
  with check (exists (select 1 from eventos_sinistro e
                      where e.id = evento_id and pode_regional(e.regional_id)));

-- anexos: staff da regional do evento + associado dono do evento
create policy anexos_select on anexos_evento for select to authenticated
  using (exists (select 1 from eventos_sinistro e
                 where e.id = evento_id
                   and (pode_regional(e.regional_id) or e.cliente_id = auth_cliente_id())));
create policy anexos_insert on anexos_evento for insert to authenticated
  with check (exists (select 1 from eventos_sinistro e
                      where e.id = evento_id
                        and (pode_regional(e.regional_id) or e.cliente_id = auth_cliente_id())));
create policy anexos_delete on anexos_evento for delete to authenticated
  using (exists (select 1 from eventos_sinistro e
                 where e.id = evento_id and pode_regional(e.regional_id)));

-- cotacoes e itens: staff da regional do evento
create policy cotacoes_all on cotacoes_pecas for all to authenticated
  using (exists (select 1 from eventos_sinistro e where e.id = evento_id and pode_regional(e.regional_id)))
  with check (exists (select 1 from eventos_sinistro e where e.id = evento_id and pode_regional(e.regional_id)));
create policy itens_all on itens_cotacao for all to authenticated
  using (exists (select 1 from cotacoes_pecas c join eventos_sinistro e on e.id = c.evento_id
                 where c.id = cotacao_id and pode_regional(e.regional_id)))
  with check (exists (select 1 from cotacoes_pecas c join eventos_sinistro e on e.id = c.evento_id
                 where c.id = cotacao_id and pode_regional(e.regional_id)));

-- notas fiscais do evento
create policy nfe_all on notas_fiscais_evento for all to authenticated
  using (exists (select 1 from eventos_sinistro e where e.id = evento_id and pode_regional(e.regional_id)))
  with check (exists (select 1 from eventos_sinistro e where e.id = evento_id and pode_regional(e.regional_id)));

-- ============================================================================
-- EMAIL TEMPLATES  (leitura staff, escrita global)
-- ============================================================================
create policy templates_select on email_templates for select to authenticated
  using (is_staff());
create policy templates_write on email_templates for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

-- ============================================================================
-- STORAGE :: bucket privado 'sinistros-docs'
-- Estrutura de path esperada: {evento_id}/{arquivo}
-- Acesso liberado a quem enxerga o evento (staff da regional ou associado dono).
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('sinistros-docs', 'sinistros-docs', false)
on conflict (id) do nothing;

create policy storage_sinistros_select on storage.objects for select to authenticated
  using (
    bucket_id = 'sinistros-docs'
    and exists (
      select 1 from eventos_sinistro e
      where e.id = (split_part(name, '/', 1))::uuid
        and (pode_regional(e.regional_id) or e.cliente_id = auth_cliente_id())
    )
  );

create policy storage_sinistros_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sinistros-docs'
    and exists (
      select 1 from eventos_sinistro e
      where e.id = (split_part(name, '/', 1))::uuid
        and (pode_regional(e.regional_id) or e.cliente_id = auth_cliente_id())
    )
  );

create policy storage_sinistros_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'sinistros-docs'
    and exists (
      select 1 from eventos_sinistro e
      where e.id = (split_part(name, '/', 1))::uuid and pode_regional(e.regional_id)
    )
  );

-- ============================================================================
-- GRANTS de acesso (o RLS acima e quem restringe as LINHAS; o GRANT libera a
-- TABELA). Sem GRANT, o Postgres retorna "permission denied" antes do RLS.
-- Observacao: no Supabase gerenciado esses roles ja possuem grants padrao;
-- mantemos explicito para o schema ser portavel e autoexplicativo.
-- ============================================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Novos objetos futuros herdam os mesmos grants.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;
