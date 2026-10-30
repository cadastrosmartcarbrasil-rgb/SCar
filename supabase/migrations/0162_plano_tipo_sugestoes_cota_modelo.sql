-- ============================================================================
-- SCar :: 0162_plano_tipo_sugestoes_cota_modelo.sql
--
-- Pedido do usuario (30/10/2026), na tela de nova cotacao:
--  (A) PLANO POR TIPO DE VEICULO — "nao tem sentido oferecer plano de motos para
--      carros, caminhoes etc. e vice-versa". `plano_tipos_veiculo` (sem linha =
--      TODOS os tipos, mesma regra de `produto_tipos_veiculo`, 0089) +
--      `plano_atende_tipo`. A cotacao que grava plano de outro tipo e RECUSADA
--      por trigger (so quando o plano ou o tipo MUDA: cotacao antiga nao trava).
--  (B) BENEFICIOS PRE-MARCADOS — "nos planos essenciais, deixar marcados por
--      padrao alguns beneficios; o consultor ou o cliente exclui ou troca (vidros
--      completo -> so parabrisa) para chegar ao valor". `plano_sugestoes`: os
--      opcionais que JA VEM MARCADOS como avulso quando o plano e escolhido. Nao
--      sao itens do plano (`plano_produtos`): o preco segue o mesmo motor
--      (`cotar_plano` com os avulsos), entao tirar um baixa o valor.
--  (C) COTA PELO MODELO — "ao informar a placa, a cota de participacao precisa
--      vir com o % do cadastro de Marcas/Modelos". `modelo_do_catalogo(marca,
--      modelo)` acha o modelo do catalogo (nomes do SGA, nao os da FIPE) por
--      semelhanca de texto dentro da marca e devolve a cota dele.
--  (D) CORRECAO: os opcionais da cotacao aceita NUNCA chegavam ao veiculo
--      (`veiculo_produtos`) — a venda com avulso entrava na base sem ele (sem
--      cobertura na ficha e sem cobranca). `autorizar_entrada_lead` passa a
--      copiar `cotacoes.opcionais_ids` (troca de literal sobre a versao em vigor).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) plano x tipo de veiculo
-- ----------------------------------------------------------------------------
create table if not exists plano_tipos_veiculo (
  plano_id        uuid not null references planos_protecao(id) on delete cascade,
  tipo_veiculo_id uuid not null references tipos_veiculo(id) on delete cascade,
  primary key (plano_id, tipo_veiculo_id)
);
create index if not exists idx_plano_tipos_tipo on plano_tipos_veiculo (tipo_veiculo_id);

alter table plano_tipos_veiculo enable row level security;
drop policy if exists ptv2_select on plano_tipos_veiculo;
create policy ptv2_select on plano_tipos_veiculo for select to authenticated using (is_staff());
drop policy if exists ptv2_write on plano_tipos_veiculo;
create policy ptv2_write on plano_tipos_veiculo for all to authenticated
  using ((select pode_configurar('cfg_planos', 'criar') or pode_configurar('cfg_planos', 'editar')))
  with check ((select pode_configurar('cfg_planos', 'criar') or pode_configurar('cfg_planos', 'editar')));

create or replace function plano_atende_tipo(p_plano_id uuid, p_tipo_veiculo_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select p_plano_id is null
      or p_tipo_veiculo_id is null
      or not exists (select 1 from plano_tipos_veiculo t where t.plano_id = p_plano_id)
      or exists (select 1 from plano_tipos_veiculo t
                  where t.plano_id = p_plano_id and t.tipo_veiculo_id = p_tipo_veiculo_id);
$$;

comment on function plano_atende_tipo(uuid, uuid) is
  'O plano e oferecido a este tipo de veiculo? Sem tipo marcado = todos; plano ou tipo nulo = sim.';

create or replace function fn_cotacao_plano_do_tipo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.plano_id is not distinct from old.plano_id
     and new.tipo_veiculo_id is not distinct from old.tipo_veiculo_id then
    return new;
  end if;
  if not plano_atende_tipo(new.plano_id, new.tipo_veiculo_id) then
    raise exception 'O plano "%" nao e oferecido para o tipo de veiculo "%"',
      (select nome from planos_protecao where id = new.plano_id),
      (select nome from tipos_veiculo where id = new.tipo_veiculo_id)
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cotacao_plano_do_tipo on cotacoes;
create trigger trg_cotacao_plano_do_tipo
  before insert or update of plano_id, tipo_veiculo_id on cotacoes
  for each row execute function fn_cotacao_plano_do_tipo();

-- ----------------------------------------------------------------------------
-- (B) beneficios pre-marcados do plano
-- ----------------------------------------------------------------------------
create table if not exists plano_sugestoes (
  plano_id   uuid not null references planos_protecao(id) on delete cascade,
  produto_id uuid not null references produtos(id) on delete cascade,
  primary key (plano_id, produto_id)
);
create index if not exists idx_plano_sugestoes_produto on plano_sugestoes (produto_id);

alter table plano_sugestoes enable row level security;
drop policy if exists psug_select on plano_sugestoes;
create policy psug_select on plano_sugestoes for select to authenticated using (is_staff());
drop policy if exists psug_write on plano_sugestoes;
create policy psug_write on plano_sugestoes for all to authenticated
  using ((select pode_configurar('cfg_planos', 'criar') or pode_configurar('cfg_planos', 'editar')))
  with check ((select pode_configurar('cfg_planos', 'criar') or pode_configurar('cfg_planos', 'editar')));

comment on table plano_sugestoes is
  'Opcionais que ja vem MARCADOS (como avulso) quando o plano e escolhido na cotacao. Removiveis: nao sao itens do plano.';

-- ----------------------------------------------------------------------------
-- (C) o modelo do catalogo (e a cota dele) a partir da marca/modelo da FIPE
-- ----------------------------------------------------------------------------
create or replace function nome_veiculo_normalizado(p text)
returns text
language sql immutable
set search_path = public
as $$
  select btrim(regexp_replace(upper(texto_sem_acento(coalesce(p, ''))), '[^A-Z0-9]+', ' ', 'g'));
$$;

create or replace function modelo_do_catalogo(p_marca text, p_modelo text)
returns table (
  modelo_id uuid, marca text, modelo text, cota_id uuid, cota_codigo text,
  cota_percentual numeric, similaridade numeric
)
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_marca text := nome_veiculo_normalizado(p_marca);
  v_mod   text := nome_veiculo_normalizado(p_modelo);
begin
  if not (is_staff() or auth.uid() is null) then return; end if;
  if v_marca = '' or v_mod = '' then return; end if;

  return query
  with mk as (
    -- A FIPE escreve "GM - Chevrolet", "VW - VolksWagen"; o catalogo, "CHEVROLET".
    select mk.id, mk.nome,
           case when nome_veiculo_normalizado(mk.nome) = v_marca then 1.0
                when (' ' || v_marca || ' ') like ('% ' || nome_veiculo_normalizado(mk.nome) || ' %') then 0.9
                else similarity(nome_veiculo_normalizado(mk.nome), v_marca) end as sm
      from marcas mk
  ), melhor_marca as (
    select id, nome from mk where sm >= 0.5 order by sm desc, length(nome) desc limit 1
  )
  select m.id, mm.nome, m.nome, c.id, c.codigo, c.percentual,
         round(similarity(nome_veiculo_normalizado(m.nome), v_mod)::numeric, 3)
    from melhor_marca mm
    join modelos m on m.marca_id = mm.id
    left join cotas_participacao c on c.id = m.cota_participacao_id
   where similarity(nome_veiculo_normalizado(m.nome), v_mod) >= 0.3
   order by similarity(nome_veiculo_normalizado(m.nome), v_mod) desc,
            (m.cota_participacao_id is not null) desc, m.nome
   limit 1;
end;
$$;

comment on function modelo_do_catalogo(text, text) is
  'O modelo do catalogo (Configuracoes > Marcas e Modelos) mais parecido com a marca/modelo da FIPE, com a cota dele. Vazio = nenhum parecido.';

-- ----------------------------------------------------------------------------
-- (D) autorizar_entrada_lead copia os opcionais da cotacao para o veiculo
-- ----------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_old text := '  update vistorias set veiculo_id = v_veiculo, status = ''APROVADA''';
  v_new text :=
'  -- 0162: os opcionais contratados na cotacao aceita vao para o veiculo
  -- (antes ficavam so na cotacao: sem cobertura na ficha e sem cobranca).
  insert into veiculo_produtos (veiculo_id, produto_id)
  select v_veiculo, o.pid
    from cotacoes c, unnest(coalesce(c.opcionais_ids, ''{}''::uuid[])) as o(pid)
   where c.id = v_cot
     and exists (select 1 from produtos p where p.id = o.pid)
     and not exists (select 1 from plano_produtos pp where pp.plano_id = l.plano_id and pp.produto_id = o.pid)
  on conflict do nothing;

  update vistorias set veiculo_id = v_veiculo, status = ''APROVADA''';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'autorizar_entrada_lead';
  if v_def is null then
    raise exception '0162: autorizar_entrada_lead nao existe';
  end if;
  if position('0162: os opcionais' in v_def) > 0 then
    return; -- ja aplicada
  end if;
  if position(v_old in v_def) = 0 or position('v_cot' in v_def) = 0 then
    raise exception '0162: trecho esperado nao encontrado em autorizar_entrada_lead';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

-- ----------------------------------------------------------------------------
-- Rito de seguranca (0052)
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
