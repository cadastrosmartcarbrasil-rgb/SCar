#!/usr/bin/env bash
# Sincronia automatica com o Mutual (0107) — chamado pelo crontab do VPS.
#   crontab -e  ->  20 3 * * * /opt/scar/scripts/mutual-sincronizar.sh
# Recaptura equipes, contratos, associados, enderecos e veiculos e roda a carga
# de cada unidade (sem gerar boleto). Usa o MESMO segredo da baixa bancaria
# (COBRANCA_CRON_SECRET), lido do .env SEM `source` (source quebra valores).
# Demora minutos: espera ate 1 h. Log em /var/log/scar-mutual.log.
set -u
ENV_FILE="${ENV_FILE:-/opt/scar/.env}"
URL="${URL:-https://appsmartcar.com.br/api/v1/mutual/sincronizar}"
LOG="${LOG:-/var/log/scar-mutual.log}"

SEGREDO="$(grep -E '^COBRANCA_CRON_SECRET=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '\r"')"
if [ -z "$SEGREDO" ]; then
  echo "$(date -Is) ERRO: COBRANCA_CRON_SECRET vazio em $ENV_FILE" >> "$LOG"
  exit 1
fi

echo "$(date -Is) inicio" >> "$LOG"
RESP="$(curl -sS --max-time 3600 -X POST -H "x-cron-secret: $SEGREDO" -H 'Content-Type: application/json' -d '{}' \
  -w ' HTTP=%{http_code}' "$URL" 2>&1)"
# Resumo, cada etapa e as equipes novas sem unidade (essas pedem decisao na tela).
echo "$(date -Is) $(echo "$RESP" | grep -o '"resumo":"[^"]*"\|"error":"[^"]*"\|"equipes_sem_unidade":\[[^]]*\]\|HTTP=[0-9]*' | tr '\n' ' ')" >> "$LOG"
echo "$RESP" | grep -o '"etapa":"[^"]*","ok":[a-z]*,"detalhe":"[^"]*"' | sed "s/^/$(date -Is)   /" >> "$LOG"
