-- ============================================================================
-- SCar :: 0080_cores_veiculo.sql
--
-- O CATALOGO DE CORES DO VEICULO. Ate aqui `veiculos.cor` e `leads.cor` eram
-- TEXTO LIVRE, escrito por tres caminhos que nunca combinaram entre si:
--   1. digitacao na ficha (/veiculos e o <FechamentoVenda>);
--   2. a consulta por placa (0075), que traz a cor do REGISTRO do documento;
--   3. a carga do Mutual (Fase 3), que traz `vehicle_color_id` de /vehicle/color/.
-- O resultado e o que o usuario chamou de "cores atrapalhadas": PRATA, Prata,
-- prata metalico e PRATA METALICO sao quatro cores diferentes para o banco, e
-- qualquer filtro, contagem ou relatorio por cor mente.
--
-- ---------------------------------------------------------------------------
-- AS SEIS DECISOES QUE MORAM AQUI (leia antes de mexer)
-- ---------------------------------------------------------------------------
-- (1) O VOCABULARIO E O DO DOCUMENTO (DENATRAN), nao uma paleta comercial.
--     A cor chega, na maioria dos casos, da consulta por placa — que le o
--     registro do CRLV, e o CRLV tem DEZESSEIS cores e so essas. Semear
--     "PRATA PEROLA" seria criar vocabulario que o documento nao tem.
--
-- (2) `cor` CONTINUA SENDO TEXTO, e e ELE que e padronizado.
--     Trocar a coluna por `cor_id` obrigaria a mexer em todo leitor que ja
--     existe (`autorizar_entrada_lead` 0034/0075, o SAC, o portal, a ficha) por
--     um ganho que o trigger abaixo ja entrega. `cor_id` entra AO LADO, opcional
--     — exatamente o que `modelos.id` -> `veiculos.modelo_id` fez na 0016.
--
-- (3) COR DESCONHECIDA ENTRA E E RELATADA, NUNCA RECUSADA.
--     Recusar no balcao, com o cliente na frente, uma cor que o documento traz
--     e o catalogo ainda nao conhece e trocar um dado impreciso por nenhuma
--     venda. Mesma escolha do `numero_motor` (0075): divergencia aqui e
--     RELATORIO (`cores_nao_reconhecidas`), nao constraint.
--
-- (4) APELIDO E TABELA, NAO ARRAY. O unique no apelido normalizado e o que
--     impede "GRAFITE" apontar para CINZA e para PRETO ao mesmo tempo. Array
--     em coluna nao da essa garantia.
--
-- (5) A PRIMEIRA PALAVRA E FALLBACK DELIBERADO. "PRATA METALICO",
--     "AZUL ESCURO", "BRANCO PEROLA" — a primeira palavra ja e uma cor do
--     catalogo. Sem esse degrau o de-para resolve uma fracao do que o documento
--     manda, e o resto vira fila manual. Ele so casa quando a primeira palavra
--     E um nome (ou apelido) do catalogo: nao e busca aproximada.
--
-- (6) O TRIGGER REESCREVE `cor` PARA O NOME CANONICO quando resolve — e isso e
--     o que "padronizar" significa. Quando NAO resolve, guarda o texto como veio
--     (em caixa alta, convencao de cadastro) e deixa `cor_id` nulo: o dado nao
--     se perde, ele fica na fila. E quem escreve `cor_id` (a carga) ganha o
--     texto de volta pelo catalogo — vale o lado que o chamador MUDOU.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. O catalogo
-- ----------------------------------------------------------------------------
create table if not exists cores (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,          -- canonico, CAIXA ALTA, sem acento
  hex        text,                          -- amostra para a tela; nao e regra
  ordem      smallint not null default 100,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_cor_hex check (hex is null or hex ~ '^#[0-9A-Fa-f]{6}$')
);

comment on table cores is
  'Catalogo de cores do VEICULO (vocabulario do CRLV/DENATRAN). NAO e a paleta visual do sistema — essa vive em globals.css e, no white-label, em empresa.';
comment on column cores.hex is
  'Amostra para o seletor da tela. Cor de veiculo nao tem hex exato; serve para reconhecer, nao para pintar.';

create table if not exists cor_apelidos (
  id      uuid primary key default gen_random_uuid(),
  cor_id  uuid not null references cores(id) on delete cascade,
  apelido text not null,                    -- ja normalizado por cor_normalizada
  constraint uq_cor_apelido unique (apelido)
);

comment on table cor_apelidos is
  'Como o mundo escreve cada cor (PRATEADO, BORDO, GRAFITE). O unique e no APELIDO, nao no par: um apelido nao pode apontar para duas cores.';
create index if not exists idx_cor_apelidos_cor on cor_apelidos (cor_id);

drop trigger if exists trg_cores_updated on cores;
create trigger trg_cores_updated before update on cores
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Normalizacao e resolucao
--
-- `cor_normalizada` reusa o `texto_sem_acento` da 0079 (IMMUTABLE, dicionario
-- fixo) — nao criar um segundo normalizador no projeto.
-- ----------------------------------------------------------------------------
create or replace function cor_normalizada(p_texto text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select nullif(
           btrim(regexp_replace(
             upper(texto_sem_acento(coalesce(p_texto, ''))),
             '[^A-Z0-9]+', ' ', 'g')),
           '');
$$;

comment on function cor_normalizada(text) is
  'CAIXA ALTA, sem acento, pontuacao virando espaco e espaco unico. A chave de comparacao do catalogo.';

create or replace function cor_do_texto(p_texto text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  -- SECURITY DEFINER porque o TRIGGER precisa enxergar o catalogo escreva quem
  -- escrever (staff, service_role do hotlink, a carga). O catalogo nao tem dado
  -- sensivel — sao dezesseis nomes de cor.
  with alvo as (select cor_normalizada(p_texto) as t),
       palavra as (select split_part((select t from alvo), ' ', 1) as p)
  select coalesce(
    -- 1. nome exato
    (select c.id from cores c, alvo a
      where c.ativo and cor_normalizada(c.nome) = a.t limit 1),
    -- 2. apelido exato
    (select ap.cor_id from cor_apelidos ap join cores c on c.id = ap.cor_id, alvo a
      where c.ativo and ap.apelido = a.t limit 1),
    -- 3. primeira palavra e um nome do catalogo  ("PRATA METALICO" -> PRATA)
    (select c.id from cores c, palavra w
      where c.ativo and w.p <> '' and cor_normalizada(c.nome) = w.p limit 1),
    -- 4. primeira palavra e um apelido          ("PRATEADO FOSCO" -> PRATA)
    (select ap.cor_id from cor_apelidos ap join cores c on c.id = ap.cor_id, palavra w
      where c.ativo and w.p <> '' and ap.apelido = w.p limit 1)
  );
$$;

comment on function cor_do_texto(text) is
  'Texto livre -> cor do catalogo, em quatro degraus (nome, apelido, primeira palavra como nome, primeira palavra como apelido). NULL = nao reconhecida: entra assim mesmo e aparece em cores_nao_reconhecidas().';

-- ----------------------------------------------------------------------------
-- 3. Seed: as 16 cores do CRLV
-- ----------------------------------------------------------------------------
insert into cores (nome, hex, ordem)
select v.nome, v.hex, v.ordem
  from (values
    ('BRANCO',   '#F5F7FA',  10),
    ('PRATA',    '#C0C5CE',  20),
    ('PRETO',    '#111827',  30),
    ('CINZA',    '#6B7280',  40),
    ('VERMELHO', '#DC2626',  50),
    ('AZUL',     '#1D4ED8',  60),
    ('VERDE',    '#16A34A',  70),
    ('AMARELO',  '#F5C518',  80),
    ('MARROM',   '#6B4423',  90),
    ('BEGE',     '#D8C9A3', 100),
    ('LARANJA',  '#EA580C', 110),
    ('DOURADO',  '#C9A227', 120),
    ('GRENA',    '#6E1423', 130),
    ('ROSA',     '#EC4899', 140),
    ('ROXO',     '#7C3AED', 150),
    ('FANTASIA', '#94A3B8', 160)
  ) as v(nome, hex, ordem)
 where not exists (select 1 from cores c where c.nome = v.nome);

-- Apelidos: so os que sao CERTOS. O que nao e certo vai para a fila de
-- `cores_nao_reconhecidas()` e alguem decide — mapear no escuro e a mesma
-- familia de erro de `DIFICULDADE FINANCEIRA` no de-para do Mutual (0065).
insert into cor_apelidos (cor_id, apelido)
select c.id, cor_normalizada(v.apelido)
  from (values
    ('BRANCO',   'BRANCA'),   ('BRANCO',   'WHITE'),    ('BRANCO',   'PEROLA'),
    ('PRATA',    'PRATEADO'), ('PRATA',    'PRATEADA'), ('PRATA',    'SILVER'),
    ('PRETO',    'PRETA'),    ('PRETO',    'BLACK'),
    ('CINZA',    'GRAFITE'),  ('CINZA',    'CHUMBO'),   ('CINZA',    'GRAY'),
    ('CINZA',    'GREY'),
    ('VERMELHO', 'VERMELHA'), ('VERMELHO', 'RED'),
    ('AZUL',     'BLUE'),
    ('VERDE',    'GREEN'),
    ('AMARELO',  'AMARELA'),  ('AMARELO',  'YELLOW'),
    ('MARROM',   'CAFE'),     ('MARROM',   'BROWN'),
    ('BEGE',     'CREME'),    ('BEGE',     'AREIA'),
    ('LARANJA',  'ORANGE'),
    ('DOURADO',  'DOURADA'),  ('DOURADO',  'OURO'),     ('DOURADO',  'GOLD'),
    ('GRENA',    'BORDO'),    ('GRENA',    'VINHO'),    ('GRENA',    'GRANA'),
    ('ROXO',     'VIOLETA'),  ('ROXO',     'LILAS'),
    ('FANTASIA', 'MULTICOLOR')
  ) as v(cor, apelido)
  join cores c on c.nome = v.cor
 where not exists (
   select 1 from cor_apelidos a where a.apelido = cor_normalizada(v.apelido)
 );

-- ----------------------------------------------------------------------------
-- 4. A coluna nas duas pontas
--
-- Nas DUAS de proposito: o veiculo nasce por dois caminhos (cadastro direto e a
-- rota da venda), e so em `veiculos` faria a cor do LEAD seguir livre ate a
-- auditoria — que e justamente onde a consulta por placa escreve primeiro.
-- Mesmo raciocinio do `numero_motor` (0075).
-- ----------------------------------------------------------------------------
alter table veiculos add column if not exists cor_id uuid references cores(id) on delete set null;
alter table leads    add column if not exists cor_id uuid references cores(id) on delete set null;

create index if not exists idx_veiculos_cor on veiculos (cor_id);
create index if not exists idx_leads_cor    on leads (cor_id);

comment on column veiculos.cor_id is
  'Cor do catalogo (0080). `cor` continua sendo o texto, canonizado pelo trigger; este e o handle estavel para filtro e carga.';
comment on column leads.cor_id is
  'Cor do catalogo (0080). Ver veiculos.cor_id.';

-- ----------------------------------------------------------------------------
-- 5. O trigger — um so, servindo as duas tabelas
--
-- Vale o lado que o CHAMADOR MUDOU: quem digitou a cor manda sobre o id antigo;
-- quem gravou o id (a carga do Mutual) ganha o texto pelo catalogo. Sem essa
-- distincao, um dos dois caminhos seria desfeito em silencio.
-- ----------------------------------------------------------------------------
create or replace function fn_padronizar_cor()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_id    uuid;
  v_nome  text;
  v_texto boolean;   -- o chamador mexeu no TEXTO?
  v_ident boolean;   -- o chamador mexeu no ID?
begin
  v_texto := case when tg_op = 'INSERT' then new.cor    is not null
                  else new.cor    is distinct from old.cor    end;
  v_ident := case when tg_op = 'INSERT' then new.cor_id is not null
                  else new.cor_id is distinct from old.cor_id end;

  -- So o ID mudou (a carga, uma API): o texto vem do catalogo. Se os dois
  -- mudaram, o TEXTO vence — e quem digitou que esta com o documento na mao.
  if v_ident and not v_texto and new.cor_id is not null then
    select c.nome into v_nome from cores c where c.id = new.cor_id;
    if v_nome is not null then
      new.cor := v_nome;
      return new;
    end if;
  end if;

  if cor_normalizada(new.cor) is null then
    -- Vazio vira NULL, nunca '' (a mordida de fornecedores.documento, 0051).
    new.cor    := null;
    new.cor_id := null;
    return new;
  end if;

  v_id := cor_do_texto(new.cor);

  if v_id is not null then
    select c.nome into v_nome from cores c where c.id = v_id;
    new.cor_id := v_id;
    new.cor    := v_nome;
  else
    new.cor_id := null;
    -- Nao reconhecida: entra como veio, so em caixa alta e com espaco unico.
    -- O acento e PRESERVADO aqui — a fila de revisao e lida por gente.
    new.cor := upper(btrim(regexp_replace(new.cor, '\s+', ' ', 'g')));
  end if;

  return new;
end;
$$;

comment on function fn_padronizar_cor() is
  'Canoniza veiculos.cor/leads.cor pelo catalogo e resolve cor_id. Cor desconhecida NAO e recusada: entra e vai para cores_nao_reconhecidas().';

-- `create trigger` nao aceita `if not exists` (gotcha 0044/0049).
drop trigger if exists trg_veiculo_cor on veiculos;
create trigger trg_veiculo_cor
  before insert or update of cor, cor_id on veiculos
  for each row execute function fn_padronizar_cor();

drop trigger if exists trg_lead_cor on leads;
create trigger trg_lead_cor
  before insert or update of cor, cor_id on leads
  for each row execute function fn_padronizar_cor();

-- ----------------------------------------------------------------------------
-- 6. Backfill do que ja esta na base
--
-- Explicito, e nao "update cor = cor" para deixar o trigger fazer: `update of`
-- dispara pela MENCAO da coluna, entao o trigger cairia no ramo do id e o
-- backfill nao aconteceria. Os triggers de veiculos que importam sao todos
-- `update of status` — este UPDATE nao acorda cobranca, ativacao nem saida.
-- ----------------------------------------------------------------------------
update veiculos set cor = null where cor is not null and btrim(cor) = '';
update leads    set cor = null where cor is not null and btrim(cor) = '';

update veiculos v
   set cor_id = cor_do_texto(v.cor),
       cor    = coalesce(
                  (select c.nome from cores c where c.id = cor_do_texto(v.cor)),
                  upper(btrim(regexp_replace(v.cor, '\s+', ' ', 'g')))
                )
 where v.cor is not null;

update leads l
   set cor_id = cor_do_texto(l.cor),
       cor    = coalesce(
                  (select c.nome from cores c where c.id = cor_do_texto(l.cor)),
                  upper(btrim(regexp_replace(l.cor, '\s+', ' ', 'g')))
                )
 where l.cor is not null;

-- ----------------------------------------------------------------------------
-- 7. Consulta e diagnostico
-- ----------------------------------------------------------------------------
create or replace function cores_listar(p_incluir_inativas boolean default false)
returns table (
  id         uuid,
  nome       text,
  hex        text,
  ordem      smallint,
  ativo      boolean,
  apelidos   text[],
  veiculos   bigint,
  leads      bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.nome, c.hex, c.ordem, c.ativo,
         coalesce((select array_agg(a.apelido order by a.apelido)
                     from cor_apelidos a where a.cor_id = c.id), '{}'::text[]),
         (select count(*) from veiculos v where v.cor_id = c.id),
         (select count(*) from leads    l where l.cor_id = c.id)
    from cores c
   where is_staff()
     and (coalesce(p_incluir_inativas, false) or c.ativo)
   order by c.ordem, c.nome;
$$;

comment on function cores_listar(boolean) is
  'O catalogo para a tela, com os apelidos e quantos registros usam cada cor (o numero que diz se da para inativar).';

create or replace function cores_nao_reconhecidas()
returns table (
  cor        text,
  veiculos   bigint,
  leads      bigint,
  total      bigint
)
language sql
stable
security definer
set search_path = public
as $$
  -- A FILA DE TRABALHO do catalogo. Sem ela, "cor desconhecida entra" viraria
  -- "cor desconhecida some" — que e o gotcha do campo que ninguem le (0068).
  with tudo as (
    select v.cor as texto, 1 as e_veiculo, 0 as e_lead
      from veiculos v where v.cor is not null and v.cor_id is null
    union all
    select l.cor, 0, 1
      from leads l where l.cor is not null and l.cor_id is null
  )
  select t.texto,
         sum(t.e_veiculo)::bigint,
         sum(t.e_lead)::bigint,
         count(*)::bigint
    from tudo t
   where is_staff()
   group by t.texto
   order by count(*) desc, t.texto;
$$;

comment on function cores_nao_reconhecidas() is
  'O texto de cor que o catalogo nao reconheceu, com quantos registros dependem dele. Vira apelido novo ou cor nova.';

-- ----------------------------------------------------------------------------
-- 8. O de-para do MUTUAL (/vehicle/color/)
--
-- Regra da 0064, repetida aqui porque ela ja custou duas rodadas neste modulo:
-- enquanto ninguem CAPTUROU a entidade, o diagnostico manda PUXAR — nao acusa
-- o dado. E nao se chuta o nome da chave do payload: `mutual_texto_em` (0073)
-- existe exatamente para isso.
-- ----------------------------------------------------------------------------
create or replace function mutual_cor_do_externo(p_id_externo text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cor_do_texto(
           mutual_texto_em(mc.payload,
             array['name', 'description', 'descricao', 'nome', 'color', 'cor'])
         )
    from mutual_captura mc
   where mc.entidade = 'VEHICLE_COLOR'
     and mc.id_externo = mutual_texto(p_id_externo)
     and not mc.deletado
   limit 1;
$$;

comment on function mutual_cor_do_externo(text) is
  'vehicle_color_id do Mutual -> cor do catalogo, pelo payload de /vehicle/color/ ja capturado. NULL = nao capturado ou vocabulario novo.';

create or replace function mutual_cores_nao_mapeadas()
returns table (
  id_externo text,
  descricao  text,
  situacao   text
)
language sql
stable
security definer
set search_path = public
as $$
  select mc.id_externo,
         mutual_texto_em(mc.payload,
           array['name', 'description', 'descricao', 'nome', 'color', 'cor']),
         case
           when mutual_texto_em(mc.payload,
                  array['name','description','descricao','nome','color','cor']) is null
             then 'PAYLOAD SEM DESCRICAO'
           else 'VOCABULARIO NOVO — vira apelido ou cor nova'
         end
    from mutual_captura mc
   where is_staff()
     and mc.entidade = 'VEHICLE_COLOR'
     and not mc.deletado
     and mutual_cor_do_externo(mc.id_externo) is null
   order by mc.id_externo;
$$;

comment on function mutual_cores_nao_mapeadas() is
  'A cor do Mutual que o nosso catalogo nao reconhece. Vazio com /vehicle/color/ capturado = de-para completo; vazio SEM captura nao prova nada (regra da 0064).';

-- ----------------------------------------------------------------------------
-- 9. RLS — mesmo desenho de marcas/modelos (0007): staff le, matriz mantem
-- ----------------------------------------------------------------------------
alter table cores        enable row level security;
alter table cor_apelidos enable row level security;

drop policy if exists cores_select on cores;
create policy cores_select on cores for select to authenticated using (is_staff());
drop policy if exists cores_write on cores;
create policy cores_write on cores for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

drop policy if exists cor_apelidos_select on cor_apelidos;
create policy cor_apelidos_select on cor_apelidos for select to authenticated using (is_staff());
drop policy if exists cor_apelidos_write on cor_apelidos;
create policy cor_apelidos_write on cor_apelidos for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

grant select, insert, update, delete on cores        to authenticated;
grant select, insert, update, delete on cor_apelidos to authenticated;

-- ----------------------------------------------------------------------------
-- Rito de seguranca (0052): funcao nasce com EXECUTE para PUBLIC.
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
