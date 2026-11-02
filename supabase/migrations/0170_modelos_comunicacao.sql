-- ============================================================================
-- 0170 — MODELOS DE COMUNICACAO: o texto dos e-mails editavel pela tela
-- ============================================================================
-- Pedido do usuario (02/11/2026): "nao ha local para criar ou editar templates". Etapa 1:
-- editar assunto e textos dos e-mails que ja existem (lembrete, vence hoje, atraso,
-- boas-vindas, aniversario, recuperar senha), mantendo o visual.
--
-- (A) comunicacao_modelos (canal, codigo) -> textos jsonb com SO o que difere do texto
--     original (o original mora no codigo, src/lib/comunicacao/modelos.ts). '{}' = original.
--     `canal` ja nasce com WHATSAPP para a etapa 3; `codigo` nao e travado aqui porque a
--     etapa 2 cria comunicados novos (a tela/rota valida o catalogo).
-- (B) comunicacao_modelo_versoes: cada gravacao vira uma versao IMUTAVEL (historico e
--     "voltar a esta versao"). Sem update/delete para ninguem.
-- (C) celula da grade `comunicacao_modelos` (ver | editar); seed so no financeiro; admin
--     sempre; o resto por perfil ou extra (0116). pode_modelos_comunicacao(acao).
-- (D) salvar_modelo_comunicacao(canal, codigo, textos, motivo): unica escrita.
-- A rotina de envio le pelo service_role. Re-executavel.
-- ============================================================================

-- (C) a grade -----------------------------------------------------------------
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
    ('comunicacao_modelos','ver'), ('comunicacao_modelos','editar'),
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
                       ('veiculos'),('rastreadores'),('eventos'),('cobranca'),('cobranca_emails'),('comunicacao_modelos'),('revistoria'),
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
select k.papel, 'comunicacao_modelos', a.acao, (k.papel = 'financeiro')
  from (select distinct papel from perfil_permissoes) k
 cross join (values ('ver'), ('editar')) a(acao)
 where not exists (select 1 from perfil_permissoes x
                    where x.papel = k.papel and x.modulo = 'comunicacao_modelos' and x.acao = a.acao);

create or replace function pode_modelos_comunicacao(p_acao text default 'ver')
returns boolean
language sql stable security definer set search_path = public
as $$
  select perfil_pode('comunicacao_modelos', coalesce(p_acao, 'ver'))
      or (coalesce(p_acao, 'ver') = 'ver' and perfil_pode('comunicacao_modelos', 'editar'));
$$;
comment on function pode_modelos_comunicacao(text) is
  'Modelos de comunicacao (0170): celula comunicacao_modelos.<acao> (perfil ou extra; admin sempre). Editar inclui ver.';

-- (A) os modelos ---------------------------------------------------------------
create table if not exists comunicacao_modelos (
  canal          text not null default 'EMAIL',
  codigo         text not null,
  textos         jsonb not null default '{}'::jsonb,
  versao         integer not null default 0,
  atualizado_por uuid references usuarios(id) on delete set null,
  atualizado_em  timestamptz not null default now(),
  primary key (canal, codigo),
  constraint chk_com_modelo_canal check (canal in ('EMAIL', 'WHATSAPP')),
  constraint chk_com_modelo_codigo check (codigo ~ '^[a-z0-9_]{2,60}$'),
  constraint chk_com_modelo_textos check (jsonb_typeof(textos) = 'object')
);

-- (B) as versoes ---------------------------------------------------------------
create table if not exists comunicacao_modelo_versoes (
  id         bigint generated always as identity primary key,
  canal      text not null,
  codigo     text not null,
  versao     integer not null,
  textos     jsonb not null,
  motivo     text,
  criado_por uuid references usuarios(id) on delete set null,
  criado_em  timestamptz not null default clock_timestamp(),
  unique (canal, codigo, versao)
);
create index if not exists idx_com_modelo_versoes on comunicacao_modelo_versoes (canal, codigo, versao desc);

alter table comunicacao_modelos enable row level security;
alter table comunicacao_modelo_versoes enable row level security;
drop policy if exists com_modelos_select on comunicacao_modelos;
create policy com_modelos_select on comunicacao_modelos for select to authenticated
  using ((select pode_modelos_comunicacao('ver')));
drop policy if exists com_modelo_versoes_select on comunicacao_modelo_versoes;
create policy com_modelo_versoes_select on comunicacao_modelo_versoes for select to authenticated
  using ((select pode_modelos_comunicacao('ver')));
revoke all on comunicacao_modelos, comunicacao_modelo_versoes from anon;

-- (D) a gravacao ---------------------------------------------------------------
create or replace function salvar_modelo_comunicacao(
  p_canal text, p_codigo text, p_textos jsonb, p_motivo text default null)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_versao integer;
  v_chave text;
  v_valor jsonb;
begin
  if not pode_modelos_comunicacao('editar') then
    raise exception 'Sem permissao para editar modelos de comunicacao' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_canal, '') not in ('EMAIL', 'WHATSAPP') then raise exception 'Canal invalido'; end if;
  if coalesce(p_codigo, '') !~ '^[a-z0-9_]{2,60}$' then raise exception 'Modelo invalido'; end if;
  if p_textos is null or jsonb_typeof(p_textos) <> 'object' then raise exception 'Textos invalidos'; end if;
  for v_chave, v_valor in select * from jsonb_each(p_textos) loop
    if v_chave !~ '^[a-z_]{2,40}$' then raise exception 'Campo de texto invalido: %', v_chave; end if;
    if jsonb_typeof(v_valor) <> 'string' then raise exception 'O texto de % precisa ser texto', v_chave; end if;
    if length(v_valor #>> '{}') > 3000 then raise exception 'O texto de % passa de 3000 caracteres', v_chave; end if;
  end loop;

  insert into comunicacao_modelos (canal, codigo, textos, versao, atualizado_por, atualizado_em)
  values (p_canal, p_codigo, p_textos, 1, usuario_atual_id(), now())
  on conflict (canal, codigo) do update
     set textos = excluded.textos,
         versao = comunicacao_modelos.versao + 1,
         atualizado_por = excluded.atualizado_por,
         atualizado_em = now()
  returning versao into v_versao;

  insert into comunicacao_modelo_versoes (canal, codigo, versao, textos, motivo, criado_por)
  values (p_canal, p_codigo, v_versao, p_textos, nullif(btrim(coalesce(p_motivo, '')), ''), usuario_atual_id());
  return v_versao;
end;
$$;

-- rito da 0052
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
