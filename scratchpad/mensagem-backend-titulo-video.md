Oi! Achei um 404 testando o fluxo de renomear vídeo — o frontend já chama a rota, só falta implementar ela aí no backend.

## Contexto

O front tem um botão de editar o título do vídeo (tanto na revisão interna quanto na tela pública do cliente), que chama `PATCH /videos/:id/titulo`. Só que essa rota não existe hoje — só `PATCH /videos/:id/status` e `PATCH /videos/:id/deadline` estão implementadas. O erro que aparece é o 404 padrão do Nest: `Cannot PATCH /api/videos/:id/titulo`.

## O que precisa ser feito

**Nova rota: `PATCH /videos/:id/titulo`**

- **Auth:** `owner`, `editor` (mesmo padrão de `status`).
- **Body:** `{ "nomeArquivo": "novo-nome.mp4" }`
- **Resposta:** o `Video` atualizado, mesmo shape que `status`/`deadline` já retornam.

**Nova rota: `PATCH /public/videos/:linkPublico/titulo`**

- **Sem autenticação** — o cliente também pode renomear pela tela pública dele.
- **Body:** `{ "nomeArquivo": "novo-nome.mp4" }`
- **Resposta:** o `Video` atualizado.
- Vale considerar o mesmo rate limit que as outras rotas públicas de vídeo já têm (`comments`/`ratings` são 20/min, `approve`/`request-changes` são 10/min) — essa aqui acho que serve bem no mesmo patamar de `approve`/`request-changes`.

## O que já está pronto no frontend

- Os dois fluxos (revisão interna e tela pública) já chamam essas rotas e já tratam o erro via `ApiError` — não precisa de nada a mais do meu lado, só a implementação aí.

Documentei as duas rotas no `API.md` do repo do frontend (seção Vídeos e seção pública), marcadas como pendentes, se quiser conferir o formato exato esperado.

Qualquer dúvida sobre o payload ou os erros, me chama.
