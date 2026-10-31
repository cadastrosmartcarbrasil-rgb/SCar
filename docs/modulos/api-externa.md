# API externa do SCar (0151)

API para sistemas parceiros. A primeira integração é a **plataforma de rastreamento**:
ela cruza os veículos do SCar com os equipamentos dela e devolve a última comunicação
de cada IMEI.

- **Endereço:** `https://appsmartcar.com.br/api/externa/v1`
- **Documentação para o parceiro (pública, sem chave):** `GET /api/externa/v1/docs` (página com endpoints,
  parâmetros, curl, respostas de exemplo e erros) · `docs.md` (a mesma em Markdown) · `postman.json` (coleção
  pronta, variáveis `base_url` e `chave`) · `openapi.json` (OpenAPI 3 com exemplos, operationId e tags).
- **Fonte única da documentação:** `src/lib/api-externa-doc.ts` (`ENDPOINTS_API`, `ERROS_API`). Mudou rota,
  parâmetro ou campo: mude ali e em `src/lib/api-externa-openapi.ts` — o teste confere que os dois listam as
  mesmas rotas e que todo código de erro citado existe. (O parceiro recebeu só o `openapi.json` cru em 28/10/2026
  e respondeu que "faltavam os endpoints": JSON de especificação sem guia nem exemplo não é documentação.)
- **Chave:** Configurações → **API e Integrações** (só admin). Uma chave por sistema.
  Formato `scar_<prefixo>_<segredo>`; aparece **uma vez**; o banco guarda só o SHA-256.
- **Autenticação:** `Authorization: Bearer <chave>` ou `x-api-key: <chave>`.

## Rotas

| Rota | Escopo | O que faz |
|---|---|---|
| `GET /status` | — | Confere a chave (integração, escopos, IP visto) |
| `GET /veiculos` | `veiculos:ler` | Lista paginada (`limite` ≤ 500, `cursor`), `atualizados_desde`, `placa`, `chassi`, `imei`, `situacao` |
| `GET /veiculos/{placa\|chassi\|id}` | `veiculos:ler` | Um veículo |
| `GET /rastreadores` | `rastreadores:ler` | Parque por IMEI (`atualizados_desde`, `cursor`, `imei`) |
| `POST /rastreadores` | `rastreadores:escrever` | **(0165)** Cadastra até 500 equipamentos por IMEI e instala no veículo (`placa`/`chassi`/`veiculo_id`); exige chave ligada a uma rastreadora |
| `POST /rastreadores/comunicacao` | `rastreadores:escrever` | Até 500 `{imei, comunicado_em, latitude?, longitude?, velocidade?, ignicao?, endereco?}` |

`associados:ler` acrescenta nome, CPF/CNPJ, telefone, celular e e-mail do associado no
veículo. Sem ele, vem só o `id` do associado (LGPD: a rastreadora recebe o que precisa).

## A regra que a rastreadora usa: `situacao_rastreamento`

| Status do veículo | situacao_rastreamento | O que fazer |
|---|---|---|
| ativo, em_evento, vistoria_pendente | `ATIVO` | manter o rastreamento |
| inadimplente, suspenso | `SUSPENSO` | benefícios bloqueados; equipamento continua |
| inativo, baixado, excluido | `ENCERRADO` | encerrar e recolher o equipamento |

Espelho em SQL (`api_situacao_rastreamento`) e TS (`situacaoRastreamento`, `src/lib/api-externa.ts`).
Mexeu num, mexa no outro e nos dois testes.

## Sincronia incremental

1. Primeira carga: `GET /veiculos?limite=500`, repetindo com `cursor=<proximo_cursor>` até vir nulo.
2. Guardar o maior `alterado_em` recebido.
3. Nas rodadas seguintes: `GET /veiculos?atualizados_desde=<esse valor>` (mesma paginação).

`alterado_em` = o mais recente entre o veículo e o associado. A comunicação informada pela
rastreadora **não** mexe no `alterado_em` (a 0151 corrigiu o espelho da 0050, que regravava
a ficha do veículo a cada update do rastreador).

## Segurança

- A rota valida a chave (hash em tempo constante), situação, IP e escopo; as RPCs
  (`api_veiculos`, `api_rastreadores`, `api_registrar_comunicacoes`) **conferem de novo** pelo
  `api_exigir` e só rodam sem sessão (service_role).
- Chave ligada a uma rastreadora (fornecedor) só vê e só atualiza os equipamentos dela;
  recorte por unidade e lista de IPs opcionais; validade opcional; pausar (ativo = false)
  ou revogar (definitivo, com motivo).
- Limite: 120 requisições/min por chave; 20 tentativas de chave inválida por IP em 10 min
  (contador em memória — um contêiner, como o login do portal).
- Trilha de toda requisição em `api_requisicoes` (rota, status, IP, duração, registros, código do erro).
- `/api/externa` está em `PUBLIC_PATHS` do middleware: autentica por chave, nunca por sessão.

## Cadastro do parque pela API (0165)

Motivo (31/10/2026): a New Tracker conectou e só leu veículos; a tela de Rastreadores seguia vazia
porque o parque estava vazio e a comunicação só aceita IMEI já cadastrado. `api_cadastrar_rastreadores`:
re-executável por IMEI; equipamento nasce da rastreadora da chave; com veículo instala (ATIVO, espelho
na ficha); troca de aparelho da mesma rastreadora devolve o antigo ao estoque; equipamento de outra
rastreadora no veículo = RECUSADO; status fora de DISPONIVEL/ATIVO = RECUSADO; sem a trava de 35 dias de
atraso (é fato consumado na rua). Item ruim não derruba o lote (subtransação por item). Histórico do
equipamento mostra "API <nome da chave>".

## Não feito (próximas fases)

- **Webhook de saída** (o SCar avisar a plataforma quando um veículo muda de situação) —
  hoje a plataforma puxa com `atualizados_desde`.
- Desinstalar/baixar equipamento pela API (instalar já existe, 0165).
- Limpeza da trilha `api_requisicoes` (cresce sem teto; agendar apagar o que tem +90 dias).
