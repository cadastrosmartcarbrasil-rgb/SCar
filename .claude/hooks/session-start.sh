#!/bin/bash
# ============================================================================
# SCar :: SessionStart
#
# Faz duas coisas, nessa ordem de importancia:
#
#  1) GRITA se a sessao nasceu no branch errado. Ja custou DOIS dias de
#     trabalho jogados fora (a fase da tela de vendas e o painel da 24h):
#     o default do GitHub e um branch morto, entao quem clona o padrao comeca
#     numa base parada, escreve migration com numero ja usado e so descobre no
#     fim. Aviso em prosa dentro do CLAUDE.md nao resolveu — por isso a checagem
#     virou codigo.
#
#  2) Instala as dependencias, para `npm run validate` rodar sem preparo.
#
# Nao usa `set -e`: hook de inicio de sessao nunca pode DERRUBAR a sessao. Se a
# instalacao falhar, a sessao comeca mesmo assim e a pessoa conserta na mao.
# ============================================================================
set -uo pipefail

BRANCH_TRABALHO="claude/claude-md-opcao-x-98kfj5"
cd "${CLAUDE_PROJECT_DIR:-$(dirname "${BASH_SOURCE[0]}")/../..}" || exit 0

atual="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo desconhecido)"

if [ "$atual" != "$BRANCH_TRABALHO" ]; then
  cat <<AVISO

  ############################################################################
  #  ATENCAO: ESTA SESSAO NAO ESTA NO BRANCH DE TRABALHO
  #
  #    voce esta em : $atual
  #    o certo e    : $BRANCH_TRABALHO   (trabalho E deploy)
  #
  #  O default do GitHub e um branch MORTO. Trabalhar nele significa base
  #  desatualizada, numero de migration ja usado e retrabalho no fim do dia.
  #
  #    git fetch origin $BRANCH_TRABALHO
  #    git checkout $BRANCH_TRABALHO
  #
  #  So siga em outro branch se o usuario tiver pedido isso explicitamente.
  ############################################################################

AVISO
else
  echo "SCar: branch de trabalho OK ($atual)."
fi

# --------------------------------------------------------------- dependencias
# `npm install` (nao `ci`) para aproveitar o cache do container entre sessoes.
if [ -f package.json ]; then
  echo "SCar: instalando dependencias..."
  npm install --no-audit --no-fund || echo "SCar: npm install falhou — rode na mao antes de 'npm run validate'."
fi

# O Postgres de teste NAO e provisionado aqui: `scripts/db-test.sh` ja cria o
# cluster sozinho na primeira chamada de `npm run test:db`. Duplicar isso seria
# o "caminho paralelo" que o CLAUDE.md manda evitar.
exit 0
