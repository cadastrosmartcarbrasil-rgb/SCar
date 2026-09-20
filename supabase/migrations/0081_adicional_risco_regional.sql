-- ============================================================================
-- SCar :: 0081_adicional_risco_regional.sql
--
-- ADICIONAL DE RISCO POR REGIONAL — o preço deixa de ser só nacional sem
-- duplicar uma única tabela de preço.
--
-- A tabela da MATRIZ continua sendo a ÚNICA tabela de preço do sistema
-- (`tabela_precos_faixa`, `participacao_faixa`, `adesao_faixa` seguem chaveadas
-- só por `tipo_veiculo_id`). Cada regional cadastra apenas UM valor em R$ por
-- TIPO DE VEÍCULO, somado à mensalidade final de QUALQUER faixa FIPE daquele
-- tipo. "Natal · Moto · +R$ 5,00" é UMA linha que cobre as 46 faixas de Moto.
-- Sem linha cadastrada = preço da matriz, intacto.
--
-- ---------------------------------------------------------------------------
-- AS SETE DECISÕES QUE MORAM AQUI (leia antes de mexer)
-- ---------------------------------------------------------------------------
-- (1) É UM valor por (regional, tipo), aplicado UMA VEZ sobre o total da
--     faixa — NÃO por produto. Cada faixa tem 2 produtos obrigatórios hoje;
--     +R$ 5,00 tem de dar +R$ 5,00, nunca +R$ 10,00. Por isso a soma acontece
--     DEPOIS do laço de produtos e da regra do rastreador, uma vez só.
--
-- (2) SÓ MENSALIDADE. Adesão e participação não recebem adicional:
--     `calcular_adesao`, `calcular_participacao`, `adesao_faixa`,
--     `participacao_faixa` e `substituir_tabela_precos` ficam INTACTOS. O
--     `taxa_adesao` do retorno continua vindo do `calcular_adesao` puro.
--
-- (3) 🔴 É OVERLOAD? NÃO — É DROP + CREATE. `calcular_mensalidade` e
--     `cotar_plano` já têm DEFAULT no último argumento. Criar uma versão com um
--     argumento a mais (também com default) deixaria `calcular_mensalidade(fipe,
--     tipo)` casando com as DUAS, e o Postgres recusa com "function is not
--     unique". Mesma mordida que a 0070 documentou no `atualizar_cotacao`.
--     As chamadas antigas (sem regional) seguem funcionando iguais — o default
--     `null` significa MATRIZ PURA.
--
-- (4) VALOR É SEMPRE >= 0 (decisão do usuário, 20/09/2026). O desenho original
--     previa valor negativo com piso/teto na matriz; o usuário avaliou e disse
--     que adicional é adicional. Com isso caem o piso, o teto e a confirmação de
--     negativo na tela. Liberar depois é trocar UM check — mas aí a alçada volta
--     a ser assunto, porque negativo é desconto.
--
-- (5) A COMISSÃO NÃO FOI TOCADA (decisão do usuário, 20/09/2026). O desenho
--     original mandava tirar o adicional da base de `regionais.taxa_comissao_
--     recorrente` — mas essa taxa é só TETO, nunca multiplica valor nenhum.
--     Quem vira dinheiro é `vendedores.taxa_comissao_recorrente`, em
--     `fn_calcular_comissao` (0002), sobre o título pago. Tirar dali mexeria no
--     bolso do VENDEDOR, e o usuário optou por deixar a comissão sobre o valor
--     cheio. `fn_calcular_comissao` fica exatamente como está.
--
-- (6) 🔴 VEÍCULO NA BASE NÃO FLUTUA — e o override é o que impede cobrar 2×.
--     `valor_mensalidade_veiculo` (0024) devolve `veiculos.valor_mensalidade`
--     quando ele existe e NUNCA chama o `cotar_plano`. São dois nascimentos:
--       · venda (`autorizar_entrada_lead`) NÃO grava override -> cai no
--         `cotar_plano` (matriz) e aí o adicional GUARDADO é somado;
--       · cadastro manual em /veiculos GRAVA o override com o valor calculado,
--         que já inclui o adicional -> somar de novo cobraria em dobro.
--     Então: o adicional entra SÓ no caminho sem override. Override é preço
--     final negociado e, por definição, já inclui tudo — é a semântica que o
--     sistema já tinha. E a soma usa o valor GRAVADO no veículo, nunca uma
--     consulta nova: mudar o cadastro não retroage no faturamento recorrente.
--
-- (7) A REGIONAL DE PREÇO É A DO ASSOCIADO (`clientes.regional_id`). Não existe
--     de-para CEP -> regional no sistema (conferido: nenhuma faixa de CEP, UF ou
--     abrangência por unidade). `clientes.regional_id` é o campo que já governa
--     RLS e carteira; a divergência a vigiar é "vendedor de uma unidade,
--     associado de outra", que é exatamente o caso que o desenho quer pegar.
-- ============================================================================

-- `btree_gist` é o que permite misturar igualdade (uuid) com sobreposição de
-- período (daterange) na MESMA constraint de exclusão.
create extension if not exists btree_gist;

-- ----------------------------------------------------------------------------
-- 1. O cadastro
-- ----------------------------------------------------------------------------
create table if not exists regional_adicional_risco (
  id              uuid primary key default gen_random_uuid(),
  regional_id     uuid not null references regionais(id) on delete cascade,
  tipo_veiculo_id uuid not null references tipos_veiculo(id) on delete cascade,
  valor           numeric(12,2) not null,
  justificativa   text,
  vigencia_inicio date not null default current_date,
  vigencia_fim    date,                       -- null = vigente sem prazo
  status          boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid references usuarios(id) on delete set null,
  constraint chk_adicional_valor    check (valor >= 0),
  constraint chk_adicional_vigencia check (vigencia_fim is null or vigencia_fim > vigencia_inicio)
);

comment on table regional_adicional_risco is
  'Adicional de risco em R$ por (regional, tipo de veiculo), somado UMA VEZ a mensalidade de qualquer faixa FIPE daquele tipo. Nao toca adesao nem participacao.';
comment on column regional_adicional_risco.valor is
  'R$ somados a mensalidade TOTAL da faixa — nao e por produto. >= 0 por decisao do usuario (20/09/2026).';
comment on column regional_adicional_risco.justificativa is
  'O fundamento tecnico do risco da regiao. Existe para a proxima gestao saber POR QUE o numero e esse.';

-- Duas linhas VIGENTES para o mesmo par, com periodos que se cruzam, fariam o
-- `limit 1` escolher por acaso — e preco decidido por acaso e o pior desfecho
-- possivel aqui. A exclusao recusa a sobreposicao no proprio banco.
drop index if exists uq_adicional_vigente;
alter table regional_adicional_risco drop constraint if exists uq_adicional_vigente;
alter table regional_adicional_risco
  add constraint uq_adicional_vigente
  exclude using gist (
    regional_id     with =,
    tipo_veiculo_id with =,
    daterange(vigencia_inicio, vigencia_fim, '[)') with &&
  ) where (status);

create index if not exists idx_adicional_regional on regional_adicional_risco (regional_id, tipo_veiculo_id);

-- ----------------------------------------------------------------------------
-- 2. A leitura — 0 sempre que não houver o que somar
-- ----------------------------------------------------------------------------
create or replace function adicional_risco_regional(
  p_regional_id     uuid,
  p_tipo_veiculo_id uuid,
  p_data            date default current_date
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  -- SECURITY DEFINER porque o motor de preco roda para o visitante do hotlink
  -- (service_role) e para o associado no portal. O cadastro nao tem dado
  -- sensivel — e um numero por unidade e tipo.
  select coalesce((
    select a.valor
      from regional_adicional_risco a
     where a.regional_id     = p_regional_id
       and a.tipo_veiculo_id = p_tipo_veiculo_id
       and a.status
       and a.vigencia_inicio <= coalesce(p_data, current_date)
       and (a.vigencia_fim is null or a.vigencia_fim > coalesce(p_data, current_date))
     limit 1
  ), 0);
$$;

comment on function adicional_risco_regional(uuid, uuid, date) is
  'R$ do adicional vigente NAQUELA DATA. Zero quando a regional e nula, nao ha linha vigente ou a linha esta inativa — nunca NULL.';

-- ----------------------------------------------------------------------------
-- 3. O motor — DROP + CREATE (ver a decisão 3 no topo)
-- ----------------------------------------------------------------------------
drop function if exists calcular_mensalidade(numeric, uuid, uuid[]);

create or replace function calcular_mensalidade(
  p_fipe            numeric,
  p_tipo_veiculo_id uuid,
  p_produtos_ids    uuid[] default '{}'::uuid[],
  p_regional_id     uuid default null            -- null = MATRIZ PURA
)
returns jsonb
language plpgsql stable
as $$
declare
  rec record;
  v numeric;
  detalhe jsonb := '[]'::jsonb;
  total numeric := 0;
  sub_admin numeric := 0;
  sub_parceiros numeric := 0;
  tv tipos_veiculo;
  v_rast numeric := 0;
  v_adic numeric := 0;
  v_reg_nome text;
begin
  for rec in
    select * from produtos p
     where p.status = true
       and (p.obrigatorio = true or p.id = any(p_produtos_ids))
     order by p.categoria, p.nome
  loop
    v := calcular_valor_produto(rec.id, p_fipe, p_tipo_veiculo_id);
    detalhe := detalhe || jsonb_build_object(
      'produto_id', rec.id, 'nome', rec.nome, 'valor', v,
      'fornecedor', rec.fornecedor_nome, 'categoria', rec.categoria,
      'obrigatorio', rec.obrigatorio
    );
    total := total + v;
    if rec.categoria = 'ADMIN' then sub_admin := sub_admin + v; end if;
    if rec.fornecedor_nome is distinct from 'Interno' then sub_parceiros := sub_parceiros + v; end if;
  end loop;

  -- Regra de rastreador (gatilho de isencao por faixa FIPE).
  select * into tv from tipos_veiculo where id = p_tipo_veiculo_id;
  if coalesce(tv.exige_rastreador, false) and p_fipe > coalesce(tv.valor_limite_isencao, 0) then
    v_rast := coalesce(tv.valor_mensalidade_rastreador, 0);
    detalhe := detalhe || jsonb_build_object(
      'produto_id', null, 'nome', 'Rastreador', 'valor', v_rast,
      'fornecedor', 'Interno', 'categoria', 'RASTREADOR', 'obrigatorio', true
    );
    total := total + v_rast;
  end if;

  -- ADICIONAL DE RISCO REGIONAL — UMA vez, sobre o total, DEPOIS de tudo.
  -- Dentro do laco de produtos ele seria somado uma vez POR PRODUTO: +R$ 5,00
  -- viraria +R$ 10,00 nas faixas de 2 produtos. E por isso que ele esta aqui.
  if p_regional_id is not null then
    v_adic := adicional_risco_regional(p_regional_id, p_tipo_veiculo_id);
    if v_adic <> 0 then
      select nome into v_reg_nome from regionais where id = p_regional_id;
      -- `produto_id` null, como a linha do Rastreador: `produtos_obrigatorios_
      -- cotacao` (0028) ja descarta item sem produto_id, entao o adicional NAO
      -- vira "item obrigatorio que sumiu da cotacao".
      detalhe := detalhe || jsonb_build_object(
        'produto_id', null,
        'nome', 'Adicional de risco regional — ' || coalesce(v_reg_nome, 'unidade'),
        'valor', v_adic,
        'fornecedor', 'Interno',
        'categoria', 'ADICIONAL_REGIONAL',
        'obrigatorio', true
      );
      total := total + v_adic;
    end if;
  end if;

  return jsonb_build_object(
    'valor_fipe', p_fipe,
    'detalhamento_produtos', detalhe,
    'subtotal_taxa_admin', sub_admin,
    'subtotal_beneficios_parceiros', sub_parceiros,
    'valor_total_mensalidade', total,
    'adicional_regional', v_adic,
    -- A adesao NAO leva adicional (decisao 2): segue vindo do calcular_adesao puro.
    'taxa_adesao', calcular_adesao(p_fipe, p_tipo_veiculo_id)
  );
end;
$$;

comment on function calcular_mensalidade(numeric, uuid, uuid[], uuid) is
  'Mensalidade = produtos + regra do rastreador + adicional de risco da regional (uma vez, sobre o total). Sem regional = matriz pura. Adesao e franquia NAO recebem adicional.';

drop function if exists cotar_plano(numeric, uuid, uuid, uuid[]);

create or replace function cotar_plano(
  p_fipe            numeric,
  p_tipo_veiculo_id uuid,
  p_plano_id        uuid default null,
  p_avulsos_ids     uuid[] default '{}'::uuid[],
  p_regional_id     uuid default null            -- null = MATRIZ PURA
)
returns jsonb
language plpgsql stable
as $$
declare
  v_ids  uuid[] := '{}'::uuid[];
  v_calc jsonb;
  v_plano planos_protecao;
begin
  if p_plano_id is not null then
    select coalesce(array_agg(produto_id), '{}'::uuid[]) into v_ids
      from plano_produtos where plano_id = p_plano_id;
    select * into v_plano from planos_protecao where id = p_plano_id;
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids
    from unnest(v_ids || coalesce(p_avulsos_ids, '{}'::uuid[])) x
   where x is not null;

  v_calc := calcular_mensalidade(p_fipe, p_tipo_veiculo_id, v_ids, p_regional_id);

  return jsonb_build_object(
    'valor_fipe', p_fipe,
    'plano_id', p_plano_id,
    'plano_nome', v_plano.nome,
    'regional_id', p_regional_id,
    'detalhamento_produtos', v_calc->'detalhamento_produtos',
    'subtotal_taxa_admin', (v_calc->>'subtotal_taxa_admin')::numeric,
    'subtotal_beneficios_parceiros', (v_calc->>'subtotal_beneficios_parceiros')::numeric,
    'valor_total_mensalidade', (v_calc->>'valor_total_mensalidade')::numeric,
    'adicional_regional', (v_calc->>'adicional_regional')::numeric,
    'taxa_adesao', (v_calc->>'taxa_adesao')::numeric,
    -- A franquia/participacao NAO leva adicional (decisao 2).
    'franquia_participacao', calcular_participacao(p_fipe, p_tipo_veiculo_id)
  );
end;
$$;

comment on function cotar_plano(numeric, uuid, uuid, uuid[], uuid) is
  'Combo + avulsos + adicional da regional. Devolve `adicional_regional` e `regional_id` para a tela DISCRIMINAR o valor, nunca embutir.';

-- ----------------------------------------------------------------------------
-- 4. O SNAPSHOT — é ele a prova do cálculo depois
-- ----------------------------------------------------------------------------
alter table cotacoes
  add column if not exists regional_id uuid references regionais(id) on delete set null,
  add column if not exists valor_adicional_regional numeric(12,2) not null default 0;

alter table veiculos
  add column if not exists valor_adicional_regional numeric(12,2) not null default 0,
  add column if not exists regional_preco_id uuid references regionais(id) on delete set null;

comment on column cotacoes.valor_adicional_regional is
  'O adicional VIGENTE no instante da cotacao. Congelado: reler o cadastro depois mudaria a prova do que foi vendido.';
comment on column veiculos.valor_adicional_regional is
  'O adicional carimbado na ENTRADA na base. O faturamento recorrente usa ESTE valor, nunca o cadastro atual — mudanca de adicional nao retroage.';
comment on column veiculos.regional_preco_id is
  'Qual unidade precificou este veiculo. Pode diferir de regional_id (a unidade que vendeu) — e a divergencia que a alcada trata.';

-- ----------------------------------------------------------------------------
-- 5. O faturamento recorrente usa o valor GRAVADO (ver a decisão 6)
-- ----------------------------------------------------------------------------
create or replace function valor_mensalidade_veiculo(p_veiculo_id uuid)
returns numeric
language plpgsql
stable
as $$
declare
  v        veiculos;
  v_opcs   uuid[];
  v_valor  numeric;
begin
  select * into v from veiculos where id = p_veiculo_id;
  if v.id is null then return 0; end if;

  -- OVERRIDE: preco final negociado. Ele JA inclui o adicional (a tela que o
  -- grava cotou com a regional), entao somar de novo cobraria em dobro.
  if v.valor_mensalidade is not null and v.valor_mensalidade > 0 then
    return round(v.valor_mensalidade, 2);
  end if;

  if v.tipo_veiculo_id is null then return 0; end if;

  select coalesce(array_agg(produto_id), '{}'::uuid[]) into v_opcs
    from veiculo_produtos where veiculo_id = v.id;

  -- Matriz pura + o adicional CARIMBADO na entrada. Nao passamos a regional ao
  -- `cotar_plano` de proposito: ela releria o cadastro de hoje, e o veiculo na
  -- base nao flutua quando a unidade reajusta o adicional.
  v_valor := (
    cotar_plano(coalesce(v.valor_fipe, 0), v.tipo_veiculo_id, v.plano_protecao_id, v_opcs)
      ->>'valor_total_mensalidade'
  )::numeric;

  return round(coalesce(v_valor, 0) + coalesce(v.valor_adicional_regional, 0), 2);
end;
$$;

comment on function valor_mensalidade_veiculo(uuid) is
  'Override negociado (ja inclui o adicional) OU matriz pura + o adicional carimbado na entrada. Nunca rele o cadastro de adicional.';

-- ----------------------------------------------------------------------------
-- 6. RLS — leitura por escopo, escrita só da matriz
-- ----------------------------------------------------------------------------
alter table regional_adicional_risco enable row level security;

drop policy if exists adicional_select on regional_adicional_risco;
create policy adicional_select on regional_adicional_risco for select to authenticated
  using (tem_acesso_global() or pode_regional(regional_id));

-- Preco e da MATRIZ. O gestor regional le o proprio e nao edita nada — nem o
-- dele, nem (obviamente) o da franquia vizinha.
drop policy if exists adicional_write on regional_adicional_risco;
create policy adicional_write on regional_adicional_risco for all to authenticated
  using (is_admin()) with check (is_admin());

grant select, insert, update, delete on regional_adicional_risco to authenticated;

-- ----------------------------------------------------------------------------
-- 7. A tela de cadastro (só admin) e a leitura da grade
-- ----------------------------------------------------------------------------
create or replace function adicionais_risco_do_tipo(p_tipo_veiculo_id uuid)
returns table (
  regional_id   uuid,
  regional_nome text,
  regional_ativa boolean,
  adicional_id  uuid,
  valor         numeric,
  justificativa text,
  vigencia_inicio date,
  vigencia_fim  date,
  veiculos      bigint
)
language sql
stable
security definer
set search_path = public
as $$
  -- Uma linha por REGIONAL (a grade da aba Tabela de Precos). A unidade sem
  -- adicional vem com valor NULL — "sem adicional" e diferente de "R$ 0,00
  -- cadastrado", e a tela precisa distinguir os dois.
  select r.id, r.nome, r.ativo,
         a.id, a.valor, a.justificativa, a.vigencia_inicio, a.vigencia_fim,
         (select count(*) from veiculos v
           where v.regional_preco_id = r.id
             and v.tipo_veiculo_id = p_tipo_veiculo_id
             and v.status::text not in ('excluido', 'baixado'))
    from regionais r
    left join lateral (
      select x.* from regional_adicional_risco x
       where x.regional_id = r.id
         and x.tipo_veiculo_id = p_tipo_veiculo_id
         and x.status
         and x.vigencia_inicio <= current_date
         and (x.vigencia_fim is null or x.vigencia_fim > current_date)
       limit 1
    ) a on true
   where is_staff()
     and (tem_acesso_global() or pode_regional(r.id))
   order by r.ativo desc, r.nome;
$$;

comment on function adicionais_risco_do_tipo(uuid) is
  'A grade do painel em Precificacao -> Tabela: uma linha por regional, com o adicional vigente e quantos veiculos ja foram precificados por ela.';

create or replace function salvar_adicional_risco(
  p_regional_id     uuid,
  p_tipo_veiculo_id uuid,
  p_valor           numeric,          -- null ou negativo = RETIRAR o adicional
  p_justificativa   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not is_admin() then
    raise exception 'Somente a matriz (admin) cadastra adicional de risco.';
  end if;
  if p_regional_id is null or p_tipo_veiculo_id is null then
    raise exception 'Informe a unidade e o tipo de veiculo.';
  end if;

  -- Encerrar a vigente e a UNICA forma de mexer: o historico do preco nao se
  -- apaga (mesma postura de `titulos_financeiros` — nada de excluir dinheiro).
  -- Encerrar com `vigencia_fim = hoje` deixaria a linha valendo ate ontem; o
  -- `status = false` e o que tira do ar AGORA sem inventar data no passado.
  update regional_adicional_risco
     set status = false, vigencia_fim = greatest(vigencia_inicio + 1, current_date)
   where regional_id = p_regional_id
     and tipo_veiculo_id = p_tipo_veiculo_id
     and status
     and (vigencia_fim is null or vigencia_fim > current_date);

  if p_valor is null or p_valor <= 0 then
    return null;   -- retirado: a regional volta ao preco da matriz
  end if;

  insert into regional_adicional_risco
    (regional_id, tipo_veiculo_id, valor, justificativa, created_by)
  values
    (p_regional_id, p_tipo_veiculo_id, round(p_valor, 2), nullif(btrim(coalesce(p_justificativa, '')), ''), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function salvar_adicional_risco(uuid, uuid, numeric, text) is
  'Troca o adicional vigente de um par (regional, tipo). Encerra o anterior em vez de apagar — o historico do preco e prova. Valor nulo/zero RETIRA o adicional.';

-- ----------------------------------------------------------------------------
-- 8. QUAL REGIONAL PRECIFICA — a do ASSOCIADO (decisão 7)
-- ----------------------------------------------------------------------------
create or replace function regional_preco_do_lead(p_lead_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $FN$
  -- O associado manda. Enquanto ele nao existe (cotacao de hotlink, primeiro
  -- contato), vale a regional do LEAD — e o fechamento da venda recalcula,
  -- mostrando a diferenca. Nunca se adivinha por CEP: nao existe de-para de
  -- abrangencia neste sistema, e inventar um na cotacao seria preco por palpite.
  select coalesce(
           (select cl.regional_id from clientes cl where cl.id = l.cliente_existente_id),
           l.regional_id
         )
    from leads l
   where l.id = p_lead_id;
$FN$;

comment on function regional_preco_do_lead(uuid) is
  'A unidade que PRECIFICA o lead: a do associado quando ele ja existe, senao a do proprio lead.';

-- A divergencia que a alcada trata: vendeu uma unidade, o associado e de outra.
create or replace function divergencia_regional_preco(p_lead_id uuid)
returns table (
  regional_preco_id   uuid,
  regional_preco_nome text,
  regional_lead_id    uuid,
  regional_lead_nome  text,
  divergente          boolean
)
language sql
stable
security definer
set search_path = public
as $FN$
  select rp.id, rp.nome, rl.id, rl.nome,
         (rp.id is not null and rl.id is not null and rp.id <> rl.id)
    from leads l
    left join regionais rp on rp.id = regional_preco_do_lead(l.id)
    left join regionais rl on rl.id = l.regional_id
   where l.id = p_lead_id
     and (is_staff() or auth.uid() is null);
$FN$;

comment on function divergencia_regional_preco(uuid) is
  'Diz se a unidade que precifica (a do associado) e outra que a que vendeu. A tela exige a MESMA alcada do desconto de venda (0028) para seguir.';

-- ----------------------------------------------------------------------------
-- 9. O snapshot chega na cotação e no veículo
--
-- Os dois sao RECRIADOS a partir do texto vivo (0070 e 0075) com a adicao
-- minima — nada mais do corpo mudou.
-- ----------------------------------------------------------------------------
create or replace function atualizar_cotacao(
  p_cotacao_id      uuid,
  p_fipe            numeric default null,
  p_tipo_veiculo_id uuid default null,
  p_cota_id         uuid default null,
  p_plano_id        uuid default null,
  p_opcionais_ids   uuid[] default null,
  p_modo_envio      text default null,
  p_desconto_percentual numeric default null,
  p_desconto_justificativa text default null,
  p_limpar_plano    boolean default false
)
returns cotacoes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg_preco uuid;
  v_adic      numeric := 0;
  c        cotacoes;
  v_lead   leads;
  v_calc   jsonb;
  v_itens  jsonb;
  v_fipe   numeric;
  v_tipo   uuid;
  v_plano  uuid;
  v_opc    uuid[];
  v_desc   numeric;
  v_reg    uuid;
  v_limite numeric;
  v_aprov  uuid;
  v_aprov_em timestamptz;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;

  select * into c from cotacoes where id = p_cotacao_id;
  if c.id is null then raise exception 'Cotacao nao encontrada'; end if;
  select * into v_lead from leads where id = c.lead_id;

  if not lead_em_negociacao(c.lead_id) then
    raise exception 'Cotacao bloqueada: o lead ja foi enviado para auditoria (status %)', v_lead.status;
  end if;

  v_fipe  := coalesce(p_fipe, c.fipe);
  v_tipo  := coalesce(p_tipo_veiculo_id, c.tipo_veiculo_id);
  -- Descer ate a base e uma escolha, nao um esquecimento: so limpa quem pediu.
  v_plano := case when p_limpar_plano then null else coalesce(p_plano_id, c.plano_id) end;
  v_opc   := coalesce(p_opcionais_ids, c.opcionais_ids, '{}'::uuid[]);
  if v_tipo is null then raise exception 'Informe o tipo de veiculo da cotacao'; end if;

  -- Motor de precos: base obrigatoria + itens do plano + opcionais escolhidos.
  -- 0081: a regional de PRECO e a do ASSOCIADO. Enquanto nao ha associado
  -- (cotacao de hotlink), vale a do lead — e o fechamento da venda recalcula.
  v_reg_preco := regional_preco_do_lead(c.lead_id);
  v_calc := cotar_plano(v_fipe, v_tipo, v_plano, v_opc, v_reg_preco);
  v_adic := coalesce((v_calc->>'adicional_regional')::numeric, 0);
  v_itens := coalesce(v_calc->'detalhamento_produtos', '[]'::jsonb);

  -- Seguranca: nenhum item obrigatorio pode ficar de fora do snapshot.
  if exists (
    select 1 from produtos_obrigatorios_cotacao(v_tipo, v_plano, v_fipe) o
     where not exists (
       select 1 from jsonb_array_elements(v_itens) i
        where (i->>'produto_id')::uuid = o.produto_id
     )
  ) then
    raise exception 'A edicao removeria itens obrigatorios do plano';
  end if;

  -- Desconto: mantem o atual quando nao informado.
  v_desc     := coalesce(p_desconto_percentual, c.desconto_percentual, 0);
  v_aprov    := c.desconto_aprovado_por;
  v_aprov_em := c.desconto_aprovado_em;

  if p_desconto_percentual is not null and p_desconto_percentual <> c.desconto_percentual then
    select coalesce(l.regional_id, u.regional_id) into v_reg
      from leads l left join usuarios u on u.id = l.consultor_id
     where l.id = c.lead_id;
    v_limite := limite_desconto_regional(v_reg);

    if v_desc > v_limite then
      -- Acima do limite: exige alcada + justificativa (a trava do trigger
      -- continua valendo para qualquer outro caminho).
      if not pode_aprovar_desconto() then
        raise exception 'DESCONTO_ACIMA_DO_LIMITE: % %% excede o limite de % %% da regional — necessaria aprovacao de gestor',
          v_desc, v_limite;
      end if;
      if p_desconto_justificativa is null or btrim(p_desconto_justificativa) = '' then
        raise exception 'Informe a justificativa da excecao de desconto';
      end if;
      v_aprov := auth.uid();
      v_aprov_em := now();
    else
      -- Dentro do limite: nao precisa de aprovacao.
      v_aprov := null;
      v_aprov_em := null;
    end if;
  end if;

  update cotacoes
     set regional_id = v_reg_preco,
         valor_adicional_regional = v_adic,
         fipe                 = v_fipe,
         tipo_veiculo_id      = v_tipo,
         cota_participacao_id = coalesce(p_cota_id, cota_participacao_id),
         plano_id             = v_plano,
         opcionais_ids        = v_opc,
         itens                = v_itens,
         total_mensalidade    = (v_calc->>'valor_total_mensalidade')::numeric,
         taxa_adesao          = coalesce((v_calc->>'taxa_adesao')::numeric, 0),
         participacao         = calcular_participacao(v_fipe, v_tipo, coalesce(p_cota_id, cota_participacao_id)),
         modo_envio           = coalesce(p_modo_envio, modo_envio),
         desconto_percentual  = v_desc,
         desconto_aprovado_por = v_aprov,
         desconto_aprovado_em  = v_aprov_em,
         desconto_justificativa = case when v_aprov is null then null
                                       else coalesce(p_desconto_justificativa, desconto_justificativa) end,
         atualizada_em        = now(),
         atualizada_por       = auth.uid()
   where id = p_cotacao_id
   returning * into c;

  return c;
end;
$$;

create or replace function autorizar_entrada_lead(p_lead_id uuid, p_cpf_cnpj text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_adic      numeric := 0;
  v_reg_preco uuid;
  l           leads;
  v_doc       text;
  v_tipo      tipo_pessoa;
  v_cliente   uuid;
  v_veiculo   uuid;
  v_pendente  text;
  v_vend      vendedores;
  v_comissao  numeric := 0;
  v_lanc      uuid;
  v_cat       uuid;
begin
  if not pode_auditar() then
    raise exception 'Sem permissao: apenas a Auditoria pode autorizar a entrada na base';
  end if;

  select * into l from leads where id = p_lead_id for update;
  if not found then raise exception 'Lead nao encontrado'; end if;
  if l.status <> 'EM_AUDITORIA' then
    raise exception 'Lead nao esta Em Auditoria (status atual: %)', l.status;
  end if;
  if l.veiculo_id is not null then raise exception 'Lead ja foi convertido'; end if;

  if p_cpf_cnpj is not null then
    update leads set cpf_cnpj = regexp_replace(p_cpf_cnpj, '[^0-9]', '', 'g')
     where id = p_lead_id;
    select * into l from leads where id = p_lead_id;
  end if;

  -- TRAVA: o veiculo so entra na base com a ficha completa.
  select string_agg(item, '; ') into v_pendente
    from checklist_lead(p_lead_id) where not ok;
  if v_pendente is not null then
    raise exception 'Cadastro incompleto - falta: %', v_pendente
      using errcode = 'check_violation';
  end if;

  v_doc  := regexp_replace(coalesce(l.cpf_cnpj, ''), '[^0-9]', '', 'g');
  v_tipo := coalesce(l.tipo_pessoa, (case when length(v_doc) > 11 then 'PJ' else 'PF' end)::tipo_pessoa);

  -- Associado: reaproveita pelo documento (atualizando a ficha) ou cria.
  select id into v_cliente from clientes where cpf_cnpj = v_doc;
  if v_cliente is null then
    insert into clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, rg_ie, email, telefone,
                          endereco, regional_id)
    values (v_tipo, l.nome, v_doc, l.rg_ie, l.email, l.celular, l.endereco, l.regional_id)
    returning id into v_cliente;
  else
    update clientes set
      nome_razao_social = coalesce(nullif(l.nome, ''), nome_razao_social),
      rg_ie             = coalesce(nullif(l.rg_ie, ''), rg_ie),
      email             = coalesce(nullif(l.email, ''), email),
      telefone          = coalesce(nullif(l.celular, ''), telefone),
      endereco          = case when l.endereco = '{}'::jsonb then endereco else l.endereco end
    where id = v_cliente;
  end if;

  -- Veiculo oficial, agora com a ficha completa.
  -- ADICIONAL DE RISCO (0081): sai da COTACAO, nao do cadastro de hoje. A
  -- cotacao e a prova do preco que o associado aceitou; se a unidade reajustou
  -- o adicional entre o aceite e a auditoria, cobrar o novo quebraria o aceite.
  select coalesce(c.valor_adicional_regional, 0), c.regional_id
    into v_adic, v_reg_preco
    from cotacoes c
   where c.lead_id = p_lead_id
   order by (c.id = l.aceite_cotacao_id) desc, c.created_at desc
   limit 1;

  insert into veiculos (cliente_id, placa, chassi, renavam, numero_motor, marca, modelo,
                        ano_fabricacao, ano_modelo, cor, valor_fipe, codigo_fipe, combustivel, uso,
                        tipo_veiculo_id, cota_participacao_id, modelo_id, regional_id,
                        vendedor_id, plano_protecao_id, status,
                        valor_adicional_regional, regional_preco_id)
  values (v_cliente, upper(l.placa),
          nullif(upper(regexp_replace(coalesce(l.chassi, ''), '[^0-9A-Za-z]', '', 'g')), ''),
          nullif(regexp_replace(coalesce(l.renavam, ''), '[^0-9]', '', 'g'), ''),
          nullif(upper(btrim(coalesce(l.numero_motor, ''))), ''),
          l.marca, l.modelo, l.ano_fabricacao, l.ano_modelo, l.cor, l.valor_fipe, l.codigo_fipe,
          l.combustivel, l.uso, l.tipo_veiculo_id, l.cota_participacao_id, l.modelo_id,
          l.regional_id, l.vendedor_id, l.plano_id, 'ativo',
          coalesce(v_adic, 0), v_reg_preco)
  returning id into v_veiculo;

  -- A vistoria feita na venda passa a ser a vistoria do veiculo.
  update vistorias set veiculo_id = v_veiculo, status = 'APROVADA'
   where lead_id = p_lead_id and veiculo_id is null;

  -- ---------------------------------------------------------------- adesao
  select * into v_vend from vendedores where id = l.vendedor_id;
  v_comissao := round(coalesce(l.adesao_valor, 0) * coalesce(v_vend.taxa_comissao_adesao, 0), 2);

  if l.adesao_forma::text = 'VENDEDOR_NA_HORA' then
    -- O dinheiro nunca passou pela associacao: NADA entra no financeiro.
    -- Fica so o registro da comissao, ja quitada na origem.
    insert into comissoes_vendas (vendedor_id, veiculo_id, valor_comissao, is_adesao, status_pagamento)
    values (l.vendedor_id, v_veiculo, coalesce(l.adesao_valor, 0), true, 'pago');
  else
    -- Recebido pelo nosso sistema: vira titulo a receber e a comissao do
    -- vendedor nasce PENDENTE (sai depois, no repasse).
    select id into v_cat from categorias_dre where codigo_estruturado = '1.1.01';
    insert into lancamentos_financeiros
      (tipo, cliente_id, descricao, categoria_dre_id, regional_id, valor_original,
       data_emissao, data_vencimento, competencia, forma_pagamento_prevista, observacoes)
    values ('RECEITA', v_cliente,
            'Taxa de adesao - ' || upper(l.placa),
            v_cat, l.regional_id, l.adesao_valor,
            current_date, coalesce(l.adesao_recebida_em, current_date), current_date,
            (case l.adesao_forma::text when 'BOLETO' then 'BOLETO'
                                       when 'PIX' then 'PIX'
                                       else 'CARTAO' end)::forma_pagamento,
            'Adesao da venda ' || p_lead_id::text)
    returning id into v_lanc;

    insert into comissoes_vendas (vendedor_id, veiculo_id, valor_comissao, is_adesao, status_pagamento)
    values (l.vendedor_id, v_veiculo, v_comissao, true, 'pendente');
  end if;

  update leads set
    status = 'ATIVO', cliente_id = v_cliente, veiculo_id = v_veiculo,
    cpf_cnpj = v_doc, auditado_em = now(), auditado_por = auth.uid()
  where id = p_lead_id;

  return v_veiculo;
end;
$$;

-- ============================================================================
-- Rito de seguranca (0052): funcao nasce com EXECUTE para PUBLIC.
-- ============================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
