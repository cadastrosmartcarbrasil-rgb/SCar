-- ============================================================================
-- SCar :: 0079_busca_leads_sem_acento.sql
-- A BUSCA DA LISTA DE VENDAS PASSA A IGNORAR ACENTO — e a mascara do telefone.
--
-- O DEFEITO: `/vendas` tem duas visoes que filtram de formas diferentes DE
-- PROPOSITO (a Lista busca no banco, porque nao carrega tudo; o Kanban filtra
-- o que ja esta na tela, para responder a cada tecla). So que a diferenca
-- vazava para o RESULTADO: o Kanban achava "JOAO" digitando "joão" e a Lista
-- nao, porque `ilike` compara byte a byte e o Postgres nao tira acento sozinho.
-- Quem procura o proprio associado nao tem como saber que a resposta depende
-- de qual aba esta aberta.
--
-- 🔴 E NAO ERA SO O ACENTO. A mesma consulta procura telefone e CPF por
-- DIGITOS (`celular.ilike.*65999998888*`), mas o `celular` do lead nem sempre
-- esta em digitos: a captura grava limpo (`replace(/\D/g,'')`) e o
-- `<FechamentoVenda>` grava MASCARADO (`maskCelular`, e o telefone copiado do
-- cadastro do associado vem como esta la). Nesses leads a busca por telefone
-- simplesmente nao achava nada — e esse e o campo que o atendente usa com o
-- cliente na linha.
--
-- A CORRECAO E A MESMA PARA OS DOIS: normalizar a COLUNA no banco, e nao so o
-- termo digitado. Duas colunas GERADAS (`generated always as ... stored`), que
-- nao podem sair de sincronia com a ficha porque nao sao escritas por ninguem —
-- o Postgres as recalcula a cada gravacao. O oposto de um cache que a aplicacao
-- precisa lembrar de atualizar.
--
-- POR QUE COLUNA GERADA E NAO UMA RPC DE BUSCA: manter a consulta como
-- `from('leads').select('*')` preserva a RLS de `leads` (0038) — o
-- `consultor_vendas` continua vendo so a propria carteira, sem que nada disso
-- precise ser reimplementado dentro de uma funcao `security definer`. Busca que
-- vira RPC vira tambem uma segunda copia da regra de visibilidade.
-- ============================================================================

-- `unaccent` tira o acento; `pg_trgm` e o que faz `ilike '%termo%'` usar indice
-- (btree nao serve com curinga na frente). As duas ja estao no banco de
-- producao, entao aqui isto e no-op — esta escrito para a migration valer
-- sozinha em base nova.
create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- ----------------------------------------------------------------------------
-- ⚠️ O `unaccent` do contrib e STABLE, nao IMMUTABLE — e coluna gerada exige
-- IMMUTABLE. Por isso o embrulho abaixo, que e o padrao documentado:
--   . a forma de DOIS argumentos fixa o dicionario (`'unaccent'::regdictionary`)
--     em vez de deixa-lo depender do `search_path` da sessao. E isso que torna
--     honesto declarar IMMUTABLE;
--   . a de um argumento NAO serve: ela resolve o dicionario na hora da chamada.
-- A ressalva real, e ela e pequena: se o arquivo de dicionario do servidor
-- mudasse, o valor ja gravado nao seria recalculado. Nao muda.
-- ----------------------------------------------------------------------------
create or replace function texto_sem_acento(p_texto text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select lower(public.unaccent('public.unaccent'::regdictionary, coalesce(p_texto, '')));
$$;

comment on function texto_sem_acento(text) is
  'Minusculo e sem acento, IMMUTABLE (dicionario fixo) para servir a coluna gerada da busca.';

-- ----------------------------------------------------------------------------
-- As duas colunas da busca.
--
-- `busca_texto` junta nome + marca + modelo + placa num campo so. Isso alinha a
-- Lista com o Kanban tambem no ESCOPO: a Lista procurava em nome/modelo/placa e
-- ignorava a MARCA, entao "Fiat" achava no Kanban e nao achava na Lista.
--
-- `busca_digitos` e o telefone e o documento reduzidos a digito, que e como a
-- tela ja monta o termo. Assim tanto faz o lead ter sido gravado como
-- "(65) 99999-8888" ou "65999998888".
-- ----------------------------------------------------------------------------
alter table leads
  add column if not exists busca_texto text
    generated always as (
      texto_sem_acento(
        coalesce(nome, '')   || ' ' || coalesce(marca, '')  || ' ' ||
        coalesce(modelo, '') || ' ' || coalesce(placa, '')
      )
    ) stored,
  add column if not exists busca_digitos text
    generated always as (
      regexp_replace(coalesce(celular, '') || coalesce(cpf_cnpj, ''), '[^0-9]', '', 'g')
    ) stored;

comment on column leads.busca_texto is
  'GERADA: nome+marca+modelo+placa sem acento e em minusculo. Alimenta a busca da Lista de /vendas.';
comment on column leads.busca_digitos is
  'GERADA: celular+cpf_cnpj so com digitos — a ficha grava mascarado em alguns caminhos.';

-- GIN/trigrama porque a busca e por PEDACO (`%termo%`). Vale a partir de 3
-- caracteres; com 2 o planejador cai em varredura, e e por isso que o piso de 2
-- da tela continua de pe (recusar 2 caracteres seria trocar um resultado lento
-- por nenhum resultado).
create index if not exists idx_leads_busca_texto   on leads using gin (busca_texto   gin_trgm_ops);
create index if not exists idx_leads_busca_digitos on leads using gin (busca_digitos gin_trgm_ops);

-- ============================================================================
-- Rito de seguranca (0052): funcao nasce com EXECUTE para PUBLIC.
-- ============================================================================
grant execute on function texto_sem_acento(text) to authenticated;

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant  execute on all functions in schema public to service_role;
