#!/usr/bin/env bash
# ============================================================================
# SCar :: deploy para o VPS (Linux/macOS/WSL) — equivalente ao deploy.ps1.
#
#   ./scripts/deploy.sh                          # branch e host padrao
#   BRANCH=outro/branch ./scripts/deploy.sh
#   SERVIDOR=root@1.2.3.4 CAMINHO=/opt/scar ./scripts/deploy.sh
#   ./scripts/deploy.sh --descobrir              # mostra a pasta do projeto no VPS
#
# O `git pull` roda DENTRO do servidor (por isso o ssh "..."): rodar na maquina
# local falha com "not a git repository".
# ============================================================================
set -euo pipefail

BRANCH="${BRANCH:-claude/claude-md-opcao-x-98kfj5}"
SERVIDOR="${SERVIDOR:-root@app.smartvidanet.com.br}"
CAMINHO="${CAMINHO:-/opt/scar}"

if [ "${1:-}" = "--descobrir" ]; then
  echo "Procurando a pasta do projeto no servidor..."
  ssh "$SERVIDOR" 'docker inspect $(docker ps -q | head -1) --format "{{index .Config.Labels \"com.docker.compose.project.working_dir\"}}"'
  exit 0
fi

echo "==> $SERVIDOR : $CAMINHO ($BRANCH)"
ssh "$SERVIDOR" "set -e
  cd $CAMINHO
  git fetch origin $BRANCH
  git checkout $BRANCH
  git pull origin $BRANCH
  docker compose up -d --build"

echo
echo "Deploy concluido. Atualize a pagina com Ctrl+F5."
