-- ============================================================================
-- SCar :: 0111_permissoes_modulo_acao.sql
--
-- PERMISSOES POR PERFIL NO FORMATO MODULO x ACAO (pedido do usuario,
-- 15/10/2026: "igual a da Smart Vida — Modulo, Ver, Criar, Editar, Excluir,
-- Exportar, Baixar, Estornar, Cancelar, Transferir, Fechar").
--
-- A 0110 deu ao admin 9 chaves soltas. Aqui a grade vira MODULO x ACAO:
--   (A) `perfil_permissoes (papel, modulo, acao, concedida)` — uma linha por
--       celula que existe; `permissao_celula_valida()` e a lista das celulas
--       (o que nao existe no modulo e "nao se aplica", nunca linha).
--   (B) SEED = o comportamento de hoje, com DUAS decisoes registradas:
--         . EXCLUIR passa a valer de verdade (abaixo, policies RESTRICTIVE) e
--           nasce so com quem ja era gestao: associado e veiculo apagaveis por
--           financeiro e gestor regional (antes: qualquer staff da unidade);
--         . o menu passa a obedecer o VER, e /financeiro nasce visivel so para
--           financeiro, gestor, 24h, supervisor e cobranca (antes: todo staff).
--       Os 6 valores da 0110 que viram celula sao COPIADOS (inclusive o que o
--       admin ja tiver mudado), nunca recalculados.
--   (C) `perfil_pode(modulo, acao)` — admin sempre sim; inativo nunca.
--   (D) Os helpers de capacidade passam a ler a grade:
--         pode_auditar               -> vendas.fechar
--         pode_assistencia           -> assistencia.criar OU .editar
--         pode_tratar_evento(reg)    -> eventos.editar (+ a unidade)
--         pode_cadastrar_fornecedor  -> fornecedores.criar OU .editar
--         pode_publicar_memo         -> comunicados.criar
--         pode_editar_precos         -> precificacao.editar
--       As 3 ALCADAS que nao sao modulo x acao ficam em `papel_permissoes`
--       (0110): desconto, liberar_24h e leads (carteira da unidade).
--   (E) EXCLUIR no BANCO: policy RESTRICTIVE de delete nas tabelas-mae
--       (clientes, veiculos, leads, eventos_sinistro, fornecedores,
--       lancamentos_financeiros, memos). Restrictive so ESTREITA o que as
--       policies existentes ja permitem; quem nao e staff (associado do
--       portal) nao e afetado; cascata de FK nao passa por RLS.
--       As demais acoes valem pela TELA (menu, botoes) e pelos helpers acima.
--   (F) `salvar_permissoes_perfil(papel, celulas jsonb)` — so admin, em lote,
--       com trilha em `papel_permissoes_log` ('modulo.acao', de -> para).
-- ============================================================================

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
    ('precificacao','ver'), ('precificacao','editar'), ('precificacao','exportar'),
    ('fornecedores','ver'), ('fornecedores','criar'), ('fornecedores','editar'),
      ('fornecedores','excluir'), ('fornecedores','exportar'),
    ('financeiro','ver'), ('financeiro','criar'), ('financeiro','editar'), ('financeiro','excluir'),
      ('financeiro','exportar'), ('financeiro','baixar'), ('financeiro','estornar'),
      ('financeiro','cancelar'),
    ('comunicados','ver'), ('comunicados','criar'), ('comunicados','editar'), ('comunicados','excluir')
  );
$$;

create table if not exists perfil_permissoes (
  papel        text not null,
  modulo       text not null,
  acao         text not null,
  concedida    boolean not null default false,
  alterado_por uuid references usuarios(id) on delete set null,
  alterado_em  timestamptz not null default now(),
  primary key (papel, modulo, acao),
  constraint chk_perfil_permissoes_papel check (papel in (
    'financeiro', 'gestor_regional', 'consultor_vendas', 'sinistro',
    'auditoria', 'assistencia_24h', 'supervisor', 'cobranca')),
  constraint chk_perfil_permissoes_celula check (permissao_celula_valida(modulo, acao))
);

comment on table perfil_permissoes is
  'Grade modulo x acao por papel, editavel pelo admin (Configuracoes -> Usuarios '
  '-> Permissoes por perfil). Admin nao tem linha: perfil_pode() e sempre true.';

-- ----------------------------------------------------------------------------
-- (B) Seed
-- ----------------------------------------------------------------------------
with papeis(papel) as (
  values ('financeiro'), ('gestor_regional'), ('consultor_vendas'), ('sinistro'),
         ('auditoria'), ('assistencia_24h'), ('supervisor'), ('cobranca')
),
-- quem recebe cada celula; 'todos' = os 8 papeis acima
padrao(modulo, acao, quem) as (values
  ('painel','ver','todos'), ('painel','exportar','todos'),
  ('sac','ver','todos'), ('sac','criar','todos'), ('sac','editar','todos'),
    ('sac','transferir','todos'), ('sac','fechar','todos'),
  ('protocolos','ver','todos'), ('protocolos','criar','todos'), ('protocolos','editar','todos'),
    ('protocolos','transferir','todos'), ('protocolos','fechar','todos'),
  ('assistencia','ver','todos'),
  ('assistencia','cancelar','financeiro,gestor_regional,assistencia_24h'),
  ('assistencia','transferir','financeiro,gestor_regional,assistencia_24h'),
  ('assistencia','fechar','financeiro,gestor_regional,assistencia_24h'),
  ('vendas','ver','todos'), ('vendas','criar','todos'), ('vendas','editar','todos'),
    ('vendas','excluir','financeiro'), ('vendas','exportar','todos'), ('vendas','cancelar','todos'),
    ('vendas','transferir','financeiro,gestor_regional'),
  ('associados','ver','todos'), ('associados','criar','todos'), ('associados','editar','todos'),
    ('associados','excluir','financeiro,gestor_regional'), ('associados','exportar','todos'),
  ('veiculos','ver','todos'), ('veiculos','criar','todos'), ('veiculos','editar','todos'),
    ('veiculos','excluir','financeiro,gestor_regional'), ('veiculos','exportar','todos'),
    ('veiculos','cancelar','financeiro,gestor_regional'),
  ('rastreadores','ver','todos'), ('rastreadores','criar','todos'), ('rastreadores','editar','todos'),
    ('rastreadores','transferir','todos'), ('rastreadores','baixar','financeiro'),
  ('eventos','ver','todos'), ('eventos','criar','todos'), ('eventos','exportar','todos'),
    ('eventos','transferir','todos'),
    ('eventos','cancelar','financeiro,sinistro,gestor_regional'),
    ('eventos','fechar','financeiro,sinistro,gestor_regional'),
  ('cobranca','ver','todos'), ('cobranca','exportar','todos'),
    ('cobranca','criar','financeiro'),
    ('cobranca','editar','financeiro,gestor_regional,supervisor,cobranca'),
    ('cobranca','baixar','financeiro'), ('cobranca','cancelar','financeiro'),
  ('precificacao','ver','todos'), ('precificacao','exportar','todos'),
  ('fornecedores','ver','todos'), ('fornecedores','exportar','todos'),
    ('fornecedores','excluir','financeiro'),
  ('financeiro','ver','financeiro,gestor_regional,assistencia_24h,supervisor,cobranca'),
  ('financeiro','exportar','financeiro,gestor_regional,assistencia_24h,supervisor,cobranca'),
  ('financeiro','criar','financeiro,gestor_regional,assistencia_24h'),
  ('financeiro','editar','financeiro,gestor_regional,assistencia_24h'),
  ('financeiro','baixar','financeiro,gestor_regional,assistencia_24h'),
  ('financeiro','excluir','financeiro'), ('financeiro','estornar','financeiro'),
  ('financeiro','cancelar','financeiro,gestor_regional'),
  ('comunicados','ver','todos'),
  ('comunicados','excluir','financeiro,gestor_regional')
),
-- as celulas que herdam o valor JA GRAVADO na 0110 (inclusive ajuste do admin)
herdado(modulo, acao, chave) as (values
  ('vendas','fechar','auditoria'),
  ('assistencia','criar','assistencia'), ('assistencia','editar','assistencia'),
  ('eventos','editar','evento'),
  ('fornecedores','criar','fornecedor'), ('fornecedores','editar','fornecedor'),
  ('comunicados','criar','comunicados'), ('comunicados','editar','comunicados'),
  ('precificacao','editar','precos')
),
celulas as (
  select pp.papel, c.modulo, c.acao,
         coalesce(
           (select x.concedida from herdado h
              join papel_permissoes x on x.permissao = h.chave and x.papel = pp.papel
             where h.modulo = c.modulo and h.acao = c.acao),
           exists (select 1 from padrao d
                    where d.modulo = c.modulo and d.acao = c.acao
                      and (d.quem = 'todos' or pp.papel = any (string_to_array(d.quem, ','))))
         ) as concedida
    from papeis pp
   cross join (
     select m.modulo, a.acao
       from (values ('painel'),('sac'),('protocolos'),('assistencia'),('vendas'),('associados'),
                    ('veiculos'),('rastreadores'),('eventos'),('cobranca'),('precificacao'),
                    ('fornecedores'),('financeiro'),('comunicados')) m(modulo)
      cross join (values ('ver'),('criar'),('editar'),('excluir'),('exportar'),('baixar'),
                         ('estornar'),('cancelar'),('transferir'),('fechar')) a(acao)
      where permissao_celula_valida(m.modulo, a.acao)
   ) c
)
insert into perfil_permissoes (papel, modulo, acao, concedida)
select papel, modulo, acao, concedida from celulas c
 where not exists (select 1 from perfil_permissoes x
                    where x.papel = c.papel and x.modulo = c.modulo and x.acao = c.acao);

-- As 6 chaves da 0110 que viraram celula saem de papel_permissoes: ficam so as
-- 3 alcadas (sem duas fontes para a mesma decisao).
delete from papel_permissoes
 where permissao not in ('desconto', 'liberar_24h', 'leads');
alter table papel_permissoes drop constraint if exists chk_papel_permissoes_chave;
alter table papel_permissoes add constraint chk_papel_permissoes_chave
  check (permissao in ('desconto', 'liberar_24h', 'leads'));

alter table perfil_permissoes enable row level security;
drop policy if exists perfil_permissoes_select on perfil_permissoes;
create policy perfil_permissoes_select on perfil_permissoes for select to authenticated
  using ((select is_staff()));
grant select on perfil_permissoes to authenticated;

-- ----------------------------------------------------------------------------
-- (C) A leitura
-- ----------------------------------------------------------------------------
create or replace function perfil_pode(p_modulo text, p_acao text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when auth_papel() is null then false
    when auth_papel()::text = 'admin' then true
    else coalesce((select pp.concedida from perfil_permissoes pp
                    where pp.papel = auth_papel()::text
                      and pp.modulo = p_modulo and pp.acao = p_acao), false)
  end;
$$;

comment on function perfil_pode(text, text) is
  'O papel de quem chama tem a acao no modulo? Admin sempre; inativo nunca (auth_papel, 0068).';

-- O que o usuario logado pode: celulas 'modulo.acao' + as alcadas (0110).
drop function if exists minhas_permissoes();
create function minhas_permissoes()
returns text[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(k order by k), '{}') from (
    select c.modulo || '.' || c.acao as k
      from (
        select m.modulo, a.acao
          from (values ('painel'),('sac'),('protocolos'),('assistencia'),('vendas'),('associados'),
                       ('veiculos'),('rastreadores'),('eventos'),('cobranca'),('precificacao'),
                       ('fornecedores'),('financeiro'),('comunicados')) m(modulo)
         cross join (values ('ver'),('criar'),('editar'),('excluir'),('exportar'),('baixar'),
                            ('estornar'),('cancelar'),('transferir'),('fechar')) a(acao)
         where permissao_celula_valida(m.modulo, a.acao)
      ) c
     where perfil_pode(c.modulo, c.acao)
    union all
    select k from unnest(array['desconto', 'liberar_24h', 'leads']) k where papel_pode(k)
  ) t;
$$;

-- ----------------------------------------------------------------------------
-- (D) Os helpers de capacidade (mesmas assinaturas e atributos)
-- ----------------------------------------------------------------------------
create or replace function pode_auditar()
returns boolean language sql stable security definer set search_path = public as $$
  select perfil_pode('vendas', 'fechar');
$$;

create or replace function pode_assistencia()
returns boolean language sql stable security definer set search_path = public as $$
  select perfil_pode('assistencia', 'criar') or perfil_pode('assistencia', 'editar');
$$;

create or replace function pode_tratar_evento(p_regional uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select perfil_pode('eventos', 'editar') and (tem_acesso_global() or pode_regional(p_regional));
$$;

create or replace function pode_cadastrar_fornecedor()
returns boolean language sql stable as $$
  select perfil_pode('fornecedores', 'criar') or perfil_pode('fornecedores', 'editar');
$$;

create or replace function pode_publicar_memo()
returns boolean language sql stable as $$
  select perfil_pode('comunicados', 'criar');
$$;

create or replace function pode_editar_precos()
returns boolean language sql stable security definer set search_path = public as $$
  select perfil_pode('precificacao', 'editar');
$$;

-- ----------------------------------------------------------------------------
-- (E) EXCLUIR vale no banco
-- ----------------------------------------------------------------------------
drop policy if exists perfil_excluir on clientes;
create policy perfil_excluir on clientes as restrictive for delete to authenticated
  using ((select not coalesce(is_staff(), false) or perfil_pode('associados', 'excluir')));
drop policy if exists perfil_excluir on veiculos;
create policy perfil_excluir on veiculos as restrictive for delete to authenticated
  using ((select not coalesce(is_staff(), false) or perfil_pode('veiculos', 'excluir')));
drop policy if exists perfil_excluir on leads;
create policy perfil_excluir on leads as restrictive for delete to authenticated
  using ((select not coalesce(is_staff(), false) or perfil_pode('vendas', 'excluir')));
drop policy if exists perfil_excluir on eventos_sinistro;
create policy perfil_excluir on eventos_sinistro as restrictive for delete to authenticated
  using ((select not coalesce(is_staff(), false) or perfil_pode('eventos', 'excluir')));
drop policy if exists perfil_excluir on fornecedores;
create policy perfil_excluir on fornecedores as restrictive for delete to authenticated
  using ((select not coalesce(is_staff(), false) or perfil_pode('fornecedores', 'excluir')));
drop policy if exists perfil_excluir on lancamentos_financeiros;
create policy perfil_excluir on lancamentos_financeiros as restrictive for delete to authenticated
  using ((select not coalesce(is_staff(), false) or perfil_pode('financeiro', 'excluir')));
drop policy if exists perfil_excluir on memos;
create policy perfil_excluir on memos as restrictive for delete to authenticated
  using ((select not coalesce(is_staff(), false) or perfil_pode('comunicados', 'excluir')));

-- ----------------------------------------------------------------------------
-- (F) A escrita: so admin, em lote, com trilha
-- p_celulas = [{"modulo":"veiculos","acao":"excluir","concedida":true}, ...]
-- modulo 'alcada' grava as 3 alcadas da 0110 (acao = desconto/liberar_24h/leads).
-- ----------------------------------------------------------------------------
create or replace function salvar_permissoes_perfil(p_papel text, p_celulas jsonb)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  c        jsonb;
  v_mod    text;
  v_acao   text;
  v_novo   boolean;
  v_de     boolean;
  v_muda   integer := 0;
begin
  if not coalesce(is_admin(), false) then
    raise exception 'Somente o administrador ajusta as permissoes dos perfis';
  end if;
  if p_papel = 'admin' then
    raise exception 'O administrador tem todas as permissoes e nao pode ser ajustado';
  end if;
  if jsonb_typeof(p_celulas) is distinct from 'array' then
    raise exception 'Informe a lista de permissoes';
  end if;

  for c in select * from jsonb_array_elements(p_celulas) loop
    v_mod  := c->>'modulo';
    v_acao := c->>'acao';
    v_novo := (c->>'concedida')::boolean;
    if v_novo is null then
      raise exception 'Permissao % . % sem valor', v_mod, v_acao;
    end if;

    if v_mod = 'alcada' then
      select concedida into v_de from papel_permissoes where papel = p_papel and permissao = v_acao;
      insert into papel_permissoes (papel, permissao, concedida, alterado_por, alterado_em)
        values (p_papel, v_acao, v_novo, auth.uid(), now())
      on conflict (papel, permissao) do update
        set concedida = excluded.concedida, alterado_por = excluded.alterado_por,
            alterado_em = excluded.alterado_em;
      if v_de is distinct from v_novo then
        insert into papel_permissoes_log (papel, permissao, de, para, alterado_por)
          values (p_papel, v_acao, v_de, v_novo, auth.uid());
        v_muda := v_muda + 1;
      end if;
    else
      if not permissao_celula_valida(v_mod, v_acao) then
        raise exception 'A acao % nao se aplica ao modulo %', v_acao, v_mod;
      end if;
      select concedida into v_de from perfil_permissoes
       where papel = p_papel and modulo = v_mod and acao = v_acao;
      insert into perfil_permissoes (papel, modulo, acao, concedida, alterado_por, alterado_em)
        values (p_papel, v_mod, v_acao, v_novo, auth.uid(), now())
      on conflict (papel, modulo, acao) do update
        set concedida = excluded.concedida, alterado_por = excluded.alterado_por,
            alterado_em = excluded.alterado_em;
      if v_de is distinct from v_novo then
        insert into papel_permissoes_log (papel, permissao, de, para, alterado_por)
          values (p_papel, v_mod || '.' || v_acao, v_de, v_novo, auth.uid());
        v_muda := v_muda + 1;
      end if;
    end if;
  end loop;

  return v_muda;
end;
$$;

-- A da 0110 (uma chave por vez) segue existindo para as alcadas.

-- ----------------------------------------------------------------------------
-- Rito de seguranca da 0052
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
