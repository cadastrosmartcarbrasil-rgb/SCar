-- ============================================================================
-- SCar :: 0110_permissoes_por_papel.sql
--
-- AS PERMISSOES DE CADA PAPEL PASSAM A SER AJUSTAVEIS PELO ADMINISTRADOR.
--
-- Ate aqui a grade "Permissoes por papel" (Configuracoes -> Usuarios) era so
-- DESCRICAO: quem decidia era a lista de papeis escrita dentro de cada helper
-- (`pode_auditar`, `pode_assistencia`, `pode_tratar_evento`...). Para tirar ou
-- dar uma permissao era preciso migration. Pedido do usuario (15/10/2026):
-- "libere para que o administrador possa ajustar os perfis".
--
-- (A) `papel_permissoes` — UMA linha por (papel, permissao), com `concedida`.
--     O seed reproduz EXATAMENTE o que os helpers faziam: aplicar esta
--     migration nao muda o acesso de ninguem.
-- (B) `papel_pode(chave)` — a leitura. O ADMIN sempre pode tudo e NAO tem
--     linha na tabela: nao existe clique que tranque a empresa para fora.
-- (C) Os helpers de CAPACIDADE passam a ler a tabela (mesmas assinaturas):
--       auditoria   -> pode_auditar()
--       assistencia -> pode_assistencia()
--       liberar_24h -> pode_liberar_assistencia()
--       desconto    -> pode_aprovar_desconto()
--       leads       -> pode_ver_carteira_regional()  (sem ela: so os proprios)
--       fornecedor  -> pode_cadastrar_fornecedor()
--       comunicados -> pode_publicar_memo()
--       evento      -> pode_tratar_evento(regional)  (continua na unidade dele)
--       precos      -> pode_editar_precos()  (NOVO; as 3 policies de escrita
--                      da tabela de precos deixam de ser tem_acesso_global())
-- (D) O que NAO vira chave, de proposito: o alcance da UNIDADE
--     (`pode_regional`, `tem_acesso_global`, `escopo_regional`) e o
--     `is_admin()`. Sao a estrutura do multi-tenant — sustentam ~190 policies,
--     e mexer neles por clique e decisao de desenho, nao de cadastro.
-- (E) `salvar_permissao_papel` — so admin; cada troca vai para
--     `papel_permissoes_log` (quem, quando, de -> para).
-- ============================================================================

create table if not exists papel_permissoes (
  papel        text not null,
  permissao    text not null,
  concedida    boolean not null default false,
  alterado_por uuid references usuarios(id) on delete set null,
  alterado_em  timestamptz not null default now(),
  primary key (papel, permissao),
  constraint chk_papel_permissoes_papel check (papel in (
    'financeiro', 'gestor_regional', 'consultor_vendas', 'sinistro',
    'auditoria', 'assistencia_24h', 'supervisor', 'cobranca')),
  constraint chk_papel_permissoes_chave check (permissao in (
    'desconto', 'auditoria', 'precos', 'evento', 'assistencia',
    'liberar_24h', 'fornecedor', 'comunicados', 'leads'))
);

comment on table papel_permissoes is
  'O que cada papel pode fazer, editavel pelo admin. O admin nao tem linha: '
  'papel_pode() devolve sempre true para ele. Sem linha = sem permissao.';

create table if not exists papel_permissoes_log (
  id           bigserial primary key,
  papel        text not null,
  permissao    text not null,
  de           boolean,
  para         boolean not null,
  alterado_por uuid references usuarios(id) on delete set null,
  alterado_em  timestamptz not null default clock_timestamp()
);

-- Seed: o comportamento de hoje, papel a papel (lido dos helpers vigentes).
insert into papel_permissoes (papel, permissao, concedida)
select p.papel, k.permissao, (p.papel, k.permissao) in (
         ('gestor_regional', 'desconto'),
         ('auditoria',       'auditoria'),
         ('financeiro',      'precos'),
         ('financeiro', 'evento'), ('sinistro', 'evento'), ('gestor_regional', 'evento'),
         ('financeiro', 'assistencia'), ('gestor_regional', 'assistencia'),
           ('assistencia_24h', 'assistencia'),
         ('financeiro', 'liberar_24h'), ('gestor_regional', 'liberar_24h'),
         ('financeiro', 'fornecedor'), ('gestor_regional', 'fornecedor'),
           ('assistencia_24h', 'fornecedor'),
         ('financeiro', 'comunicados'), ('gestor_regional', 'comunicados'),
         ('financeiro', 'leads'), ('gestor_regional', 'leads'), ('auditoria', 'leads'))
  from (values ('financeiro'), ('gestor_regional'), ('consultor_vendas'), ('sinistro'),
               ('auditoria'), ('assistencia_24h'), ('supervisor'), ('cobranca')) p(papel)
 cross join (values ('desconto'), ('auditoria'), ('precos'), ('evento'), ('assistencia'),
               ('liberar_24h'), ('fornecedor'), ('comunicados'), ('leads')) k(permissao)
 where not exists (select 1 from papel_permissoes x
                    where x.papel = p.papel and x.permissao = k.permissao);

alter table papel_permissoes     enable row level security;
alter table papel_permissoes_log enable row level security;

drop policy if exists papel_permissoes_select on papel_permissoes;
create policy papel_permissoes_select on papel_permissoes for select to authenticated
  using ((select is_staff()));
drop policy if exists papel_permissoes_log_select on papel_permissoes_log;
create policy papel_permissoes_log_select on papel_permissoes_log for select to authenticated
  using ((select is_admin()));
-- Escrita: so pela RPC (security definer, exige admin). Nenhuma policy de escrita.

grant select on papel_permissoes, papel_permissoes_log to authenticated;

-- ----------------------------------------------------------------------------
-- (B) A leitura
-- ----------------------------------------------------------------------------
create or replace function papel_pode(p_permissao text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when auth_papel() is null then false
    when auth_papel()::text = 'admin' then true
    else coalesce((select pp.concedida from papel_permissoes pp
                    where pp.papel = auth_papel()::text and pp.permissao = p_permissao), false)
  end;
$$;

comment on function papel_pode(text) is
  'O papel de quem chama tem a permissao? Admin sempre sim; usuario inativo '
  'nunca (auth_papel exige ativo, 0068). Editavel em Configuracoes -> Usuarios.';

-- O que o usuario logado pode — para a TELA nao oferecer o que o banco recusa.
create or replace function minhas_permissoes()
returns text[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(k order by k), '{}')
    from unnest(array['desconto', 'auditoria', 'precos', 'evento', 'assistencia',
                      'liberar_24h', 'fornecedor', 'comunicados', 'leads']) k
   where papel_pode(k);
$$;

-- ----------------------------------------------------------------------------
-- (C) Os helpers de capacidade (mesmas assinaturas e atributos)
-- ----------------------------------------------------------------------------
create or replace function pode_auditar()
returns boolean language sql stable security definer set search_path = public as $$
  select papel_pode('auditoria');
$$;

create or replace function pode_assistencia()
returns boolean language sql stable security definer set search_path = public as $$
  select papel_pode('assistencia');
$$;

create or replace function pode_liberar_assistencia()
returns boolean language sql stable security definer set search_path = public as $$
  select papel_pode('liberar_24h');
$$;

create or replace function pode_aprovar_desconto()
returns boolean language sql stable security definer set search_path = public as $$
  select papel_pode('desconto');
$$;

create or replace function pode_ver_carteira_regional()
returns boolean language sql stable security definer set search_path = public as $$
  select papel_pode('leads');
$$;

create or replace function pode_cadastrar_fornecedor()
returns boolean language sql stable as $$
  select papel_pode('fornecedor');
$$;

create or replace function pode_publicar_memo()
returns boolean language sql stable as $$
  select papel_pode('comunicados');
$$;

-- Continua na unidade de quem trata: a permissao diz O QUE, a unidade diz ONDE.
create or replace function pode_tratar_evento(p_regional uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select papel_pode('evento') and (tem_acesso_global() or pode_regional(p_regional));
$$;

create or replace function pode_editar_precos()
returns boolean language sql stable security definer set search_path = public as $$
  select papel_pode('precos');
$$;

drop policy if exists precos_write on tabela_precos_faixa;
create policy precos_write on tabela_precos_faixa for all to authenticated
  using ((select pode_editar_precos())) with check ((select pode_editar_precos()));
drop policy if exists part_write on participacao_faixa;
create policy part_write on participacao_faixa for all to authenticated
  using ((select pode_editar_precos())) with check ((select pode_editar_precos()));
drop policy if exists adesao_write on adesao_faixa;
create policy adesao_write on adesao_faixa for all to authenticated
  using ((select pode_editar_precos())) with check ((select pode_editar_precos()));

-- ----------------------------------------------------------------------------
-- (E) A escrita: so admin, com trilha
-- ----------------------------------------------------------------------------
create or replace function salvar_permissao_papel(
  p_papel     text,
  p_permissao text,
  p_concedida boolean
)
returns papel_permissoes
language plpgsql security definer set search_path = public
as $$
declare
  r     papel_permissoes;
  v_de  boolean;
begin
  if not coalesce(is_admin(), false) then
    raise exception 'Somente o administrador ajusta as permissoes dos papeis';
  end if;
  if p_papel = 'admin' then
    raise exception 'O administrador tem todas as permissoes e nao pode ser ajustado';
  end if;
  if p_concedida is null then
    raise exception 'Informe se a permissao e concedida ou retirada';
  end if;

  select concedida into v_de from papel_permissoes
   where papel = p_papel and permissao = p_permissao;

  insert into papel_permissoes (papel, permissao, concedida, alterado_por, alterado_em)
    values (p_papel, p_permissao, p_concedida, auth.uid(), now())
  on conflict (papel, permissao) do update
    set concedida = excluded.concedida, alterado_por = excluded.alterado_por,
        alterado_em = excluded.alterado_em
  returning * into r;

  if v_de is distinct from p_concedida then
    insert into papel_permissoes_log (papel, permissao, de, para, alterado_por)
      values (p_papel, p_permissao, v_de, p_concedida, auth.uid());
  end if;

  return r;
end;
$$;

-- ----------------------------------------------------------------------------
-- Rito de seguranca da 0052
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
