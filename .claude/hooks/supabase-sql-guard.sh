#!/usr/bin/env bash
# Guarda do execute_sql do Supabase (PreToolUse).
#
# Regra do usuario (10/10/2026): CONSULTA e livre; IMPLANTACAO (qualquer escrita
# ou DDL) so com a autorizacao dele, uma a uma.
#
# O execute_sql e UMA ferramenta para as duas coisas, entao regra de permissao
# por nome nao separa leitura de escrita. Este hook olha o SQL:
#   - so leitura            -> "allow"  (roda sem perguntar)
#   - qualquer sinal de escrita -> "ask" (o usuario aprova ou recusa)
#
# FALHA FECHADA: sem jq, entrada ilegivel ou SQL vazio, o hook nao responde nada
# e vale o fluxo normal de permissao (que pergunta). Errar para "perguntar" e o
# lado seguro; errar para "liberar" seria implantar sem autorizacao.
set -u

command -v jq >/dev/null 2>&1 || exit 0
entrada="$(cat)" || exit 0
sql="$(printf '%s' "$entrada" | jq -r '.tool_input.query // empty' 2>/dev/null)" || exit 0
[ -n "$sql" ] || exit 0

responder() {
  jq -cn --arg d "$1" --arg r "$2" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:$d,permissionDecisionReason:$r}}'
  exit 0
}

baixo="$(printf '%s' "$sql" | tr '[:upper:]' '[:lower:]')"

# Corpo dollar-quoted ($$ ... $$) = bloco DO ou definicao de funcao: escrita.
if printf '%s' "$baixo" | grep -q '\$\$\|\$[a-z_]*\$'; then
  responder ask "SQL com bloco \$\$ (DO/funcao) - implantacao precisa de autorizacao"
fi

# Tira comentarios e literais de texto, para "where obs like '%delete%'" nao
# disparar e "/* select */ drop table" nao passar.
limpo="$(printf '%s' "$baixo" \
  | sed -e 's/--.*$//' \
  | tr '\n' ' ' \
  | sed -e 's#/\*[^*]*\*\+\([^/*][^*]*\*\+\)*/# #g' -e "s/'[^']*'/''/g")"

# 1) Comandos que escrevem ou mudam estrutura/permissao.
if printf '%s' "$limpo" | grep -Eq '(^|[^a-z_])(insert|update|delete|merge|upsert|alter|create|drop|truncate|grant|revoke|comment[[:space:]]+on|do|call|copy|vacuum|analyze|reindex|cluster|refresh|lock|reset|security[[:space:]]+label|import|discard|listen|notify|prepare|execute|savepoint|rollback|commit|begin|start[[:space:]]+transaction)([^a-z_]|$)'; then
  responder ask "SQL com escrita/DDL - implantacao precisa de autorizacao"
fi

# 2) "set" que muda sessao/papel (set role, set session authorization...).
if printf '%s' "$limpo" | grep -Eq '(^|;)[[:space:]]*set[[:space:]]'; then
  responder ask "SQL com SET - precisa de autorizacao"
fi

# 3) Funcao que ESCREVE chamada por SELECT. Neste projeto quase toda acao e uma
#    RPC (mutual_executar_carga, vincular_externo, registrar_*...), e
#    "select vincular_externo(...)" grava sem conter INSERT nenhum. Pelo verbo
#    no nome: falso positivo so faz perguntar (ex.: gerar_dre), nunca libera.
if printf '%s' "$limpo" | grep -Eq '(executar|vincular|aplicar|registrar|gravar|salvar|definir|marcar|atualizar|inserir|excluir|remover|desfazer|liberar|cancelar|concluir|confirmar|emitir|gerar|criar|abrir|encerrar|transferir|trocar|repassar|sincronizar|importar|substituir|cobrar|instalar|mover|responder|solicitar|arquivar|resolver|ajustar|reemitir|quitar|baixar|distribuir|atribuir|reprocessar|enviar|set_config|setval|nextval|pg_terminate|pg_cancel|pg_reload|dblink)[a-z_]*[[:space:]]*\(' \
  || printf '%s' "$limpo" | grep -Eq '(^|[^a-z_])(lo_[a-z_]+|http_[a-z_]+|net\.[a-z_]+)[[:space:]]*\('; then
  responder ask "SELECT chama funcao que pode gravar - precisa de autorizacao"
fi

# 4) Sobrou leitura: so libera se o comando comeca como consulta.
if printf '%s' "$limpo" | grep -Eq '^[[:space:]]*\(?[[:space:]]*(select|with|explain|show|table|values)([^a-z_]|$)'; then
  responder allow "Consulta somente leitura"
fi

responder ask "Comando nao reconhecido como consulta - precisa de autorizacao"
