-- =====================================================================
-- 0184 — DE-PARA DOS PRODUTOS DO MUTUAL -> OPCIONAIS DO SCar
-- ---------------------------------------------------------------------
-- Decisao do usuario (05/11/2026): nao ha mais Ouro/Prata/Diamante. O veiculo
-- migrado fica no plano ESSENCIAL do tipo dele, e o que ele contratou no
-- Mutual entra como OPCIONAL contratado (veiculo_produtos). Ate aqui a carga so
-- trazia o plano: dos 3.040 migrados da base viva, praticamente nenhum tinha
-- opcional gravado, e a ficha do SAC nao mostrava carro reserva, vidros nem
-- terceiros que o associado paga.
--
-- Os produtos de cada veiculo ja estao capturados (CONTRACT_OBJECT_PRODUCT,
-- 0091/0092: uma linha por veiculo com products[] dentro). Sao ~196 nomes no
-- Mutual — muitos sao a BASE do plano (taxa adm, 24h, chaveiro, casco) e nao
-- viram opcional. Por isso o de-para tem tres destinos:
--   OPCIONAL  -> um produto do SCar (vai para veiculo_produtos)
--   BASE      -> ja faz parte do plano essencial; nao grava nada
--   IGNORAR   -> nao se aplica (ex.: assistencia profissional, que tem tela propria)
--
-- A chave e o product_id do Mutual (global), com o nome como reserva.
--
-- Regras da aplicacao (mutual_aplicar_opcionais):
--   * so ACRESCENTA: opcional incluido aqui no SCar nao e apagado;
--   * nao grava o que o plano do veiculo ja traz (plano_produtos) nem o que nao
--     atende o tipo do veiculo (0089) — o motor ignoraria do mesmo jeito;
--   * re-executavel; a rotina diaria do Mutual chama depois da carga.
--   * o BOLETO do migrado nao muda: ele segue o valor do Mutual (override).
-- =====================================================================

create table if not exists mutual_produto_de_para (
  chave        text primary key,
  nome_mutual  text,
  acao         text not null,
  produto_id   uuid references produtos(id) on delete restrict,
  definido_por uuid references usuarios(id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint chk_mutual_produto_acao check (acao in ('OPCIONAL', 'BASE', 'IGNORAR')),
  constraint chk_mutual_produto_destino check ((acao = 'OPCIONAL') = (produto_id is not null))
);

comment on table mutual_produto_de_para is
  '0184: de-para do produto do Mutual (product_id) para opcional do SCar, BASE do plano ou IGNORAR. Escrita so por mutual_definir_produto.';

alter table mutual_produto_de_para enable row level security;
drop policy if exists mutual_produto_de_para_select on mutual_produto_de_para;
create policy mutual_produto_de_para_select on mutual_produto_de_para
  for select to authenticated using ((select is_staff()));
revoke all on mutual_produto_de_para from anon;
grant select on mutual_produto_de_para to authenticated;

-- ---------------------------------------------------------------------
-- Os itens de produto de cada veiculo MIGRADO (vinculo CONTRACT_OBJECT).
-- ---------------------------------------------------------------------
create or replace function mutual_itens_produto_veiculos(p_regional_id uuid default null)
returns table (veiculo_id uuid, chave text, nome text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct
         v.id,
         coalesce(nullif(btrim(p->>'product_id'), ''), 'nome:' || upper(btrim(p->>'product_name'))),
         nullif(btrim(p->>'product_name'), '')
    from integracao_vinculos iv
    join veiculos v on v.id = iv.registro_id
    join mutual_captura m
      on m.entidade = 'CONTRACT_OBJECT_PRODUCT'
     and not m.deletado
     and m.payload->>'contract_object_id' = iv.id_externo
    cross join lateral jsonb_array_elements(
           case when jsonb_typeof(m.payload->'products') = 'array'
                then m.payload->'products' else '[]'::jsonb end) p
   where iv.sistema = 'MUTUAL'
     and iv.entidade = 'CONTRACT_OBJECT'
     and iv.tabela = 'veiculos'
     and (p_regional_id is null or v.regional_id = p_regional_id)
     and (tem_acesso_global() or auth.uid() is null)
     and coalesce(nullif(btrim(p->>'product_id'), ''), nullif(btrim(p->>'product_name'), '')) is not null
$$;

-- ---------------------------------------------------------------------
-- A tela: um produto do Mutual por linha, com o peso e o destino gravado.
-- ---------------------------------------------------------------------
create or replace function mutual_produtos_externos(p_regional_id uuid default null)
returns table (
  chave            text,
  nome             text,
  veiculos         bigint,
  veiculos_na_base bigint,
  acao             text,
  produto_id       uuid,
  produto_nome     text
)
language sql
stable
security definer
set search_path = public
as $$
  with i as (select * from mutual_itens_produto_veiculos(p_regional_id)),
  nomes as (
    select i.chave, i.nome,
           row_number() over (partition by i.chave order by count(*) desc, i.nome) rn
      from i where i.nome is not null
     group by i.chave, i.nome
  ),
  ag as (
    select i.chave,
           count(distinct i.veiculo_id) veiculos,
           count(distinct i.veiculo_id) filter (
             where v.status::text in ('ativo', 'em_evento', 'vistoria_pendente', 'inadimplente')) na_base
      from i join veiculos v on v.id = i.veiculo_id
     group by i.chave
  )
  select ag.chave,
         coalesce(n.nome, d.nome_mutual),
         ag.veiculos,
         ag.na_base,
         d.acao,
         d.produto_id,
         pr.nome
    from ag
    left join nomes n on n.chave = ag.chave and n.rn = 1
    left join mutual_produto_de_para d on d.chave = ag.chave
    left join produtos pr on pr.id = d.produto_id
   order by ag.na_base desc, ag.veiculos desc, 2
$$;

-- ---------------------------------------------------------------------
-- Grava (ou desfaz, com p_acao nulo) o destino de um produto do Mutual.
-- ---------------------------------------------------------------------
create or replace function mutual_definir_produto(
  p_chave      text,
  p_acao       text,
  p_produto_id uuid default null,
  p_nome       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'Somente a matriz define o de-para dos produtos do Mutual';
  end if;
  if nullif(btrim(p_chave), '') is null then
    raise exception 'Produto do Mutual sem chave';
  end if;

  if p_acao is null then
    delete from mutual_produto_de_para where chave = p_chave;
    return;
  end if;

  if p_acao not in ('OPCIONAL', 'BASE', 'IGNORAR') then
    raise exception 'Destino invalido: %', p_acao;
  end if;
  if p_acao = 'OPCIONAL' and p_produto_id is null then
    raise exception 'Escolha o opcional do SCar para este produto';
  end if;
  if p_acao = 'OPCIONAL' and not exists (select 1 from produtos where id = p_produto_id) then
    raise exception 'Produto do SCar nao encontrado';
  end if;

  insert into mutual_produto_de_para (chave, nome_mutual, acao, produto_id, definido_por, updated_at)
  values (p_chave, nullif(btrim(p_nome), ''), p_acao,
          case when p_acao = 'OPCIONAL' then p_produto_id end, usuario_atual_id(), now())
  on conflict (chave) do update
     set acao = excluded.acao,
         produto_id = excluded.produto_id,
         nome_mutual = coalesce(excluded.nome_mutual, mutual_produto_de_para.nome_mutual),
         definido_por = excluded.definido_por,
         updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------
-- Os pares (veiculo, opcional) que o de-para pede, com a situacao de cada um.
-- ---------------------------------------------------------------------
create or replace function mutual_opcionais_do_de_para(p_regional_id uuid default null)
returns table (veiculo_id uuid, produto_id uuid, ja boolean, no_plano boolean, atende boolean)
language sql
stable
security definer
set search_path = public
as $$
  select a.veiculo_id, a.produto_id,
         exists (select 1 from veiculo_produtos vp
                  where vp.veiculo_id = a.veiculo_id and vp.produto_id = a.produto_id),
         exists (select 1 from plano_produtos pp
                  where pp.plano_id = v.plano_protecao_id and pp.produto_id = a.produto_id),
         (v.tipo_veiculo_id is null or produto_atende_tipo(a.produto_id, v.tipo_veiculo_id))
    from (select distinct i.veiculo_id, d.produto_id
            from mutual_itens_produto_veiculos(p_regional_id) i
            join mutual_produto_de_para d on d.chave = i.chave and d.acao = 'OPCIONAL') a
    join veiculos v on v.id = a.veiculo_id
$$;

-- ---------------------------------------------------------------------
-- Aplica: grava em veiculo_produtos os opcionais do de-para. Sem
-- p_confirmar so conta (simulacao). Sem tabela temporaria (gotcha da 0084).
-- ---------------------------------------------------------------------
create or replace function mutual_aplicar_opcionais(
  p_regional_id uuid default null,
  p_confirmar   boolean default false
)
returns table (
  veiculos_alcancados  bigint,
  a_inserir            bigint,
  ja_tinham            bigint,
  ja_no_plano          bigint,
  fora_do_tipo         bigint,
  produtos_sem_de_para bigint,
  inseridos            bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alc bigint; v_ins_prev bigint; v_ja bigint; v_plano bigint; v_tipo bigint; v_sem bigint;
  v_ins bigint := 0;
begin
  if auth.uid() is not null and not tem_acesso_global() then
    raise exception 'Somente a matriz aplica os opcionais do Mutual';
  end if;

  select count(distinct o.veiculo_id) filter (where not o.ja and not o.no_plano and o.atende),
         count(*) filter (where not o.ja and not o.no_plano and o.atende),
         count(*) filter (where o.ja),
         count(*) filter (where not o.ja and o.no_plano),
         count(*) filter (where not o.ja and not o.no_plano and not o.atende)
    into v_alc, v_ins_prev, v_ja, v_plano, v_tipo
    from mutual_opcionais_do_de_para(p_regional_id) o;

  select count(distinct i.chave) into v_sem
    from mutual_itens_produto_veiculos(p_regional_id) i
   where not exists (select 1 from mutual_produto_de_para d where d.chave = i.chave);

  if p_confirmar then
    insert into veiculo_produtos (veiculo_id, produto_id)
    select o.veiculo_id, o.produto_id from mutual_opcionais_do_de_para(p_regional_id) o
     where not o.ja and not o.no_plano and o.atende
    on conflict do nothing;
    get diagnostics v_ins = row_count;
  end if;

  return query select v_alc, v_ins_prev, v_ja, v_plano, v_tipo, v_sem, v_ins;
end;
$$;

comment on function mutual_aplicar_opcionais(uuid, boolean) is
  '0184: grava em veiculo_produtos os opcionais do de-para dos produtos do Mutual. So acrescenta; pula o que o plano ja traz e o que nao atende o tipo. Sem p_confirmar so simula.';

-- Rito da 0052.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
