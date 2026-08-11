Oi! Complemento do pedido anterior do Kanban (`etapaProducao` em `Video`, já implementado — valeu). Agora precisamos de uma entidade nova pra cobrir a outra metade do quadro: cards que não são vídeo.

## Contexto

O Kanban (`/kanban`) hoje mistura duas coisas:

1. **Cards de vídeo** — reais, vêm de `GET /videos` com `etapaProducao` (já funcionando).
2. **Cards genéricos** ("Projeto", "Campanha", "Gravação", "Demanda") — criados direto no quadro pelo usuário, sem estar ligados a nenhum vídeo. Hoje isso é só um protótipo funcional: fica salvo no `localStorage` do navegador, não sincroniza entre membros da equipe nem entre dispositivos. Pra virar recurso de verdade (o objetivo é imitar o Trello — todo mundo da agência vendo o mesmo quadro), precisa de uma entidade nova no backend.

## O que precisa ser feito

**Nova tabela: `Demanda`**

Campos sugeridos:

- `id`
- `titulo` (string, obrigatório)
- `tipo`: enum `projeto | campanha | gravacao | demanda` (vídeo não entra aqui — vídeo continua sendo um `Video` normal)
- `clienteId` (FK pra `Client`, opcional/nullable) — hoje no frontend o campo "cliente" é só texto livre; se topem expor isso como FK de verdade eu ajusto o form pra virar um select dos clientes já cadastrados, fica mais consistente com o resto do sistema
- `responsavelId` (FK pro usuário/editor da equipe, nullable) — mesmo padrão de `Video.editorResponsavelId`
- `prazo` (date, nullable) — mesmo padrão de `Video.deadline`
- `etapa`: **mesmo enum de 7 valores** já criado pra `Video.etapaProducao` (`planejado | producao | edicao | aguardando_aprovacao | ajustes | aprovado | entregue`) — reaproveitar o enum em vez de criar um novo, já que o quadro trata os dois tipos de card igual
- `videoId` (FK pra `Video`, opcional/nullable) — não usamos agora, mas deixa a porta aberta pra no futuro uma demanda "virar" ou referenciar um vídeo específico
- `contaId`/`agenciaId` (o mesmo escopo multi-tenant que `Project`/`Client` já usam — cada conta só vê as próprias demandas)
- `criadoEm`, `atualizadoEm`

**Rotas** (mesmo padrão de auth de `/videos` — owner/editor):

- `POST /demandas` — cria. Body: `{ titulo, tipo, clienteId?, responsavelId?, prazo?, etapa? }` (etapa default `planejado`).
- `GET /demandas` — lista as da conta autenticada.
- `PATCH /demandas/:id` — edita os campos (título, tipo, cliente, responsável, prazo).
- `PATCH /demandas/:id/etapa` — move de etapa. Body: `{ etapa }` (mesmo shape de `PATCH /videos/:id/etapa`).
- `DELETE /demandas/:id` — exclui.

## O que já está pronto no frontend

O quadro (`components/kanban-view.tsx`) já sabe renderizar, filtrar (por tipo e cliente), arrastar entre etapas, criar/editar/excluir esses cards — hoje tudo contra o `localStorage`. Assim que essas rotas existirem, troco a camada de persistência local por chamadas reais em `lib/services.ts` (mesmo padrão de `videoService`), sem mudar a experiência visual.

Qualquer dúvida no enum ou no formato dos campos, me chama.
