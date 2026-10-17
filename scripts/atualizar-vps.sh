#!/usr/bin/env bash
# ============================================================================
# SCar :: atualiza a producao a partir da IMAGEM PRONTA (roda DENTRO do VPS).
#
#   bash scripts/atualizar-vps.sh            # git pull + imagem do commit atual
#   bash scripts/atualizar-vps.sh <sha>      # volta/vai para a imagem de um commit
#
# A imagem e compilada pelo GitHub Actions (.github/workflows/imagem.yml) a cada
# push no branch de deploy. Aqui so se baixa e troca o contêiner: o VPS nao
# compila mais nada. Se a imagem do commit ainda estiver sendo compilada, o
# script espera (ate ESPERA_MAX segundos, padrao 15 min).
#
# Plano B (sem GitHub/registro): DOCKER_BUILDKIT=0 docker compose up -d --build
# ============================================================================
set -euo pipefail

BRANCH="${BRANCH:-claude/claude-md-opcao-x-98kfj5}"
IMAGEM="${IMAGEM:-ghcr.io/cadastrosmartcarbrasil-rgb/scar}"
ESPERA_MAX="${ESPERA_MAX:-900}"

cd "$(dirname "$0")/.."

if [ -n "${1:-}" ]; then
  SHA="$1"
  echo "==> Imagem pedida: $SHA (sem git pull)"
else
  git pull --ff-only origin "$BRANCH"
  SHA="$(git rev-parse HEAD)"
  echo "==> Commit $(git log -1 --format='%h %s')"
fi

inicio=$(date +%s)
while true; do
  if saida=$(docker pull "$IMAGEM:$SHA" 2>&1); then
    break
  fi
  if echo "$saida" | grep -qiE 'manifest unknown|not found'; then
    passado=$(( $(date +%s) - inicio ))
    if [ "$passado" -ge "$ESPERA_MAX" ]; then
      echo "A imagem deste commit nao apareceu em ${ESPERA_MAX}s."
      echo "Confira a aba Actions do GitHub (workflow 'Imagem de producao')."
      exit 1
    fi
    echo "   GitHub ainda compilando a imagem... (${passado}s) — aguardando"
    sleep 20
    continue
  fi
  echo "$saida"
  echo
  echo "Falha ao baixar a imagem. Causas conhecidas (DEPLOY.md, secao 1.1):"
  echo " - 'denied'/'unauthorized': falta o 'docker login ghcr.io' neste servidor;"
  echo " - 'lookup ... i/o timeout': DNS do daemon do Docker (aplicar o conserto do resolv.conf)."
  echo "Plano B: DOCKER_BUILDKIT=0 docker compose up -d --build"
  exit 1
done

# O compose usa :latest; marcar a imagem do commit como latest LOCAL faz o `up`
# subir exatamente ela (sem depender do que a latest remota for agora).
docker tag "$IMAGEM:$SHA" "$IMAGEM:latest"
docker compose up -d --no-build

# Guarda as 3 imagens mais recentes (para voltar com `atualizar-vps.sh <sha>`)
# e apaga as mais antigas, para o disco nao encher de novo (DEPLOY.md 2.1).
docker images "$IMAGEM" --format '{{.Repository}}:{{.Tag}}' \
  | grep -v ':latest$' | tail -n +4 | xargs -r docker rmi >/dev/null 2>&1 || true
docker image prune -f >/dev/null 2>&1 || true

echo
echo "Producao atualizada para ${SHA:0:7}. Atualize a pagina com Ctrl+F5."
