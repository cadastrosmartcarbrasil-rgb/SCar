# API externa do SCar (0151)

API para sistemas parceiros. A primeira integração é a **plataforma de rastreamento**:
ela cruza os veículos do SCar com os equipamentos dela e devolve a última comunicação
de cada IMEI.

- **Endereço:** `https://appsmartcar.com.br/api/externa/v1`
- **Documentação (OpenAPI 3, pública):** `GET /api/externa/v1/openapi.json` — importa no Swagger/Postman.
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

## Não feito (próximas fases)

- **Webhook de saída** (o SCar avisar a plataforma quando um veículo muda de situação) —
  hoje a plataforma puxa com `atualizados_desde`.
- Instalar/desinstalar equipamento pela API (hoje só pela tela do módulo de Rastreadores).
- Limpeza da trilha `api_requisicoes` (cresce sem teto; agendar apagar o que tem +90 dias).
