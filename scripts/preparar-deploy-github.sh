#!/usr/bin/env bash
# ============================================================================
# SCar :: prepara o VPS para o DEPLOY PELO GITHUB. Rodar UMA vez, como root:
#
#   cd /opt/scar && git pull origin claude/claude-md-opcao-x-98kfj5 \
#     && bash scripts/preparar-deploy-github.sh
#
# O que faz (pode rodar de novo sem estragar nada):
#   1. cria a chave ~/.ssh/github_deploy (se ainda nao existe);
#   2. autoriza essa chave no authorized_keys PRESA ao scripts/deploy-remoto.sh —
#      com ela da para atualizar a producao e mais nada (sem terminal, sem tunel);
#   3. mostra a chave PRIVADA, para colar no GitHub como o Secret VPS_CHAVE_SSH.
# ============================================================================
set -euo pipefail

RAIZ="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
CHAVE="$HOME/.ssh/github_deploy"
AUTH="$HOME/.ssh/authorized_keys"

mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
chmod +x "$RAIZ/scripts/deploy-remoto.sh"

if [ ! -f "$CHAVE" ]; then
  ssh-keygen -t ed25519 -N "" -C "github-deploy-scar" -f "$CHAVE" >/dev/null
  echo "==> Chave nova criada."
else
  echo "==> Chave ja existia; reaproveitando."
fi

PUB="$(cat "$CHAVE.pub")"
LINHA="command=\"$RAIZ/scripts/deploy-remoto.sh\",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty $PUB"

touch "$AUTH" && chmod 600 "$AUTH"
# tira uma autorizacao antiga desta mesma chave e grava a versao certa
grep -vF "$PUB" "$AUTH" > "$AUTH.tmp" || true
printf '%s\n' "$LINHA" >> "$AUTH.tmp"
mv "$AUTH.tmp" "$AUTH" && chmod 600 "$AUTH"
echo "==> Chave autorizada SO para atualizar a producao."

echo
echo "Endereco do servidor (Secret VPS_HOST): use o IP abaixo ou appsmartcar.com.br"
hostname -I 2>/dev/null | awk '{print "   " $1}' || true
echo
echo "============ COPIE DAQUI (Secret VPS_CHAVE_SSH) ============"
cat "$CHAVE"
echo "============ ATE AQUI =========================================="
echo
echo "No GitHub: repositorio -> Settings -> Secrets and variables -> Actions -> New repository secret"
echo "  VPS_HOST      = o endereco acima"
echo "  VPS_CHAVE_SSH = o bloco entre as linhas, inteiro (BEGIN ... END)"
echo "Depois: aba Actions -> 'Publicar em producao' -> Run workflow."
