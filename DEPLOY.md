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

## 3. Conferência

| Sintoma | Causa provável |
|---|---|
| Menu sem os itens novos | Container não foi reconstruído (ou pull no branch errado) |
| Tela abre e quebra ao carregar dados | Falta rodar a migration daquele módulo no Supabase |
| `not a git repository` | O comando rodou no Windows, não no servidor |
| `couldn't find remote ref` | Branch errado no `git pull` |

## Branch de produção

O VPS acompanha **`claude/claude-md-opcao-x-98kfj5`** — é o branch que contém
todo o histórico do projeto mais os módulos novos. O `claude/scar-project-btasdf`
é o branch padrão do repositório e está parado em `953c53c`. Mesmo repositório,
branches diferentes: nada foi migrado de lugar.

Se uma sessão futura for configurada para outro branch, ajuste o padrão em
`scripts/deploy.ps1` / `scripts/deploy.sh` (ou passe `-Branch`).
