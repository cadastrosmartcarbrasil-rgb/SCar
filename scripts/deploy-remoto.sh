#!/usr/bin/env bash
# ============================================================================
# SCar :: porta de entrada do DEPLOY PELO GITHUB (roda DENTRO do VPS).
#
# Nao e para rodar a mao. A chave SSH que o GitHub usa esta presa a este script
# no authorized_keys (command="..."): quem tiver a chave so consegue fazer
# ISTO — atualizar a producao. Nao abre terminal, nao roda outro comando.
#
# O GitHub pode mandar, no maximo, o sha de um commit (40 caracteres hex) para
# voltar/ir para uma versao especifica. Qualquer outra coisa e recusada.
# Instalacao: scripts/preparar-deploy-github.sh
# ============================================================================
set -euo pipefail

PEDIDO="${SSH_ORIGINAL_COMMAND:-}"
PEDIDO="$(printf '%s' "$PEDIDO" | tr -d '[:space:]')"

cd "$(dirname "$(readlink -f "$0")")/.."

if [ -z "$PEDIDO" ] || [ "$PEDIDO" = "ultimo" ]; then
  exec bash scripts/atualizar-vps.sh
elif printf '%s' "$PEDIDO" | grep -qE '^[0-9a-f]{40}$'; then
  exec bash scripts/atualizar-vps.sh "$PEDIDO"
else
  echo "Pedido recusado: este acesso so atualiza a producao (vazio, 'ultimo' ou o sha de 40 caracteres)."
  exit 2
fi
