-- =====================================================================
-- 0095_mutual_vendedor_do_consultor
-- O VEICULO MIGRADO GANHA O VENDEDOR — E O VEICULO MIGRADO NUNCA PAGA ADESAO.
--
-- Medido em producao em 08/10/2026: a carga (0084/0094) nunca grava
-- `veiculos.vendedor_id`. Na MATRIZ, 465 dos 467 veiculos migrados estavam sem
-- vendedor, e o dado existe no Mutual: o CONTRATO traz `consultant_id`, o
-- consultor (`/association/consultant/`, capturado) traz o CPF, e o CPF casa
-- com `vendedores.documento` (a chave da importacao, 0069). A corrente resolve
-- 431 dos 467, todos com o vendedor na MESMA unidade do veiculo. Os 34 cujo
-- consultor nao estava no cadastro foram ligados a mao (decisao do usuario).
--
-- O que muda:
--   (A) `vendedores.documento` passa a ser gravado SO COM DIGITOS por qualquer
--       caminho. A importacao (0069) ja gravava assim; a TELA gravava com
--       mascara ("503.189.501-20"), e a corrente acima nao casava o vendedor
--       que acabara de ser cadastrado a mao.
--   (B) `mutual_vendedores_dos_veiculos(regional)` — a leitura, uma linha por
--       veiculo migrado da unidade, com o vendedor encontrado e o MOTIVO de
--       quando nao ha. `mutual_vendedores_resumo` agrupa para a tela e
--       `mutual_vincular_vendedores(regional, confirmar)` grava.
--       So preenche quem esta SEM vendedor: o que alguem ligou a mao (os 34 do
--       Clayton) nao e tocado, e a carga continua sem mexer no campo (0084).
--       Vendedor de OUTRA unidade nao e ligado: e relatado.
--   (C) `fn_calcular_comissao` (0002): o 1o titulo pago de um veiculo vindo do
--       Mutual NAO e adesao — a adesao dele foi paga no sistema antigo. Sem
--       isso, no cutover, cada veiculo migrado pagaria ao vendedor a comissao
--       de ADESAO (hoje ha vendedor com 100%) sobre a 1a mensalidade.
--       A recorrencia segue igual, sobre o valor cheio do titulo.
--
-- Nada aqui gera fatura, titulo ou comissao: os migrados seguem com
-- `cobranca_externa`.
-- =====================================================================


-- =====================================================================
-- (A) O CPF DO VENDEDOR SO COM DIGITOS, POR QUALQUER CAMINHO
-- =====================================================================
create or replace function fn_vendedor_documento_digitos()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Vazio vira NULL, nunca '': o unique parcial (0069) colidiria nos vazios.
  new.documento := nullif(regexp_replace(coalesce(new.documento, ''), '\D', '', 'g'), '');
  return new;
end;
$$;

drop trigger if exists trg_vendedor_documento_digitos on vendedores;
create trigger trg_vendedor_documento_digitos
  before insert or update of documento on vendedores
  for each row execute function fn_vendedor_documento_digitos();

-- Quem ja foi gravado com mascara (em 08/10/2026 eram ZERO em producao: o
-- unico caso, o do Clayton, foi corrigido a mao). Se dois cadastros forem o
-- mesmo CPF, o unique da 0069 recusa aqui — e e o certo: sao duas fichas da
-- mesma pessoa, e quem decide qual fica e a gestao.
update vendedores
   set documento = documento
 where documento ~ '\D';


-- =====================================================================
-- (B) O VENDEDOR DE CADA VEICULO MIGRADO, PELO CONSULTOR DO CONTRATO
-- =====================================================================
-- Corrente: vinculo CONTRACT_OBJECT -> veiculos (a carga, 0084) -> objeto ->
-- contrato -> consultor (`mutual_consultor_do_objeto`, 0073: objeto manda,
-- contrato e reserva; no objeto a chave vem vazia, no contrato e
-- `consultant_id`) -> CPF -> `vendedores.documento`. E-mail so como reserva, e
-- so quando aponta para UM vendedor (e-mail nao e unico — a mordida da 0074).
--
-- Motivos, na ordem em que sao decididos:
--   JA_LIGADO          o veiculo ja tem ESTE vendedor
--   MANTIDO            o veiculo ja tem OUTRO vendedor — nao e tocado
--   SEM_CONSULTOR      o contrato no Mutual nao tem consultor
--   CONSULTOR_NAO_CAPTURADO  o consultor nao foi puxado (puxe Consultores)
--   EMAIL_AMBIGUO      sem CPF que case, e o e-mail aponta para varios
--   CONSULTOR_SEM_VENDEDOR   o consultor nao esta no cadastro de vendedores
--   UNIDADE_DIFERENTE  o vendedor e de outra unidade — nao e ligado
--   LIGAR              sera ligado
create or replace function mutual_vendedores_dos_veiculos(p_regional_id uuid)
returns table (
  veiculo_id          uuid,
  placa               text,
  objeto              text,
  vendedor_atual_id   uuid,
  consultor_id        text,
  consultor_nome      text,
  consultor_documento text,
  vendedor_id         uuid,
  vendedor_nome       text,
  motivo              text
)
language sql
stable
security definer
set search_path = public
as $$
  with car as (
    select v.id as vid, v.placa, v.vendedor_id as atual, v.regional_id as reg,
           iv.id_externo as obj, o.payload as op
      from integracao_vinculos iv
      join veiculos v       on v.id = iv.registro_id
      join mutual_captura o on o.entidade = 'CONTRACT_OBJECT' and not o.deletado
                           and o.id_externo = iv.id_externo
     where iv.sistema = 'MUTUAL' and iv.entidade = 'CONTRACT_OBJECT' and iv.tabela = 'veiculos'
       and v.regional_id = p_regional_id
       and (tem_acesso_global() or auth.uid() is null)
  ),
  cons as (
    select car.*, mutual_consultor_do_objeto(car.op, ct.payload) as cid
      from car
      left join mutual_captura ct on ct.entidade = 'CONTRACT' and not ct.deletado
                                 and ct.id_externo = car.op->>'contract_id'
  ),
  cs as (
    select cons.*, c.payload as cp,
           mutual_texto_em(c.payload, array['name','nome','full_name','fantasy_name']) as cnome,
           nullif(regexp_replace(coalesce(
             mutual_texto_em(c.payload, array['cpf_cnpj','cpf','document','documento','doc']), ''),
             '\D', '', 'g'), '') as cdoc,
           lower(mutual_texto_em(c.payload, array['email','e_mail','mail'])) as cmail
      from cons
      left join mutual_captura c on c.entidade = 'CONSULTANT' and not c.deletado
                                and c.id_externo = cons.cid
  ),
  m as (
    select cs.*,
           coalesce(pd.id, case when pe.n = 1 then pe.id end) as vend,
           coalesce(pe.n, 0) as n_mail
      from cs
      -- documento e unique (0069): no maximo um
      left join lateral (
        select vd.id from vendedores vd
         where cs.cdoc is not null and vd.documento = cs.cdoc
         limit 1
      ) pd on true
      -- reserva: e-mail, so se apontar para UM vendedor
      left join lateral (
        select (array_agg(vd.id order by vd.id))[1] as id, count(*) as n
          from vendedores vd
         where pd.id is null and cs.cmail is not null and lower(vd.email) = cs.cmail
      ) pe on true
  )
  select m.vid, m.placa, m.obj, m.atual, m.cid, m.cnome, m.cdoc,
         m.vend, vd.nome,
         case
           when m.atual is not null and m.atual = m.vend then 'JA_LIGADO'
           when m.atual is not null                      then 'MANTIDO'
           when m.cid is null                            then 'SEM_CONSULTOR'
           when m.cp is null                             then 'CONSULTOR_NAO_CAPTURADO'
           when m.vend is null and m.n_mail > 1          then 'EMAIL_AMBIGUO'
           when m.vend is null                           then 'CONSULTOR_SEM_VENDEDOR'
           when vd.regional_id is distinct from m.reg    then 'UNIDADE_DIFERENTE'
           else 'LIGAR'
         end
    from m
    left join vendedores vd on vd.id = m.vend;
$$;

comment on function mutual_vendedores_dos_veiculos(uuid) is
  'O vendedor de cada veiculo migrado da unidade, pelo consultor do contrato do Mutual (CPF -> '
  'vendedores.documento; e-mail so se unico), com o MOTIVO quando nao ha. Leitura (0095).';


-- A tela: agrupado por motivo e consultor, maior volume primeiro.
create or replace function mutual_vendedores_resumo(p_regional_id uuid)
returns table (
  motivo              text,
  consultor_id        text,
  consultor_nome      text,
  consultor_documento text,
  vendedor_nome       text,
  veiculos            bigint,
  placas              text
)
language sql
stable
security definer
set search_path = public
as $$
  select b.motivo, b.consultor_id, b.consultor_nome, b.consultor_documento, b.vendedor_nome,
         count(*),
         string_agg(b.placa, ', ' order by b.placa)
    from mutual_vendedores_dos_veiculos(p_regional_id) b
   group by 1, 2, 3, 4, 5
   order by count(*) desc, b.consultor_nome nulls last;
$$;


-- A escrita. Sem `p_confirmar` so conta. So preenche quem esta SEM vendedor.
create or replace function mutual_vincular_vendedores(
  p_regional_id uuid,
  p_confirmar   boolean default false
)
returns table (
  ligar         bigint,
  ja_ligados    bigint,
  mantidos      bigint,
  sem_vendedor  bigint,
  gravados      bigint,
  mensagem      text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ligar bigint; v_ja bigint; v_mant bigint; v_sem bigint;
  v_grav  bigint := 0;
begin
  if not (tem_acesso_global() or auth.uid() is null) then
    raise exception 'Somente a matriz liga vendedores aos veiculos migrados'
      using errcode = 'insufficient_privilege';
  end if;
  if p_regional_id is null then
    raise exception 'Escolha a unidade' using errcode = 'invalid_parameter_value';
  end if;

  select count(*) filter (where b.motivo = 'LIGAR'),
         count(*) filter (where b.motivo = 'JA_LIGADO'),
         count(*) filter (where b.motivo = 'MANTIDO'),
         count(*) filter (where b.motivo not in ('LIGAR','JA_LIGADO','MANTIDO'))
    into v_ligar, v_ja, v_mant, v_sem
    from mutual_vendedores_dos_veiculos(p_regional_id) b;

  if p_confirmar then
    update veiculos v
       set vendedor_id = b.vendedor_id
      from mutual_vendedores_dos_veiculos(p_regional_id) b
     where b.motivo = 'LIGAR'
       and v.id = b.veiculo_id
       and v.vendedor_id is null;
    get diagnostics v_grav = row_count;
  end if;

  return query select v_ligar, v_ja, v_mant, v_sem, v_grav,
    case
      when p_confirmar then format('%s veiculo(s) ligado(s) ao vendedor.', v_grav)
      else format('%s veiculo(s) seriam ligados ao vendedor.', v_ligar)
    end;
end;
$$;

comment on function mutual_vincular_vendedores(uuid, boolean) is
  'Liga ao vendedor os veiculos migrados da unidade SEM vendedor, pelo consultor do contrato do '
  'Mutual. Sem p_confirmar so conta. Nunca troca vendedor ja gravado (0095).';


-- =====================================================================
-- (C) VEICULO VINDO DO MUTUAL NUNCA PAGA COMISSAO DE ADESAO
-- =====================================================================
-- Corpo da 0002 com UMA condicao a mais na adesao. O vinculo da carga
-- (`integracao_vinculos`) e a marca permanente de "veio do Mutual" — a
-- `cobranca_externa` nao serve, porque e justamente ela que vira no cutover.
create or replace function fn_calcular_comissao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendedor   vendedores;
  v_is_adesao  boolean;
  v_taxa       numeric(6,4);
  v_base       numeric(12,2);
begin
  -- dispara apenas na transicao para 'pago' (ignora se ja estava pago)
  if new.status <> 'pago' or old.status is not distinct from 'pago' then
    return new;
  end if;
  if new.veiculo_id is null then
    return new;
  end if;

  select v.* into v_vendedor
    from veiculos ve
    join vendedores v on v.id = ve.vendedor_id
   where ve.id = new.veiculo_id;

  if not found then
    return new;  -- veiculo sem vendedor: nada a comissionar
  end if;

  -- adesao = primeiro titulo pago deste veiculo — EXCETO veiculo migrado do
  -- Mutual, cuja adesao foi paga no sistema antigo (0095)
  select not exists (
           select 1 from comissoes_vendas c
            where c.veiculo_id = new.veiculo_id and c.is_adesao = true
         )
     and not exists (
           select 1 from integracao_vinculos iv
            where iv.sistema = 'MUTUAL' and iv.entidade = 'CONTRACT_OBJECT'
              and iv.tabela = 'veiculos' and iv.registro_id = new.veiculo_id
         )
    into v_is_adesao;

  v_taxa := case when v_is_adesao
                 then v_vendedor.taxa_comissao_adesao
                 else v_vendedor.taxa_comissao_recorrente end;

  v_base := coalesce(new.valor_pago, new.valor);

  insert into comissoes_vendas (
    vendedor_id, veiculo_id, titulo_id, valor_comissao, is_adesao, status_pagamento
  ) values (
    v_vendedor.id, new.veiculo_id, new.id, round(v_base * v_taxa, 2), v_is_adesao, 'pendente'
  )
  on conflict (titulo_id) do nothing;   -- idempotente

  return new;
end;
$$;


-- =====================================================================
-- Rito da 0052
-- =====================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
