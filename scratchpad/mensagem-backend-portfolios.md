Oi! Subi a aba nova de "Portfólios" no frontend — o owner monta vitrines de vídeos em destaque (fora do fluxo de aprovação cliente↔projeto) e compartilha como link público, pra atrair novos clientes. Preciso de um conjunto de endpoints novos aí no backend pra ela funcionar de verdade; até lá, deixei tudo funcionando em modo demo.

## Contexto

Diferente da galeria de projeto (`/public/projects/:linkPublico`, que espelha 1:1 os vídeos de uma entrega e carrega `status` de aprovação), um portfólio é uma coleção **curada manualmente** pelo owner: ele escolhe o que entra, seja referenciando um vídeo já existente em qualquer projeto, seja subindo um vídeo novo direto pro portfólio (sem vínculo com projeto/cliente). A página pública (`/p/:linkPublico`) nunca expõe nome de cliente, status de aprovação ou qualquer outro dado interno — só título/descrição do vídeo e a marca da agência.

## O que precisa ser feito

Documentei o contrato completo (request/response, roles) no `API.md`, duas seções novas:

**1. [`## Portfólios (/portfolios)`](API.md#portfólios-portfolios)** — CRUD autenticado, só `owner`:
- `GET/POST /portfolios`, `GET/PATCH/DELETE /portfolios/:id`
- `POST /portfolios/:id/videos` — adiciona um vídeo já existente (o backend precisa **copiar** `urlStorage`/`posterUrl` do vídeo original pro item do portfólio nesse momento — denormalizado, pra rota pública não precisar resolver o vídeo/projeto/cliente original por trás)
- `POST /portfolios/:id/upload-url` + `POST /portfolios/:id/videos/upload-complete` — upload dedicado, mesmo padrão 3 passos de `POST /videos/upload-url` + `POST /videos`, mas sem `projectId` (o vídeo não pertence a nenhum projeto)
- `PATCH /portfolios/:id/videos/:videoId`, `DELETE /portfolios/:id/videos/:videoId`
- `PATCH /portfolios/:id/videos/order` — reordena (recebe o array completo de ids na ordem desejada)

**2. [`### Portfólio público`](API.md#portfólio-público)**, dentro de "Acesso público do cliente":
- `GET /public/portfolios/:linkPublico` — sem autenticação, `404` se o link não existir. Resposta enxuta: `nome`, `descricao`, `agencia` (branding) e `videos[]` — sem nenhum campo de cliente/projeto/status.

Os dois shapes de `Portfolio`/`PortfolioVideo` estão detalhados no `API.md`, junto com um exemplo de JSON pra cada rota.

## O que já está pronto no frontend

Toda a tela (`/portfolios`, `/portfolios/:id`, `/p/:link`) já está funcional em modo demo (`?demo=1` / "Entrar como demo" no login) — dá pra ver o fluxo completo: criar portfólio, selecionar vídeo existente, upload dedicado, reordenar, remover, copiar/abrir o link público, e o player em lightbox na página pública. Assim que os endpoints acima existirem, é só o backend responder — não deve precisar de nenhuma mudança do meu lado.

Qualquer dúvida sobre algum payload específico, me chama.
