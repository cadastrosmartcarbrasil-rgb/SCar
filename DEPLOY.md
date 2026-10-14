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
cd /opt/scar && git pull origin claude/claude-md-opcao-x-98kfj5 && DOCKER_BUILDKIT=0 docker compose up -d --build
```

> **O `DOCKER_BUILDKIT=0` faz parte do comando — não é contorno de emergência.**
> O daemon do Docker deste VPS resolve DNS pelo stub do `systemd-resolved`, que
> já ficou "no ar e mudo": com o BuildKit ligado, o build para em
> `failed to resolve source metadata` **antes de começar**. Com ele desligado, o
> builder clássico usa a `node:20-alpine` que já está no cache local e o deploy
> passa. Nosso `Dockerfile` é genérico (sem `# syntax=`, sem cache mount), então
> **nada se perde** — só o paralelismo do BuildKit, que aqui não muda nada.
> O diagnóstico completo, e o conserto definitivo do DNS, estão mais abaixo.

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
ssh root@appsmartcar.com.br "cd /opt/scar && git pull origin claude/claude-md-opcao-x-98kfj5 && DOCKER_BUILDKIT=0 docker compose up -d --build"
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

### Por que o comando leva `DOCKER_BUILDKIT=0` (e o que fazer para não precisar dele)

Sem ele, o build para assim:

```
failed to solve: node:20-alpine: ... dial tcp: lookup registry-1.docker.io
on 127.0.0.53:53: read udp ... i/o timeout
```

**Não é erro do projeto, e o site NÃO caiu:** build que falha não substitui o
contêiner — a produção segue na versão anterior. O que quebrou foi o DNS do
*daemon* do Docker.

#### O que aconteceu de verdade (diagnosticado em 09/09/2026)

**`getent` e o Docker não usam o mesmo caminho de DNS — e é isso que engana.**
O `getent` fala com o `systemd-resolved` por D-Bus (`nss-resolve`, no
`nsswitch.conf`), então ele responde bem mesmo com o resolvedor pela metade. O
daemon do Docker é Go compilado sem CGO: lê o `/etc/resolv.conf` cru e consulta
**`127.0.0.53:53` por UDP** — o *stub listener*. Aqui o stub estava **no ar e
mudo**: `ss -ulnp | grep ':53'` mostrava `127.0.0.53%lo:53` escutando, o
`getent ahostsv4 registry-1.docker.io` devolvia os IPs certinhos, e mesmo assim
o build estourava.

Consequência prática: **`getent` funcionando NÃO prova que o Docker vai
resolver**, e `systemctl restart systemd-resolved` não conserta este caso.

#### Por que `DOCKER_BUILDKIT=0` passa

```bash
cd /opt/scar && DOCKER_BUILDKIT=0 docker compose up -d --build
```

Funciona porque quem falha na resolução é o **daemon**, e o builder antigo não
precisa dele: usa a `node:20-alpine` que já está no cache local em vez de pedir
o manifesto ao registro. O `npm ci` roda **dentro do contêiner**, que recebe DNS
próprio do Docker (com o host apontando para `127.0.0.53`, o Docker troca por
resolvedor público dentro do contêiner). Deploy inteiro sem tocar no servidor.

**Isto não conserta o DNS do servidor** — só tira o build da dependência dele.
Por isso `DOCKER_BUILDKIT=0` virou parte do comando padrão e dos scripts
(`scripts/deploy.sh` / `deploy.ps1`): sem ele, o `docker compose up -d --build`
puro vai parar no mesmo lugar na próxima vez. Quem quiser voltar ao comando
limpo, aplique o conserto abaixo — depois dele o `DOCKER_BUILDKIT=0` fica
inofensivo, não obrigatório.

#### O conserto (tira o Docker da dependência do stub)

```bash
cat /run/systemd/resolve/resolv.conf   # PRECISA listar nameservers de verdade
ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf
cat /etc/resolv.conf                   # nao pode mais mostrar 127.0.0.53
```

Passa a valer o arquivo de *uplink* que o próprio systemd mantém com os
servidores reais do provedor, em vez do stub. É modo suportado do
`systemd-resolved` e a configuração de muitos hosts Docker; o que se perde é o
cache local de DNS. Se o `cat` do primeiro comando vier vazio ou sem
`nameserver`, **não troque** — sem servidor real ali você fica sem DNS nenhum.

Reverter é uma linha:
```bash
ln -sf /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf
```

Causa raiz do stub mudo, se um dia valer investigar (quase sempre é regra de
firewall descartando UDP no loopback):
```bash
ufw status; iptables -S INPUT | head
```

## 2.1 Disco cheio — a causa de "o deploy travou" (12/10/2026)

**Sintoma:** o build fica parado em `next build` por muito tempo, ou termina e o sistema continua
na versão antiga. Em 12/10/2026 o disco do VPS estava **100% cheio (67 GB)**: cada deploy deixa
imagens antigas para trás, e o cache do BuildKit acumulou **30 GB**. Disco cheio também derruba
banco de dados de outros contêineres (o `evolution_postgres` parou).

**Conferir:** `df -h /` e `docker system df`.

**Limpar (seguro):**
```bash
docker builder prune -a -f   # cache do BuildKit — o deploy usa DOCKER_BUILDKIT=0, nao precisa dele
docker image prune -f        # so imagens orfas (<none>) de deploys anteriores
```
**NUNCA** `docker image prune -a`: apaga a `node:20-alpine` do cache, e o servidor não consegue
baixá-la de novo (o problema de DNS acima) — nenhum deploy passaria mais. **NUNCA**
`docker system prune` / `docker container prune`: apagam contêineres parados com dado dentro.

**Rotina:** `docker image prune -f` uma vez por mês, ou sempre que `df -h /` passar de 85%.
O swap foi aumentado para 3 GB (`/swapfile2`, 2 GB, no `/etc/fstab`) no mesmo dia.

## 2.2 Domínio do sistema (trocado em 14/10/2026)

O app responde em **`https://appsmartcar.com.br`** (antes `app.smartvidanet.com.br`). O domínio
foi comprado na KingHost e o DNS fica lá: registro **A** (`@`) apontando para o IP do VPS.

- **O `Caddyfile` do repositório tem os quatro endereços** — `{$DOMAIN}` (o app), `www.{$DOMAIN}`
  e `app.smartvidanet.com.br` (os dois redirecionam para o domínio novo mantendo o caminho, então
  hotlink, cotação e vistoria antigos continuam abrindo) e o `n8n.smartvida.com` (webhooks do
  WhatsApp, outro serviço no mesmo VPS). Por isso **`DOMAIN` é UM domínio só**:
  ```
  DOMAIN=appsmartcar.com.br
  ```
  Lista separada por vírgula quebra o `www.{$DOMAIN}` e o destino dos redirecionamentos.
- **Não edite o `Caddyfile` no servidor — edite no repositório.** O bloco do n8n e os
  redirecionamentos nasceram editados à mão em `/opt/scar` e foram trazidos para cá em 14/10/2026;
  um `git checkout Caddyfile` antes disso teria apagado o n8n. Se o `git pull` parar com
  `Your local changes ... would be overwritten`, compare com `git -C /opt/scar diff Caddyfile`,
  traga para o repositório o que for de verdade e só então descarte a cópia local.
- **Conferir depois de mexer:** `docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile`
  e `docker compose logs caddy --tail 50` (certificado emitido para cada endereço).
- **Supabase → Authentication → URL Configuration:** `https://appsmartcar.com.br` em *Site URL* e
  em *Redirect URLs* (sem apagar o antigo durante a transição).
- **Cron da baixa do Sicredi:** `scripts/baixa-banco.sh` já chama o domínio novo — vale depois do
  `git pull`. Antes disso ele chamava o domínio antigo, que agora devolve 301 (o `curl` do script
  não segue redirecionamento de POST): a baixa só volta a rodar com o `git pull` feito.
- **Remetente de e-mail: `Smart Car Brasil <nao-responda@appsmartcar.com.br>`** — padrão no código
  (`src/lib/email.ts`, usado pelo voucher da 24h, pela boas-vindas do vendedor e pela edge function).
  `EMAIL_FROM` no `.env` do VPS sobrepõe; **se ela ainda tiver `smartvidanet`, apague a linha ou
  troque**. Para o Resend ENTREGAR, o domínio `appsmartcar.com.br` tem de estar verificado no Resend
  (registros DNS na KingHost) — sem isso o envio é recusado e a tela avisa.

## 3. Conferência

| Sintoma | Causa provável |
|---|---|
| Menu sem os itens novos | Container não foi reconstruído (ou pull no branch errado) |
| Tela abre e quebra ao carregar dados | Falta rodar a migration daquele módulo no Supabase |
| `not a git repository` | O comando rodou no Windows, não no servidor |
| `couldn't find remote ref` | Branch errado no `git pull` |
| `failed to resolve source metadata` / `i/o timeout` | Faltou o `DOCKER_BUILDKIT=0` no comando (é DNS do daemon do Docker — ver a seção acima). O site **não** caiu: build que falha não substitui o contêiner. |

## Branch de produção

O VPS acompanha **`claude/claude-md-opcao-x-98kfj5`** — é o branch que contém
todo o histórico do projeto mais os módulos novos. O `claude/scar-project-btasdf`
é o branch padrão do repositório e está parado em `953c53c`. Mesmo repositório,
branches diferentes: nada foi migrado de lugar.

Se uma sessão futura for configurada para outro branch, ajuste o padrão em
`scripts/deploy.ps1` / `scripts/deploy.sh` (ou passe `-Branch`).
