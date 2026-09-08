-- ============================================================================
-- SCar :: 0060_limpeza_atendimentos_orfaos.sql
-- CORRETIVA. Uma sessao anterior trabalhou num branch parado (o default morto
-- ja avisado no CLAUDE.md) e aplicou em producao uma migration `0025_assistencia_24h`
-- que NAO faz parte desta linha: ela tentava montar a Assistencia 24h em cima de
-- `atendimentos`, sem saber que o modulo de verdade (0026) ja existia e grava em
-- `acionamentos_assistencia`.
--
-- Nada foi destruido — mas ficaram na base colunas mortas, um trigger inerte e
-- 11 funcoes que leem uma fonte vazia. Este arquivo desfaz tudo isso.
--
-- A ORDEM IMPORTA: `abrir_atendimento` foi substituida por uma versao que INSERE
-- nas colunas que vamos remover. Restaurar a funcao vem primeiro; dropar as
-- colunas antes disso quebraria a abertura de protocolo no SAC.
--
-- Em base limpa (harness/instalacao nova) este arquivo e um no-op: tudo aqui e
-- `if exists` e as duas funcoes restauradas sao identicas as de 0021/0022.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Restaurar as funcoes as versoes desta linha (0021 e 0022) — ANTES dos drops
-- ----------------------------------------------------------------------------
create or replace function opcionais_elegibilidade(p_veiculo_id uuid)
returns table (
  produto_id        uuid,
  nome              text,
  quantidade_limite integer,
  janela_dias       integer,
  usados            bigint,
  elegivel          boolean,
  ultimo_uso        date
)
language sql stable
as $$
  select pr.id, pr.nome, pr.quantidade_limite, pr.janela_dias_limite,
         count(e.id) as usados,
         (count(e.id) < pr.quantidade_limite) as elegivel,
         max(e.data_ocorrencia) as ultimo_uso
    from produtos pr
    left join eventos_sinistro e
      on e.veiculo_id = p_veiculo_id
     and e.tipo_evento_id = pr.tipo_evento_id
     and e.data_ocorrencia >= current_date - pr.janela_dias_limite
   where pr.tem_limite_uso = true and pr.status = true
   group by pr.id, pr.nome, pr.quantidade_limite, pr.janela_dias_limite
   order by pr.nome;
$$;

create or replace function abrir_atendimento(
  p_veiculo_id uuid,
  p_tipo tipo_atendimento,
  p_canal canal_atendimento default 'SAC_INTERNO',
  p_assunto text default null,
  p_descricao text default null,
  p_dados jsonb default '{}'::jsonb
)
returns atendimentos
language plpgsql security definer set search_path = public
as $$
declare
  v     veiculos;
  a     atendimentos;
  v_uid uuid := auth.uid();
begin
  select * into v from veiculos where id = p_veiculo_id;
  if v.id is null then raise exception 'Veiculo nao encontrado'; end if;

  -- Seguranca: staff com acesso a regional OU o proprio associado dono do veiculo.
  if not (is_staff() and pode_regional(v.regional_id))
     and v.cliente_id is distinct from auth_cliente_id() then
    raise exception 'Sem permissao para abrir atendimento neste veiculo';
  end if;

  insert into atendimentos (cliente_id, veiculo_id, tipo, canal, assunto, descricao, dados, regional_id, aberto_por)
  values (
    v.cliente_id, v.id, p_tipo, p_canal, p_assunto, p_descricao, coalesce(p_dados, '{}'::jsonb), v.regional_id,
    (select id from usuarios where id = v_uid)
  )
  returning * into a;
  return a;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2) Trigger e colunas mortas em `atendimentos`
--    (`data_conclusao` era o paralelo do `encerrado_em` que a 0029 ja criou)
-- ----------------------------------------------------------------------------
drop trigger if exists trg_atendimento_conclusao on atendimentos;
drop function if exists fn_atendimento_conclusao();

alter table atendimentos
  drop column if exists subtipo,
  drop column if exists produto_id,
  drop column if exists cidade,
  drop column if exists uf,
  drop column if exists local_origem,
  drop column if exists cidade_destino,
  drop column if exists uf_destino,
  drop column if exists local_destino,
  drop column if exists km_percorridos,
  drop column if exists prestador,
  drop column if exists custo,
  drop column if exists data_conclusao;

drop index if exists idx_atendimentos_tipo_data;
drop index if exists idx_atendimentos_regional;
drop index if exists idx_atendimentos_produto;

-- ----------------------------------------------------------------------------
-- 3) RPCs orfas (liam `atendimentos` como se fosse a fonte da 24h)
--    As do painel novo nascem na 0061, sobre `acionamentos_assistencia`.
-- ----------------------------------------------------------------------------
drop function if exists assistencia_movimentos(date, date, uuid);
drop function if exists assistencia_resumo(date, date, uuid);
drop function if exists assistencia_por_motivo(date, date, uuid);
drop function if exists assistencia_por_cidade(date, date, uuid, integer);
drop function if exists assistencia_serie_mensal(integer, uuid);
drop function if exists assistencia_top_veiculos(date, date, uuid, integer);
drop function if exists assistencia_consumo_beneficios(date, date, uuid);
drop function if exists veiculos_por_cidade(uuid, integer);
drop function if exists veiculos_por_situacao(uuid);
drop function if exists num_seguro(text);
drop function if exists uuid_seguro(text);
drop function if exists norm_cidade(text);

-- ----------------------------------------------------------------------------
-- Rito de seguranca (0052): funcao nasce com EXECUTE para PUBLIC — inclusive as
-- que sao apenas restauradas com `create or replace`.
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
