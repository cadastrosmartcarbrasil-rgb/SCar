-- Teste funcional da BUSCA DA LISTA DE VENDAS (0079): o acento deixa de decidir
-- se o associado aparece, e o telefone mascarado volta a ser encontrado.
\set ON_ERROR_STOP on
do $$
declare
  u_adm uuid := gen_random_uuid();
  r_mt uuid; tv uuid;
  l_acento uuid; l_mascara uuid; l_limpo uuid;
  achou int; v_texto text; v_digitos text;
begin
  -- ===================================================== setup
  insert into auth.users (id, email) values (u_adm, 'adm79@t.com');
  insert into regionais (nome) values ('Cuiaba') returning id into r_mt;
  insert into usuarios (id, nome, email, papel, regional_id)
    values (u_adm, 'Admin', 'adm79@t.com', 'admin', null);
  perform set_config('request.jwt.claim.sub', u_adm::text, false);
  select id into tv from tipos_veiculo where nome ilike 'passeio%' limit 1;

  -- Nome COM acento e veiculo com marca (a Lista antiga nao procurava marca).
  insert into leads (nome, celular, placa, marca, modelo, regional_id, tipo_veiculo_id)
    values ('JOÃO DA CONCEIÇÃO', '65999998888', 'ABC1D23', 'FIAT', 'ARGO', r_mt, tv)
    returning id into l_acento;

  -- Telefone MASCARADO — e o que o <FechamentoVenda> grava (maskCelular).
  insert into leads (nome, celular, cpf_cnpj, regional_id, tipo_veiculo_id)
    values ('MARIA SOUZA', '(65) 98888-7777', '111.444.777-35', r_mt, tv)
    returning id into l_mascara;

  -- Telefone LIMPO — e o que a captura grava. Os dois tem de ser achaveis.
  insert into leads (nome, celular, regional_id, tipo_veiculo_id)
    values ('ANA LIMA', '65977776666', r_mt, tv)
    returning id into l_limpo;

  -- ============================== A) a coluna gerada normaliza de verdade
  select busca_texto, busca_digitos into v_texto, v_digitos from leads where id = l_acento;
  assert v_texto = 'joao da conceicao fiat argo abc1d23',
    format('busca_texto veio "%s"', v_texto);
  assert v_digitos = '65999998888', format('busca_digitos veio "%s"', v_digitos);

  select busca_digitos into v_digitos from leads where id = l_mascara;
  assert v_digitos = '65988887777' || '11144477735',
    format('a mascara tem de sumir; veio "%s"', v_digitos);

  -- ============================== B) O ACENTO DEIXA DE DECIDIR
  -- Digitando SEM acento acha quem esta COM acento (era o defeito).
  select count(*) into achou from leads where busca_texto ilike '%joao%';
  assert achou = 1, format('"joao" deveria achar JOÃO, achou %s', achou);

  -- E digitando COM acento tambem acha — o termo passa por `semAcento` na tela,
  -- entao as duas grafias chegam iguais ao banco.
  select count(*) into achou from leads where busca_texto ilike '%' || texto_sem_acento('JOÃO') || '%';
  assert achou = 1, format('"JOÃO" deveria achar, achou %s', achou);

  select count(*) into achou from leads where busca_texto ilike '%conceicao%';
  assert achou = 1, 'sobrenome com cedilha tambem';

  -- ============================== C) A MARCA passa a ser procuravel
  -- (a Lista antiga so olhava nome/modelo/placa — o Kanban achava, ela nao).
  select count(*) into achou from leads where busca_texto ilike '%fiat%';
  assert achou = 1, format('a marca deveria ser procuravel, achou %s', achou);

  -- ============================== D) PLACA com e sem separador
  select count(*) into achou from leads where busca_texto ilike '%abc1d23%';
  assert achou = 1, 'placa como esta gravada';
  -- "ABC-1D23" digitado vira "abc1d23" na tela (so alfanumerico) e casa.
  select count(*) into achou
    from leads where busca_texto ilike '%' || lower(regexp_replace('ABC-1D23', '[^a-zA-Z0-9]', '', 'g')) || '%';
  assert achou = 1, 'placa digitada com hifen tem de casar';

  -- ============================== E) TELEFONE: mascarado e limpo, iguais
  select count(*) into achou from leads where busca_digitos ilike '%65988887777%';
  assert achou = 1, 'telefone gravado MASCARADO tem de ser achado por digitos';
  select count(*) into achou from leads where busca_digitos ilike '%65977776666%';
  assert achou = 1, 'telefone gravado limpo continua sendo achado';
  -- CPF digitado com pontuacao vira digito na tela e casa com o mascarado.
  select count(*) into achou from leads where busca_digitos ilike '%11144477735%';
  assert achou = 1, 'CPF gravado com pontuacao tem de ser achado por digitos';

  -- ============================== F) A COLUNA ACOMPANHA A FICHA
  -- E o ponto de ser GERADA: ninguem precisa lembrar de atualizar.
  update leads set nome = 'JOÃO DA SILVA SAUDAÇÃO' where id = l_acento;
  select busca_texto into v_texto from leads where id = l_acento;
  assert v_texto like 'joao da silva saudacao%',
    format('a coluna tem de acompanhar o update; veio "%s"', v_texto);

  update leads set celular = '(65) 3333-2222' where id = l_limpo;
  select busca_digitos into v_digitos from leads where id = l_limpo;
  assert v_digitos = '6533332222', format('digitos apos update: "%s"', v_digitos);

  -- ============================== G) NAO SE ESCREVE NUMA COLUNA GERADA
  -- (a trava e do Postgres; o teste existe para o dia em que alguem tentar
  --  "corrigir" a busca gravando na mao em vez de arrumar a ficha)
  begin
    execute format('update leads set busca_texto = %L where id = %L', 'chute', l_acento);
    raise exception 'escrever em coluna gerada deveria ter sido recusado';
  exception when others then
    assert sqlstate in ('42601', '428C9'),
      format('esperava recusa do Postgres, veio %s: %s', sqlstate, sqlerrm);
  end;

  -- ============================== H) nulo nao quebra
  insert into leads (nome, celular, regional_id, tipo_veiculo_id)
    values ('SEM VEICULO', '65900001111', r_mt, tv);
  select count(*) into achou from leads where busca_texto is null or busca_digitos is null;
  assert achou = 0, 'coluna gerada nunca deve sair nula (o coalesce cuida disso)';

  raise notice '=== TESTES 0079 (busca da lista sem acento) PASSARAM ===';
end $$;
