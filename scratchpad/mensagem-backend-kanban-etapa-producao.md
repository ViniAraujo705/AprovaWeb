Oi! Vamos transformar o protótipo de Kanban do dashboard (`/prototipos/kanban` no front, hoje 100% mockado) numa funcionalidade real. Pra isso precisamos de um campo novo no backend.

## Contexto

Hoje o dashboard lista vídeos pelo `status` (`pendente`/`aprovado`/`ajuste`/`erro`), que é a **decisão do cliente** sobre o vídeo — vem do fluxo de aprovação na tela pública. O Kanban é outra coisa: é a **etapa de produção interna** da agência, que existe mesmo antes do vídeo ir pro cliente (planejamento, gravação, edição) e depois que ele já foi aprovado (entrega). O fluxo combinado com o time de produto foi:

```
Planejado → Em produção → Em edição → Aguardando aprovação → Ajustes → Aprovado → Entregue
```

Reparem que "Aguardando aprovação", "Ajustes" e "Aprovado" batem conceitualmente com o `status` que já existe (pendente/ajuste/aprovado) — mas "Planejado", "Em produção", "Em edição" e "Entregue" não têm correspondência nenhuma no status atual. Por isso a proposta é um **campo novo, separado do `status`**, não uma substituição — evita mexer em toda a lógica de aprovação do cliente que já depende do `status` hoje.

Escopo combinado pra essa primeira versão: só vídeos (reaproveita a entidade `Video` que já existe). Cards de campanha/projeto/gravação genéricos (que apareciam no protótipo visual) ficam pra uma fase 2, se fizer sentido — não é pra entrar agora.

## O que precisa ser feito

**Novo campo no `Video`: `etapaProducao`**

- Enum com 7 valores: `planejado`, `producao`, `edicao`, `aguardando_aprovacao`, `ajustes`, `aprovado`, `entregue`.
- Default `planejado` pra vídeos novos.
- Pros vídeos já existentes na base, precisa de uma migração com valor inicial coerente — sugestão de mapeamento a partir do `status` atual:
  - `status = pendente` → `aguardando_aprovacao`
  - `status = ajuste` → `ajustes`
  - `status = aprovado` → `aprovado`
  - `status = erro` → `planejado` (ou o que fizer mais sentido aí, não tenho certeza do que esse status representa hoje)

**Nova rota: `PATCH /videos/:id/etapa`**

- **Auth:** `owner`, `editor` (mesmo padrão de `/videos/:id/status`).
- **Body:** `{ "etapa": "producao" }`
- **Resposta:** o `Video` atualizado, mesmo shape que `status`/`deadline` já retornam, incluindo o novo campo `etapaProducao`.

**`GET /videos` (listagem)**

- Incluir `etapaProducao` na resposta de cada item, pra alimentar o board numa chamada só (sem precisar de request por vídeo).

**Sincronia com a decisão do cliente (a definir com vocês)**

Ficou em aberto se a etapa deveria avançar sozinha quando o cliente decide algo na tela pública:

- Cliente aprova (`POST /public/videos/:link/approve`) → `etapaProducao` vai automaticamente pra `aprovado`?
- Cliente pede ajuste (`POST /public/videos/:link/request-changes`) → vai pra `ajustes`?

Se for mais simples pra essa primeira versão deixar 100% manual (a equipe arrasta o card ela mesma no board), também funciona — só me avisem qual dos dois caminhos pra eu ajustar a expectativa no frontend.

## O que já está pronto no frontend

O protótipo visual (drag-and-drop entre etapas, modal com revisão interna/canal do cliente, prazos) já existe em `/prototipos/kanban`, hoje com dados mockados. Assim que o campo e a rota existirem, troco pra consumir de verdade via `videoService` — não deve precisar de mais nada do lado de vocês além do que está listado acima.

Qualquer dúvida sobre o enum ou o mapeamento de migração, me chama.
