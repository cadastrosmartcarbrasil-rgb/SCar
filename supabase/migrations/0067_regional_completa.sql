-- ============================================================================
-- SCar :: 0067_regional_completa.sql
-- CONTROLE TOTAL DA REGIONAL (a unidade/franquia).
--
-- Por que existe: a `regionais` nasceu na 0001 com nome, CNPJ e um jsonb de
-- endereco de tres campos, e foi ganhando politica de desconto (0028),
-- comissao (0034), prazo de pagamento (0035), codigo de hotlink (0036) e
-- regras de lead (0041) — mas nunca ganhou o BASICO de um cadastro: contato e
-- SITUACAO. Sem "ativa/inativa" a unica forma de tirar uma unidade de circulacao
-- era APAGAR a linha, e apagar aqui e o pior desfecho possivel (ver (C)).
--
-- (A) contato e situacao: `telefone`, `email`, `ativo`, `inativada_em`.
-- (B) unidade INATIVA sai de circulacao: nao recebe vendedor novo, nao resolve
--     hotlink e nao entra no rodizio. O que ela JA produziu continua nos
--     relatorios — inativar e parar de OFERECER, nunca reescrever historico.
-- (C) EXCLUIR unidade com movimento passa a ser RECUSADO pelo banco. Todas as
--     ~20 FKs que apontam para `regionais` sao `on delete set null`, e neste
--     sistema `regional_id is null` significa MATRIZ: apagar "Cuiaba" moveria,
--     em silencio, os clientes, veiculos, leads e lancamentos dela para o
--     escopo da matriz. O erro nomeia o que esta pendurado e manda inativar.
-- (D) `regionais_listar()` — a unidade com os numeros que dizem se ela esta
--     viva e se da para excluir. E a tela de "controle total".
--
-- Fora daqui, de proposito: o hotlink DA UNIDADE. A decisao do usuario e que o
-- responsavel pela regional e um VENDEDOR com hotlink proprio, entao a unidade
-- nao precisa de link de venda. A coluna `codigo` (0036) e o `resolver_hotlink`
-- ficam INTACTOS — ha leads em producao com `origem_hotlink` apontando para
-- codigos de unidade, e derrubar isso quebraria links ja distribuidos. O que
-- muda e que o link some da tela e a unidade inativa deixa de resolver.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) Contato e situacao
-- ----------------------------------------------------------------------------
alter table regionais
  add column if not exists telefone     text,
  add column if not exists email        text,
  add column if not exists ativo        boolean not null default true,
  add column if not exists inativada_em timestamptz;

comment on column regionais.ativo is
  'Unidade em operacao. Inativa sai das listas de escolha, do hotlink e do '
  'rodizio, mas continua no historico dos relatorios e do DRE.';

create index if not exists idx_regionais_ativo on regionais (ativo);

-- Carimba/limpa a data de inativacao sozinha, para o relatorio nao depender de
-- alguem lembrar de preencher.
create or replace function fn_regional_situacao()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.ativo is distinct from old.ativo then
    new.inativada_em := case when new.ativo then null else now() end;
  elsif tg_op = 'INSERT' and not new.ativo then
    new.inativada_em := coalesce(new.inativada_em, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_regional_situacao on regionais;
create trigger trg_regional_situacao
  before insert or update on regionais
  for each row execute function fn_regional_situacao();

/** A unidade esta em operacao? Nulo (matriz) conta como ativa. */
create or replace function regional_ativa(p_regional uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
           when p_regional is null then true
           else coalesce((select r.ativo from regionais r where r.id = p_regional), false)
         end;
$$;

-- ----------------------------------------------------------------------------
-- (B) Unidade inativa sai de circulacao
-- ----------------------------------------------------------------------------

-- Vendedor novo (ou reativado) exige unidade em operacao. Vendedor que JA
-- existe numa unidade inativada nao e derrubado: o cadastro fica, so nao volta
-- a ficar ativo enquanto a unidade nao voltar.
create or replace function fn_vendedor_regional_ativa()
returns trigger language plpgsql as $$
declare
  v_mudou boolean;
begin
  if not new.ativo or new.regional_id is null or regional_ativa(new.regional_id) then
    return new;
  end if;
  -- Chegou aqui: vendedor ATIVO numa unidade INATIVA. So barra quando o
  -- movimento e novo — trocar a unidade, entrar nela ou reativar o cadastro.
  -- Um vendedor que ja estava ali quando a unidade foi inativada continua
  -- editavel (corrigir telefone nao pode depender de reativar a franquia).
  if tg_op = 'INSERT' then
    v_mudou := true;
  else
    v_mudou := new.regional_id is distinct from old.regional_id
            or (new.ativo and not old.ativo);
  end if;

  if v_mudou then
    raise exception 'A unidade "%" esta INATIVA — reative a unidade antes de cadastrar ou reativar vendedores nela.',
      (select nome from regionais where id = new.regional_id)
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vendedor_regional_ativa on vendedores;
create trigger trg_vendedor_regional_ativa
  before insert or update on vendedores
  for each row execute function fn_vendedor_regional_ativa();

-- O hotlink de uma unidade fora de operacao nao pode continuar captando lead —
-- nem o do vendedor dela. Recriada por causa disso (o corpo muda, a assinatura
-- nao, entao `create or replace` basta).
create or replace function resolver_hotlink(p_codigo text)
returns table (tipo text, vendedor_id uuid, regional_id uuid, nome text, consultor_id uuid)
language sql stable security definer set search_path = public as $$
  select 'VENDEDOR', v.id, v.regional_id, v.nome, v.usuario_id
    from vendedores v
   where v.codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'))
     and v.ativo
     and regional_ativa(v.regional_id)
  union all
  select 'REGIONAL', null::uuid, r.id, r.nome, r.responsavel_id
    from regionais r
   where r.codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'))
     and r.ativo
     and not exists (
       select 1 from vendedores v
        where v.codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'))
          and v.ativo and regional_ativa(v.regional_id)
     );
$$;

-- ----------------------------------------------------------------------------
-- (C) Excluir unidade com movimento e RECUSADO
--
-- Sem esta trava, o `delete` dispara ~20 FKs `on delete set null` e joga a
-- carteira da unidade no escopo da MATRIZ, sem aviso e sem volta.
-- ----------------------------------------------------------------------------
create or replace function fn_regional_bloqueia_exclusao()
returns trigger language plpgsql as $$
declare
  v_pend text[] := '{}';
  n bigint;
begin
  select count(*) into n from usuarios    where regional_id = old.id;
  if n > 0 then v_pend := v_pend || format('%s usuario(s)', n); end if;
  select count(*) into n from vendedores  where regional_id = old.id;
  if n > 0 then v_pend := v_pend || format('%s vendedor(es)', n); end if;
  select count(*) into n from clientes    where regional_id = old.id;
  if n > 0 then v_pend := v_pend || format('%s associado(s)', n); end if;
  select count(*) into n from veiculos    where regional_id = old.id;
  if n > 0 then v_pend := v_pend || format('%s veiculo(s)', n); end if;
  select count(*) into n from leads       where regional_id = old.id;
  if n > 0 then v_pend := v_pend || format('%s lead(s)', n); end if;
  select count(*) into n from lancamentos_financeiros where regional_id = old.id;
  if n > 0 then v_pend := v_pend || format('%s lancamento(s) financeiro(s)', n); end if;

  if array_length(v_pend, 1) is not null then
    raise exception 'A unidade "%" nao pode ser excluida: ainda tem %. Apagar a unidade jogaria esses registros no escopo da MATRIZ. Migre-os para outra unidade ou INATIVE esta.',
      old.nome, array_to_string(v_pend, ', ')
      using errcode = 'foreign_key_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_regional_bloqueia_exclusao on regionais;
create trigger trg_regional_bloqueia_exclusao
  before delete on regionais
  for each row execute function fn_regional_bloqueia_exclusao();

-- ----------------------------------------------------------------------------
-- (D) A unidade com os numeros — a tela de controle total
--
-- `pode_excluir` responde a pergunta que a tela precisa fazer ANTES de oferecer
-- a lixeira, com a mesma conta que o trigger acima usa para recusar.
-- ----------------------------------------------------------------------------
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
   where (tem_acesso_global() or r.id = auth_regional_id())
     and (coalesce(p_incluir_inativas, true) or r.ativo)
   order by r.ativo desc, r.nome;
end;
$$;

-- Rito de seguranca (0052).
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
