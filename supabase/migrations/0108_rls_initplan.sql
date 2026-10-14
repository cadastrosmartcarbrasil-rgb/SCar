-- 0108_rls_initplan — as consultas LENTAS depois da carga do Mutual (14/10/2026).
--
-- O SINTOMA: `/veiculos` e `/associados` passaram a demorar ~20 s para abrir.
-- A lista le a tabela inteira em paginas de 1.000 (lerTodas) e, em producao,
-- cada pagina de veiculos levava 2,8 s e cada uma de clientes 1,3 s
-- (pg_stat_statements). Com 6.808 veiculos sao 7 paginas.
--
-- A CAUSA: as policies chamavam a funcao POR LINHA. `pode_regional(regional_id)`
-- e uma funcao SQL security definer, entao o planejador nao a abre: para cada
-- linha ela roda `tem_acesso_global()` -> `auth_papel()` (select em usuarios),
-- `is_staff()` e `auth_regional_id()` — quatro consultas por linha, e o filtro
-- roda sobre a tabela TODA antes do ORDER BY de cada pagina. Medido em producao:
-- a mesma consulta de 1.000 veiculos leva 1.430 ms com o filtro da policy e
-- 4 ms com o filtro abaixo (mesma tabela, mesmo plano de ordenacao).
--
-- A CORRECAO e a recomendada pelo Supabase: `(select f())` vira InitPlan e e
-- avaliado UMA vez por consulta. O argumento por linha (`regional_id`) sai da
-- funcao e vira comparacao simples com `(select auth_regional_id())`.
--
-- A REGRA NAO MUDA. `pode_regional(p)` e
--   tem_acesso_global() or (is_staff() and p is not null and auth_regional_id() = p)
-- e `auth_regional_id()` so devolve algo para usuario ATIVO em `usuarios` (0068),
-- ou seja, quando ele nao e nulo `is_staff()` ja e verdade — o termo e redundante.
-- Os nomes, os comandos e os papeis de cada policy sao os mesmos de producao
-- (conferidos em pg_policies em 14/10/2026). As permissivas se somam por OR, e
-- a `*_write` (FOR ALL) tambem entra no SELECT: por isso as duas foram reescritas.
--
-- As outras 80 e poucas policies com `pode_regional` ficam como estao: sao de
-- tabelas pequenas, onde o custo por linha nao aparece. Tabela que crescer
-- recebe o mesmo tratamento.

-- ------------------------------------------------------------------ veiculos
drop policy if exists veiculos_select on veiculos;
create policy veiculos_select on veiculos for select to authenticated
  using (
    (select tem_acesso_global())
    or (regional_id is not null and regional_id = (select auth_regional_id()))
    or cliente_id = (select auth_cliente_id())
  );

drop policy if exists veiculos_write on veiculos;
create policy veiculos_write on veiculos for all to authenticated
  using (
    (select tem_acesso_global())
    or (regional_id is not null and regional_id = (select auth_regional_id()))
  )
  with check (
    (select tem_acesso_global())
    or (regional_id is not null and regional_id = (select auth_regional_id()))
  );

-- ------------------------------------------------------------------ clientes
drop policy if exists clientes_select on clientes;
create policy clientes_select on clientes for select to authenticated
  using (
    (select tem_acesso_global())
    or (regional_id is not null and regional_id = (select auth_regional_id()))
    or auth_user_id = (select auth.uid())
  );

drop policy if exists clientes_write on clientes;
create policy clientes_write on clientes for all to authenticated
  using (
    (select tem_acesso_global())
    or (regional_id is not null and regional_id = (select auth_regional_id()))
  )
  with check (
    (select tem_acesso_global())
    or (regional_id is not null and regional_id = (select auth_regional_id()))
  );

-- --------------------------------------------------------- eventos_historico
drop policy if exists eventos_historico_select on eventos_historico;
create policy eventos_historico_select on eventos_historico for select to authenticated
  using (
    (select tem_acesso_global())
    or cliente_id = (select auth_cliente_id())
    or exists (
      select 1 from clientes c
       where c.id = eventos_historico.cliente_id
         and c.regional_id is not null
         and c.regional_id = (select auth_regional_id())
    )
  );

-- ------------------------------------------------- tabelas grandes do Mutual
-- Sem argumento por linha: so o embrulho `(select ...)`.
drop policy if exists boletos_historico_select on boletos_historico;
create policy boletos_historico_select on boletos_historico for select to authenticated
  using ((select tem_acesso_global()));

drop policy if exists vinc_select on integracao_vinculos;
create policy vinc_select on integracao_vinculos for select to authenticated
  using ((select is_staff()));
drop policy if exists vinc_write on integracao_vinculos;
create policy vinc_write on integracao_vinculos for all to authenticated
  using ((select tem_acesso_global())) with check ((select tem_acesso_global()));

drop policy if exists modelos_select on modelos;
create policy modelos_select on modelos for select to authenticated
  using ((select is_staff()));
drop policy if exists modelos_write on modelos;
create policy modelos_write on modelos for all to authenticated
  using ((select tem_acesso_global())) with check ((select tem_acesso_global()));

drop policy if exists mcap_select on mutual_captura;
create policy mcap_select on mutual_captura for select
  using ((select is_staff()));
drop policy if exists mcap_write on mutual_captura;
create policy mcap_write on mutual_captura for all
  using ((select tem_acesso_global())) with check ((select tem_acesso_global()));

drop policy if exists msinc_select on mutual_sincronias;
create policy msinc_select on mutual_sincronias for select
  using ((select is_staff()));
drop policy if exists msinc_write on mutual_sincronias;
create policy msinc_write on mutual_sincronias for all
  using ((select tem_acesso_global())) with check ((select tem_acesso_global()));
