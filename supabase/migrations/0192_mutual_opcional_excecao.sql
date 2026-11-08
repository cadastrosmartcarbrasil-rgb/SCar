-- =====================================================================
-- 0192 — EXCECAO POR VEICULO NOS OPCIONAIS DO MUTUAL
-- ---------------------------------------------------------------------
-- A API do Mutual (/contract/contract_object_product/) as vezes devolve um
-- beneficio que a TELA do Mutual mostra como nao contratado, e o item nao
-- traz campo nenhum que diferencie (conferido em 08/11/2026: OVS1811 vem com
-- "Protecao a terceiros" 4088 e no Mutual esta sem terceiros). Como a rotina
-- diaria regrava os opcionais pelo que a API entrega, retirar a mao nao
-- adianta: volta no dia seguinte.
-- Excecao = (veiculo, produto do SCar) que a gravacao nunca coloca. So recria
-- mutual_opcionais_do_de_para (mesma assinatura) com a condicao.
-- =====================================================================

create table if not exists mutual_opcional_excecoes (
  veiculo_id  uuid not null references veiculos(id) on delete cascade,
  produto_id  uuid not null references produtos(id) on delete cascade,
  motivo      text not null,
  criado_por  uuid references usuarios(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (veiculo_id, produto_id),
  constraint chk_mutual_opcional_excecao_motivo check (length(btrim(motivo)) >= 5)
);

comment on table mutual_opcional_excecoes is
  '0192: opcional do de-para do Mutual que NAO vai para o veiculo (a API entrega, a tela do Mutual diz que nao foi contratado).';

alter table mutual_opcional_excecoes enable row level security;
drop policy if exists mutual_opcional_excecoes_select on mutual_opcional_excecoes;
create policy mutual_opcional_excecoes_select on mutual_opcional_excecoes
  for select to authenticated using ((select is_staff()));
revoke all on mutual_opcional_excecoes from anon;
grant select on mutual_opcional_excecoes to authenticated;

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
   where not exists (select 1 from mutual_opcional_excecoes e
                      where e.veiculo_id = a.veiculo_id and e.produto_id = a.produto_id)
$$;

comment on function mutual_opcionais_do_de_para(uuid) is
  '0192: opcionais do de-para dos produtos do Mutual por veiculo, sem as excecoes de mutual_opcional_excecoes.';

-- Conferido no Mutual em 08/11/2026: OVS1811 sem terceiros.
insert into mutual_opcional_excecoes (veiculo_id, produto_id, motivo)
select v.id, p.id, 'No Mutual sem protecao a terceiros (conferido em 08/11/2026); a API devolve a opcao 4088'
  from veiculos v, produtos p
 where v.placa = 'OVS1811' and p.nome = 'RCF-Terceiros 50mil'
on conflict do nothing;

-- Rito da 0052.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
