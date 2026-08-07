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
- [Portfólios](#portfólios-portfolios)
- [Comentários (canais autenticados)](#comentários-canais-autenticados)
- [Conta / equipe (convites e membros)](#conta--equipe-account)
- [Sessões ativas](#sessões-ativas-accountsessions-accountmembersidsessions)
- [Branding / white label](#branding--white-label-users)
- [Dashboard](#dashboard)
- [Relatório do projeto (PDF)](#relatório-do-projeto-pdf)
- [Acesso público do cliente (sem autenticação)](#acesso-público-do-cliente-sem-autenticação)
  - [Galeria pública do projeto](#galeria-pública-do-projeto)
  - [Portfólio público](#portfólio-público)
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

### `PATCH /videos/:id/titulo`
**[ PENDENTE NO BACKEND — 404 hoje ]** `owner`, `editor`. Renomeia o vídeo.

Body: `{ "nomeArquivo": "novo-nome.mp4" }`

Resposta: o `Video` atualizado (mesmo shape de `status`/`deadline`).

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

## Portfólios (`/portfolios`)
**[ PENDENTE NO BACKEND — nenhuma destas rotas existe hoje ]** Autenticado —
**somente `owner`** (mesma regra de branding/equipe/planos).

Vitrine da agência, distinta da galeria de projeto
([Galeria pública do projeto](#galeria-pública-do-projeto)): uma coleção de
vídeos escolhida manualmente pelo owner (não espelha uma entrega inteira),
sem `status` de aprovação, com link público próprio para atrair novos
clientes (`/p/:linkPublico` no frontend). Um vídeo entra de duas formas: (1)
referenciando um vídeo já existente em algum projeto, ou (2) upload dedicado
direto pro portfólio, sem vínculo com projeto/cliente.

| Método | Rota | Body | Retorno |
|---|---|---|---|
| `GET` | `/portfolios` | — | `Portfolio[]` (sem `videos[]`, só resumo — ver abaixo) |
| `GET` | `/portfolios/:id` | — | `Portfolio` completo, com `videos[]` |
| `POST` | `/portfolios` | `{ nome, descricao? }` | `Portfolio` criado (`linkPublico` gerado pelo backend) |
| `PATCH` | `/portfolios/:id` | `{ nome?, descricao? }` | `Portfolio` atualizado |
| `DELETE` | `/portfolios/:id` | — | `{ "deleted": true }` |

`Portfolio`: `{ id, nome, descricao, linkPublico, capaUrl, videos: PortfolioVideo[], criadoEm, atualizadoEm }`.
`capaUrl` pode ser `null` — o frontend usa o poster do primeiro vídeo como
fallback quando ausente.

`PortfolioVideo`: `{ id, titulo, descricao, urlStorage (ou urlOtimizada, o
que estiver pronto para tocar), posterUrl, statusProcessamento, ordem,
criadoEm }`. Sem `status` de aprovação — não faz sentido fora do fluxo
cliente↔projeto.

### `POST /portfolios/:id/videos`
Adiciona ao portfólio um vídeo **já existente** em algum projeto da conta.

Body: `{ "videoId": "uuid", "titulo"?: "...", "descricao"?: "..." }`
`titulo`/`descricao` são opcionais — se omitidos, sugerimos usar o
`nomeArquivo` do vídeo original como `titulo`.

Importante: o backend deve **copiar** `urlStorage`/`posterUrl` do vídeo
original pro item do portfólio nesse momento (denormalizado), não guardar só
uma referência — a rota pública (`GET /public/portfolios/:linkPublico`) não
deve precisar resolver o `Video`/projeto/cliente original por trás.

Resposta: o `Portfolio` completo atualizado (mesmo shape de `GET /portfolios/:id`).

### `POST /portfolios/:id/upload-url`
Presigned URL pro upload direto no R2, mesmo contrato de
`POST /videos/upload-url` (ver seção Vídeos) — só muda o path.

Body: `{ "nomeArquivo": "video.mp4", "contentType": "video/mp4" }`

Resposta `200`: `{ "uploadUrl": "...", "key": "...", "publicUrl": "...", "expiresIn": 600 }`

### `POST /portfolios/:id/videos/upload-complete`
Registra, direto no portfólio, um vídeo enviado pelo passo acima — **sem**
projeto/cliente por trás (diferente de `POST /videos`).

Body: `{ "urlStorage": "<publicUrl do passo anterior>", "nomeArquivo": "video.mp4", "titulo"?: "...", "descricao"?: "..." }`

Resposta: o `Portfolio` completo atualizado.

### `PATCH /portfolios/:id/videos/:videoId`
Edita título/descrição de um vídeo já no portfólio.

Body: `{ "titulo"?: "...", "descricao"?: "..." }`

Resposta: o `Portfolio` completo atualizado.

### `DELETE /portfolios/:id/videos/:videoId`
Remove um vídeo do portfólio (não afeta o vídeo original, se veio de um
projeto). Resposta: o `Portfolio` completo atualizado.

### `PATCH /portfolios/:id/videos/order`
Reordena os vídeos do portfólio (usado pelos botões subir/descer na UI).

Body: `{ "videoIds": ["uuid1", "uuid2", "..."] }` — a nova ordem completa,
na sequência desejada. Resposta: o `Portfolio` completo atualizado, com
`ordem` de cada item recalculada a partir da posição no array.

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
| `POST` | `/account/invite` | `owner` | `{ email }` | `{ id, email, status, criadoEm, expiresAt, inviteUrl }` |
| `POST` | `/account/invite/:id/send-email` | `owner` | — | `{ id, email, status, criadoEm, expiresAt, sent: true }` |
| `DELETE` | `/account/invite/:id` | `owner` | — | `204` |
| `POST` | `/account/invite/:token/accept` | **sem autenticação** | `{ nome, senha }` | `{ user, access_token }` |
| `GET` | `/account/members` | `owner` | — | `Member[]` |
| `PATCH` | `/account/members/:id/status` | `owner` | `{ status: "ativo" \| "suspenso" }` | `Member` atualizado |

- `invite`: cria convite pendente para um editor, com `expiresAt` = agora +
  3 dias. `inviteUrl` é o link completo (`<CORS_ORIGIN>/convite/:token`).
  `409` se já existe usuário ativo ou convite **ainda válido** (não
  expirado) pendente para o email. Se o convite anterior para esse email já
  tiver expirado, o backend cancela o antigo automaticamente e cria um novo
  — sem `409`.
- `send-email`: reenvia o e-mail do convite `:id` (mesmo `inviteUrl`) **e
  renova `expiresAt` para +3 dias a partir de agora**, inclusive quando o
  convite já estava expirado — não retorna mais `409`/erro nesse caso.
  `404` se `:id` não existir ou não pertencer à conta do owner autenticado;
  `409`/`400` se o convite já foi aceito (`status !== 'invited'`).
- `DELETE /account/invite/:id`: cancela/exclui um convite pendente. `404`
  se `:id` não existir ou não pertencer à conta do owner autenticado.
- `accept`: fluxo público (tela `/convite/:token` no frontend). `:token` é
  o UUID do convite. Cria o usuário `editor` e retorna token de sessão já
  logado, igual ao login. `404` se o convite já foi usado/não existe/foi
  cancelado; **`410 Gone`** se o convite existe mas `expiresAt` já passou.
- `members`: lista `owner` + `editores` da conta **e também os convites
  pendentes** (`status: "invited"`), não só usuários já criados.
  `Member`: `{ id, nome, email, teamRole, status, criadoEm, expiresAt }` —
  `expiresAt` só vem preenchido em itens com `status: "invited"` (`null`
  para os demais). Para um item `invited`, `id` é o id do convite — o mesmo
  usado em `DELETE /account/invite/:id` e `POST
  /account/invite/:id/send-email`. `nome` vem `null` até o convite ser
  aceito.
- `setMemberStatus`: só afeta `editor` (não dá pra suspender um `owner`,
  `400` se tentar). `suspenso` efetivamente remove o acesso (login/token
  passam a responder `403`).

> **Sem estado "expirado" no backend.** Um convite vencido continua com
> `status: "invited"` para sempre — é o consumidor da API quem decide se
> mostra "pendente" ou "expirado" comparando `expiresAt` com a hora atual
> (é o que o frontend já faz em `components/team-view.tsx`).
>
> **Pendência do backend, não bloqueia o frontend**: a migration do campo
> `expiresAt` ainda não foi aplicada em staging/prod — só existe em dev por
> enquanto.

---

## Sessões ativas (`/account/sessions`, `/account/members/:id/sessions`)

Login/autenticação deixou de ser 100% stateless: `/auth/login`,
`/auth/register`, `/auth/google`, `/auth/apple` e o aceite de convite agora
criam uma sessão no banco a cada login, e o `access_token` passa a carregar o
`id` dela — por isso dá pra listar dispositivos logados e revogar um token
específico antes dele expirar.

| Método | Rota | Auth | Retorno |
|---|---|---|---|
| `GET` | `/account/sessions` | qualquer role | `Session[]` (só do usuário logado) |
| `DELETE` | `/account/sessions/:id` | qualquer role | `204` |
| `DELETE` | `/account/sessions` | qualquer role | `204` |
| `GET` | `/account/members/:id/sessions` | `owner` | `Session[]` |
| `DELETE` | `/account/members/:id/sessions/:sessionId` | `owner` | `204` |
| `DELETE` | `/account/members/:id/sessions` | `owner` | `204` |

- `GET/DELETE /account/sessions[/:id]`: sobre as próprias sessões. `404` se
  `:id` não existir ou não pertencer ao usuário autenticado. Funciona mesmo
  se `:id` for a sessão que fez a própria chamada. `DELETE /account/sessions`
  (sem `:id`) encerra todas, **exceto** a que fez a própria requisição.
- `GET/DELETE /account/members/:id/sessions[...]`: owner vendo/encerrando
  sessão de um membro da equipe. `404` se `:id` não for membro da mesma
  conta do owner autenticado. `DELETE .../sessions` (sem `:sessionId`)
  encerra todas as sessões daquele membro, sem exceção.
- `Session`: `{ id, dispositivo, tipoDispositivo, localizacao, ip, criadoEm, ultimoAcessoEm, atual }`.
  `dispositivo`/`tipoDispositivo` (`"desktop" | "mobile" | "tablet"`) são
  derivados do `User-Agent` na hora da resposta. `localizacao` sempre `null`
  por enquanto (sem geolocalização por IP ainda). `atual` só é calculado nas
  rotas de sessão própria; nas rotas de `/account/members/:id/sessions`
  sempre vem `false`.

> **Nota de deploy**: como o token antigo não carrega `id` de sessão,
> qualquer sessão de navegador já logada antes desse deploy recebe `401` no
> primeiro request seguinte e precisa logar de novo — esperado, acontece só
> uma vez. O frontend já trata `401` redirecionando pro `/login`
> (`handleUnauthorized` em `lib/api.ts`), então não precisa de nenhum tratamento
> especial do lado do cliente.

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
    { "id": "uuid", "videoPaiId": null, "link": "64c7527a-...", "title": "video1.mp4", "posterUrl": "https://.../thumb.jpg", "status": "pendente", "statusProcessamento": "pronto", "versao": 1 }
  ]
}
```
- `videos[].link` é o `linkPublico` do vídeo — monta a URL de cada card e
  abre o player normal (`/v/:link`), sem mudar seu contrato de
  aprovação/comentário/avaliação.
- `status`: `pendente | aprovado | ajuste | erro`, para badge no card.
- **[ PENDENTE NO BACKEND — hoje a resposta não traz `id` nem `videoPaiId` por
  vídeo ]** O frontend usa esses dois campos só para esconder da galeria uma
  versão que já foi substituída por uma mais nova (`POST
  /videos/:id/new-version` cria uma linha nova com `videoPaiId` apontando pra
  antiga, mas a antiga continua existindo e continua vindo nesta lista).
  Sem `id`/`videoPaiId` aqui, a versão antiga (com erro, por exemplo) fica
  visível pro cliente lado a lado com a nova pra sempre — mesmo shape que já
  é usado em `GET /videos?project_id=` (ver acima).
- O link do projeto (`linkPublico`) já vem no retorno de `POST /projects` e
  `GET /projects` / `GET /projects/:id` (ver seção Projetos) — não precisa de
  chamada separada para descobri-lo.
- `GET /public/videos/:linkPublico` (o player individual) não muda de
  contrato, só o escopo da `queue`: agora traz apenas os vídeos do mesmo
  projeto, não do cliente inteiro.

### Portfólio público

### `GET /public/portfolios/:linkPublico`
**[ PENDENTE NO BACKEND — rota não existe hoje ]** Sem autenticação. `404`
se o link não existir. Vitrine da agência (ver [Portfólios](#portfólios-portfolios))
— **nenhum** dado de cliente/projeto/status é exposto aqui, só o portfólio em si.

Resposta:
```json
{
  "nome": "Reels para redes sociais",
  "descricao": "Seleção de reels de curta duração... ou null",
  "agencia": { "nome": "Agencia Teste", "logoUrl": "https://...", "corDestaque": "#ff0000" },
  "videos": [
    { "id": "uuid", "titulo": "Reel lançamento batom matte", "descricao": "... ou null", "urlStorage": "https://...", "posterUrl": "https://... ou null", "statusProcessamento": "pronto", "ordem": 0, "criadoEm": "..." }
  ]
}
```
O frontend abre cada vídeo num player simples (lightbox com `<video>`
nativo), sem navegar para `/v/:linkPublico` — a tela de aprovação do cliente
não faz sentido aqui.

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

### `PATCH /public/videos/:linkPublico/titulo`
**[ PENDENTE NO BACKEND — 404 hoje ]** Sem autenticação — o cliente também pode renomear pela tela pública.

Body: `{ "nomeArquivo": "novo-nome.mp4" }`

Resposta: o `Video` atualizado.

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
