# Deploy do SCar — passo a passo

> Regra de ouro: **o `git pull` roda dentro do servidor**, nunca no PowerShell do
> Windows. Rodar na máquina local dá `fatal: not a git repository`. Toda janela
> nova de terminal começa fora do servidor — o `ssh` precisa ser refeito.

## 1. Migrations (Supabase, pelo navegador)

Abra o **SQL Editor** do projeto no Supabase e rode as migrations novas **na
ordem numérica**, uma de cada vez. Os arquivos estão em `supabase/migrations/`.

Para saber o que falta, rode no SQL Editor:

```sql
-- Existe? Se a consulta devolver a função, a migration já foi aplicada.
select proname from pg_proc where proname in (
  'gerar_faturas_periodo',            -- 0025 (Cobrança)
  'abrir_acionamento',                -- 0026 (Assistência 24h)
  'sincronizar_lancamento_acionamento',-- 0027 (centro de custo / OS editável)
  'mover_lead_status',                -- 0028 (CRM Kanban / desconto)
  'abrir_protocolo',                  -- 0029 (SAC / Central de Protocolos)
  'alertas_veiculo',                  -- 0030 (alertas do veiculo + ordenacao)
  'definir_trajeto_acionamento'       -- 0031 (geolocalizacao da OS 24h)
);
```

Migration que só cria tabela/coluna não aparece em `pg_proc` — confira pelo objeto:

```sql
-- Rastreadores (0049): devolve o nome se a migration ja foi aplicada.
select to_regclass('public.empresas_rastreamento');
```

Montando um ambiente do zero? Cole o `supabase/schema.sql` (consolidado de
todas as migrations) em vez de rodar uma a uma.

## 2. Aplicação (VPS)

O comando muda conforme **de onde você digita**. Confira o prompt antes:

### (a) Você JÁ está dentro do servidor
Prompt parecido com `root@smartvida:~#`. É o caso mais comum quando a janela do
SSH já está aberta:

```bash
cd /opt/scar && git pull origin claude/claude-md-opcao-x-98kfj5 && docker compose up -d --build
```

### (b) Você está no SEU computador
Prompt do PowerShell (`PS C:\...>`) ou do terminal local. Aí o `ssh` faz parte
do comando — ele é quem entra no servidor:

```powershell
.\scripts\deploy.ps1
```

```bash
npm run deploy
```

Sem os scripts, o equivalente em uma linha:

```powershell
ssh root@app.smartvidanet.com.br "cd /opt/scar && git pull origin claude/claude-md-opcao-x-98kfj5 && docker compose up -d --build"
```

> **Não misture os dois.** Rodar a versão com `ssh root@...` **de dentro do
> servidor** faz a máquina tentar conectar nela mesma e falha. E rodar a versão
> sem `ssh` no PowerShell dá `fatal: not a git repository`, porque o projeto não
> está no seu computador — está em `/opt/scar`, no VPS.

Terminado o build, atualize a página com **Ctrl+F5**.

### Se o `cd` falhar (`No such file or directory`)

O projeto está em outro caminho no servidor. Descubra pelo próprio Docker:

```powershell
.\scripts\deploy.ps1 -Descobrir
```

e repita passando o caminho: `.\scripts\deploy.ps1 -Caminho /caminho/que/apareceu`.

### Variáveis de ambiente novas (opcionais)

O mapa da Assistência 24h funciona **sem configurar nada** (usa OpenStreetMap +
OSRM, públicos). Para usar o Google Maps, adicione no `.env` do servidor e
reconstrua o container:

```
GOOGLE_MAPS_API_KEY=sua_chave
```

Sem a chave, o proxy `/api/v1/geo` cai no provedor público automaticamente.

### Se o build parar em `failed to resolve source metadata` / `i/o timeout`

```
failed to solve: node:20-alpine: ... dial tcp: lookup registry-1.docker.io
on 127.0.0.53:53: read udp ... i/o timeout
```

**Isso não é erro do projeto** — o Docker não conseguiu resolver DNS no VPS.
O `127.0.0.53` é o resolvedor local do sistema (`systemd-resolved`); quando ele
para de responder, nada que precise de nome de domínio funciona, e o primeiro a
reclamar é o `FROM node:20-alpine`. Como o build falhou, **o contêiner antigo
continua no ar**: o site não caiu, só não foi atualizado.

Tudo abaixo roda **dentro do VPS**.

**1) Confirme que é DNS, e não a rede inteira:**
```bash
ping -c1 8.8.8.8                      # rede OK? (responde = a rede está viva)
getent hosts registry-1.docker.io     # nome resolve? (vazio = é DNS mesmo)
systemctl status systemd-resolved --no-pager | head -5
```

**2) O conserto que resolve na maioria das vezes:**
```bash
systemctl restart systemd-resolved
getent hosts registry-1.docker.io     # tem de devolver um IP agora
```
Resolvendo, repita o deploy normal (`git pull` + `docker compose up -d --build`).

**3) Se o `systemd-resolved` continuar mudo**, aponte um DNS público de forma
permanente (`/etc/systemd/resolved.conf`):
```bash
printf '[Resolve]\nDNS=8.8.8.8 1.1.1.1\nFallbackDNS=9.9.9.9\n' >> /etc/systemd/resolved.conf
systemctl restart systemd-resolved
getent hosts registry-1.docker.io
```

**4) Precisa subir AGORA e o DNS não coopera:** se a imagem base já está no
servidor (`docker images | grep node`), o **builder antigo** usa a cópia local
em vez de perguntar ao registro:
```bash
DOCKER_BUILDKIT=0 docker compose up -d --build
```
Isso é contorno, não conserto — o `npm ci` do build também precisa de rede, e o
próximo deploy vai esbarrar no mesmo DNS. Feche o item 2 ou 3.

## 3. Conferência

| Sintoma | Causa provável |
|---|---|
| Menu sem os itens novos | Container não foi reconstruído (ou pull no branch errado) |
| Tela abre e quebra ao carregar dados | Falta rodar a migration daquele módulo no Supabase |
| `not a git repository` | O comando rodou no Windows, não no servidor |
| `couldn't find remote ref` | Branch errado no `git pull` |
| `failed to resolve source metadata` / `i/o timeout` | DNS do VPS fora do ar — ver a seção acima; o site **não** caiu |

## Branch de produção

O VPS acompanha **`claude/claude-md-opcao-x-98kfj5`** — é o branch que contém
todo o histórico do projeto mais os módulos novos. O `claude/scar-project-btasdf`
é o branch padrão do repositório e está parado em `953c53c`. Mesmo repositório,
branches diferentes: nada foi migrado de lugar.

Se uma sessão futura for configurada para outro branch, ajuste o padrão em
`scripts/deploy.ps1` / `scripts/deploy.sh` (ou passe `-Branch`).
