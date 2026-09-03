-- ============================================================================
-- SCar :: 0047_vistoria_anexo_peso.sql
--
-- A AUDITORIA precisa CONFERIR a foto, nao so saber que existe.
--
-- Ate aqui `vistoria_anexos` guardava o caminho no bucket e o nome do arquivo.
-- Quem audita abria uma aba por foto para ver se subiu inteira — e nao tinha
-- como saber QUANDO foi enviada nem se o arquivo e um monstro de 12 MB tirado
-- do celular. Duas coisas entram aqui:
--
--   (A) `tamanho_bytes` e `enviado_por` no anexo, com TETO DE 10 MB no proprio
--       banco. A compressao acontece no navegador (lado maior 1600px, JPEG),
--       mas regra que so vive na tela nao e regra: o teto fica na tabela.
--       Linha antiga fica com `tamanho_bytes` nulo e continua valendo.
--
--   (B) `fotos_vistoria_lead` devolvendo `enviada_em`, `tamanho_bytes` e o
--       nome do arquivo — e o que a aba de vistoria mostra embaixo de cada
--       miniatura. Muda a lista de colunas de OUT, entao e drop + create.
-- ============================================================================

alter table vistoria_anexos
  add column if not exists tamanho_bytes bigint,
  add column if not exists enviado_por   uuid references usuarios(id) on delete set null;

comment on column vistoria_anexos.tamanho_bytes is
  'Peso do arquivo apos a compressao do navegador. Nulo = anexo anterior a 0047.';

-- O teto vale para qualquer caminho (tela, script, API). A foto ja subiu para
-- o bucket quando esta linha e gravada: se o insert falhar, quem envia remove
-- o arquivo (e o que o hook `useAddFotoVistoria` faz).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_vistoria_anexo_tamanho') then
    alter table vistoria_anexos add constraint chk_vistoria_anexo_tamanho
      check (tamanho_bytes is null or tamanho_bytes <= 10485760);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- A lista de poses, agora com o que a conferencia precisa ver
-- ----------------------------------------------------------------------------
drop function if exists fotos_vistoria_lead(uuid);

create or replace function fotos_vistoria_lead(p_lead_id uuid)
returns table (
  codigo        text,
  nome          text,
  instrucao     text,
  obrigatorio   boolean,
  ordem         smallint,
  anexo_id      uuid,
  url           text,
  enviada       boolean,
  enviada_em    timestamptz,
  tamanho_bytes bigint,
  arquivo       text
)
language sql
stable
security definer
set search_path = public
as $$
  with l as (select * from leads where id = p_lead_id),
  vist as (
    select id from vistorias where lead_id = p_lead_id
     order by created_at desc limit 1
  ),
  modelo as (
    select m.* from vistoria_fotos_modelo m, l
     where m.ativo
       and (m.tipo_veiculo_id is null or m.tipo_veiculo_id = l.tipo_veiculo_id)
  ),
  -- uma foto por pose: se o vendedor repetir, vale a mais recente
  foto as (
    select distinct on (upper(coalesce(a.tipo, ''))) upper(coalesce(a.tipo, '')) as codigo,
           a.id, a.url, a.created_at, a.tamanho_bytes, a.descricao
      from vistoria_anexos a
     where a.vistoria_id = (select id from vist)
     -- `a.id` desempata: dois anexos gravados na MESMA transacao tem o mesmo
     -- `created_at` (o default e `now()`), e sem isto a escolha seria arbitraria.
     order by upper(coalesce(a.tipo, '')), a.created_at desc, a.id desc
  )
  select m.codigo, m.nome, m.instrucao, m.obrigatorio, m.ordem,
         f.id, f.url, f.id is not null,
         f.created_at, f.tamanho_bytes, f.descricao
    from modelo m
    left join foto f on f.codigo = m.codigo
   order by m.ordem, m.codigo;
$$;

grant execute on function fotos_vistoria_lead(uuid) to authenticated;
