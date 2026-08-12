Oi! Mais um complemento pequeno, dessa vez em `Client`.

## Contexto

Estamos fechando o recurso de "equipe e produtividade": relacionar profissionais da agência a clientes, projetos, vídeos e demandas, pra dar visibilidade de distribuição de trabalho e sobrecarga por pessoa. Editor↔vídeo (`editorResponsavelId`) e editor↔projeto (`/projects/:id/members`) já existem; falta só editor↔cliente.

## O que precisa ser feito

**Campo novo em `Client`**: `responsavelId` (FK nullable pro usuário/editor da equipe, mesmo padrão de `Video.editorResponsavelId`) — um único responsável por cliente, não uma lista.

- Incluir em `GET /clients` e `GET /clients/:id` (campo `responsavelId` no corpo de cada cliente).
- Aceitar em `PATCH /clients/:id`, body `{ ..., responsavelId? }` (nullable, mesmo formato dos demais campos opcionais do endpoint).
- Não precisa entrar em `POST /clients` (criação) — o responsável é atribuído depois, na tela do cliente.
- Mesmo escopo multi-tenant de sempre: `responsavelId` só pode apontar pra um usuário da própria conta.

## O que já está pronto no frontend

`components/client-detail-view.tsx` já tem o seletor de responsável na aba "Visão geral" do cliente, chamando `clientService.update(id, { responsibleId })`. Só falta o backend persistir/devolver o campo.

Qualquer dúvida no formato, me chamem. Quando publicarem, atualiza o `API.md`.
