#!/usr/bin/env bash
# Rotina dos E-MAILS DE COBRANCA (0168) — chamado pelo crontab do VPS:
#   crontab -e  ->  */10 * * * * /opt/scar/scripts/email-cobranca.sh
# Enfileira os avisos do dia (D-5, D-1, D0, D+2, D+7) e despacha o que estiver
# na janela (08:00-20:00 de Brasilia, configuravel no painel). Fora da janela a
# chamada so enfileira. Usa o mesmo COBRANCA_CRON_SECRET da baixa (lido do .env
# SEM `source`). Log em /var/log/scar-email.log.
set -u
ENV_FILE="${ENV_FILE:-/opt/scar/.env}"
URL="${URL:-https://appsmartcar.com.br/api/v1/comunicacoes/email/rotina}"
LOG="${LOG:-/var/log/scar-email.log}"

SEGREDO="$(grep -E '^COBRANCA_CRON_SECRET=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '\r"')"
if [ -z "$SEGREDO" ]; then
  echo "$(date -Is) ERRO: COBRANCA_CRON_SECRET vazio em $ENV_FILE" >> "$LOG"
  exit 1
fi

RESP="$(curl -sS --max-time 150 -X POST -H "x-cron-secret: $SEGREDO" -H 'Content-Type: application/json' -d '{}' \
  -w ' HTTP=%{http_code}' "$URL" 2>&1)"
echo "$(date -Is) $(echo "$RESP" | grep -o '"resumo":{[^}]*}\|"fila":{[^}]*}\|"error":"[^"]*"\|"aviso":"[^"]*"\|HTTP=[0-9]*' | tr '\n' ' ')" >> "$LOG"
