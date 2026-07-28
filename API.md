# API do Aprova — Guia para o Frontend

Referência completa de todos os endpoints do backend: como autenticar, o que
enviar e o que esperar de volta. Gerado a partir do código-fonte em
2026-07-06 — se algo aqui divergir do comportamento real, o código
(`src/**/*.controller.ts`, `src/**/dto/*.dto.ts`) é a fonte da verdade.

## Sumário

- [Convenções gerais](#convenções-gerais)
- [Autenticação](#autenticação)
- [Clientes](#clientes-clients)
- [Projetos](#projetos-projects)
- [Vídeos](#vídeos-videos)
- [Comentários (canais autenticados)](#comentários-canais-autenticados)
- [Conta / equipe (convites e membros)](#conta--equipe-account)
- [Branding / white label](#branding--white-label-users)
- [Dashboard](#dashboard)
- [Relatório do projeto (PDF)](#relatório-do-projeto-pdf)
- [Acesso público do cliente (sem autenticação)](#acesso-público-do-cliente-sem-autenticação)
  - [Galeria pública do projeto](#galeria-pública-do-projeto)
- [Admin](#admin)
- [Health check](#health-check)
- [Fluxo de upload de vídeo](#fluxo-de-upload-de-vídeo)

## Convenções gerais

**Base URL**: todas as rotas abaixo estão sob o prefixo `/api`. Em dev local:
`http://localhost:3000/api`.

**Autenticação**: JWT via header `Authorization: Bearer <access_token>`.
O token é obtido em `/auth/login`, `/auth/register` ou
`/account/invite/:token/accept`. Expira por padrão em `7d`
(`JWT_EXPIRES_IN`). Quando expira ou é inválido, qualquer rota autenticada
responde `401`. Se a conta estiver com `status = suspenso`, responde `403`
mesmo com token válido.

**Roles**: `admin`, `owner`, `editor`.
- `owner` = dono da agência (quem se cadastra em `/auth/register`).
- `editor` = membro convidado pelo owner (via `/account/invite`).
- `admin` = administrador da plataforma, não pertence a nenhuma agência.

Cada rota autenticada abaixo indica quais roles têm acesso. Rotas sem essa
indicação e sem "sem autenticação" explícito devem ser tratadas como
autenticadas com qualquer role válido.

**Escopo por conta**: `owner` e `editor` só enxergam dados da própria
agência (`accountId` do token). Nunca é possível acessar cliente/projeto/vídeo
de outra agência, mesmo sabendo o `id`.

**Validação de body**: todo body é validado (`class-validator`). Campos não
declarados no DTO causam `400` (`forbidNonWhitelisted`). Campos obrigatórios
ausentes ou de tipo errado também causam `400` com `message` sendo um array
de strings (uma por campo inválido).

**Formato de erro** (padronizado, inclusive erros do Prisma):
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Email invalido",
  "timestamp": "2026-07-06T12:00:00.000Z",
  "path": "/api/auth/login"
}
```
`message` pode ser `string` ou `string[]` (validação com múltiplos campos).

**Rate limiting**: padrão global de **60 requisições/minuto por IP**. Rotas
sensíveis têm limite próprio (indicado em cada seção): `429 Too Many
Requests` quando estourado.

**CORS**: a origem do frontend precisa estar em `CORS_ORIGIN` no backend
(lista separada por vírgula). Sem isso configurado, nenhuma origem é
liberada — se o front rodar em uma URL nova (preview, domínio custom),
avisar o time de backend para adicionar.

**Datas**: sempre ISO 8601 (`criadoEm`, `aprovadoEm`, `deadline`, etc).

---

## Autenticação

### `POST /auth/register`
Sem autenticação. Rate limit: **5/min**.

Cria a agência (`Account`) + o usuário `owner`. Dispara em background a
criação de dados de exemplo (cliente/projeto/vídeo com `isExemplo: true`).

Body:
```json
{ "nome": "Maria Silva", "email": "maria@agencia.com", "senha": "123456", "nomeAgencia": "Agência Maria" }
```
- `nome`, `email`, `senha` (mín. 6 caracteres) obrigatórios.
- `nomeAgencia` opcional — se omitido, usa `nome`.

Resposta `201`:
```json
{
  "user": { "id": "...", "nome": "Maria Silva", "email": "maria@agencia.com", "teamRole": "owner", "status": "ativo", "accountId": "...", "criadoEm": "..." },
  "access_token": "eyJhbGciOi..."
}
```
Erros: `409` se já existe conta com o email.

### `POST /auth/login`
Sem autenticação. Rate limit: **5/min**.

Body: `{ "email": "...", "senha": "..." }`

Resposta `200`: mesmo shape de `register` (`{ user, access_token }`).

Erros: `401` credenciais inválidas · `403` conta suspensa.

> Nota: `user.teamRole` é o campo que o frontend deve usar para decidir a UI
> por papel (`owner`/`editor`/`admin`) — o Prisma chama esse campo de `role`
> internamente, mas a API sempre expõe como `teamRole`.

### `POST /auth/forgot-password`
Sem autenticação. Body: `{ "email": "..." }`. A UI trata a resposta como
sucesso sempre (não revela se o e-mail existe).

### `POST /auth/reset-password`
Sem autenticação. Body: `{ "token": "...", "novaSenha": "..." }`
(`novaSenha` mín. 6 caracteres — **não** enviar como `senha`, o DTO rejeita
campo extra com `property senha should not exist`).

---

## Clientes (`/clients`)
Autenticado — roles `owner`, `editor`.

| Método | Rota | Body | Retorno |
|---|---|---|---|
| `POST` | `/clients` | `{ nome, email }` | `Client` criado |
| `GET` | `/clients` | — | `Client[]` (ordenado por `nome`) |
| `GET` | `/clients/:id` | — | `Client` |
| `PATCH` | `/clients/:id` | `{ nome?, email? }` | `Client` atualizado |
| `DELETE` | `/clients/:id` | — | `{ "deleted": true }` |

`Client`: `{ id, nome, email, accountId, isExemplo }`. Deletar um cliente
apaga em cascata seus projetos e vídeos (histórico não é recuperável).
Erros: `404` se o cliente não existe ou não pertence à conta.

---

## Projetos (`/projects`)
Autenticado — roles `owner`, `editor`.

| Método | Rota | Body | Retorno |
|---|---|---|---|
| `POST` | `/projects` | `{ nome, clientId }` | `Project` criado |
| `GET` | `/projects` | — | `Project[]` (com `client: { id, nome }`, mais recente primeiro) |
| `GET` | `/projects/:id` | — | `Project` (com `client: { id, nome }`) |
| `PATCH` | `/projects/:id` | `{ nome?, clientId? }` | `Project` atualizado |
| `DELETE` | `/projects/:id` | — | `{ "deleted": true }` |

`clientId` deve ser UUID de um cliente da mesma conta (`400` caso contrário).
Deletar um projeto apaga em cascata seus vídeos.

Todo `Project` (criado ou lido) inclui `linkPublico` (UUID v4) — o
identificador da **galeria pública do projeto**, um link só que lista todos
os vídeos da entrega (ver
[Galeria pública do projeto](#galeria-pública-do-projeto)). Monta-se
compartilhando `https://<seu-domínio>/g/:linkPublico`.

---

## Vídeos (`/videos`)
Autenticado — roles `owner`, `editor` (exceto onde indicado).

### `POST /videos/upload-url`
Gera uma presigned URL para o frontend fazer upload direto no R2 (o
arquivo **não** passa pelo backend).

Body: `{ "nomeArquivo": "video.mp4", "contentType": "video/mp4" }`
`contentType` aceito: `video/mp4`, `video/quicktime`, `video/webm`,
`video/x-msvideo`, `video/mpeg`.

Resposta `200`:
```json
{ "uploadUrl": "https://...presigned...", "key": "videos/172...-video.mp4", "publicUrl": "https://cdn.../videos/172...-video.mp4", "expiresIn": 600 }
```
O frontend faz `PUT <uploadUrl>` com o binário do arquivo (`Content-Type`
igual ao enviado acima). `expiresIn` em segundos (10 min).

### `POST /videos`
Registra o vídeo após o upload completar. Dispara em background a geração
de thumbnail + versão otimizada (`statusProcessamento` começa em
`processando`, vira `pronto` ou `erro`).

Body: `{ "projectId": "uuid", "urlStorage": "<publicUrl do passo anterior>", "nomeArquivo": "video.mp4", "versao": 1 }`
`versao` é opcional — se omitida, o backend calcula a próxima versão do
projeto automaticamente.

Resposta `201`: o registro completo do `Video` (ver shape abaixo).

### `POST /videos/:id/new-version`
Sobe uma nova versão vinculada ao vídeo anterior (`videoPaiId`), herdando o
projeto e incrementando a versão. Comentários/ratings da versão anterior
continuam ligados a ela (histórico preservado).

Body: `{ "urlStorage": "...", "nomeArquivo": "..." }`

### `GET /videos?project_id=<uuid>`
Lista os vídeos de um projeto (mais recente primeiro por versão).

Resposta: array de `Video` + `videoPai: { id, versao, nomeArquivo } | null`
+ `_count: { comments, ratings, versoes }`.

### `PATCH /videos/:id/status`
Body: `{ "status": "pendente" | "aprovado" | "ajuste" | "erro" }`
Ao marcar `aprovado`, o backend carimba `aprovadoEm`.

### `PATCH /videos/:id/deadline`
**Somente `owner`.** Define ou remove o prazo de entrega.

Body: `{ "deadline": "2026-08-15" | null }` (ISO 8601; `null` remove o prazo)

> `deadline` nunca é exposto no canal público do cliente
> (`GET /public/videos/:linkPublico`) — é dado interno da agência.

**Shape do `Video`** (retornado por `POST`, `new-version` e `PATCH`):
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "urlStorage": "https://...",
  "nomeArquivo": "video.mp4",
  "versao": 1,
  "videoPaiId": null,
  "status": "pendente",
  "linkPublico": "uuid",
  "thumbnailUrl": null,
  "urlOtimizada": null,
  "statusProcessamento": "processando",
  "aprovadoEm": null,
  "isExemplo": false,
  "deadline": null,
  "criadoEm": "2026-07-06T12:00:00.000Z"
}
```
`linkPublico` é o identificador a compartilhar com o cliente
(`/public/videos/:linkPublico` — ver seção própria).

---

## Comentários (canais autenticados)
Rotas sob `/videos/:id/comments`, onde `:id` é o `id` do vídeo (não o
`linkPublico`). Há dois canais isolados: **interno** (conversa da agência)
e **cliente** (resposta do owner ao comentário público do cliente).

| Método | Rota | Role | Body | Descrição |
|---|---|---|---|---|
| `GET` | `/videos/:id/comments/internal` | `owner`, `editor` | — | Lista o canal interno |
| `POST` | `/videos/:id/comments/internal` | `owner`, `editor` | `{ timestampVideo, texto, parentId? }` | Cria comentário interno (autor = usuário do token) |
| `POST` | `/videos/:id/comments/client-reply` | `owner` apenas | `{ timestampVideo, texto, parentId? }` | Resposta do owner ao cliente, no canal cliente |

- `timestampVideo`: segundos (inteiro ≥ 0).
- `texto`: string não vazia, até 2000 caracteres.
- `parentId`: UUID opcional — precisa ser um comentário existente, **do
  mesmo vídeo e do mesmo canal** (senão `400`).

Shape do comentário retornado:
```json
{
  "id": "uuid",
  "timestampVideo": 12,
  "texto": "Ajustar o áudio aqui",
  "channel": "interno",
  "autorType": "owner",
  "autorNome": null,
  "autorUserId": "uuid",
  "autorUser": { "id": "uuid", "nome": "Maria Silva", "teamRole": "owner" },
  "parentId": null,
  "criadoEm": "...",
  "isAgencyReply": false
}
```
`isAgencyReply` só é relevante no canal **cliente** — indica que a
mensagem é uma resposta do owner (para diferenciar visualmente da
mensagem original do cliente, que vem via
`POST /public/videos/:linkPublico/comments`).

> Os comentários do canal **cliente** (o cliente escrevendo, sem login) não
> têm um endpoint de listagem autenticado dedicado — eles aparecem dentro de
> `GET /public/videos/:linkPublico` (campo `comments`) e o front autenticado
> os lê por ali. `client-reply` só serve para o owner *responder*.

---

## Conta / equipe (`/account`)

| Método | Rota | Auth | Body | Retorno |
|---|---|---|---|---|
| `POST` | `/account/invite` | `owner` | `{ email }` | `{ id, email, status, criadoEm, inviteUrl }` |
| `POST` | `/account/invite/:id/send-email` | `owner` | — | `204` / `{ sent: true }` |
| `POST` | `/account/invite/:token/accept` | **sem autenticação** | `{ nome, senha }` | `{ user, access_token }` |
| `GET` | `/account/members` | `owner` | — | `Member[]` |
| `PATCH` | `/account/members/:id/status` | `owner` | `{ status: "ativo" \| "suspenso" }` | `Member` atualizado |

- `invite`: cria convite pendente para um editor. `inviteUrl` é o link
  completo (`<CORS_ORIGIN>/convite/:token`). `409` se já existe usuário ou
  convite pendente para o email.
- `send-email` **(pendente de implementação — ver abaixo)**: dispara o
  envio real do e-mail de convite para o `:id` retornado por `invite`.
- `accept`: fluxo público (tela `/convite/:token` no frontend). `:token` é
  o UUID do convite. Cria o usuário `editor` e retorna token de sessão já
  logado, igual ao login. `404` se o convite já foi usado/não existe.
- `members`: lista `owner` + `editores` da conta.
  `Member`: `{ id, nome, email, teamRole, status, criadoEm }`.
- `setMemberStatus`: só afeta `editor` (não dá pra suspender um `owner`,
  `400` se tentar). `suspenso` efetivamente remove o acesso (login/token
  passam a responder `403`).

> **Pendente no backend — `POST /account/invite/:id/send-email`**
>
> Hoje o convite só existe como registro + `inviteUrl`; nenhum e-mail é
> disparado de verdade (o frontend antes usava um link `mailto:` local, que
> depende do cliente de e-mail do owner e não é confiável). O frontend já
> foi ajustado para chamar este endpoint a partir de um botão "Enviar
> e-mail" na tela de equipe — falta implementar no backend:
> 1. Integrar um provedor transacional (Resend, SES, Postmark, etc.) e
>    enviar um e-mail real para o endereço do convite (`invite.email`),
>    com o `inviteUrl` e um template básico ("Você foi convidado(a) para
>    colaborar na APROVA...").
> 2. Rota `POST /account/invite/:id/send-email`, autenticada como `owner`
>    da mesma conta do convite. `404` se `:id` não existir ou não
>    pertencer à conta do owner autenticado; `409`/`400` se o convite já
>    foi aceito (`status !== 'invited'`).
> 3. Resposta `204` (ou `{ sent: true }`) em caso de sucesso; erro do
>    provedor de e-mail deve virar `502`/`500` com corpo de erro padrão
>    (`ApiError` no frontend já trata isso).
> 4. Considerar rate limit por convite (evitar reenvio em loop) e não
>    quebrar o fluxo de `invite` existente — o botão de copiar link
>    continua funcionando como fallback caso o e-mail falhe ou caia em
>    spam.

---

## Branding / white label (`/users/me`)
Autenticado — **somente `owner`**.

| Método | Rota | Body | Retorno |
|---|---|---|---|
| `POST` | `/users/me/branding/logo-upload-url` | `{ nomeArquivo, contentType }` | `{ uploadUrl, key, publicUrl, expiresIn }` |
| `PATCH` | `/users/me/branding` | `{ logoUrl?, corDestaque? }` | `{ id, nome, logoUrl, corDestaque }` |

`contentType` aceito: `image/png`, `image/jpeg`, `image/webp`,
`image/svg+xml`. Mesmo fluxo de presigned URL dos vídeos (`PUT` direto no
R2), só que na pasta `branding`. `corDestaque` é hex (`#RGB` ou `#RRGGBB`).
Esse branding (`logoUrl`/`corDestaque`) é o que aparece para o **cliente**
em `GET /public/videos/:linkPublico` (campo `agencia`).

---

## Dashboard
Autenticado — roles `owner`, `editor`. Escopado à conta do token.

### `GET /dashboard/insights?horas_pendentes=48`
`horas_pendentes` é opcional (query, inteiro, padrão `48`) — janela para
considerar um vídeo pendente como "atrasado".

Resposta:
```json
{
  "periodoPendentesHoras": 48,
  "videosPendentesAtrasados": 3,
  "clienteAprovacaoMaisRapida": { "clientId": "uuid", "nome": "Cliente A", "tempoMedioHoras": 4.5, "amostras": 6 },
  "clienteAprovacaoMaisLenta": { "clientId": "uuid", "nome": "Cliente B", "tempoMedioHoras": 72.1, "amostras": 2 },
  "videosAprovadosNoMes": 14
}
```
`clienteAprovacaoMaisRapida`/`Lenta` podem vir `null` se ainda não há
nenhum vídeo aprovado na conta.

---

## Relatório do projeto (PDF)
Autenticado — roles `owner`, `editor`.

### `GET /projects/:id/report`
Não retorna JSON — é um download direto (`Content-Type: application/pdf`,
`Content-Disposition: attachment`). No frontend, tratar como blob:
```js
const res = await fetch(`/api/projects/${id}/report`, {
  headers: { Authorization: `Bearer ${token}` },
});
const blob = await res.blob();
// criar link de download a partir do blob
```
Conteúdo do PDF: nome do projeto/cliente, lista de vídeos (status +
versão), comentários por vídeo (com timestamp) e notas médias por
categoria.

---

## Acesso público do cliente (sem autenticação)

Identificador é sempre `linkPublico` (UUID v4) do vídeo — nunca o `id`
interno. Rotas sob `/public/videos/:linkPublico`. Nenhum dado interno da
agência é exposto (sem `deadline`, sem `editorId`, sem canal interno de
comentários).

### `GET /public/videos/:linkPublico`
Sem rate limit específico (usa o global de 60/min).

Resposta:
```json
{
  "id": "uuid",
  "nomeArquivo": "video.mp4",
  "urlStorage": "https://...",
  "urlOtimizada": "https://... ou null (ainda processando)",
  "thumbnailUrl": "https://... ou null",
  "statusProcessamento": "processando" | "pronto" | "erro",
  "versao": 1,
  "status": "pendente" | "aprovado" | "ajuste" | "erro",
  "criadoEm": "...",
  "projeto": { "nome": "Campanha Verão" },
  "cliente": { "nome": "Cliente A" },
  "agencia": { "nome": "Agência Maria", "logoUrl": "https://... ou null", "corDestaque": "#1E90FF ou null" },
  "comments": [
    { "id": "...", "timestampVideo": 12, "texto": "...", "autorType": "cliente", "autorNome": "Fulano", "autorUser": null, "parentId": null, "criadoEm": "...", "isAgencyReply": false }
  ],
  "ratings": [
    { "id": "...", "categoria": "iluminacao", "nota": 4, "criadoEm": "..." }
  ],
  "queue": [
    { "link": "abc123-...", "title": "video.mp4", "posterUrl": "https://... ou null", "status": "pendente" }
  ]
}
```

- `comments` aqui é **só o canal cliente** (a conversa que o cliente vê
  com o owner). `isAgencyReply: true` marca as respostas do owner.
- `queue`: usado pela navegação estilo "Reels" (swipe entre vídeos do
  mesmo cliente). Contém **todos** os vídeos do cliente dono deste vídeo,
  **incluindo o vídeo atual**, ordenados por data de criação (crescente,
  estável entre chamadas). O frontend localiza a posição atual com
  `queue.findIndex(item => item.link === linkPublicoAtual)` para navegar
  prev/next — sempre vai existir um match porque o vídeo atual está na
  lista. Cada item tem só `link`, `title`, `posterUrl`, `status` (nada de
  dados internos da agência).

### Galeria pública do projeto

### `GET /public/projects/:linkPublico`
Sem autenticação. Um link só por projeto, listando todos os vídeos da
entrega (em vez de um link por vídeo). `404` se o link não existir.

Resposta:
```json
{
  "projeto": { "nome": "Campanha Julho" },
  "cliente": { "nome": "Cliente X" },
  "agencia": { "nome": "Agencia Teste", "logoUrl": "https://...", "corDestaque": "#ff0000" },
  "videos": [
    { "link": "64c7527a-...", "title": "video1.mp4", "posterUrl": "https://.../thumb.jpg", "status": "pendente", "statusProcessamento": "pronto", "versao": 1 }
  ]
}
```
- `videos[].link` é o `linkPublico` do vídeo — monta a URL de cada card e
  abre o player normal (`/v/:link`), sem mudar seu contrato de
  aprovação/comentário/avaliação.
- `status`: `pendente | aprovado | ajuste | erro`, para badge no card.
- O link do projeto (`linkPublico`) já vem no retorno de `POST /projects` e
  `GET /projects` / `GET /projects/:id` (ver seção Projetos) — não precisa de
  chamada separada para descobri-lo.
- `GET /public/videos/:linkPublico` (o player individual) não muda de
  contrato, só o escopo da `queue`: agora traz apenas os vídeos do mesmo
  projeto, não do cliente inteiro.

### `POST /public/videos/:linkPublico/comments`
Rate limit: **20/min**.

Body: `{ "timestampVideo": 12, "texto": "...", "autorNome": "Fulano" }`
(`texto` até 2000 chars, `autorNome` até 120 chars, ambos obrigatórios)

Cria comentário no canal cliente (autor = cliente, sem login).

### `POST /public/videos/:linkPublico/ratings`
Rate limit: **20/min**.

Body: `{ "categoria": "iluminacao" | "audio" | "enquadramento", "nota": 1 }`
(`nota` inteiro de 1 a 5)

### `POST /public/videos/:linkPublico/approve`
Rate limit: **10/min**. Sem body. Marca `status = aprovado` e carimba
`aprovadoEm`.

### `POST /public/videos/:linkPublico/request-changes`
Rate limit: **10/min**. Sem body. Marca `status = ajuste`.

---

## Admin
Autenticado — **somente role `admin`**.

| Método | Rota | Body | Retorno |
|---|---|---|---|
| `GET` | `/admin/users` | — | lista de agências (owners) com contagens |
| `PATCH` | `/admin/users/:id/status` | `{ status: "ativo" \| "suspenso" }` | usuário atualizado |
| `GET` | `/admin/metrics` | — | métricas gerais da plataforma |
| `GET` | `/admin/videos/errors` | — | vídeos com `status = erro` |

`GET /admin/users` → cada item:
```json
{ "id": "...", "nome": "...", "email": "...", "status": "ativo", "criadoEm": "...", "account": { "id": "...", "nomeAgencia": "...", "_count": { "clients": 3, "projects": 5, "users": 2 } } }
```

`GET /admin/metrics`:
```json
{
  "users": { "total": 40, "profissionais": 30, "admins": 1, "suspensos": 2 },
  "videos": { "total": 500, "porStatus": { "pendente": 100, "aprovado": 350, "ajuste": 40, "erro": 10 } },
  "storage": { "estimadoBytes": 26214400000, "estimadoGb": 24.41, "observacao": "Estimativa por contagem (~50MB/video); tamanho real nao e armazenado." }
}
```
(storage é estimado — o tamanho real do arquivo não é persistido, já que o
upload vai direto pro R2)

`GET /admin/videos/errors` → cada item inclui `project.account.users[0]`
(o owner responsável, para contato).

---

## Health check
### `GET /health`
Sem autenticação, sem rate limit. Usado por orquestradores/load balancer.
`200 { "status": "ok" }` ou `503` se o banco estiver indisponível.

---

## Fluxo de upload de vídeo

1. `POST /videos/upload-url` → recebe `uploadUrl` (presigned, expira em 10
   min) e `publicUrl`.
2. Frontend faz `PUT <uploadUrl>` com o arquivo binário direto no R2
   (`Content-Type` igual ao enviado no passo 1). **Não** passa pelo
   backend.
3. `POST /videos` com `urlStorage = publicUrl` do passo 1 → registra no
   banco, gera `linkPublico` e dispara thumbnail/otimização em background.
4. Compartilha `linkPublico` com o cliente
   (`https://<seu-dominio>/v/:linkPublico` ou o formato de rota que o
   front usar) → ele acessa via `GET /public/videos/:linkPublico`.

Mesmo padrão vale para o logo da agência
(`POST /users/me/branding/logo-upload-url` → `PUT` → `PATCH
/users/me/branding`).
