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

# Normaliza o SQL com um tokenizador de verdade (python3), nao com sed: a versao
# por sed cortava "-- ate o fim da linha" ANTES de tirar os literais, entao
#   select '--'; delete from x
# perdia o DELETE e era liberado. O tokenizador anda caractere a caractere:
#   - '...' (com '' escapado; barra invertida so em E'...') vira ''
#   - "Identificador Com Espaco" vira identificador_com_espaco - o nome continua
#     visivel para as regras (uma RPC entre aspas nao escapa), mas o alias em
#     portugues ("dia do vencimento") deixa de casar com o DO da regra 1
#   - -- e /* */ (aninhado) viram espaco
#   - $$ ou $tag$ fora de literal imprime __dollar__ (bloco DO / corpo de funcao)
# Sem python3 o hook nao responde, e vale a pergunta (falha fechada).
command -v python3 >/dev/null 2>&1 || exit 0
limpo="$(printf '%s' "$sql" | python3 -c '
import re, sys
s = sys.stdin.read().lower()
o, i, n = [], 0, len(s)
while i < n:
    c = s[i]
    if c == "-" and s.startswith("--", i):
        j = s.find("\n", i); i = n if j < 0 else j; o.append(" ")
    elif c == "/" and s.startswith("/*", i):
        d, i = 1, i + 2
        while i < n and d:
            if s.startswith("/*", i): d += 1; i += 2
            elif s.startswith("*/", i): d -= 1; i += 2
            else: i += 1
        o.append(" ")
    elif c == "\x27":
        # Barra so escapa em E'...'. Num literal comum (standard_conforming_strings)
        # tratar barra+aspa como escape faria o literal "engolir" o DELETE seguinte.
        esc = i > 0 and s[i - 1] == "e" and (i < 2 or not (s[i - 2].isalnum() or s[i - 2] == "_"))
        i += 1
        while i < n:
            if esc and s[i] == "\\" and i + 1 < n: i += 2; continue
            if s[i] == "\x27":
                if s.startswith("\x27\x27", i): i += 2; continue
                i += 1; break
            i += 1
        o.append("\x27\x27")
    elif c == "\x22":
        j = s.find("\x22", i + 1); j = n if j < 0 else j
        o.append(re.sub(r"[^a-z0-9_]", "_", s[i + 1:j])); i = j + 1
    elif c == "$" and re.match(r"\$[a-z_]*\$", s[i:]):
        o.append(" __dollar__ "); i += len(re.match(r"\$[a-z_]*\$", s[i:]).group(0))
    else:
        o.append(" " if c in "\n\r\t" else c); i += 1
print("".join(o))
' 2>/dev/null)" || exit 0
[ -n "$limpo" ] || exit 0

# Corpo dollar-quoted ($$ ... $$) = bloco DO ou definicao de funcao: escrita.
if printf '%s' "$limpo" | grep -q '__dollar__'; then
  responder ask "SQL com bloco \$\$ (DO/funcao) - implantacao precisa de autorizacao"
fi

# EXPLAIN [ANALYZE|VERBOSE|...] de uma consulta e consulta. (Se o que vem depois
# for escrita, o INSERT/UPDATE/DELETE continua no texto e a regra 1 pega.)
limpo="$(printf '%s' "$limpo" | sed -E 's/^[[:space:]]*explain[[:space:]]*(\([^)]*\))?[[:space:]]*((analyze|analyse|verbose|costs|buffers|settings|wal|timing|summary)[[:space:]]+)*/explain /')"

# Funcoes STABLE/IMMUTABLE cujo nome tem verbo de escrita (gerar_dre, resolver_hotlink...).
# O Postgres PROIBE escrita dentro de funcao nao-volatil, entao chama-las e leitura.
# Conferido no schema.sql em 12/10/2026. Ao recriar uma delas como VOLATILE, tire daqui.
limpo="$(printf '%s' "$limpo" | sed -E 's/(^|[^a-z0-9_])(gerar_dre|gerar_dre_completo|gerar_dre_mensal|gerar_dre_resumo|gerar_dre_resumo_completo|gerar_codigo_regional|gerar_codigo_vendedor|pode_liberar_assistencia|resolver_hotlink)[[:space:]]*\(/\1funcao_de_leitura(/g')"

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
