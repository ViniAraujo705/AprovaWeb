Oi! Subi a aba nova de "Portfólios" no frontend — o owner monta vitrines de vídeos em destaque (fora do fluxo de aprovação cliente↔projeto) e compartilha como link público, pra atrair novos clientes. Preciso de um conjunto de endpoints novos aí no backend pra ela funcionar de verdade; até lá, deixei tudo funcionando em modo demo.

**Atualização 1:** o portfólio agora também aceita **foto**, não só vídeo (pedido do time). Já ajustei o contrato abaixo e no `API.md` pra cobrir os dois casos — se você ainda não tinha começado a implementar, é só seguir a versão atual do documento.

**Atualização 2:** entrou mais uma camada em cima disso — um **hub público único da agência** (uma espécie de "perfil"), com foto de perfil e os portfólios organizados em abas por categoria (o owner cria as categorias do jeito que quiser, tipo "Casamento", "Institucional" — não é fixo). Três seções novas no `API.md`: [`/portfolio-profile` e `/portfolio-categories`](API.md#portfólio-perfil-e-categorias-portfolio-profile-portfolio-categories) (autenticado), [`GET /public/portfolio-hub/:linkHub`](API.md#hub-público-do-portfólio) (público), e um endpoint novo de capa em [`POST /portfolios/:id/cover-upload-url`](API.md#portfólios-portfolios). Os links dos álbuns individuais (`/p/:linkPublico`) **não mudam em nada** — o hub só lista cards que apontam pra eles.

## Contexto

Diferente da galeria de projeto (`/public/projects/:linkPublico`, que espelha 1:1 os vídeos de uma entrega e carrega `status` de aprovação), um portfólio é uma coleção **curada manualmente** pelo owner: ele escolhe o que entra, seja referenciando um vídeo já existente em qualquer projeto (sempre vídeo), seja subindo um vídeo **ou foto** novo direto pro portfólio (sem vínculo com projeto/cliente). A página pública (`/p/:linkPublico`) nunca expõe nome de cliente, status de aprovação ou qualquer outro dado interno — só título/descrição do item e a marca da agência.

## O que precisa ser feito

Documentei o contrato completo (request/response, roles) no `API.md`, quatro seções novas:

**1. [`## Portfólios (/portfolios)`](API.md#portfólios-portfolios)** — CRUD autenticado, só `owner`:
- `GET/POST /portfolios`, `GET/PATCH/DELETE /portfolios/:id` — `POST`/`PATCH` agora também aceitam `categoriaId` (referencia uma categoria do item 3, `null` = sem categoria) e `PATCH` aceita `capaUrl` direto (setado via o novo upload de capa, item abaixo).
- `POST /portfolios/:id/videos` — adiciona um vídeo já existente (o backend precisa **copiar** `urlStorage`/`posterUrl` do vídeo original pro item do portfólio nesse momento — denormalizado, pra rota pública não precisar resolver o vídeo/projeto/cliente original por trás). Só vídeo — não existe "selecionar foto existente".
- `POST /portfolios/:id/upload-url` + `POST /portfolios/:id/videos/upload-complete` — upload dedicado, mesmo padrão 3 passos de `POST /videos/upload-url` + `POST /videos`, mas sem `projectId` (o item não pertence a nenhum projeto). Novo campo `tipoMidia: "video" | "foto"` no body do `upload-complete` — quando é `"foto"`, o backend grava `posterUrl = urlStorage` (a foto é ao mesmo tempo o thumbnail e a imagem em tela cheia, sem pipeline de otimização) e deixa `urlStorage`/`urlOtimizada` do item `null`. `POST /portfolios/:id/upload-url` também precisa aceitar `contentType` de imagem (`image/png`, `image/jpeg`, `image/webp`), além dos de vídeo já usados em `/videos/upload-url`.
- `PATCH /portfolios/:id/videos/:videoId`, `DELETE /portfolios/:id/videos/:videoId`
- `PATCH /portfolios/:id/videos/order` — reordena (recebe o array completo de ids na ordem desejada)
- `POST /portfolios/:id/cover-upload-url` — presigned URL só de imagem pra capa do álbum, mesmo padrão 2-passos do item 3 (sem passo de "confirmação": a `publicUrl` já vai direto num `PATCH /portfolios/:id { capaUrl }`).

**2. [`### Portfólio público`](API.md#portfólio-público)**, dentro de "Acesso público do cliente":
- `GET /public/portfolios/:linkPublico` — sem autenticação, `404` se o link não existir. Resposta enxuta: `nome`, `descricao`, `agencia` (branding) e `videos[]` — sem nenhum campo de cliente/projeto/status. Cada item traz `tipoMidia` pro frontend saber se abre `<video>` ou a foto em tela cheia no lightbox.

**3. [`## Portfólio: perfil e categorias`](API.md#portfólio-perfil-e-categorias-portfolio-profile-portfolio-categories)** — autenticado, só `owner`:
- `GET`/`PATCH /portfolio-profile` — foto de perfil (`fotoUrl`) + `linkHub` (gerado automaticamente na primeira leitura, nunca `null`). `POST /portfolio-profile/photo-upload-url` — presigned URL só de imagem, 2 passos (sem confirmação, igual à capa do item 1).
- CRUD de `/portfolio-categories` (`nome`, `ordem`) — livres, o owner nomeia como quiser. Excluir uma categoria só desassocia os álbuns dela (`categoriaId: null`), não apaga nada.

**4. [`### Hub público do portfólio`](API.md#hub-público-do-portfólio)**, também em "Acesso público":
- `GET /public/portfolio-hub/:linkHub` — sem autenticação, `404` se não existir. Retorna `fotoUrl`, `agencia` (branding) e `categorias[]`, cada uma com seus `portfolios[]` (resumo do álbum: id/nome/descricao/link/capaUrl, sem `videos[]`). **Só categorias com pelo menos um álbum com item** — filtra vazias no backend. Álbuns sem categoria não aparecem aqui.

Os shapes de `Portfolio`/`PortfolioItem`/`PortfolioProfile`/`PortfolioCategory` estão detalhados no `API.md`, junto com um exemplo de JSON pra cada rota.

## O que já está pronto no frontend

Toda a tela (`/portfolios`, `/portfolios/:id`, `/p/:link`, `/portfolio/:linkHub`) já está funcional em modo demo (`?demo=1` / "Entrar como demo" no login) — dá pra ver o fluxo completo: criar categorias, subir foto de perfil, criar portfólio já numa categoria, selecionar vídeo existente, upload de vídeo/foto dedicado, capa do álbum, reordenar, remover, copiar/abrir o link do hub e de cada álbum, e navegar do hub pro álbum. Assim que os endpoints acima existirem, é só o backend responder — não deve precisar de nenhuma mudança do meu lado.

Qualquer dúvida sobre algum payload específico, me chama.
