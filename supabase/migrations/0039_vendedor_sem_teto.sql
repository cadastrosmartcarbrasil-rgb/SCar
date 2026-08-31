-- ============================================================================
-- SCar :: 0039_vendedor_sem_teto.sql
-- O vendedor nao ve o TETO de comissao da franquia.
--
-- `vendedor_perfil()` (0038) devolvia `teto_adesao`/`teto_recorrente` para o
-- portal mostrar "sua comissao x teto da franquia". Isso e informacao da
-- NEGOCIACAO entre a matriz e a franquia: o vendedor precisa saber o percentual
-- DELE, e so. Como remover coluna de OUT muda a assinatura da funcao, ela e
-- derrubada e recriada.
--
-- `listar_vendedores` (0035) segue como esta: ela ja limita por
-- `tem_acesso_global() or pode_regional(v.regional_id)`, entao o gestor da
-- franquia so enxerga a propria equipe — e por isso ele pode cadastrar e
-- editar o vendedor de dentro do portal, sem passar pelo sistema de gestao.
-- ============================================================================

drop function if exists vendedor_perfil();

create or replace function vendedor_perfil()
returns table (
  id                    uuid,
  nome                  text,
  email                 text,
  telefone              text,
  documento             text,
  codigo                text,
  regional_nome         text,
  banco                 text,
  agencia               text,
  conta                 text,
  chave_pix             text,
  taxa_adesao           numeric,
  taxa_recorrente       numeric,
  dia_entrada           smallint,
  dia_recorrencia       smallint,
  entrada_herdada       boolean,
  recorrencia_herdada   boolean,
  contrato_url          text,
  boas_vindas_enviada_em timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with eu as (select vendedor_atual() as id),
  prazo as (select * from prazo_pagamento_vendedor((select id from eu)))
  select v.id, coalesce(v.nome, u.nome), coalesce(v.email, u.email), v.telefone,
         v.documento, v.codigo, r.nome,
         v.banco, v.agencia, v.conta, v.chave_pix,
         v.taxa_comissao_adesao, v.taxa_comissao_recorrente,
         (select dia_entrada from prazo), (select dia_recorrencia from prazo),
         (select entrada_herdada from prazo), (select recorrencia_herdada from prazo),
         v.contrato_url, v.boas_vindas_enviada_em
    from vendedores v
    left join usuarios  u on u.id = v.usuario_id
    left join regionais r on r.id = v.regional_id
   where v.id = (select id from eu);
$$;

comment on function vendedor_perfil() is
  'Cadastro do proprio vendedor. NAO devolve o teto de comissao da franquia: '
  'isso e da negociacao matriz-franquia, nao do vendedor.';

grant execute on function vendedor_perfil() to authenticated;
