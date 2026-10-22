#!/usr/bin/env bash
# Rotina diaria da REVISTORIA do boleto vencido (0137) — chamado pelo crontab do VPS:
#   crontab -e  ->  15 6 * * * /opt/scar/scripts/revistorias-rotina.sh
# Usa o mesmo COBRANCA_CRON_SECRET da baixa (lido do .env SEM `source`).
# Log em /var/log/scar-revistorias.log.
set -u
ENV_FILE="${ENV_FILE:-/opt/scar/.env}"
URL="${URL:-https://appsmartcar.com.br/api/v1/cobrancas/revistorias/rotina}"
LOG="${LOG:-/var/log/scar-revistorias.log}"

SEGREDO="$(grep -E '^COBRANCA_CRON_SECRET=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '\r"')"
if [ -z "$SEGREDO" ]; then
  echo "$(date -Is) ERRO: COBRANCA_CRON_SECRET vazio em $ENV_FILE" >> "$LOG"
  exit 1
fi

RESP="$(curl -sS --max-time 120 -X POST -H "x-cron-secret: $SEGREDO" -H 'Content-Type: application/json' -d '{}' \
  -w ' HTTP=%{http_code}' "$URL" 2>&1)"
echo "$(date -Is) $(echo "$RESP" | grep -o '"resumo":{[^}]*}\|"error":"[^"]*"\|HTTP=[0-9]*' | tr '\n' ' ')" >> "$LOG"
