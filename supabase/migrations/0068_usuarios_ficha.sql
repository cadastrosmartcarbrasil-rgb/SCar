-- ============================================================================
-- SCar :: 0068_usuarios_ficha.sql
-- O USUARIO VIRA UM CADASTRO DE RESPONSABILIDADE.
--
-- A `usuarios` nasceu na 0001 com nome, e-mail, papel, unidade e `ativo` — o
-- suficiente para LOGAR, nao para RESPONDER. Quem assina uma autorizacao de
-- entrada na base, libera um acionamento da 24h bloqueado, aprova desconto
-- acima da alcada ou baixa um titulo e uma pessoa: precisa de contato, CPF,
-- cargo e data de inicio.
--
-- 🔴 E AQUI ESTA O ACHADO QUE MUDA A MIGRATION DE COSMETICA PARA DE SEGURANCA:
--    `usuarios.ativo` NAO CORTAVA NADA. `is_staff()` (0003) e `auth_papel()`
--    (0002) olhavam so `id = auth.uid()`, sem `and ativo`. Ou seja: desmarcar
--    "Usuario ativo" mudava um checkbox e mais nada — a pessoa continuava
--    logando, lendo a carteira, lancando no financeiro e autorizando OS.
--    A propria tela prometia o contrario ("desmarcar tira o acesso sem apagar
--    o historico"), o que e pior que nao ter o campo: a gestao acreditava ter
--    revogado um acesso que seguia aberto.
--
-- (A) ficha: `telefone`, `documento` (CPF validado e unico), `cargo`,
--     `data_inicio`, `data_desligamento`, `observacoes`.
-- (B) `ativo` passa a valer DE VERDADE, nos tres helpers que sustentam a RLS
--     inteira. Nada mais precisa mudar: `is_admin`, `tem_acesso_global`,
--     `pode_regional`, `pode_auditar`, `pode_liberar_assistencia` e companhia
--     derivam desses tres.
-- (C) `usuarios_listar()` — a equipe com o que a gestao precisa ver de fora.
--
-- CARGO x PAPEL sao coisas diferentes e ficam em campos diferentes de
-- proposito: `papel` e PERMISSAO (o que o sistema deixa fazer), `cargo` e a
-- funcao na empresa ("Supervisora de Atendimento"). Misturar os dois e como o
-- RH pedir para criar um papel novo so para mudar um titulo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) A ficha
-- ----------------------------------------------------------------------------
alter table usuarios
  add column if not exists telefone          text,
  add column if not exists documento         text,
  add column if not exists cargo             text,
  add column if not exists data_inicio       date,
  add column if not exists data_desligamento date,
  add column if not exists observacoes       text;

comment on column usuarios.cargo is
  'Funcao na empresa (texto livre). NAO confundir com `papel`, que e permissao.';
comment on column usuarios.data_desligamento is
  'Carimbada sozinha ao desativar e limpa ao reativar; editavel.';

-- CPF valido quando informado (mesma funcao do cadastro de associado).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_usuario_documento_valido') then
    alter table usuarios add constraint chk_usuario_documento_valido
      check (documento is null or validar_documento(documento, 'PF'));
  end if;
end $$;

-- Duas pessoas nao dividem um CPF. PARCIAL porque o campo e opcional — com
-- unique cheio, o segundo cadastro sem documento colidiria com o primeiro.
create unique index if not exists uq_usuario_documento
  on usuarios (documento) where documento is not null;

-- A saida nao pode ser anterior a entrada.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_usuario_periodo') then
    alter table usuarios add constraint chk_usuario_periodo
      check (data_inicio is null or data_desligamento is null
             or data_desligamento >= data_inicio);
  end if;
end $$;

create index if not exists idx_usuarios_ativo on usuarios (ativo);

/**
 * Carimba a data de desligamento ao desativar e limpa ao reativar — do mesmo
 * jeito que a 0067 fez com a unidade. Nao sobrescreve data ja informada.
 */
create or replace function fn_usuarios_periodo()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.ativo is distinct from old.ativo then
    if new.ativo then
      -- Reativou: a saida deixou de existir (afastamento que voltou, engano).
      if new.data_desligamento is not distinct from old.data_desligamento then
        new.data_desligamento := null;
      end if;
    elsif new.data_desligamento is null then
      new.data_desligamento := current_date;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_usuarios_periodo on usuarios;
create trigger trg_usuarios_periodo
  before update on usuarios
  for each row execute function fn_usuarios_periodo();

-- ----------------------------------------------------------------------------
-- (B) `ativo` passa a CORTAR O ACESSO
--
-- Os tres helpers abaixo sao a raiz da RLS. Ao exigir `ativo` neles, todo o
-- resto cai junto: `is_admin()` chama `auth_papel()`, `tem_acesso_global()`
-- tambem, `pode_regional()` usa os dois. Nao ha nada a caçar tela por tela.
--
-- `usuarios_select_self` (0003) NAO muda de proposito: a pessoa desativada
-- precisa continuar lendo a PROPRIA linha, senao a tela nao tem como dizer
-- "seu acesso esta suspenso" — mostraria um painel vazio e sem explicacao.
--
-- A trava do ULTIMO ADMIN (`fn_usuarios_protege_ultimo_admin`, 0054) deixa de
-- ser conveniencia e vira carga: e ela que impede a empresa de se trancar
-- para fora desativando o unico administrador.
-- ----------------------------------------------------------------------------
create or replace function is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.usuarios where id = auth.uid() and ativo); $$;

create or replace function auth_papel()
returns papel_usuario
language sql stable security definer set search_path = public
as $$ select papel from public.usuarios where id = auth.uid() and ativo; $$;

create or replace function auth_regional_id()
returns uuid
language sql stable security definer set search_path = public
as $$ select regional_id from public.usuarios where id = auth.uid() and ativo; $$;

/**
 * O portal do vendedor cai junto com o acesso da pessoa.
 *
 * `vendedor_atual()` (0038) olhava so `vendedores.ativo`, entao um usuario
 * desativado que tambem fosse vendedor perdia o /dashboard e continuava
 * entrando no /vendedor — com a carteira, os leads e o hotlink.
 *
 * Formulacao defensiva de proposito: em vez de exigir uma linha ATIVA em
 * `usuarios`, ela recusa quando existe uma linha INATIVA. Vendedor sem linha
 * em `usuarios` (cadastro sem portal, 0035) segue exatamente como antes.
 */
create or replace function vendedor_atual()
returns uuid
language sql stable security definer set search_path = public
as $$
  select v.id
    from vendedores v
   where v.usuario_id = auth.uid()
     and v.ativo
     and not exists (
       select 1 from usuarios u where u.id = v.usuario_id and not u.ativo
     )
   limit 1;
$$;

/** O acesso desta pessoa esta ativo? Usada pelas telas para explicar o corte. */
create or replace function usuario_acesso_ativo()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select u.ativo from public.usuarios u where u.id = auth.uid()), false);
$$;

-- ----------------------------------------------------------------------------
-- (C) A equipe como a gestao precisa ver
-- ----------------------------------------------------------------------------
create or replace function usuarios_listar(p_incluir_inativos boolean default true)
returns table (
  id uuid, nome text, email text, telefone text, documento text, cargo text,
  papel papel_usuario, regional_id uuid, regional_nome text,
  ativo boolean, data_inicio date, data_desligamento date, observacoes text,
  criado_em timestamptz,
  vendedor_id uuid, vendedor_codigo text, vendedor_ativo boolean,
  responsavel_por bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then
    raise exception 'Sem permissao' using errcode = 'insufficient_privilege';
  end if;

  return query
  select u.id, u.nome, u.email, u.telefone, u.documento, u.cargo,
         u.papel, u.regional_id, r.nome,
         u.ativo, u.data_inicio, u.data_desligamento, u.observacoes,
         u.created_at,
         v.id, v.codigo, v.ativo,
         (select count(*) from regionais x where x.responsavel_id = u.id)
    from usuarios u
    left join regionais  r on r.id = u.regional_id
    -- `usuario_id` de vendedores e UNIQUE (0001), entao o join nunca duplica.
    left join vendedores v on v.usuario_id = u.id
   where (tem_acesso_global() or pode_regional(u.regional_id) or u.id = auth.uid())
     and (coalesce(p_incluir_inativos, true) or u.ativo)
   order by u.ativo desc, u.nome;
end;
$$;

-- Rito de seguranca (0052).
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
