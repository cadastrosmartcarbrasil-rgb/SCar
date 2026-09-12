-- ============================================================================
-- SCar :: 0077_papeis_cotador_sinistro.sql
--
-- A VARREDURA DOS 8 PAPEIS (12/09/2026) achou dois papeis que nao eram grupo
-- de acesso, e o usuario decidiu o destino de cada um:
--
--   (A) `cotador` — APOSENTADO. Ele tinha DUAS ocorrencias no schema inteiro e
--       nenhuma era codigo: a declaracao do enum (0001) e um comentario (0003).
--       Zero helpers, zero policies. Quem era cadastrado como cotador recebia
--       staff generico da unidade, e a tela oferecia o papel como se ele
--       significasse alguma coisa — o mesmo gotcha do `usuarios.ativo` (0068).
--
--   (B) `sinistro` — PASSA A GOVERNAR O EVENTO, e so ele. Ate aqui o papel que
--       da nome ao modulo de eventos existia em UM lugar: dentro de
--       `pode_assistencia()`, ao lado de `assistencia_24h` — ou seja, ele
--       destravava a 24h e NAO governava evento nenhum (as policies de
--       `eventos_sinistro` sao `pode_regional`/`is_admin`).
--
-- ============================================================================
-- O RECORTE DE (B), que e a decisao de desenho desta migration:
--
--   ABRIR evento e ATENDIMENTO; TRATAR evento e do time de sinistro.
--
-- Restringir o INSERT quebraria a operacao no ponto mais comum: o associado
-- liga, o SAC registra o evento pelo VCard "Evento" (-> /sinistros/novo?placa=)
-- e QUALQUER atendente faz isso — nao existe papel `sac`. Restringir o SELECT
-- quebraria a lista do SAC, que marca quais veiculos ja tiveram evento.
--
-- Entao o corte fica onde ele significa algo: o que MOVE o evento e o que gasta
-- DINHEIRO nele — update do evento, cotacao de pecas, itens e nota fiscal.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) COTADOR APOSENTADO
--
-- Enum no Postgres nao perde valor (`alter type ... drop value` nao existe),
-- entao a aposentadoria e em tres passos: mover quem esta la, RECUSAR novos no
-- banco e tirar da tela. So tirar da tela repetiria o defeito que a varredura
-- achou — opcao que a tela nao oferece mas o banco aceita, e a rota
-- /api/usuarios usa service_role, que ignora RLS.
--
-- O destino e `consultor_vendas`, e a escolha e NEUTRA em acesso, nao um
-- palpite: nenhum dos dois papeis e citado por helper algum, e nas policies os
-- dois se distinguem apenas por ficarem FORA de `pode_ver_carteira_regional()`
-- — juntos. Quem era cotador via os leads que criou; como consultor_vendas ve
-- exatamente os mesmos. E tambem e o default da coluna (0001).
-- ----------------------------------------------------------------------------
update usuarios
   set papel = 'consultor_vendas'
 where papel::text = 'cotador';

-- O mural segue as pessoas. Comunicado enderecado a {cotador} (0055) ficaria
-- com ZERO destinatarios depois da migracao — a tela da gestao marca isso em
-- vermelho (0057), mas um aviso vigente deixaria de chegar em silencio para
-- quem continua na casa, so com outro rotulo.
update memos
   set papeis = (
     select array_agg(distinct p)
       from unnest(array_replace(papeis, 'cotador', 'consultor_vendas')) p
   )
 where papeis is not null
   and 'cotador' = any (papeis);

alter table usuarios drop constraint if exists chk_papel_vigente;
alter table usuarios
  add constraint chk_papel_vigente check (papel::text <> 'cotador');

comment on constraint chk_papel_vigente on usuarios is
  'cotador aposentado na 0077: enum nao perde valor, entao a recusa vive aqui.';

-- ----------------------------------------------------------------------------
-- (B1) QUEM TRATA O EVENTO
--
-- `financeiro` entra pelo `tem_acesso_global()`: a nota fiscal do evento e
-- dinheiro e ja aparece no DRE (`dre_movimentos`, 0032).
-- `auditoria` NAO entra — ela autoriza a entrada na base (0017/0034), que e
-- outro assunto; e `assistencia_24h` tambem nao: guincho nao e sinistro.
-- ----------------------------------------------------------------------------
create or replace function pode_tratar_evento(p_regional uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select tem_acesso_global()
      or (auth_papel()::text in ('sinistro', 'gestor_regional')
          and pode_regional(p_regional));
$$;

comment on function pode_tratar_evento(uuid) is
  'Quem MOVE o evento e gasta nele. Abrir e ver continuam sendo de todo staff '
  'da unidade: o SAC registra o evento quando o associado liga.';

-- ----------------------------------------------------------------------------
-- (B2) AS POLICIES DO EVENTO
--
-- select/insert de `eventos_sinistro` e o insert de `anexos_evento` ficam como
-- estao de proposito (ver o recorte no topo). `historico_protocolo` tambem: e a
-- trilha que a tramitacao e os PARECERES (0059) escrevem, e juridico, vistoria
-- e diretoria opinam no evento sem serem o time de sinistro.
-- ----------------------------------------------------------------------------
drop policy if exists eventos_update on eventos_sinistro;
create policy eventos_update on eventos_sinistro for update to authenticated
  using (pode_tratar_evento(regional_id)) with check (pode_tratar_evento(regional_id));

drop policy if exists anexos_delete on anexos_evento;
create policy anexos_delete on anexos_evento for delete to authenticated
  using (exists (select 1 from eventos_sinistro e
                 where e.id = evento_id and pode_tratar_evento(e.regional_id)));

drop policy if exists cotacoes_all on cotacoes_pecas;
create policy cotacoes_all on cotacoes_pecas for all to authenticated
  using (exists (select 1 from eventos_sinistro e
                 where e.id = evento_id and pode_tratar_evento(e.regional_id)))
  with check (exists (select 1 from eventos_sinistro e
                 where e.id = evento_id and pode_tratar_evento(e.regional_id)));

drop policy if exists itens_all on itens_cotacao;
create policy itens_all on itens_cotacao for all to authenticated
  using (exists (select 1 from cotacoes_pecas c join eventos_sinistro e on e.id = c.evento_id
                 where c.id = cotacao_id and pode_tratar_evento(e.regional_id)))
  with check (exists (select 1 from cotacoes_pecas c join eventos_sinistro e on e.id = c.evento_id
                 where c.id = cotacao_id and pode_tratar_evento(e.regional_id)));

drop policy if exists nfe_all on notas_fiscais_evento;
create policy nfe_all on notas_fiscais_evento for all to authenticated
  using (exists (select 1 from eventos_sinistro e
                 where e.id = evento_id and pode_tratar_evento(e.regional_id)))
  with check (exists (select 1 from eventos_sinistro e
                 where e.id = evento_id and pode_tratar_evento(e.regional_id)));

-- ----------------------------------------------------------------------------
-- (B2-bis) A TRAMITACAO, QUE E POR ONDE A TELA REALMENTE MEXE NO EVENTO
--
-- Policy sozinha aqui seria meia porta: `transferir_protocolo` (0059) e
-- SECURITY DEFINER e roda como dona da tabela, entao ela NAO passa por policy
-- nenhuma — e e ela que o card "Tramitar" chama. Fechar so o `update` direto
-- (use-eventos.ts) deixaria o caminho principal aberto, o que e pior que nao
-- ter fechado: viraria uma regra que a tela contorna sem ninguem notar.
-- ----------------------------------------------------------------------------
create or replace function transferir_protocolo(
  p_evento_id          uuid,
  p_usuario_destino_id uuid default null,   -- nulo = so muda status / registra parecer
  p_parecer            text default null,
  p_novo_status        status_evento default null
)
returns eventos_sinistro
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origem uuid := auth.uid();
  v_atual  eventos_sinistro;
  v_status_anterior status_evento;
  v_status_novo     status_evento;
  v_destino uuid;
  v_atend   uuid;
begin
  if not is_staff() then raise exception 'Sem permissao'; end if;

  select * into v_atual from eventos_sinistro where id = p_evento_id for update;
  if not found then
    raise exception 'Evento % nao encontrado', p_evento_id using errcode = 'no_data_found';
  end if;

  if p_usuario_destino_id is not null
     and not exists (select 1 from usuarios where id = p_usuario_destino_id and ativo) then
    raise exception 'Responsavel de destino invalido ou inativo';
  end if;

  -- 0077 — esta funcao e SECURITY DEFINER, entao ela NAO passa pelas policies
  -- de `eventos_sinistro`: a trava tem de estar aqui dentro (regra da 0052).
  -- Duas coisas mudam:
  --   (a) o piso vira a UNIDADE. Ate aqui bastava `is_staff()`, ou seja, um
  --       atendente de Natal tramitava evento de Cuiaba — a policy da tabela
  --       impedia, a RPC nao, e e a RPC que a tela usa.
  --   (b) mudar o STATUS passa a ser de quem TRATA o evento. Transferir e
  --       registrar parecer seguem abertos ao staff da unidade de proposito:
  --       juridico, vistoria e diretoria opinam no sinistro sem serem o time
  --       dele, e o evento precisa poder voltar da mao de quem opinou.
  if not pode_regional(v_atual.regional_id) then
    raise exception 'Evento de outra unidade';
  end if;

  if p_novo_status is not null
     and p_novo_status is distinct from v_atual.status
     and not pode_tratar_evento(v_atual.regional_id) then
    raise exception 'Mudar o status do evento e do time de sinistro';
  end if;

  -- Sem destino, o evento fica com quem ja estava (ou com quem esta tramitando):
  -- nao existe protocolo sem dono.
  v_destino := coalesce(p_usuario_destino_id, v_atual.operador_atual_id, v_origem);

  if p_usuario_destino_id is null
     and p_novo_status is null
     and coalesce(btrim(p_parecer), '') = '' then
    raise exception 'Informe o destino, o novo status ou o parecer';
  end if;

  v_status_anterior := v_atual.status;
  v_status_novo     := coalesce(p_novo_status, v_atual.status);

  update eventos_sinistro
     set operador_atual_id = v_destino,
         status            = v_status_novo,
         updated_at        = now()
   where id = p_evento_id
   returning * into v_atual;

  insert into historico_protocolo (
    evento_id, usuario_origem_id, usuario_destino_id,
    acao_realizada, status_anterior, status_novo, observacoes
  ) values (
    p_evento_id, v_origem, v_destino,
    case when p_usuario_destino_id is not null then 'TRANSFERENCIA'
         when p_novo_status is not null        then 'MUDANCA_STATUS'
         else 'PARECER' end,
    v_status_anterior, v_status_novo, p_parecer
  );

  -- Espelha na Central de Protocolos: e la que a pessoa VE que algo caiu na mao
  -- dela. Sem isso a transferencia so existiria dentro da tela do sinistro.
  v_atend := protocolo_do_evento(p_evento_id);
  update atendimentos
     set responsavel_id = v_destino, updated_at = now()
   where id = v_atend;

  insert into protocolo_interacoes (
    atendimento_id, tipo, mensagem, de_usuario, para_usuario, usuario_id
  ) values (
    v_atend,
    (case when p_usuario_destino_id is not null then 'TRANSFERENCIA' else 'COMENTARIO' end)
      ::tipo_interacao_protocolo,
    coalesce(nullif(btrim(coalesce(p_parecer, '')), ''),
             'Status: ' || v_status_anterior::text || ' -> ' || v_status_novo::text),
    case when p_usuario_destino_id is not null then v_origem end,
    case when p_usuario_destino_id is not null then v_destino end,
    v_origem
  );

  return v_atual;
end;
$$;

-- ----------------------------------------------------------------------------
-- (B3) `sinistro` SAI DA ASSISTENCIA 24H
--
-- E a outra metade de "restringir o papel aos eventos": ele destravava a 24h
-- inteira (abrir acionamento, cadastrar prestador, lancar e BAIXAR contas a
-- pagar pela policy `lanc_assistencia`) sem nunca ter governado um evento.
--
-- ⚠️ CONSEQUENCIA A CONFERIR ANTES DO DEPLOY: quem hoje opera a 24h com papel
-- `sinistro` perde o acionamento. Se alguem da casa faz as duas coisas, o papel
-- dela e `assistencia_24h` (que nao perde nada aqui) ou `gestor_regional`.
-- Quem tem unidade continua lancando no financeiro pela `lanc_all`
-- (`pode_regional`); quem esta na MATRIZ sem unidade nao — e era justamente
-- esse o alcance largo demais.
-- ----------------------------------------------------------------------------
create or replace function pode_assistencia()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    auth_papel()::text in ('admin', 'financeiro', 'gestor_regional', 'assistencia_24h'),
    false
  );
$$;

comment on function pode_assistencia() is
  'Opera a Assistencia 24h. `sinistro` saiu na 0077: o papel passou a governar '
  'o EVENTO (pode_tratar_evento), e guincho nao e sinistro.';

-- ----------------------------------------------------------------------------
-- Rito de seguranca da 0052 — funcao nasce com execute para PUBLIC/anon.
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
