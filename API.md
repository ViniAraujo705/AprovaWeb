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
- [Portfólio: perfil e categorias](#portfólio-perfil-e-categorias-portfolio-profile-portfolio-categories)
- [Comentários (canais autenticados)](#comentários-canais-autenticados)
- [Conta / equipe (convites e membros)](#conta--equipe-account)
- [Sessões ativas](#sessões-ativas-accountsessions-accountmembersidsessions)
- [Branding / white label](#branding--white-label-users)
- [Dashboard](#dashboard)
- [Relatório do projeto (PDF)](#relatório-do-projeto-pdf)
- [Acesso público do cliente (sem autenticação)](#acesso-público-do-cliente-sem-autenticação)
  - [Galeria pública do projeto](#galeria-pública-do-projeto)
  - [Portfólio público](#portfólio-público)
  - [Hub público do portfólio](#hub-público-do-portfólio)
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

`Client`: `{ id, nome, email, accountId, isExemplo, branding }`. Deletar um
cliente apaga em cascata seus projetos e vídeos (histórico não é
recuperável). Erros: `404` se o cliente não existe ou não pertence à conta.

### Marca própria do cliente (`branding`)
**[ PENDENTE NO BACKEND — nenhuma destas rotas/campos existe hoje ]**
`owner` apenas (mesma regra da marca da agência). Cada cliente pode ter uma
marca própria (logo + cor de destaque), opcional, que **sobrepõe** a marca
da agência nos links públicos ligados a esse cliente — a [galeria pública
do projeto](#galeria-pública-do-projeto) (todo projeto já tem `clientId`) e
qualquer [portfólio](#portfólios-portfolios) marcado com o `clienteId` dele
(ver abaixo). Pensado pra agência white-label revender a aprovação sob a
marca do cliente final dela.

| Método | Rota | Body | Retorno |
|---|---|---|---|
| `POST` | `/clients/:id/branding/logo-upload-url` | `{ nomeArquivo, contentType }` | `{ uploadUrl, key, publicUrl, expiresIn }` |
| `PATCH` | `/clients/:id/branding` | `{ logoUrl?, corDestaque? }` | `{ logoUrl, corDestaque }` |

Mesmo contrato de [`/users/me/branding`](#branding--white-label-usersme):
`contentType` aceito `image/png`, `image/jpeg`, `image/webp`,
`image/svg+xml`; presigned URL na pasta `branding` do R2; `corDestaque` em
hex. `logoUrl: null` ou `corDestaque: null` limpa o campo (volta a herdar da
agência). `GET/PATCH /clients/:id` deveria passar a incluir
`branding: { logoUrl, corDestaque } | null` no `Client` (null = sem marca
própria, usa a da agência normalmente).

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

**Nova versão substitui de verdade (28/08).** A linha nova ganha um
`linkPublico` próprio, mas o link que o cliente já tem continua valendo: o
acesso público resolve qualquer link da cadeia para a versão mais recente
(ver `GET /public/videos/:linkPublico`). A resposta traz, além do `Video`
normal, `linkPublicoEfetivo` — o link estável da cadeia, que é o que a
agência deve compartilhar. **Não é preciso reenviar link pro cliente.**
`mapVideo` (lib/services.ts) já lê `linkPublicoEfetivo` na frente de
`linkPublico` ao montar `Video.publicLink`.

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
vídeos **e fotos** escolhida manualmente pelo owner (não espelha uma entrega
inteira), sem `status` de aprovação, com link público próprio para atrair
novos clientes (`/p/:linkPublico` no frontend). Um item entra de três formas:
(1) referenciando um vídeo já existente em algum projeto (sempre vira um item
`tipoMidia: "video"`), (2) upload de vídeo dedicado direto pro portfólio, ou
(3) upload de foto dedicada — nos dois últimos casos, sem vínculo com
projeto/cliente.

| Método | Rota | Body | Retorno |
|---|---|---|---|
| `GET` | `/portfolios` | — | `Portfolio[]` (sem `videos[]`, só resumo — ver abaixo) |
| `GET` | `/portfolios/:id` | — | `Portfolio` completo, com `videos[]` |
| `POST` | `/portfolios` | `{ nome, descricao?, categoriaId? }` | `Portfolio` criado (`linkPublico` gerado pelo backend) |
| `PATCH` | `/portfolios/:id` | `{ nome?, descricao?, categoriaId?, capaUrl?, clienteId? }` | `Portfolio` atualizado |
| `DELETE` | `/portfolios/:id` | — | `{ "deleted": true }` |

`Portfolio`: `{ id, nome, descricao, linkPublico, categoriaId, capaUrl, clienteId, videos: PortfolioItem[], criadoEm, atualizadoEm }`.
`categoriaId` referencia uma categoria de [`/portfolio-categories`](#portfólio-perfil-e-categorias-portfolio-profile-portfolio-categories),
`null` = sem categoria (não aparece em nenhuma aba do hub público, mas
continua acessível pelo link direto do álbum). `capaUrl` também pode ser
`null` — nesse caso o frontend usa o poster/foto do primeiro item como
fallback. O campo continua se chamando `videos` por compatibilidade com o
que já foi combinado, mas a lista mistura vídeos e fotos.

**[ PENDENTE NO BACKEND ]** `clienteId` (UUID de um cliente da conta,
`null` = padrão) é campo novo — só em `PATCH`, não em `POST` (todo álbum
nasce como vitrine geral, sem cliente). Marca esse álbum específico como
personalizado pra um cliente: a página pública dele (`GET
/public/portfolios/:linkPublico`) passa a expor a
[marca própria](#marca-própria-do-cliente-branding) desse cliente, se
configurada, no lugar da marca da agência — ver [Portfólio
público](#portfólio-público) abaixo. Não afeta o hub (`/portfolio/:linkHub`),
que continua mostrando a marca da agência.

`PortfolioItem`: `{ id, tipoMidia: "video" | "foto", titulo, descricao,
urlStorage (ou urlOtimizada, o que estiver pronto para tocar — sempre `null`
quando `tipoMidia: "foto"`), posterUrl, statusProcessamento, ordem, destaque,
criadoEm }`. Sem `status` de aprovação — não faz sentido fora do fluxo
cliente↔projeto.

**[ PENDENTE NO BACKEND ]** `destaque` (boolean, default `false`) é campo
novo: o owner marca manualmente os melhores trabalhos do álbum (estrela na UI
de gestão). É só um sinal visual — vira um badge "Destaque" na vitrine
pública — **não** afeta `ordem` nem nenhuma outra regra. Editável via
`PATCH /portfolios/:id/videos/:videoId` (abaixo).

Quando `tipoMidia: "foto"`: `posterUrl` é a própria foto em alta resolução
(usada tanto como thumbnail na grade pública quanto em tela cheia no
lightbox) — **não** existe pipeline de otimização/thumbnail separado pra
fotos, ao contrário de vídeo. `statusProcessamento` deve vir sempre `"pronto"`
nesse caso (não há processamento em background pra foto).

### `POST /portfolios/:id/videos`
Adiciona ao portfólio um vídeo **já existente** em algum projeto da conta
(sempre `tipoMidia: "video"` — não existe equivalente pra foto, já que o app
não tem um acervo de fotos fora do portfólio).

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
`POST /videos/upload-url` (ver seção Vídeos) — só muda o path. Agora também
usado pra fotos: `contentType` aceita, além dos tipos de vídeo já
documentados, `image/png`, `image/jpeg` e `image/webp`.

Body: `{ "nomeArquivo": "foto.jpg", "contentType": "image/jpeg" }`

Resposta `200`: `{ "uploadUrl": "...", "key": "...", "publicUrl": "...", "expiresIn": 600 }`

### `POST /portfolios/:id/videos/upload-complete`
Registra, direto no portfólio, um vídeo **ou foto** enviado pelo passo acima
— **sem** projeto/cliente por trás (diferente de `POST /videos`).

Body: `{ "urlStorage": "<publicUrl do passo anterior>", "nomeArquivo": "video.mp4", "tipoMidia": "video" | "foto", "titulo"?: "...", "descricao"?: "..." }`
Quando `tipoMidia: "foto"`, o backend deve gravar `posterUrl = urlStorage`
(a própria foto) e deixar `urlStorage`/`urlOtimizada` do item como `null`.

Resposta: o `Portfolio` completo atualizado.

### `PATCH /portfolios/:id/videos/:videoId`
Edita título/descrição/destaque de um item (vídeo ou foto) já no portfólio.

Body: `{ "titulo"?: "...", "descricao"?: "...", "destaque"?: true }`

Resposta: o `Portfolio` completo atualizado.

### `DELETE /portfolios/:id/videos/:videoId`
Remove um item (vídeo ou foto) do portfólio (não afeta o vídeo original, se
veio de um projeto). Resposta: o `Portfolio` completo atualizado.

### `PATCH /portfolios/:id/videos/order`
Reordena os itens do portfólio (usado pelos botões subir/descer na UI).

Body: `{ "videoIds": ["uuid1", "uuid2", "..."] }` — a nova ordem completa,
na sequência desejada. Resposta: o `Portfolio` completo atualizado, com
`ordem` de cada item recalculada a partir da posição no array.

### `POST /portfolios/:id/cover-upload-url`
**[ PENDENTE NO BACKEND ]** Presigned URL pra capa do álbum — só imagem, mesmo
contrato 2-passos de `POST /portfolio-profile/photo-upload-url` (não precisa
de um terceiro passo de "confirmação": a própria `publicUrl` retornada aqui
já é enviada direto em `PATCH /portfolios/:id { capaUrl }`).

Body: `{ "nomeArquivo": "capa.jpg", "contentType": "image/jpeg" }`
`contentType` aceita `image/png`, `image/jpeg`, `image/webp`.

Resposta `200`: `{ "uploadUrl": "...", "key": "...", "publicUrl": "...", "expiresIn": 600 }`

## Portfólio: perfil e categorias (`/portfolio-profile`, `/portfolio-categories`)
**[ PENDENTE NO BACKEND — nenhuma destas rotas existe hoje ]** Autenticado —
**somente `owner`**.

A vitrine da agência tem um **hub público único** (`/portfolio/:linkHub` no
frontend) que reúne todos os portfólios/álbuns, agrupados em abas pelas
categorias que o owner cria livremente (não é fixo em "Foto"/"Vídeo" — o
owner nomeia como quiser: "Casamento", "Institucional", etc). Um álbum sem
categoria (`categoriaId: null`) não aparece em nenhuma aba do hub, mas
continua acessível pelo link direto dele.

| Método | Rota | Body | Retorno |
|---|---|---|---|
| `GET` | `/portfolio-profile` | — | `PortfolioProfile` (cria `linkHub` automaticamente na primeira chamada, se a conta ainda não tiver um) |
| `PATCH` | `/portfolio-profile` | `{ fotoUrl?, capaUrl?, bio?, links? }` | `PortfolioProfile` atualizado |
| `GET` | `/portfolio-categories` | — | `PortfolioCategory[]`, ordenadas por `ordem` |
| `POST` | `/portfolio-categories` | `{ nome }` | `PortfolioCategory` criada |
| `PATCH` | `/portfolio-categories/:id` | `{ nome }` | `PortfolioCategory` atualizada |
| `DELETE` | `/portfolio-categories/:id` | — | `{ "deleted": true }` — os álbuns associados viram `categoriaId: null`, **não são apagados** |
| `PATCH` | `/portfolio-categories/order` | `{ categoryIds: ["uuid1", "uuid2", "..."] }` | `PortfolioCategory[]` com `ordem` recalculada pela posição no array |

`PortfolioProfile`: `{ fotoUrl, capaUrl, bio, links: PortfolioLink[], linkHub }`
— `linkHub` nunca é `null` (mesmo espírito do `linkPublico` de projeto).
`PortfolioCategory`: `{ id, nome, ordem }`.

**[ PENDENTE NO BACKEND ]** `capaUrl`, `bio` e `links` são campos novos
(pedido original de portfólio: "capa, bio ... e informações de contato").
`capaUrl` é o banner exibido no topo do hub público — setado via o novo
upload abaixo, igual à foto de perfil. `bio` é texto livre (sem limite
específico documentado, sugerimos algo como 500 chars). `links` é uma lista
livre de contato/redes — sem plataformas fixas, o owner nomeia o rótulo como
quiser ("Site", "WhatsApp", "Instagram"...): `PortfolioLink`:
`{ id, rotulo, url }`. Em `PATCH`, o frontend manda `links` como a lista
completa (substitui, não faz merge por id) — o backend gera o `id` de cada
entrada nova.

### `POST /portfolio-profile/photo-upload-url`
Presigned URL pra foto de perfil — só imagem, mesmo contrato 2-passos de
`clientService.getPhotoUploadUrl` (ver seção Clientes): o frontend faz
`PUT <uploadUrl>` com o arquivo e depois salva a `publicUrl` retornada com
`PATCH /portfolio-profile { fotoUrl: publicUrl }` — sem um terceiro passo de
"confirmação" (diferente do upload de vídeo).

Body: `{ "nomeArquivo": "foto.jpg", "contentType": "image/jpeg" }`
`contentType` aceita `image/png`, `image/jpeg`, `image/webp`.

Resposta `200`: `{ "uploadUrl": "...", "key": "...", "publicUrl": "...", "expiresIn": 600 }`

### `POST /portfolio-profile/cover-upload-url`
**[ PENDENTE NO BACKEND ]** Presigned URL pra capa do hub — só imagem, mesmo
contrato 2-passos acima (sem passo de "confirmação": a `publicUrl` retornada
já é enviada direto em `PATCH /portfolio-profile { capaUrl }`).

Body: `{ "nomeArquivo": "capa.jpg", "contentType": "image/jpeg" }`
`contentType` aceita `image/png`, `image/jpeg`, `image/webp`.

Resposta `200`: `{ "uploadUrl": "...", "key": "...", "publicUrl": "...", "expiresIn": 600 }`

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

**Resolve a cadeia de versões (28/08):** dado qualquer `linkPublico` da
cadeia, o backend segue os filhos (`videoPaiId`) e devolve a **versão mais
recente** — vídeo, `status`, comentários e avaliações já são os dela. Por
isso `id` é o id da versão resolvida: comentário, avaliação, aprovação e
pedido de ajuste feitos por esta rota caem na versão nova, não na antiga.
Vêm também `latestVersionId` (id da versão resolvida) e
`resolvedFromVersion` (a `versao` do link que foi pedido).

Resposta:
```json
{
  "id": "uuid (versão mais recente da cadeia)",
  "latestVersionId": "uuid",
  "resolvedFromVersion": 2,
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
  "cliente": { "nome": "Cliente X", "branding": { "logoUrl": "https://...", "corDestaque": "#d6336c" } },
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
- **[ PENDENTE NO BACKEND — `cliente.branding` não vem na resposta hoje ]**
  Ver [Marca própria do cliente](#marca-própria-do-cliente-branding).
  `cliente.branding` é `{ logoUrl, corDestaque } | null` — quando presente
  (não-`null`), o frontend sobrepõe campo a campo sobre `agencia` (o cliente
  pode ter só cor, só logo, ou os dois; o que não estiver setado cai pra
  `agencia`). `null`/campo ausente = usa só a marca da agência, como hoje.
- **Uma entrada por cadeia de versões (28/08):** a lista já vem só com a
  versão mais recente de cada vídeo — a antiga não aparece mais lado a lado
  com a nova. Cada item continua expondo `id`, `videoPaiId` e `versao`
  (mesmo shape de `GET /videos?project_id=`); `hideSupersededGalleryVideos`
  (lib/services.ts) segue no frontend só como rede de segurança.
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
— **nenhum** dado de cliente/projeto/status é exposto aqui, só o portfólio em si,
exceto a marca (ver abaixo).

Resposta:
```json
{
  "nome": "Reels para redes sociais",
  "descricao": "Seleção de reels de curta duração... ou null",
  "agencia": { "nome": "Agencia Teste", "logoUrl": "https://...", "corDestaque": "#ff0000" },
  "cliente": { "branding": { "logoUrl": "https://...", "corDestaque": "#d6336c" } },
  "videos": [
    { "id": "uuid", "tipoMidia": "video", "titulo": "Reel lançamento batom matte", "descricao": "... ou null", "urlStorage": "https://...", "posterUrl": "https://... ou null", "statusProcessamento": "pronto", "ordem": 0, "destaque": true, "criadoEm": "..." },
    { "id": "uuid", "tipoMidia": "foto", "titulo": "Still campanha", "descricao": null, "urlStorage": null, "posterUrl": "https://...", "statusProcessamento": "pronto", "ordem": 1, "destaque": false, "criadoEm": "..." }
  ]
}
```
O frontend abre cada item num lightbox — `<video>` nativo pra
`tipoMidia: "video"`, a imagem em tela cheia pra `tipoMidia: "foto"` — sem
navegar para `/v/:linkPublico` — a tela de aprovação do cliente não faz
sentido aqui.

`cliente` só vem preenchido quando o álbum tem `clienteId` setado (ver
[`clienteId` em `PATCH /portfolios/:id`](#portfólios-portfolios)) **e** esse
cliente tem `branding` configurado — caso contrário omitir o campo (ou
`null`). Mesma regra de merge campo a campo sobre `agencia` explicada em
[Marca própria do cliente](#marca-própria-do-cliente-branding). Não expor
`cliente.nome`/`id` aqui — a vitrine não deve revelar pra quem o álbum foi
personalizado.

### Hub público do portfólio

### `GET /public/portfolio-hub/:linkHub`
**[ PENDENTE NO BACKEND — rota não existe hoje ]** Sem autenticação. `404` se
o link não existir. Vitrine central da agência (ver
[Portfólio: perfil e categorias](#portfólio-perfil-e-categorias-portfolio-profile-portfolio-categories)):
todos os álbuns agrupados por categoria, pra alimentar as abas no frontend
(`/portfolio/:linkHub`). Só inclui categorias com pelo menos um álbum que
tenha algum item — categoria vazia não deve vir na resposta. Álbuns sem
categoria (`categoriaId: null`) não aparecem aqui (só pelo link direto deles).

Resposta:
```json
{
  "fotoUrl": "https://... ou null",
  "capaUrl": "https://... ou null",
  "bio": "Produzimos vídeos... ou null",
  "links": [{ "id": "uuid", "rotulo": "Site", "url": "https://..." }],
  "agencia": { "nome": "Agencia Teste", "logoUrl": "https://...", "corDestaque": "#ff0000" },
  "categorias": [
    {
      "id": "uuid",
      "nome": "Vídeo",
      "portfolios": [
        { "id": "uuid", "nome": "Reels para redes sociais", "descricao": "... ou null", "link": "64c7527a-...", "capaUrl": "https://... ou null" }
      ]
    }
  ]
}
```
Cada item de `portfolios[]` é só o resumo do álbum (sem `videos[]`) — o
frontend usa `link` pra montar o card que leva pra `/p/:link` (a página do
álbum já existente, sem nenhuma mudança de contrato ali). `capaUrl`, `bio` e
`links` vêm direto de `PortfolioProfile` (ver [Portfólio: perfil e
categorias](#portfólio-perfil-e-categorias-portfolio-profile-portfolio-categories))
— `links` vazio (`[]`) quando o owner não cadastrou nenhum.

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
