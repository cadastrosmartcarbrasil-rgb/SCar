-- =============================================================================
-- 0164 — PROPOSTA COMERCIAL v2: km do reboque por tipo de veiculo e validade
--
-- Pedido do usuario (30/10/2026), na nova proposta de 3 paginas:
--  (A) a tabela da Assistencia 24h e igual para todos, menos o LIMITE DO
--      REBOQUE, que muda conforme o tipo de veiculo (carro, moto, pesado).
--      Nao existia campo para isso: `servicos_assistencia.km_franquia` e custo
--      do prestador, nao beneficio do associado. Decisao: por TIPO DE VEICULO.
--      Nulo = nao informado (a proposta diz "conforme o tipo do veiculo");
--      nada e semeado de proposito — o km e do manual, nao de palpite.
--  (B) validade da proposta configuravel em Empresa (padrao 30 dias).
-- So colunas; nenhuma funcao nova, nenhum preco muda.
-- =============================================================================

alter table tipos_veiculo
  add column if not exists km_reboque_ida   integer,
  add column if not exists km_reboque_volta integer;

alter table tipos_veiculo drop constraint if exists chk_tipo_km_reboque;
alter table tipos_veiculo add constraint chk_tipo_km_reboque check (
  (km_reboque_ida is null or km_reboque_ida between 0 and 5000)
  and (km_reboque_volta is null or km_reboque_volta between 0 and 5000)
);

comment on column tipos_veiculo.km_reboque_ida is
  '0164: km do reboque da Assistencia 24h (ida) mostrado na proposta. Nulo = nao informado.';
comment on column tipos_veiculo.km_reboque_volta is
  '0164: km do reboque da Assistencia 24h (volta) mostrado na proposta. Nulo = nao informado.';

alter table empresa
  add column if not exists validade_proposta_dias integer not null default 30;

alter table empresa drop constraint if exists chk_empresa_validade_proposta;
alter table empresa add constraint chk_empresa_validade_proposta
  check (validade_proposta_dias between 1 and 180);

comment on column empresa.validade_proposta_dias is
  '0164: dias de validade da proposta comercial, contados da data da cotacao.';
