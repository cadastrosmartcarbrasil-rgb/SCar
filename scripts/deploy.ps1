# =============================================================================
# SCar :: deploy para o VPS (Windows / PowerShell)
#
# Uso, a partir de QUALQUER pasta do Windows (nao precisa estar no repositorio):
#
#   .\deploy.ps1                          # usa o branch e o host padrao
#   .\deploy.ps1 -Branch outro/branch
#   .\deploy.ps1 -Servidor root@1.2.3.4 -Caminho /opt/scar
#   .\deploy.ps1 -Descobrir               # so mostra onde o projeto esta no VPS
#
# Por que este arquivo existe: o `git pull` PRECISA rodar dentro do servidor.
# Rodando no Windows ele falha com "not a git repository". O script abre a
# conexao SSH e executa tudo la dentro, numa linha so.
#
# Antes de rodar: aplique as migrations novas no Supabase SQL Editor (na ordem).
# =============================================================================
param(
  [string]$Branch   = "claude/claude-md-opcao-x-98kfj5",
  [string]$Servidor = "root@app.smartvidanet.com.br",
  [string]$Caminho  = "/opt/scar",
  [switch]$Descobrir
)

if ($Descobrir) {
  Write-Host "Procurando a pasta do projeto no servidor..." -ForegroundColor Cyan
  ssh $Servidor "docker inspect `$(docker ps -q | head -1) --format '{{index .Config.Labels \`"com.docker.compose.project.working_dir\`"}}'"
  exit $LASTEXITCODE
}

Write-Host "==> $Servidor : $Caminho ($Branch)" -ForegroundColor Cyan

$remoto = "set -e; cd $Caminho; git fetch origin $Branch; git checkout $Branch; git pull origin $Branch; docker compose up -d --build"
ssh $Servidor $remoto

if ($LASTEXITCODE -eq 0) {
  Write-Host "`nDeploy concluido. Abra o sistema e atualize com Ctrl+F5." -ForegroundColor Green
} else {
  Write-Host "`nDeploy falhou (codigo $LASTEXITCODE)." -ForegroundColor Red
  Write-Host "Se a mensagem foi 'No such file or directory', rode: .\deploy.ps1 -Descobrir" -ForegroundColor Yellow
}
