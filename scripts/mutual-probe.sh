#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Sondagem da API do Mutual — roda NO VPS, antes de existir qualquer codigo.
#
# Objetivo: responder 4 perguntas sem chutar nada
#   1. o dominio responde e o IP daqui esta liberado?
#   2. onde esta o OpenAPI (o contrato) e como e a AUTENTICACAO de verdade?
#   3. o token funciona?
#   4. como e o retorno real (campos, paginacao, filtro por data)?
#
# Uso:
#   export MUTUAL_TOKEN='...'      # ou o script pergunta, sem ecoar
#   bash mutual-probe.sh
#
# SAIDA em /root/mutual/ (FORA do repositorio, de proposito: a amostra tem
# CPF e endereco de gente real e NAO pode ser comitada).
# ---------------------------------------------------------------------------
set -uo pipefail

BASE="${MUTUAL_BASE:-https://smartcar-api.mutualignit.com.br}"
PREFIXO="${MUTUAL_PREFIXO:-/public_api/v2}"
DOCS="${MUTUAL_DOCS:-/redoc/}"      # confirmado na tela: Redoc, nao /docs/
SAIDA="${MUTUAL_SAIDA:-/root/mutual}"
mkdir -p "$SAIDA"

if [ -z "${MUTUAL_TOKEN:-}" ]; then
  read -rsp 'Token do Mutual (nao aparece na tela): ' MUTUAL_TOKEN; echo
fi
[ -z "$MUTUAL_TOKEN" ] && { echo 'Sem token. Abortado.'; exit 1; }

# le json sem depender de jq
ler() { python3 -c "$1" 2>/dev/null; }
codigo() { curl -s -o "$2" -w '%{http_code}' -m 25 "$@" 2>/dev/null || echo 000; }

echo "== 1. O dominio responde e este IP esta liberado? =========================="
HTTP=$(curl -s -o "$SAIDA/docs.html" -w '%{http_code}' -m 25 "$BASE$PREFIXO$DOCS")
echo "GET $PREFIXO$DOCS  ->  HTTP $HTTP  ($(wc -c <"$SAIDA/docs.html") bytes)"
case "$HTTP" in
  000) echo '   !! SEM RESPOSTA. Timeout = IP deste servidor provavelmente NAO liberado.';;
  200) echo '   OK: a rede daqui alcanca a Mutual.';;
  40*|50*) echo "   Respondeu, mas com $HTTP — a rede esta ok, o resto e do lado deles.";;
esac

echo
echo "== 2. Onde esta o OpenAPI (o contrato)? ===================================="
# a pagina de docs (Redoc/Swagger/Scalar) referencia o spec no proprio HTML
grep -oE '(spec-url|data-url|url)["'"'"']?[:=]["'"'"' ]*[^"'"'"' ><]+' "$SAIDA/docs.html" \
  | head -20 || echo '   (nada obvio no HTML — segue para os caminhos usuais)'

echo '   -- testando os caminhos usuais --'
for P in "$PREFIXO/swagger.json" "$PREFIXO/swagger.yaml" "$PREFIXO/swagger/?format=openapi" \
         "$PREFIXO/schema/?format=json" "$PREFIXO/schema/" "$PREFIXO/openapi.json"; do
  H=$(curl -s -o "$SAIDA/spec.tmp" -w '%{http_code}' -m 25 "$BASE$P")
  T=$(head -c 1 "$SAIDA/spec.tmp" 2>/dev/null)
  if [ "$H" = "200" ] && { [ "$T" = "{" ] || [ "$T" = "o" ]; }; then
    mv "$SAIDA/spec.tmp" "$SAIDA/mutual-openapi.json"
    echo "   ACHOU -> $P  (salvo em $SAIDA/mutual-openapi.json)"; break
  fi
  echo "   $H  $P"
done
rm -f "$SAIDA/spec.tmp"

SPEC="$SAIDA/mutual-openapi.json"
if [ -s "$SPEC" ]; then
  echo
  echo '   -- COMO E A AUTENTICACAO (direto do contrato, sem chute) --'
  ler "
import json;d=json.load(open('$SPEC'))
s=(d.get('components',{}) or {}).get('securitySchemes') or d.get('securityDefinitions') or {}
print(json.dumps(s,indent=2,ensure_ascii=False) if s else '   (o spec nao declara securitySchemes)')
"
  echo '   -- ENDPOINTS DE LEITURA (GET) --'
  ler "
import json;d=json.load(open('$SPEC'))
for p,ops in sorted((d.get('paths') or {}).items()):
    if 'get' in ops:
        t=(ops['get'].get('tags') or ['-'])[0]
        print(f'   GET {p:<55} [{t}]')
" | head -60
fi

echo
echo "== 3. O token funciona? (testa as 3 formas mais comuns) ===================="
ALVO="${MUTUAL_ALVO:-$PREFIXO/event/}"    # confirmado na tela: GET /event/ (singular)
for NOME in 'Bearer' 'Basic' 'Token'; do
  case "$NOME" in
    Bearer)    HDR="Authorization: Bearer $MUTUAL_TOKEN";;
    Basic)     HDR="Authorization: Basic $MUTUAL_TOKEN";;
    Token)     HDR="Authorization: Token $MUTUAL_TOKEN";;
  esac
  H=$(curl -s -o "$SAIDA/probe.json" -w '%{http_code}' -m 25 -H "$HDR" -H 'Accept: application/json' "$BASE$ALVO")
  echo "   $NOME -> HTTP $H"
  if [ "$H" = "200" ]; then
    echo "   >> FUNCIONOU com '$NOME'. Primeiros 400 caracteres do retorno:"
    head -c 400 "$SAIDA/probe.json"; echo; echo "   AUTH_OK=$NOME" > "$SAIDA/auth.txt"; break
  fi
done
[ -f "$SAIDA/auth.txt" ] || echo '   Nenhuma das 3 passou — ver securitySchemes no passo 2 e o ALVO usado.'

echo
echo "== 4. Onde ficou tudo ======================================================"
ls -la "$SAIDA"
cat <<'FIM'

PROXIMO PASSO
  - Mande o arquivo mutual-openapi.json (nao tem dado de ninguem, so o formato).
  - NAO mande probe.json nem amostras: tem CPF/nome/endereco reais.
  - NAO comite nada daqui de dentro do VPS: /opt/scar e checkout de DEPLOY;
    commit local ali conflita com o proximo `git pull`.
FIM
