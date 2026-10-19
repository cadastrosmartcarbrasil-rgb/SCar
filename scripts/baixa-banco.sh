#!/usr/bin/env bash
# Baixa automatica pelo banco (0105) — chamado pelo crontab do VPS.
#   crontab -e  ->  10 7,12,18,22 * * * /opt/scar/scripts/baixa-banco.sh
# Le o COBRANCA_CRON_SECRET do .env SEM dar `source` (source quebra valores)
# e chama a rota pelo dominio. Log em /var/log/scar-baixa.log.
set -u
ENV_FILE="${ENV_FILE:-/opt/scar/.env}"
URL="${URL:-https://appsmartcar.com.br/api/v1/cobrancas/baixa-banco}"
LOG="${LOG:-/var/log/scar-baixa.log}"

SEGREDO="$(grep -E '^COBRANCA_CRON_SECRET=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '\r"')"
if [ -z "$SEGREDO" ]; then
  echo "$(date -Is) ERRO: COBRANCA_CRON_SECRET vazio em $ENV_FILE" >> "$LOG"
  exit 1
fi

RESP="$(curl -sS --max-time 120 -X POST -H "x-cron-secret: $SEGREDO" -H 'Content-Type: application/json' -d '{}' \
  -w ' HTTP=%{http_code}' "$URL" 2>&1)"
# So o resumo vai para o log (o detalhe fica na tabela cobranca_liquidacoes).
echo "$(date -Is) $(echo "$RESP" | grep -o '"resumo":{[^}]*}\|"avisos_pendentes":{[^}]*}\|"error":"[^"]*"\|HTTP=[0-9]*' | tr '\n' ' ')" >> "$LOG"
