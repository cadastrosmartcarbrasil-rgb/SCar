-- ============================================================================
-- SCar :: 0040_vistoria_modelo_fotos.sql
-- VISTORIA COM MODELO DE FOTOS + a vistoria do vendedor no portal.
--
-- Duas coisas que faltavam para o vendedor fechar a venda pelo celular:
--
-- (A) CATALOGO DE POSES. Ate aqui a regra era "no minimo 4 fotos" — e quatro
--     fotos da frente do carro passavam. Agora existe `vistoria_fotos_modelo`:
--     cada foto tem codigo, nome, instrucao de enquadramento e se e
--     obrigatoria. O app mostra a lista, o vendedor bate uma a uma e o
--     `checklist_lead` passa a exigir as POSES obrigatorias, nao um numero.
--     O codigo da pose fica em `vistoria_anexos.tipo`, coluna que ja existia.
--     `tipo_veiculo_id` nulo = vale para todos; preenchido = so aquele tipo
--     (uma moto nao tem as mesmas fotos de um carro).
--
-- (B) RLS DA VISTORIA PELO VENDEDOR. As policies de 0034 enxergavam o lead por
--     `consultor_id`/`created_by`/regional. O lead que chega pelo HOTLINK e
--     criado pelo service_role e so tem `vendedor_id` — logo o dono do link nao
--     conseguiria abrir a vistoria dele. Mesma correcao que o 0038 fez em
--     `leads`, agora em `vistorias` e `vistoria_anexos`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) Catalogo de poses
-- ----------------------------------------------------------------------------
create table if not exists vistoria_fotos_modelo (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null unique,
  nome            text not null,
  instrucao       text,
  obrigatorio     boolean not null default true,
  ordem           smallint not null default 0,
  tipo_veiculo_id uuid references tipos_veiculo(id) on delete cascade,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now()
);

comment on table vistoria_fotos_modelo is
  'Poses que a vistoria exige. O app mostra esta lista ao vendedor e o '
  'codigo de cada uma e gravado em vistoria_anexos.tipo.';

create index if not exists idx_vist_modelo_ordem on vistoria_fotos_modelo (ordem);
create index if not exists idx_vanx_tipo on vistoria_anexos (vistoria_id, tipo);

insert into vistoria_fotos_modelo (codigo, nome, instrucao, obrigatorio, ordem) values
  ('FRENTE', 'Frente do veiculo',
   'De frente, a uns 3 metros, com a PLACA dianteira legivel e o veiculo inteiro no quadro.', true, 1),
  ('TRASEIRA', 'Traseira do veiculo',
   'Atras, com a PLACA traseira legivel e o veiculo inteiro no quadro.', true, 2),
  ('LATERAL_ESQUERDA', 'Lateral esquerda',
   'Lateral do motorista inteira, do para-choque dianteiro ao traseiro.', true, 3),
  ('LATERAL_DIREITA', 'Lateral direita',
   'Lateral do passageiro inteira, do para-choque dianteiro ao traseiro.', true, 4),
  ('CHASSI', 'Numero do chassi',
   'Chassi gravado (cofre do motor, coluna da porta ou vidro). Aproxime ate ler os numeros.', true, 5),
  ('HODOMETRO', 'Painel / hodometro',
   'Painel com o veiculo LIGADO, mostrando a quilometragem.', true, 6),
  ('MOTOR', 'Compartimento do motor',
   'Capo aberto, motor inteiro no quadro.', false, 7),
  ('INTERIOR', 'Interior',
   'Bancos e painel, com a porta do motorista aberta.', false, 8),
  ('PNEUS', 'Pneus',
   'Estado dos pneus — uma foto que mostre a banda de rodagem.', false, 9),
  ('ACESSORIOS', 'Acessorios instalados',
   'Som, multimidia, rastreador, engate ou qualquer item declarado.', false, 10)
on conflict (codigo) do nothing;

alter table vistoria_fotos_modelo enable row level security;

create policy vfm_select on vistoria_fotos_modelo for select to authenticated using (is_staff());
create policy vfm_write  on vistoria_fotos_modelo for all to authenticated
  using (tem_acesso_global()) with check (tem_acesso_global());

grant select, insert, update, delete on vistoria_fotos_modelo to authenticated;

-- ----------------------------------------------------------------------------
-- Poses do lead com o que ja foi enviado (a lista que o app desenha)
-- ----------------------------------------------------------------------------
create or replace function fotos_vistoria_lead(p_lead_id uuid)
returns table (
  codigo      text,
  nome        text,
  instrucao   text,
  obrigatorio boolean,
  ordem       smallint,
  anexo_id    uuid,
  url         text,
  enviada     boolean
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
           a.id, a.url
      from vistoria_anexos a
     where a.vistoria_id = (select id from vist)
     order by upper(coalesce(a.tipo, '')), a.created_at desc
  )
  select m.codigo, m.nome, m.instrucao, m.obrigatorio, m.ordem,
         f.id, f.url, f.id is not null
    from modelo m
    left join foto f on f.codigo = m.codigo
   order by m.ordem, m.codigo;
$$;

-- ----------------------------------------------------------------------------
-- (A2) Itens que JA VEM no plano/combo
--
-- `produtos_obrigatorios_cotacao` (0028) devolve so o que e obrigatorio no
-- proprio cadastro do produto — nao os opcionais amarrados ao combo. Sem esta
-- lista a tela de cotacao mostrava, por exemplo, "Carro Reserva 30 dias" como
-- adicional AVULSO mesmo quando ele ja estava dentro do plano Diamante, e o
-- vendedor podia oferecer duas vezes a mesma coisa.
-- ----------------------------------------------------------------------------
create or replace function produtos_do_plano(p_plano_id uuid)
returns table (produto_id uuid, nome text, valor_fixo numeric, categoria text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nome, p.valor_fixo, p.categoria
    from plano_produtos pp
    join produtos p on p.id = pp.produto_id
   where pp.plano_id = p_plano_id
     and p.status
   order by p.nome;
$$;

-- ----------------------------------------------------------------------------
-- (B) RLS: o dono do hotlink tambem alcanca a vistoria do proprio lead
-- ----------------------------------------------------------------------------
drop policy if exists vist_select on vistorias;
drop policy if exists vist_write  on vistorias;

create policy vist_select on vistorias for select to authenticated using (
  exists (select 1 from veiculos v where v.id = veiculo_id
           and (pode_regional(v.regional_id) or v.cliente_id = auth_cliente_id()))
  or exists (select 1 from leads l where l.id = lead_id
           and (tem_acesso_global() or pode_auditar() or pode_regional(l.regional_id)
                or l.consultor_id = auth.uid() or l.created_by = auth.uid()
                or exists (select 1 from vendedores ve
                            where ve.id = l.vendedor_id and ve.usuario_id = auth.uid())))
);
create policy vist_write on vistorias for all to authenticated using (
  exists (select 1 from veiculos v where v.id = veiculo_id and pode_regional(v.regional_id))
  or exists (select 1 from leads l where l.id = lead_id
           and (tem_acesso_global() or pode_auditar() or pode_regional(l.regional_id)
                or l.consultor_id = auth.uid() or l.created_by = auth.uid()
                or exists (select 1 from vendedores ve
                            where ve.id = l.vendedor_id and ve.usuario_id = auth.uid())))
) with check (
  exists (select 1 from veiculos v where v.id = veiculo_id and pode_regional(v.regional_id))
  or exists (select 1 from leads l where l.id = lead_id
           and (tem_acesso_global() or pode_auditar() or pode_regional(l.regional_id)
                or l.consultor_id = auth.uid() or l.created_by = auth.uid()
                or exists (select 1 from vendedores ve
                            where ve.id = l.vendedor_id and ve.usuario_id = auth.uid())))
);

-- ----------------------------------------------------------------------------
-- (C) Checklist: exige as POSES obrigatorias, nao "4 fotos"
-- ----------------------------------------------------------------------------
create or replace function checklist_lead(p_lead_id uuid)
returns table (
  item     text,
  grupo    text,
  ok       boolean,
  detalhe  text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  l        leads;
  v_doc    text;
  v_tipo   tipo_pessoa;
  v_fotos  int;
  v_obrig  int;
  v_vist   int;
begin
  select * into l from leads where id = p_lead_id;
  if not found then
    return query select 'Lead'::text, 'Geral'::text, false, 'Lead nao encontrado'::text;
    return;
  end if;

  v_doc  := regexp_replace(coalesce(l.cpf_cnpj, ''), '[^0-9]', '', 'g');
  v_tipo := coalesce(l.tipo_pessoa, (case when length(v_doc) > 11 then 'PJ' else 'PF' end)::tipo_pessoa);

  select count(*) into v_vist from vistorias where lead_id = p_lead_id;
  -- Fotos: o que vale e ter as POSES obrigatorias do catalogo, nao um numero
  -- solto de arquivos. Quatro fotos da frente nao sao uma vistoria.
  select count(*) into v_obrig
    from vistoria_fotos_modelo m
   where m.obrigatorio and m.ativo
     and (m.tipo_veiculo_id is null or m.tipo_veiculo_id = l.tipo_veiculo_id);

  select count(distinct m.codigo) into v_fotos
    from vistoria_fotos_modelo m
    join vistoria_anexos a on upper(coalesce(a.tipo, '')) = m.codigo
    join vistorias vi on vi.id = a.vistoria_id
   where vi.lead_id = p_lead_id
     and m.obrigatorio and m.ativo
     and (m.tipo_veiculo_id is null or m.tipo_veiculo_id = l.tipo_veiculo_id);

  -- Associado -------------------------------------------------------------
  return query select 'CPF/CNPJ valido', 'Associado',
    (v_doc <> '' and validar_documento(v_doc, v_tipo)),
    coalesce(nullif(v_doc, ''), 'nao informado');

  return query select 'Nome completo', 'Associado',
    (coalesce(trim(l.nome), '') <> '' and position(' ' in trim(l.nome)) > 0),
    coalesce(nullif(l.nome, ''), 'nao informado');

  return query select 'Celular', 'Associado',
    (length(regexp_replace(coalesce(l.celular, ''), '[^0-9]', '', 'g')) >= 10),
    coalesce(nullif(l.celular, ''), 'nao informado');

  return query select 'E-mail', 'Associado',
    (coalesce(l.email, '') ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
    coalesce(nullif(l.email, ''), 'nao informado');

  return query select 'Endereco completo', 'Associado',
    (coalesce(l.endereco->>'cep', '') <> '' and coalesce(l.endereco->>'logradouro', '') <> ''
     and coalesce(l.endereco->>'numero', '') <> '' and coalesce(l.endereco->>'cidade', '') <> ''
     and coalesce(l.endereco->>'uf', '') <> ''),
    coalesce(nullif(concat_ws(', ', l.endereco->>'logradouro', l.endereco->>'numero',
                              l.endereco->>'cidade', l.endereco->>'uf'), ''), 'nao informado');

  return query select
    (case when v_tipo = 'PJ' then 'Inscricao estadual / RG' else 'RG' end), 'Associado',
    (coalesce(l.rg_ie, '') <> ''), coalesce(nullif(l.rg_ie, ''), 'nao informado');

  return query select 'Data de nascimento / fundacao', 'Associado',
    (l.data_nascimento is not null),
    coalesce(to_char(l.data_nascimento, 'DD/MM/YYYY'), 'nao informada');

  -- Veiculo ---------------------------------------------------------------
  return query select 'Placa', 'Veiculo',
    (coalesce(l.placa, '') <> ''), coalesce(nullif(l.placa, ''), 'nao informada');

  return query select 'Chassi', 'Veiculo',
    (length(regexp_replace(coalesce(l.chassi, ''), '[^0-9A-Za-z]', '', 'g')) = 17),
    coalesce(nullif(l.chassi, ''), 'nao informado');

  return query select 'Renavam', 'Veiculo',
    (length(regexp_replace(coalesce(l.renavam, ''), '[^0-9]', '', 'g')) between 9 and 11),
    coalesce(nullif(l.renavam, ''), 'nao informado');

  return query select 'Marca e modelo', 'Veiculo',
    (coalesce(l.marca, '') <> '' and coalesce(l.modelo, '') <> ''),
    coalesce(nullif(concat_ws(' ', l.marca, l.modelo), ''), 'nao informado');

  return query select 'Ano fabricacao / modelo', 'Veiculo',
    (l.ano_fabricacao is not null and l.ano_modelo is not null),
    coalesce(concat_ws('/', l.ano_fabricacao::text, l.ano_modelo::text), 'nao informado');

  return query select 'Cor', 'Veiculo',
    (coalesce(l.cor, '') <> ''), coalesce(nullif(l.cor, ''), 'nao informada');

  return query select 'Valor FIPE', 'Veiculo',
    (coalesce(l.valor_fipe, 0) > 0),
    coalesce(to_char(l.valor_fipe, 'FM999G999D00'), 'nao informado');

  return query select 'Tipo de veiculo (precificacao)', 'Veiculo',
    (l.tipo_veiculo_id is not null),
    coalesce((select nome from tipos_veiculo where id = l.tipo_veiculo_id), 'nao informado');

  -- Documentos ------------------------------------------------------------
  return query select 'CRLV do veiculo', 'Documentos',
    (coalesce(l.crlv_url, '') <> '' or coalesce(l.crlv_qrcode, '') <> ''),
    (case when coalesce(l.crlv_qrcode, '') <> '' then 'QR Code lido'
          when coalesce(l.crlv_url, '') <> '' then 'arquivo anexado'
          else 'nao anexado' end);

  return query select 'Vistoria registrada', 'Documentos',
    (v_vist > 0), (v_vist || ' vistoria(s)')::text;

  return query select 'Fotos obrigatorias da vistoria', 'Documentos',
    (v_obrig > 0 and v_fotos >= v_obrig),
    (v_fotos || ' de ' || v_obrig || ' foto(s) obrigatoria(s)')::text;

  -- Venda -----------------------------------------------------------------
  return query select 'Plano contratado', 'Venda',
    (l.plano_id is not null),
    coalesce((select nome from planos_protecao where id = l.plano_id), 'nao informado');

  return query select 'Vendedor responsavel', 'Venda',
    (l.vendedor_id is not null),
    -- left join + v.nome: o vendedor sem usuario de portal (0035) continua
    -- sendo vendedor valido; o join interno o descartava.
    coalesce((select coalesce(v.nome, u.nome) from vendedores v
               left join usuarios u on u.id = v.usuario_id
               where v.id = l.vendedor_id), 'nao informado');

  return query select 'Forma de recebimento da adesao', 'Venda',
    (l.adesao_forma is not null and coalesce(l.adesao_valor, 0) > 0),
    coalesce(l.adesao_forma::text, 'nao informada');
end;
$$;
grant execute on function fotos_vistoria_lead(uuid) to authenticated;
grant execute on function produtos_do_plano(uuid) to authenticated;
grant execute on function checklist_lead(uuid) to authenticated;
