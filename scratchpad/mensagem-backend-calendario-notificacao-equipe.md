Oi! Esse pedido é maior que os outros — cobre três grupos de rota que ainda não existem aí, então já aviso de cara: se fizer sentido quebrar em fases, eu topo, é só falar.

## Contexto

O calendário de gravações (`/calendario`) e o sino de notificações já existem no frontend faz tempo, mas rodando 100% sobre dados de demonstração — nenhuma das rotas que eles chamam está implementada (nem documentada no `API.md`) hoje: `/recording-events`, `/crew` e `/notifications`.

Motivo de estar mexendo nisso agora: adicionei a possibilidade de vincular a escala de gravação a uma conta de verdade da equipe (em vez de só um nome livre tipo "Diego, freelancer"), pra abrir caminho pra notificar a pessoa certa quando ela é escalada — hoje isso não acontece porque não tem endpoint nenhum por trás. Precisa dos três grupos de rota funcionando pra fechar o ciclo:

```
Owner cria gravação e escala "Marina Alves" (conta real, não freelancer)
                    ↓
   backend salva o vínculo (RecordingEvent.crew → Crew.userId → User)
                    ↓
   backend cria notificação pra Marina: "gravação agendada em breve"
                    ↓
        Marina vê no sino dela quando loga
```

## O que precisa ser feito

### 1. `Crew` — pessoas da escala de gravação

Tabela nova. Um registro por pessoa que já apareceu numa escala (reaproveitável entre eventos, é um roster salvo por conta).

- `id`
- `nome` (string, obrigatório)
- `userId` (FK pro usuário da conta, **nullable**) — presente quando a pessoa é vinculada a uma conta real (owner/editor); `null` é o caso comum, gente sem login no Aprova (freelancer, motorista etc.)
- `contaId`/`agenciaId` (mesmo escopo multi-tenant de `Client`/`Project`)

Rotas:

| Método | Rota | Auth | Body | Resposta |
|---|---|---|---|---|
| `GET` | `/crew` | owner, editor | — | `Crew[]` |
| `POST` | `/crew` | owner, editor | `{ nome, userId? }` | `Crew` criado |

### 2. `RecordingEvent` — escala de gravação (`/calendario`)

Tabela nova.

- `id`
- `titulo` (string, obrigatório)
- `dataInicio` (datetime, obrigatório)
- `dataFim` (datetime, nullable)
- `clienteId` (FK pra `Client`, nullable)
- `equipe` — relação N:N com `Crew` (a escala pode ter várias pessoas)
- `observacoes` (text, nullable)
- `contaId`/`agenciaId` (mesmo escopo multi-tenant)

Rotas (mesmo padrão de auth de `/videos` — owner, editor):

| Método | Rota | Body | Resposta |
|---|---|---|---|
| `GET` | `/recording-events` | — | `RecordingEvent[]` |
| `POST` | `/recording-events` | `{ titulo, dataInicio, dataFim?, clienteId?, equipeIds?, observacoes? }` | `RecordingEvent` criado |
| `PATCH` | `/recording-events/:id` | mesmos campos, todos opcionais | `RecordingEvent` atualizado |
| `DELETE` | `/recording-events/:id` | — | `204` |

`equipeIds` é um array de ids de `Crew` já existentes (o frontend cria/reaproveita o `Crew` via `POST /crew` antes, e só manda os ids aqui).

Resposta esperada por item (`RecordingEvent`), incluindo a equipe expandida (não só ids, porque a tela mostra nome de cada pessoa direto no card do dia):

```json
{
  "id": "uuid",
  "titulo": "Gravação — Batom matte",
  "dataInicio": "2026-08-12T21:17:00.000Z",
  "dataFim": "2026-08-12T23:17:00.000Z",
  "clienteId": "uuid",
  "clienteNome": "Bela Cosméticos",
  "equipe": [
    { "id": "uuid", "nome": "Marina Alves", "userId": "uuid-do-user" },
    { "id": "uuid", "nome": "Diego (freelancer)", "userId": null }
  ],
  "observacoes": "Estúdio próprio. Levar o kit de iluminação extra."
}
```

### 3. `/notifications` — sino de notificações

Tabela nova (`Notification` ou nome que preferirem aí).

- `id`
- `tipo`: enum `comentario_cliente | aprovacao_cliente | ajuste_solicitado | avaliacao_cliente | lembrete_gravacao`
- `userId` (FK pro usuário dono da notificação — é o que faz ela ser "pessoal", não da conta inteira)
- `lida` (boolean, default `false`)
- `criadoEm`
- `videoId` (FK pra `Video`, nullable) — presente nos 4 primeiros tipos
- `recordingEventId` (FK pra `RecordingEvent`, nullable) — presente só em `lembrete_gravacao`

Rotas:

| Método | Rota | Body | Resposta |
|---|---|---|---|
| `GET` | `/notifications?naoLidas=true` | — | `Notification[]` (query opcional filtra só não lidas) |
| `GET` | `/notifications/unread-count` | — | número cru (não `{ count }`) |
| `PATCH` | `/notifications/:id/read` | — | `204` |
| `PATCH` | `/notifications/read-all` | — | `204` |

Pros 4 primeiros tipos, o `video` na resposta deve vir com `id`, `nomeArquivo`, `thumbnailUrl`, `linkPublico`, e o `cliente`/projeto aninhado (mesmo shape que `GET /videos` já usa). Pro `lembrete_gravacao`, em vez de `video` vem `event` com `id`, `titulo`, `dataInicio`/`inicioEm`, `clienteNome`.

### 4. O gatilho — disparar `lembrete_gravacao` pra pessoa certa

Esse é o pedaço que fecha o ciclo: ao criar/editar um `RecordingEvent`, pra cada item de `equipe` que tiver `userId` preenchido, criar uma notificação `lembrete_gravacao` com `userId` = esse usuário e `recordingEventId` = o evento.

Ficou em aberto pra mim quando exatamente disparar — duas opções, me digam qual preferem ou se topam as duas:

- **Na hora que a pessoa é escalada** (mais simples de implementar, é só um hook no `POST`/`PATCH` de `recording-events`).
- **Um lembrete automático X horas antes da gravação** (precisa de um job agendado, mais valioso pra quem foi escalado há dias e esqueceu).

Pessoas sem `userId` (freelancer, motorista) não recebem nada — não tem conta pra notificar, isso é esperado.

## O que já está pronto no frontend

- Calendário (`components/calendar-view.tsx`) já tem o seletor "+ Vincular conta da equipe…", que cria o `Crew` com `userId` via `POST /crew` e monta a `equipeIds` no `POST/PATCH /recording-events`.
- Sino de notificações (`components/notification-bell.tsx`) e página `/notificacoes` já sabem renderizar todos os 5 tipos, incluindo `lembrete_gravacao` (ícone, texto "tem gravação agendada em breve", link pro evento).
- Tudo isso já roda liso contra fixtures no modo demo — assim que as rotas reais existirem, é só trocar o `isDemo()` fora e testar contra a API de verdade, não precisa de mais nada daqui.

Qualquer dúvida no shape dos campos ou no enum, me chama.
